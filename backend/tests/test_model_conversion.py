import time
from types import SimpleNamespace

import pytest

from core.config import Settings
from services.model_store import ModelStore


@pytest.fixture
def workspace(detector, tmp_path, monkeypatch):
    """Thư mục mô hình tạm, GPU / TensorRT giả, build giả (ghi file engine) thay tiến trình TensorRT."""
    cfg = Settings(MODEL_DIR=tmp_path, YOLO_MODEL="initial.pt", LASER_MODEL="initial.torchscript", MAX_MODEL_MB=1)
    detector.cfg = cfg
    detector.model_store = ModelStore(cfg)
    detector._active = {"segmentation": "initial.pt", "laser": "initial.torchscript"}
    for name in ("initial.pt", "initial.torchscript", "custom/segmentation/ready.engine"):
        (tmp_path / name).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / name).write_bytes(b"model")
    monkeypatch.setattr(detector, "engine_unavailable", lambda: None)
    loaded = []

    def prepare(kind, path):
        loaded.append(path.name)
        if path.read_bytes() == b"broken":
            raise ValueError("cannot deserialize")
        return SimpleNamespace(names={0: "person", 1: "engine object"})

    monkeypatch.setattr(detector, "_prepare_model", prepare)
    builds = []

    def build(source, output, imgsz):
        builds.append((source.name, imgsz))
        if source.read_bytes() == b"fail":
            raise RuntimeError("LLVM ERROR: out of memory")
        output.write_bytes(b"broken" if source.read_bytes() == b"bad engine" else b"engine")

    detector.converter.build = build
    return SimpleNamespace(folder=tmp_path, loaded=loaded, builds=builds)


def finished(client, timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        data = client.get("/api/models").json()
        if all(job["status"] in ("done", "error") for job in data["conversions"]):
            return data
        time.sleep(0.02)
    raise AssertionError("conversion did not finish")


def test_conversion_builds_fp16_engine_and_selects_it(client, detector, workspace):
    response = client.post("/api/models/convert", json={"id": "initial.pt"})
    assert response.status_code == 202
    assert response.json()["conversions"][0]["status"] in ("queued", "running", "done")
    data = finished(client)
    job = data["conversions"][0]
    assert job["status"] == "done" and job["engine"] == "custom/segmentation/initial-fp16.engine"
    assert workspace.builds == [("initial.pt", detector.cfg.IMAGE_SIZE)]
    engine = next(item for item in data["items"] if item["id"] == job["engine"])
    assert engine["active"] and engine["kind"] == "segmentation" and not engine["convertible"]
    assert detector.classes == ["engine object"] and detector.model_revision == 1
    assert ModelStore(detector.cfg).saved()["segmentation"] == job["engine"]


def test_laser_uses_laser_image_size_and_never_overwrites(client, detector, workspace):
    (workspace.folder / "custom" / "laser").mkdir(parents=True)
    (workspace.folder / "custom" / "laser" / "initial-fp16.engine").write_bytes(b"older")
    client.post("/api/models/convert", json={"id": "initial.torchscript"})
    job = finished(client)["conversions"][0]
    assert workspace.builds == [("initial.torchscript", detector.cfg.LASER_IMAGE_SIZE)]
    assert job["status"] == "done" and job["engine"].startswith("custom/laser/initial-fp16-")
    assert (workspace.folder / "custom" / "laser" / "initial-fp16.engine").read_bytes() == b"older"
    assert detector.status()["laser_model"] == job["engine"]


def test_failed_build_or_engine_keeps_running_model(client, detector, workspace):
    (workspace.folder / "initial.pt").write_bytes(b"fail")
    client.post("/api/models/convert", json={"id": "initial.pt"})
    job = finished(client)["conversions"][0]
    assert job["status"] == "error" and "out of memory" in job["error"]
    (workspace.folder / "initial.pt").write_bytes(b"bad engine")
    client.post("/api/models/convert", json={"id": "initial.pt"})
    job = finished(client)["conversions"][0]
    assert job["status"] == "error" and "cannot deserialize" in job["error"]
    # Engine không nạp được thì bị xoá, mô hình đang chạy giữ nguyên
    assert not list((workspace.folder / "custom" / "segmentation").glob("initial*.engine"))
    assert detector.status()["model"] == "initial.pt" and detector.model_revision == 0


def test_convert_rejects_engines_and_missing_tensorrt(client, detector, workspace, monkeypatch):
    assert client.post("/api/models/convert", json={"id": "custom/segmentation/ready.engine"}).status_code == 400
    assert client.post("/api/models/convert", json={"id": "nope.pt"}).status_code == 404
    monkeypatch.setattr(detector, "engine_unavailable", lambda: "Mô hình TensorRT cần GPU NVIDIA CUDA")
    response = client.post("/api/models/convert", json={"id": "initial.pt"})
    assert response.status_code == 400 and "GPU" in response.json()["detail"]
    data = client.get("/api/models").json()
    assert data["convert_available"] is False and "GPU" in data["convert_reason"]
    assert {item["id"]: item["convertible"] for item in data["items"]} == {
        "initial.pt": True, "initial.torchscript": True, "custom/segmentation/ready.engine": False}


def test_upload_with_convert_queues_engine_build(client, detector, workspace):
    response = client.post("/api/models", params={"kind": "segmentation", "name": "mine.pt", "convert": "true"},
                           content=b"model", headers={"Content-Type": "application/octet-stream"})
    assert response.status_code == 201
    job = finished(client)["conversions"][0]
    assert job["status"] == "done" and job["name"].startswith("mine-")
    assert detector.status()["model"] == job["engine"]
