"""API ảnh / video thử: tải lên (lưu vào UPLOAD_DIR), liệt kê, phát lại. Nhận diện vẫn đi qua /vision/frame."""
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse

from core.config import settings
from core.logging import logger
from models import MediaItem, MediaList
from services import media

router = APIRouter(prefix="/media", tags=["Media"])

# Swagger: body là file thô (không phải multipart), tên file ở query `name`
BINARY_BODY = {
    "requestBody": {
        "required": True,
        "content": {"application/octet-stream": {"schema": {"type": "string", "format": "binary"}}},
    }
}


@router.get("", response_model=MediaList)
def list_media():
    """Ảnh / video đã tải lên, mới nhất trước."""
    return MediaList(
        folder=settings.upload_dir_label,
        max_bytes=settings.max_upload_bytes,
        items=media.list_media(settings.UPLOAD_DIR),
    )


@router.post(
    "",
    response_model=MediaItem,
    status_code=201,
    openapi_extra=BINARY_BODY,
    responses={
        400: {"description": "File rỗng"},
        413: {"description": "File quá lớn"},
        415: {"description": "Không phải ảnh / video được hỗ trợ"},
    },
)
async def upload_media(request: Request, name: str = Query(..., min_length=1, max_length=255, description="Tên file gốc")):
    """Lưu một ảnh / video vào thư mục UPLOAD_DIR của máy chủ."""
    try:
        target = media.new_path(settings.UPLOAD_DIR, name)
    except ValueError as exc:
        raise HTTPException(415, str(exc)) from exc
    limit = settings.max_upload_bytes
    too_large = HTTPException(413, f"File vượt quá giới hạn {settings.MAX_UPLOAD_MB} MB.")
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > limit:
        raise too_large
    try:
        size = await media.save_stream(request.stream(), target, limit)
    except media.MediaTooLarge as exc:
        raise too_large from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except OSError as exc:
        logger.exception("Could not save upload to %s", target)
        raise HTTPException(500, f"Không ghi được file vào {settings.upload_dir_label}.") from exc
    logger.info("Saved upload %s (%d bytes)", target, size)
    return media.describe(target)


@router.get("/{name}", responses={404: {"description": "Không có file này"}})
def get_media(name: str):
    """Trả lại file đã tải lên (hỗ trợ Range để tua video)."""
    path = media.find(settings.UPLOAD_DIR, name)
    if path is None:
        raise HTTPException(404, "Không tìm thấy file.")
    return FileResponse(path, media_type=media.content_type(name))
