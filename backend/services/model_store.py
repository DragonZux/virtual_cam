"""File mô hình YOLO tải thêm: đặt tên an toàn, liệt kê, ghi nhớ bật / tắt và bảng lớp.

`models.json` trong thư mục mô hình giữ trạng thái giữa các lần chạy:
  {"disabled": ["a.pt", "yolo26m-seg.pt"], "meta": {"a.pt": {"task": "detect", "names": {"0": "drone"}}}}
Nhờ bảng lớp đã lưu, mô hình đang tắt không cần nạp lên GPU mà Cài đặt vẫn biết nó nhận diện được gì.
File .pt chép tay vào thư mục cũng được nhận ở lần khởi động sau.
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path
from typing import Any

from core.logging import logger

MODEL_SUFFIX = ".pt"
STATE_FILE = "models.json"


def new_model_path(folder: Path, original: str, reserved: set[str] = frozenset()) -> Path:
    """Đường dẫn chưa dùng trong `folder` cho file `original`; ValueError nếu không phải .pt."""
    base = Path(original.replace("\\", "/")).name
    if Path(base).suffix.lower() != MODEL_SUFFIX:
        raise ValueError("Chỉ nhận mô hình YOLO dạng .pt (Ultralytics).")
    stem = unicodedata.normalize("NFC", Path(base).stem)
    stem = re.sub(r"[^\w\-]+", "_", stem).strip("_-")[:80] or "model"
    candidate = folder / f"{stem}{MODEL_SUFFIX}"
    index = 1
    while candidate.exists() or candidate.name in reserved or candidate.with_name(candidate.name + ".part").exists():
        candidate = folder / f"{stem}-{index}{MODEL_SUFFIX}"
        index += 1
    return candidate


def model_files(folder: Path) -> list[Path]:
    """File .pt trong thư mục, cũ nhất trước (thứ tự tải lên)."""
    if not folder.is_dir():
        return []
    files = [path for path in folder.iterdir() if path.is_file() and path.suffix.lower() == MODEL_SUFFIX]
    return sorted(files, key=lambda path: (path.stat().st_mtime, path.name))


def find_model(folder: Path, name: str) -> Path | None:
    if not name or Path(name).name != name or "\\" in name or Path(name).suffix.lower() != MODEL_SUFFIX:
        return None
    path = folder / name
    return path if path.is_file() else None


def load_state(folder: Path) -> dict[str, Any]:
    state: dict[str, Any] = {"disabled": [], "meta": {}}
    path = folder / STATE_FILE
    if path.is_file():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            state["disabled"] = [str(name) for name in data.get("disabled", [])]
            state["meta"] = {str(k): v for k, v in dict(data.get("meta", {})).items()}
        except (OSError, ValueError, AttributeError, TypeError):
            logger.warning("Ignoring unreadable %s", path)
    return state


def save_state(folder: Path, state: dict[str, Any]) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    tmp = folder / (STATE_FILE + ".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(folder / STATE_FILE)


def names_from_meta(meta: dict[str, Any]) -> dict[int, str]:
    return {int(k): str(v) for k, v in dict(meta.get("names", {})).items()}
