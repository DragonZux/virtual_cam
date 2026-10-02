"""Engine discovery, coordinate contracts and routing; no CUDA required."""
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import sys

import numpy as np
import pytest

from core.config import Settings
from services.engine_metadata import engine_header
from services.laser_model import prepare_frame, select_spot
from services.model_store import ModelStore
from services.tensorrt_laser import TensorRTLaserModel


def write_engine(path, metadata=None):
    raw = b"ftrt" + b"\0" * 20
    if metadata is not None:
        header = json.dumps(metadata).encode()
        raw = len(header).to_bytes(4, "little") + header + raw
    path.write_bytes(raw)
    return path


def test_engine_catalog_distinguishes_roles_and_persists(tmp_path):
    write_engine(tmp_path / "renamed.engine", {"task": "segment", "names": {0: "cup"}})
    write_engine(tmp_path / "spot.engine", {"task": "detect", "names": {0: "laser"}})
    write_engine(tmp_path / "laser-advr-yolov5l6.engine")
    write_engine(tmp_path / "unknown.engine")
    write_engine(tmp_path / "invalid.engine", {"task": "detect", "names": 123})
    store = ModelStore(Settings(MODEL_DIR=tmp_path))
    entries = store.catalog()
    assert entries["renamed.engine"][0] == "segmentation"
    assert entries["spot.engine"][0] == entries["laser-advr-yolov5l6.engine"][0] == "laser"
    assert "unknown.engine" not in entries and "invalid.engine" not in entries
    state = {"segmentation": "renamed.engine", "laser": "laser-advr-yolov5l6.engine"}
    store.save(state)
    assert store.saved() == state


def test_metadata_reader_handles_raw_truncated_and_non_object_headers(tmp_path):
    path = write_engine(tmp_path / "model.engine")
    assert engine_header(path) == (0, {})
    for payload in (b"{", b"[]", b"null"):
        path.write_bytes(len(payload).to_bytes(4, "little") + payload)
        assert engine_header(path) == (0, {})


@pytest.mark.parametrize("shape,point", [
    ((720, 1280), (702, 253)), ((1280, 720), (320, 1000)),
    ((725, 1280), (1100, 700)), ((360, 640), (123, 200)), ((900, 500), (100, 450)),
])
def test_static_laser_letterbox_maps_back_without_stretching(shape, point):
    frame = np.full((*shape, 3), (10, 20, 30), dtype=np.uint8)
    pixels, gain, padding = prepare_frame(frame, 1280, target_shape=(1280, 1280))
    assert pixels.shape == (1, 3, 1280, 1280) and pixels.dtype == np.float32
    x, y = point
    px, py = padding
    np.testing.assert_allclose(pixels[0, :, round(y * gain + py), round(x * gain + px)], [30/255, 20/255, 10/255])
    rows = np.array([[x * gain + px, y * gain + py, 8, 8, 0.9, 0.8]])
    assert select_spot(rows, shape, gain, padding, 0.55).point == list(point)
    # A bright candidate inside the letterbox margin is not a laser in the image.
    if py > 1:
        rows[0, 1] = py - 1
        assert select_spot(rows, shape, gain, padding, 0.55) is None


def test_segmentation_engine_requires_metadata_and_cuda(detector, monkeypatch, tmp_path):
    path = write_engine(tmp_path / "renamed.engine", {"task": "segment", "names": {0: "cup"}})
    monkeypatch.setitem(sys.modules, "ultralytics", SimpleNamespace(YOLO=lambda *a, **kw: None))
    with pytest.raises(ValueError, match="GPU NVIDIA"):
        detector._load_segmentation(path)
    monkeypatch.setattr(detector, "_require_engine_gpu", lambda: None)
    wrong = write_engine(tmp_path / "wrong.engine", {"task": "detect", "names": {0: "laser"}})
    with pytest.raises(ValueError, match="segmentation"):
        detector._load_segmentation(wrong)
    calls = []
    def load(name, **kwargs):
        calls.append(kwargs)
        return SimpleNamespace(task="segment", names={0: "cup"})
    monkeypatch.setitem(sys.modules, "ultralytics", SimpleNamespace(YOLO=load))
    assert detector._load_segmentation(path).names == {0: "cup"}
    assert calls == [{"task": "segment"}]


def test_raw_laser_routes_to_native_runtime_and_releases_validation(detector, monkeypatch, tmp_path):
    path = write_engine(tmp_path / "laser.engine")
    events = []
    model = SimpleNamespace(warm_up=lambda: events.append("warm"), close=lambda: events.append("close"))
    monkeypatch.setattr(detector, "_require_engine_gpu", lambda: None)
    monkeypatch.setattr("services.detector.TensorRTLaserModel", lambda *args: model)
    detector.validate_model("laser", path)
    assert events == ["warm", "close"]
    assert not detector.model_busy


def test_failed_laser_warmup_releases_candidate(detector, monkeypatch, tmp_path):
    path = write_engine(tmp_path / "laser.engine")
    closed = []
    def fail():
        raise RuntimeError("warm-up failed")
    monkeypatch.setattr(detector, "_require_engine_gpu", lambda: None)
    monkeypatch.setattr("services.detector.TensorRTLaserModel", lambda *args: SimpleNamespace(warm_up=fail, close=lambda: closed.append(True)))
    with pytest.raises(RuntimeError, match="warm-up failed"):
        detector._prepare_model("laser", path)
    assert closed == [True]


def test_ultralytics_laser_engine_rejects_segmentation(detector, monkeypatch, tmp_path):
    path = write_engine(tmp_path / "wrong.engine", {"task": "segment", "names": {0: "cup"}})
    monkeypatch.setattr(detector, "_require_engine_gpu", lambda: None)
    with pytest.raises(ValueError, match="một lớp"):
        detector._prepare_model("laser", path)


def test_missing_engines_are_never_downloaded_or_written_as_torchscript(tmp_path, monkeypatch):
    spec = importlib.util.spec_from_file_location("test_init_models", Path(__file__).resolve().parents[2] / "docker/init_models.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, "MODEL_DIR", tmp_path)
    monkeypatch.setattr(module, "YOLO_MODEL", "objects.engine")
    monkeypatch.setattr(module, "LASER_MODEL", "laser.engine")
    (tmp_path / module.HAND_MODEL).write_bytes(b"hand")
    monkeypatch.setattr(module, "fetch", lambda *args: pytest.fail("must not download an engine"))
    monkeypatch.setattr(module.subprocess, "run", lambda *args: pytest.fail("must not export TorchScript to .engine"))
    module.prepare()
    assert not (tmp_path / "objects.engine").exists() and not (tmp_path / "laser.engine").exists()


@pytest.mark.model
def test_real_static_laser_runs_across_threads():
    from concurrent.futures import ThreadPoolExecutor
    import torch

    root = Path(__file__).resolve().parents[2] / "models"
    if not torch.cuda.is_available() or not (root / "laser-advr-yolov5l6.engine").is_file():
        pytest.skip("requires local TensorRT engine and CUDA")
    model = TensorRTLaserModel(root / "laser-advr-yolov5l6.engine", "cuda:0", 0.55)
    try:
        model.warm_up()
        for shape in ((720, 1280), (1280, 720), (480, 640)):
            frame = np.zeros((*shape, 3), dtype=np.uint8)
            with ThreadPoolExecutor(max_workers=1) as pool:
                assert pool.submit(model.detect, frame, (100, 100)).result() is None
    finally:
        model.close()
