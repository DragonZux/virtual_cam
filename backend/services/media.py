"""Ảnh / video tải lên để thử nhận diện: đặt tên an toàn, ghi vào UPLOAD_DIR, liệt kê và tìm lại.

Tên file do trình duyệt gửi chỉ dùng làm gợi ý: bỏ ký tự lạ, thêm mốc thời gian để không ghi đè,
chỉ nhận đuôi ảnh / video trình duyệt phát được.
"""
from __future__ import annotations

import re
import unicodedata
from collections.abc import AsyncIterator
from datetime import datetime
from pathlib import Path

import anyio

from models import MediaItem, MediaKind

CONTENT_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".ogv": "video/ogg",
}
PART_SUFFIX = ".part"


class MediaTooLarge(Exception):
    pass


def media_kind(name: str) -> MediaKind | None:
    content_type = CONTENT_TYPES.get(Path(name).suffix.lower())
    if content_type is None:
        return None
    return MediaKind.video if content_type.startswith("video/") else MediaKind.image


def content_type(name: str) -> str:
    return CONTENT_TYPES.get(Path(name).suffix.lower(), "application/octet-stream")


def new_path(folder: Path, original: str, now: datetime | None = None) -> Path:
    """Đường dẫn chưa tồn tại trong `folder` cho file tên `original`; ValueError nếu không phải ảnh / video."""
    base = Path(original.replace("\\", "/")).name
    suffix = Path(base).suffix.lower()
    if media_kind(base) is None:
        raise ValueError("Chỉ nhận ảnh (JPG, PNG, WEBP, BMP, GIF) hoặc video (MP4, WEBM, MOV, M4V, OGV).")
    stem = unicodedata.normalize("NFC", Path(base).stem)
    stem = re.sub(r"[^\w\-]+", "_", stem).strip("_-")[:80] or "media"
    stamp = (now or datetime.now()).strftime("%Y%m%d-%H%M%S")
    candidate = folder / f"{stamp}_{stem}{suffix}"
    index = 1
    while candidate.exists() or candidate.with_name(candidate.name + PART_SUFFIX).exists():
        candidate = folder / f"{stamp}_{stem}-{index}{suffix}"
        index += 1
    return candidate


async def save_stream(chunks: AsyncIterator[bytes], target: Path, limit: int) -> int:
    """Ghi dần body vào file tạm rồi đổi tên — lỗi giữa chừng không để lại file dở. Trả về số byte."""
    target.parent.mkdir(parents=True, exist_ok=True)
    part = target.with_name(target.name + PART_SUFFIX)
    size = 0
    try:
        async with await anyio.open_file(part, "wb") as file:
            async for chunk in chunks:
                size += len(chunk)
                if size > limit:
                    raise MediaTooLarge
                await file.write(chunk)
        if size == 0:
            raise ValueError("File rỗng.")
        part.replace(target)
    finally:
        part.unlink(missing_ok=True)
    return size


def describe(path: Path) -> MediaItem:
    stat = path.stat()
    return MediaItem(name=path.name, kind=media_kind(path.name), size=stat.st_size, modified=int(stat.st_mtime * 1000))


def list_media(folder: Path) -> list[MediaItem]:
    """Ảnh / video trong thư mục, mới nhất trước (bỏ file dở và file khác loại)."""
    if not folder.is_dir():
        return []
    files = [path for path in folder.iterdir() if path.is_file() and media_kind(path.name) is not None]
    return sorted((describe(path) for path in files), key=lambda item: item.modified, reverse=True)


def find(folder: Path, name: str) -> Path | None:
    """File `name` nằm ngay trong `folder` (không cho đi ra ngoài bằng ../ hay đường dẫn tuyệt đối)."""
    if not name or Path(name).name != name or "\\" in name or media_kind(name) is None:
        return None
    path = folder / name
    return path if path.is_file() else None
