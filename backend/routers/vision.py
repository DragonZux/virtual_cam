"""API nhận diện: trạng thái bộ nhận diện và phân tích từng khung hình camera client gửi lên."""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from starlette.concurrency import run_in_threadpool

from core.config import settings
from core.logging import logger
from models import FrameResult, StatusOut, PointerMode
from services.detector import Detector, DetectorBusy, ModelChanged
from services.laser_model import LaserUnavailable

router = APIRouter(prefix="/vision", tags=["Vision"])

# Swagger: body là ảnh JPEG thô (không phải JSON / multipart)
JPEG_BODY = {
    "requestBody": {
        "required": True,
        "content": {"image/jpeg": {"schema": {"type": "string", "format": "binary"}}},
    }
}


def get_detector(request: Request) -> Detector:
    return request.app.state.detector


async def read_frame(request: Request, limit: int) -> bytes:
    """Đọc body có giới hạn để một request lớn không chiếm bộ nhớ."""
    too_large = HTTPException(413, f"Ảnh vượt quá giới hạn {limit // 1024} KB.")
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > limit:
        raise too_large
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > limit:
            raise too_large
    return bytes(body)


@router.get("/status", response_model=StatusOut)
def get_status(detector: Detector = Depends(get_detector)):
    """Trạng thái bộ nhận diện, danh sách lớp chọn được và mặc định của máy chủ."""
    return StatusOut(**detector.status())


@router.post(
    "/frame",
    response_model=FrameResult,
    openapi_extra=JPEG_BODY,
    responses={
        400: {"description": "Ảnh hoặc cài đặt không hợp lệ"},
        413: {"description": "Ảnh quá lớn"},
        415: {"description": "Không phải image/jpeg"},
        429: {"description": "Đang xử lý khung của client khác"},
        503: {"description": "Bộ nhận diện hoặc model laser đỏ chưa sẵn sàng"},
    },
)
async def analyze_frame(
    request: Request,
    targets: str | None = Query(None, description="Tên lớp cần nhận diện, cách nhau dấu phẩy (trống = mặc định); "
                                                  "không phân biệt hoa / thường, bỏ qua lớp máy chủ không còn"),
    conf: float | None = Query(None, ge=0.05, le=0.95, description="Ngưỡng tin cậy tối thiểu của YOLO"),
    tolerance: int | None = Query(None, ge=0, le=100, description="Đầu ngón tay được cách mép vật thể tối đa (pixel)"),
    pointer_mode: PointerMode = Query(PointerMode.hand, description="Chọn bằng ngón tay hoặc chấm laser đỏ"),
    model_revision: int | None = Query(None, ge=0),
    laser_hint: str | None = Query(None, pattern=r"^\d{1,5},\d{1,5}$",
                                   description="x,y chấm laser ổn định gần nhất client đang bám (pixel khung trước)"),
    detector: Detector = Depends(get_detector),
):
    """Phân tích một khung JPEG: đầu ngón trỏ hoặc chấm laser đỏ và vật thể đang được chỉ."""
    if request.headers.get("content-type", "").split(";")[0].strip().lower() != "image/jpeg":
        raise HTTPException(415, "Chỉ nhận ảnh JPEG (Content-Type: image/jpeg).")
    if not detector.ready.is_set():
        raise HTTPException(503, detector.error or "Bộ nhận diện đang khởi động, thử lại sau giây lát.")
    if model_revision is not None and model_revision != detector.model_revision:
        raise HTTPException(409, "Mô hình vừa thay đổi, hãy cập nhật trạng thái rồi thử lại.")
    try:
        hint = tuple(int(v) for v in laser_hint.split(",")) if laser_hint else None
        options = detector.options(targets, conf, tolerance, pointer_mode, hint, model_revision)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    payload = await read_frame(request, settings.MAX_FRAME_BYTES)
    try:
        return await run_in_threadpool(detector.analyze, payload, options)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except DetectorBusy as exc:
        raise HTTPException(429, "Máy chủ đang bận, đang thử lại…", headers={"Retry-After": "1"}) from exc
    except ModelChanged as exc:
        raise HTTPException(409, "Mô hình vừa thay đổi, hãy cập nhật trạng thái rồi thử lại.") from exc
    except LaserUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:
        logger.exception("Frame analysis failed")
        raise HTTPException(500, "Không xử lý được khung hình.") from exc
