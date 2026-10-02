"""Upload, validate, select and convert (TensorRT FP16) local segmentation and laser models."""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from starlette.concurrency import run_in_threadpool

from models import ModelList, ModelSelection, StatusOut
from routers.vision import get_detector
from services.detector import Detector, DetectorBusy

router = APIRouter(prefix="/models", tags=["Models"])


def require_ready(detector: Detector = Depends(get_detector)) -> Detector:
    if not detector.ready.is_set():
        raise HTTPException(503, detector.error or "Bộ nhận diện đang khởi động.")
    return detector


@router.get("", response_model=ModelList)
def list_models(detector: Detector = Depends(get_detector)):
    reason = detector.engine_unavailable()
    return ModelList(items=detector.model_infos(), max_bytes=detector.cfg.MAX_MODEL_MB * 1024 * 1024,
                     conversions=detector.converter.snapshot(), convert_available=reason is None, convert_reason=reason)


@router.post("/convert", response_model=ModelList, status_code=202)
def convert_model(body: ModelSelection, detector: Detector = Depends(require_ready)):
    """Build TensorRT FP16 ở nền; xong thì engine tự được chọn. Theo dõi qua `conversions` của GET /models."""
    try:
        detector.converter.submit(body.id)
    except KeyError as exc:
        raise HTTPException(404, "Không tìm thấy file mô hình.") from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return list_models(detector)


@router.post("/activate", response_model=StatusOut)
async def activate_model(body: ModelSelection, detector: Detector = Depends(require_ready)):
    try:
        return await run_in_threadpool(detector.activate_model, body.id)
    except KeyError as exc:
        raise HTTPException(404, "Không tìm thấy file mô hình.") from exc
    except DetectorBusy as exc:
        raise HTTPException(409, "Đang nạp mô hình khác, vui lòng chờ.") from exc
    except Exception as exc:
        raise HTTPException(400, f"Không dùng được mô hình này: {exc}") from exc


@router.post("", response_model=ModelList, status_code=201)
async def upload_model(request: Request, kind: Literal["segmentation", "laser"],
                       name: str = Query(min_length=1, max_length=255),
                       convert: bool = Query(False, description="Tải lên xong thì chuyển sang TensorRT FP16"),
                       detector: Detector = Depends(require_ready)):
    limit = detector.cfg.MAX_MODEL_MB * 1024 * 1024
    if request.headers.get("content-length", "").isdigit() and int(request.headers["content-length"]) > limit:
        raise HTTPException(413, f"Mô hình vượt quá {detector.cfg.MAX_MODEL_MB} MB.")
    try:
        target = detector.model_store.upload_path(kind, name)
    except ValueError as exc:
        raise HTTPException(415, str(exc)) from exc
    # The unvalidated upload is invisible to the catalog, yet keeps its model extension for YOLO.
    staging = target.parent / (".upload-" + target.stem)
    staging.mkdir()
    temporary = staging / target.name
    total = 0
    try:
        with temporary.open("xb") as stream:
            async for chunk in request.stream():
                total += len(chunk)
                if total > limit:
                    raise HTTPException(413, f"Mô hình vượt quá {detector.cfg.MAX_MODEL_MB} MB.")
                await run_in_threadpool(stream.write, chunk)
        if not total:
            raise HTTPException(400, "File mô hình trống.")
        await run_in_threadpool(detector.validate_model, kind, temporary)
        temporary.replace(target)
        if convert:
            detector.converter.submit(detector.model_store.identifier(target), strict=False)
        return list_models(detector)
    except HTTPException:
        raise
    except DetectorBusy as exc:
        raise HTTPException(409, "Đang nạp mô hình khác, vui lòng chờ.") from exc
    except Exception as exc:
        raise HTTPException(400, f"Không dùng được mô hình này: {exc}") from exc
    finally:
        temporary.unlink(missing_ok=True)
        staging.rmdir()
