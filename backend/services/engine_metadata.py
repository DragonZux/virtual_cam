"""Read model metadata (Ultralytics engine header, TorchScript extra files) without importing CUDA or TensorRT."""
import json
from pathlib import Path
import zipfile


def engine_header(path: Path) -> tuple[int, dict]:
    with path.open("rb") as stream:
        size = int.from_bytes(stream.read(4), "little")
        # Raw TensorRT plans start with a magic number, not a JSON length.
        if not 0 < size <= 1024 * 1024:
            return 0, {}
        try:
            metadata = json.loads(stream.read(size))
        except (ValueError, UnicodeDecodeError):
            return 0, {}
        if not isinstance(metadata, dict):
            return 0, {}
        return 4 + size, metadata


def engine_kind(path: Path) -> str | None:
    """Unknown raw plans can be uploaded with an explicit role in Settings."""
    try:
        _, metadata = engine_header(path)
    except OSError:
        return None
    if metadata.get("task") == "segment":
        return "segmentation"
    names = metadata.get("names")
    if metadata.get("task") == "detect" and isinstance(names, (dict, list)) and len(names) == 1:
        return "laser"
    if not metadata and path.stem.lower().startswith("laser-advr-"):
        return "laser"
    return None


def torchscript_metadata(path: Path) -> dict:
    """Ultralytics TorchScript export: metadata JSON in extra/config.txt. ADVR laser uses config.json → {}."""
    try:
        with zipfile.ZipFile(path) as archive:
            name = next((n for n in archive.namelist() if n.endswith("/extra/config.txt")), None)
            metadata = json.loads(archive.read(name)) if name else {}
    except (OSError, ValueError, zipfile.BadZipFile, KeyError):
        return {}
    return metadata if isinstance(metadata, dict) and metadata.get("task") else {}


def torchscript_kind(path: Path) -> str:
    """Ultralytics segmentation TorchScript → segmentation; everything else (ADVR) stays a laser model."""
    return "segmentation" if torchscript_metadata(path).get("task") == "segment" else "laser"
