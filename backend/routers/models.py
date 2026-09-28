"""API mô hình nhận diện: liệt kê, tải thêm file .pt, bật / tắt, xoá. Danh sách vật thể của /vision/status tự cập nhật."""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from starlette.concurrency import run_in_threadpool

from core.config import settings
from core.logging import logger
from models import ModelInfo, ModelList, ModelUpdate
from routers.vision import get_detector
from services import model_store
from services.detector import Detector
from services.media import MediaTooLarge, save_stream

router = APIRouter(prefix="/models", tags=["Models"])

BINARY_BODY = {
    "requestBody": {
        "required": True,
        "content": {"application/octet-stream": {"schema": {"type": "string", "format": "binary"}}},
    }
}


def can_manage(request: Request) -> bool:
    """local: chỉ request tới cổng HTTP của chính máy (serve.py nghe 127.0.0.1; Docker map 127.0.0.1:WEB_PORT).
    Điện thoại / máy khác đi qua cổng HTTPS LAN nên chỉ xem được."""
    if settings.MODEL_ADMIN == "all":
        return True
    if settings.MODEL_ADMIN == "off":
        return False
    server = request.scope.get("server") or (None, None)
    return request.url.scheme == "http" and server[1] == getattr(request.app.state, "admin_port", settings.PORT)


def require_admin(request: Request) -> None:
    if not can_manage(request):
        raise HTTPException(403, "Chỉ quản lý mô hình được trên chính máy chạy máy chủ (mở http://localhost).")


def require_ready(detector: Detector = Depends(get_detector)) -> Detector:
    if not detector.ready.is_set():
        raise HTTPException(503, detector.error or "Bộ nhận diện đang khởi động, thử lại sau giây lát.")
    return detector


@router.get("", response_model=ModelList)
def list_models(request: Request, detector: Detector = Depends(get_detector)):
    """Các mô hình YOLO, trình duyệt này có được quản lý không, thư mục lưu."""
    return ModelList(
        can_manage=can_manage(request),
        folder=settings.custom_model_dir_label,
        max_bytes=settings.max_model_bytes,
        items=detector.model_infos() if detector.ready.is_set() else [],
    )


@router.post(
    "",
    response_model=ModelInfo,
    status_code=201,
    openapi_extra=BINARY_BODY,
    dependencies=[Depends(require_admin)],
    responses={
        400: {"description": "File không phải mô hình YOLO segment / detect dùng được"},
        403: {"description": "Chỉ máy chạy máy chủ được quản lý mô hình"},
        413: {"description": "File quá lớn"},
        415: {"description": "Không phải file .pt"},
    },
)
async def upload_model(
    request: Request,
    name: str = Query(..., min_length=1, max_length=255, description="Tên file .pt gốc"),
    detector: Detector = Depends(require_ready),
):
    """Lưu file .pt vào thư mục mô hình, nạp thử rồi cho chạy cùng các mô hình đang bật."""
    folder = settings.custom_model_dir
    try:
        target = model_store.new_model_path(folder, name, detector.reserved_names())
    except ValueError as exc:
        raise HTTPException(415, str(exc)) from exc
    limit = settings.max_model_bytes
    too_large = HTTPException(413, f"Mô hình vượt quá giới hạn {settings.MAX_MODEL_MB} MB.")
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > limit:
        raise too_large
    try:
        await save_stream(request.stream(), target, limit)
    except MediaTooLarge as exc:
        raise too_large from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    try:
        return await run_in_threadpool(detector.add_model, target)
    except Exception as exc:
        target.unlink(missing_ok=True)
        if not isinstance(exc, ValueError):
            logger.exception("Could not load uploaded model %s", target.name)
        raise HTTPException(400, f"Không dùng được mô hình này: {exc}") from exc


@router.patch("/{model_id}", response_model=ModelInfo, dependencies=[Depends(require_admin)])
async def update_model(model_id: str, body: ModelUpdate, detector: Detector = Depends(require_ready)):
    """Bật / tắt một mô hình (tắt thì giải phóng GPU, vẫn giữ file)."""
    try:
        return await run_in_threadpool(detector.set_enabled, model_id, body.enabled)
    except KeyError as exc:
        raise HTTPException(404, "Không có mô hình này.") from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.delete("/{model_id}", status_code=204, dependencies=[Depends(require_admin)])
async def delete_model(model_id: str, detector: Detector = Depends(require_ready)):
    """Xoá mô hình tải thêm (xoá cả file .pt)."""
    try:
        await run_in_threadpool(detector.remove_model, model_id)
    except KeyError as exc:
        raise HTTPException(404, "Không có mô hình này.") from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
