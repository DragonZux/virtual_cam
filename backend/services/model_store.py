"""Local model catalog and persisted selection, inside the mounted models directory."""
from __future__ import annotations

import json
from pathlib import Path
import re
from uuid import uuid4

from core.config import Settings
from core.logging import logger
from services.engine_metadata import engine_kind

KINDS = ("segmentation", "laser")


class ModelStore:
    def __init__(self, cfg: Settings):
        self.cfg = cfg
        self.root = cfg.MODEL_DIR.resolve()
        self.folder = self.root / "custom"
        self.state_file = self.folder / "active.json"

    def catalog(self) -> dict[str, tuple[str, Path]]:
        entries: dict[str, tuple[str, Path]] = {}
        for kind, path in (("segmentation", self.cfg.yolo_model_path), ("laser", self.cfg.laser_model_path)):
            entries[self.identifier(path)] = (kind, path)
        if self.root.is_dir():
            for path in sorted(self.root.iterdir()):
                if path.is_file() and path.suffix.lower() in (".pt", ".torchscript", ".engine"):
                    kind = (engine_kind(path) if path.suffix.lower() == ".engine" else
                            "laser" if path.suffix.lower() == ".torchscript" else "segmentation")
                    if kind:
                        entries.setdefault(self.identifier(path), (kind, path))
        for kind in KINDS:
            folder = self.folder / kind
            if folder.is_dir():
                for path in sorted(folder.iterdir()):
                    if path.is_file() and path.suffix.lower() in (".pt", ".torchscript", ".engine"):
                        entries[self.identifier(path)] = (kind, path)
        return entries

    def identifier(self, path: Path) -> str:
        return path.resolve().relative_to(self.root).as_posix()

    def resolve(self, model_id: str) -> tuple[str, Path]:
        entry = self.catalog().get(model_id)
        if entry is None or not entry[1].is_file():
            raise KeyError(model_id)
        # Do not follow files linked outside the configured model directory.
        entry[1].resolve().relative_to(self.root)
        return entry

    def saved(self) -> dict[str, str]:
        try:
            value = json.loads(self.state_file.read_text(encoding="utf-8"))
            return {kind: model_id for kind, model_id in value.items()
                    if kind in KINDS and isinstance(model_id, str) and self.resolve(model_id)[0] == kind}
        except FileNotFoundError:
            return {}
        except (OSError, ValueError, KeyError, AttributeError):
            logger.warning("Ignoring invalid model selection in %s", self.state_file)
            return {}

    def save(self, active: dict[str, str]) -> None:
        self.folder.mkdir(parents=True, exist_ok=True)
        temporary = self.state_file.with_suffix(".tmp")
        temporary.write_text(json.dumps(active, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(self.state_file)

    def engine_path(self, kind: str, source: Path) -> Path:
        """Engine FP16 build từ `source`: cạnh các mô hình tải lên cùng loại, không ghi đè engine đã có."""
        folder = self.folder / kind
        folder.mkdir(parents=True, exist_ok=True)
        target = folder / f"{source.stem}-fp16.engine"
        return target if not target.exists() else folder / f"{source.stem}-fp16-{uuid4().hex[:6]}.engine"

    def upload_path(self, kind: str, name: str) -> Path:
        suffix = Path(name).suffix.lower()
        allowed = (".pt", ".engine") if kind == "segmentation" else (".pt", ".torchscript", ".engine")
        if suffix not in allowed:
            raise ValueError("Segmentation cần .pt hoặc .engine; laser cần .pt, .torchscript hoặc .engine.")
        stem = re.sub(r"[^\w-]+", "_", Path(name.replace("\\", "/")).stem).strip("_")[:70] or "model"
        folder = self.folder / kind
        folder.mkdir(parents=True, exist_ok=True)
        return folder / f"{stem}-{uuid4().hex[:8]}{suffix}"
