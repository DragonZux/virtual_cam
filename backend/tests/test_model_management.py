import json
from types import SimpleNamespace

import pytest

from core.config import Settings
from services.model_store import ModelStore
from services.detector import ModelChanged
from tests.helpers import jpeg


@pytest.fixture
def catalog(detector, tmp_path, monkeypatch):
    cfg = Settings(MODEL_DIR=tmp_path, YOLO_MODEL="initial.pt", LASER_MODEL="initial.torchscript", MAX_MODEL_MB=1)
    detector.cfg = cfg
    detector.model_store = ModelStore(cfg)
    detector._active = {"segmentation": "initial.pt", "laser": "initial.torchscript"}
    for name in ("initial.pt", "initial.torchscript", "new.pt"):
        (tmp_path / name).write_bytes(b"model")
    calls = []

    def prepare(kind, path):
        calls.append((kind, path.name))
        if path.read_bytes() == b"invalid":
            raise ValueError("Invalid model")
        return SimpleNamespace(names={0: "person", 1: "custom object"})

    monkeypatch.setattr(detector, "_prepare_model", prepare)
    return tmp_path, calls


def test_catalog_discovers_existing_models_and_roles(client, catalog):
    data = client.get("/api/models").json()
    assert data["max_bytes"] == 1024 * 1024
    assert {(m["id"], m["kind"], m["active"]) for m in data["items"]} == {
        ("initial.pt", "segmentation", True), ("initial.torchscript", "laser", True),
        ("new.pt", "segmentation", False),
    }


def test_activate_updates_classes_and_persists(client, detector, catalog):
    response = client.post("/api/models/activate", json={"id": "new.pt"})
    assert response.status_code == 200
    state = response.json()
    assert state["model"] == "new.pt"
    assert state["classes"] == ["custom object"]
    assert state["defaults"]["targets"] == ["custom object"]
    assert state["model_revision"] == 1 and state["model_busy"] is False
    assert ModelStore(detector.cfg).saved()["segmentation"] == "new.pt"
    assert client.post("/api/models/activate", json={"id": "new.pt"}).json()["model_busy"] is False


def test_failure_keeps_running_model_and_classes(client, detector, catalog):
    folder, _ = catalog
    old_classes = list(detector.classes)
    (folder / "new.pt").write_bytes(b"invalid")
    assert client.post("/api/models/activate", json={"id": "new.pt"}).status_code == 400
    assert detector.status()["model"] == "initial.pt"
    assert detector.classes == old_classes
    assert detector.model_revision == 0 and not detector.model_busy
    assert not detector.model_store.state_file.exists()


def test_persistence_failure_keeps_previous_model(client, detector, catalog, monkeypatch):
    def fail(_):
        raise OSError("Disk full")
    monkeypatch.setattr(detector.model_store, "save", fail)
    old_classes = list(detector.classes)
    assert client.post("/api/models/activate", json={"id": "new.pt"}).status_code == 400
    assert detector.status()["model"] == "initial.pt"
    assert detector.classes == old_classes


@pytest.mark.parametrize("kind,name", [("segmentation", "my-seg.pt"), ("segmentation", "my-seg.torchscript"),
                                     ("laser", "spot.pt"), ("laser", "spot.torchscript"),
                                     ("segmentation", "objects.engine"), ("laser", "spot.engine")])
def test_upload_replaces_running_model_without_overwriting(client, detector, catalog, kind, name):
    folder, calls = catalog
    ids = []
    for _ in range(2):
        response = client.post("/api/models", params={"kind": kind, "name": name}, content=b"new model")
        assert response.status_code == 201
        ids.append(next(m["id"] for m in response.json()["items"] if m["active"] and m["kind"] == kind))
    files = list((folder / "custom" / kind).iterdir())
    assert len(files) == 2 and all(path.is_file() for path in files)
    assert len(calls) == 2 and all(call[0] == kind for call in calls)
    # Mỗi lần tải lên, mô hình mới thay mô hình cùng loại ngay và được nhớ khi khởi động lại
    assert ids[0] != ids[1] and all(model_id.startswith(f"custom/{kind}/") for model_id in ids)
    assert detector._active[kind] == ids[1] and ModelStore(detector.cfg).saved()[kind] == ids[1]
    other = "laser" if kind == "segmentation" else "segmentation"
    assert detector._active[other] == ("initial.torchscript" if kind == "segmentation" else "initial.pt")


