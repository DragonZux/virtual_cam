"""Read Ultralytics' optional engine header without importing CUDA or TensorRT."""
import json
from pathlib import Path


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