def test_upload_rejects_invalid_empty_large_and_wrong_format(client, catalog):
    folder, _ = catalog
    for content, expected in ((b"invalid", 400), (b"", 400), (b"x" * (1024 * 1024 + 1), 413)):
        response = client.post("/api/models", params={"kind": "segmentation", "name": "bad.pt"}, content=content)
        assert response.status_code == expected
    # Nạp lỗi: file bị bỏ, mô hình đang chạy giữ nguyên
    assert not list((folder / "custom" / "segmentation").iterdir())
    assert client.get("/api/vision/status").json()["model"] == "initial.pt"
    assert client.post("/api/models?kind=segmentation&name=bad.onnx", content=b"x").status_code == 415
    assert client.post("/api/models?kind=unknown&name=bad.pt", content=b"x").status_code == 422


def test_missing_and_traversal_models_are_not_activated(client, catalog):
    for model_id in ("../outside.pt", "missing.pt", "C:/secret.pt"):
        assert client.post("/api/models/activate", json={"id": model_id}).status_code == 404


def test_sanitize_upload_name(client, catalog):
    folder, _ = catalog
    response = client.post("/api/models", params={"kind": "laser", "name": "../../outside.pt"}, content=b"x")
    assert response.status_code == 201
    custom = next(m for m in response.json()["items"] if m["id"].startswith("custom/"))
    assert (folder / custom["id"]).resolve().is_relative_to(folder)


def test_busy_model_change_preserves_selection(client, detector, catalog):
    detector._management_lock.acquire()
    try:
        assert client.post("/api/models/activate", json={"id": "new.pt"}).status_code == 409
        assert detector.status()["model"] == "initial.pt"
    finally:
        detector._management_lock.release()


def test_frames_from_previous_model_are_rejected(client, detector, catalog):
    options = detector.options(None, None, None)
    assert client.post("/api/models/activate", json={"id": "new.pt"}).status_code == 200
    assert client.post("/api/vision/frame?model_revision=0", content=jpeg(), headers={"Content-Type": "image/jpeg"}).status_code == 409
    with pytest.raises(ModelChanged):
        detector.analyze(jpeg(), options)


def test_unloadable_saved_selection_falls_back_to_defaults(detector, catalog, monkeypatch):
    """Engine của hệ điều hành khác (Windows ↔ Docker) không được làm hỏng cả bộ nhận diện."""
    folder, _ = catalog
    (folder / "windows.engine").write_bytes(b"plan")
    (folder / "windows-laser.engine").write_bytes(b"plan")
    detector.model_store.save({"segmentation": "windows.engine", "laser": "windows-laser.engine"})
    monkeypatch.setattr(detector.model_store, "catalog", lambda: {
        "initial.pt": ("segmentation", folder / "initial.pt"), "windows.engine": ("segmentation", folder / "windows.engine"),
        "initial.torchscript": ("laser", folder / "initial.torchscript"),
        "windows-laser.engine": ("laser", folder / "windows-laser.engine")})

    def load(path):
        if path.suffix == ".engine":
            raise RuntimeError("engine plan not compatible with this platform")
        return SimpleNamespace(names={0: "person", 1: "cup"}, close=lambda: None)

    monkeypatch.setattr(detector, "_load_segmentation", load)
    monkeypatch.setattr(detector, "_prepare_model", lambda kind, path: load(path))
    monkeypatch.setattr(detector, "_predict", lambda *args: None)
    detector.error = None
    detector._load()
    assert detector.error is None and detector.laser_error is None
    assert detector._active == {"segmentation": "initial.pt", "laser": "initial.torchscript"}
    assert detector.classes == ["cup"]
    # Lựa chọn giữ nguyên cho máy build ra engine
    assert json.loads(detector.model_store.state_file.read_text(encoding="utf-8")) == {
        "segmentation": "windows.engine", "laser": "windows-laser.engine"}
