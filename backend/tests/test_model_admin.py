"""Nhiều mô hình YOLO: gộp kết quả, tải thêm / bật tắt / xoá qua API, chỉ máy chủ tự quản lý, nạp lại khi khởi động."""
import json
from types import SimpleNamespace

import numpy as np
import pytest

from core.config import settings
from main import app
from services import model_store
from services.detector import Detector
from models import PointerMode
from tests.helpers import FAKE_NAMES, hand_pointing_at
from tests.test_detector_output import model_result

MODELS_URL = "/api/models"
DRONE_NAMES = {0: "drone", 1: "cup", 2: "person"}


class FakeYolo:
    def __init__(self):
        self.calls = []

    def predict(self, frame, classes, **kwargs):
        self.calls.append(classes)
        return [None]


def detect_result(rows, names):
    """Kết quả mô hình detect (không có mask): rows = [(class_id, conf, [x1, y1, x2, y2])]."""
    boxes = SimpleNamespace(
        cls=np.array([r[0] for r in rows]), conf=np.array([r[1] for r in rows]), xyxy=np.array([r[2] for r in rows]),
    )
    boxes.cpu = lambda: boxes
    return SimpleNamespace(boxes=boxes, masks=None, orig_shape=(480, 640), names=names)


@pytest.fixture
def model_dir(tmp_path, monkeypatch, detector):
    folder = tmp_path / "models"
    monkeypatch.setattr(settings, "CUSTOM_MODEL_DIR", folder)
    monkeypatch.setattr(settings, "MODEL_ADMIN", "all")
    # Mô hình mặc định (bật lại) giữ bảng lớp COCO giả; file tải lên là mô hình "drone"
    monkeypatch.setattr(detector, "_open_model", lambda path: (
        (FakeYolo(), "segment", dict(FAKE_NAMES)) if path == settings.yolo_model_path
        else (FakeYolo(), "detect", dict(DRONE_NAMES))))
    return folder


def upload(client, name, body=b"weights"):
    return client.post(MODELS_URL, params={"name": name}, content=body, headers={"Content-Type": "application/octet-stream"})


def classes(client):
    return client.get("/api/vision/status").json()["classes"]


def test_two_models_merge_same_object_and_detect_model_uses_box_outline():
    seg = model_result()  # cup, laptop, mouse (có mask)
    det = detect_result([(0, 0.95, [301, 221, 339, 259]), (1, 0.7, [50, 300, 90, 340])], {0: "mouse", 1: "drone"})
    output = Detector._extract_output([seg, det], hand_pointing_at(0.5, 0.5), 30)
    names = [d.name for d in output.detections]
    assert names == ["cup", "laptop", "mouse", "drone"]
    mouse = output.detections[2]
    # Cùng một con chuột: giữ kết quả tin cậy hơn của mô hình thứ hai, viền lấy theo khung
    assert mouse.confidence == 0.95
    assert output.polygons[2].tolist() == [[301, 221], [339, 221], [339, 259], [301, 259]]
    # Mask của mô hình phân đoạn chỉ lấy cho laptop (con chuột của nó đã bị gộp)
    assert seg.masks.requested == [[1]]


def test_upload_model_extends_classes_then_toggle_and_remove(client, detector, model_dir):
    before = classes(client)
    res = upload(client, "My Drone.pt")
    assert res.status_code == 201
    item = res.json()
    assert item == {"id": "My_Drone.pt", "builtin": False, "enabled": True, "task": "detect",
                    "classes": ["drone", "cup"], "size": 7, "error": None}
    assert (model_dir / "My_Drone.pt").read_bytes() == b"weights"
    assert classes(client) == before + ["drone"]
    listing = client.get(MODELS_URL).json()
    assert listing["can_manage"] is True and [m["id"] for m in listing["items"]] == [settings.YOLO_MODEL, "My_Drone.pt"]
    state = json.loads((model_dir / model_store.STATE_FILE).read_text(encoding="utf-8"))
    assert state["meta"]["My_Drone.pt"] == {"task": "detect", "names": {"0": "drone", "1": "cup", "2": "person"}}

    # Tắt mô hình mặc định: chỉ còn lớp của mô hình mới, mặc định máy chủ lùi về lớp đầu tiên còn lại
    assert client.patch(f"{MODELS_URL}/{settings.YOLO_MODEL}", json={"enabled": False}).status_code == 200
    status = client.get("/api/vision/status").json()
    assert status["classes"] == ["drone", "cup"] and status["defaults"]["targets"] == ["drone"]
    assert client.patch(f"{MODELS_URL}/My_Drone.pt", json={"enabled": False}).status_code == 400
    assert client.delete(f"{MODELS_URL}/{settings.YOLO_MODEL}").status_code == 400
    assert client.delete(f"{MODELS_URL}/My_Drone.pt").status_code == 400  # đang là mô hình duy nhất được bật

    assert client.patch(f"{MODELS_URL}/{settings.YOLO_MODEL}", json={"enabled": True}).status_code == 200
    assert client.delete(f"{MODELS_URL}/My_Drone.pt").status_code == 204
    assert not (model_dir / "My_Drone.pt").exists()
    assert classes(client) == before
    assert client.patch(f"{MODELS_URL}/ghost.pt", json={"enabled": True}).status_code == 404


def test_uploaded_name_never_replaces_builtin(client, model_dir):
    assert upload(client, settings.YOLO_MODEL).json()["id"] == settings.YOLO_MODEL.replace(".pt", "-1.pt")


def test_rejects_non_pt_and_unusable_models(client, detector, model_dir, monkeypatch):
    assert upload(client, "model.onnx").status_code == 415
    assert upload(client, "empty.pt", b"").status_code == 400

    def broken(path):
        raise ValueError("file này là 'classify'")

    monkeypatch.setattr(detector, "_open_model", broken)
    res = upload(client, "classifier.pt")
    assert res.status_code == 400 and "classify" in res.json()["detail"]
    assert not (model_dir / "classifier.pt").exists()


def test_only_local_http_port_can_manage_models(client, model_dir, monkeypatch):
    monkeypatch.setattr(settings, "MODEL_ADMIN", "local")
    monkeypatch.setattr(app.state, "admin_port", settings.PORT, raising=False)
    # TestClient gọi vào cổng 80 ≠ cổng HTTP của máy chủ → như điện thoại qua cổng LAN
    assert client.get(MODELS_URL).json()["can_manage"] is False
    assert upload(client, "a.pt").status_code == 403
    assert client.delete(f"{MODELS_URL}/a.pt").status_code == 403
    monkeypatch.setattr(app.state, "admin_port", 80)
    assert client.get(MODELS_URL).json()["can_manage"] is True
    assert upload(client, "a.pt").status_code == 201
    monkeypatch.setattr(settings, "MODEL_ADMIN", "off")
    assert client.patch(f"{MODELS_URL}/a.pt", json={"enabled": False}).status_code == 403


def test_startup_loads_enabled_models_and_remembers_disabled_ones(detector, tmp_path, monkeypatch):
    folder = tmp_path / "models"
    folder.mkdir()
    for name in ("a.pt", "b.pt", "notes.txt"):
        (folder / name).write_bytes(b"x")
    model_store.save_state(folder, {"disabled": ["b.pt"], "meta": {"b.pt": {"task": "segment", "names": {"0": "kite"}}}})
    monkeypatch.setattr(settings, "CUSTOM_MODEL_DIR", folder)
    opened = []

    def fake_open(path):
        opened.append(path.name)
        return FakeYolo(), "detect", dict(DRONE_NAMES)

    monkeypatch.setattr(detector, "_open_model", fake_open)
    entries = detector._load_custom_models()
    assert opened == ["a.pt"]  # b.pt đang tắt: không nạp lên GPU, bảng lớp lấy từ models.json
    assert [(e.id, e.enabled, e.active, e.classes) for e in entries] == [
        ("a.pt", True, True, ["drone", "cup"]),
        ("b.pt", False, False, ["kite"]),
    ]


def test_frame_runs_only_models_having_the_chosen_classes(detector):
    detector._laser = SimpleNamespace(detect=lambda frame, hint: None)
    builtin, extra = FakeYolo(), FakeYolo()
    detector.models[0].model = builtin
    detector.models.append(type(detector.models[0])(id="d.pt", builtin=False, names=dict(DRONE_NAMES), model=extra))
    detector._refresh_classes()
    frame = np.zeros((480, 640, 3), np.uint8)
    detector._extract_output = lambda results, *a, **kw: SimpleNamespace(laser=None, results=results)
    run = lambda targets: Detector._run_models(detector, frame, detector.options(targets, None, None, PointerMode.laser))
    run("drone")
    assert builtin.calls == [] and extra.calls == [[0]]
    run("cup,laptop")
    assert builtin.calls == [[41, 63]] and extra.calls == [[0], [1]]


def test_classes_merge_across_models_ignoring_case(detector):
    """COCO "laptop" và Open Images "Laptop" là một vật thể; "Person" cũng bị loại như "person"."""
    detector._laser = SimpleNamespace(detect=lambda frame, hint: None)
    builtin, extra = FakeYolo(), FakeYolo()
    detector.models[0].model = builtin
    oiv = {0: "Laptop", 1: "Drone", 2: "Person"}
    detector.models.append(type(detector.models[0])(id="oiv.pt", builtin=False, names=oiv, model=extra))
    detector._refresh_classes()
    assert detector.classes == ["cup", "laptop", "mouse", "keyboard", "Drone"]
    frame = np.zeros((480, 640, 3), np.uint8)
    detector._extract_output = lambda results, *a, **kw: SimpleNamespace(laser=None)
    Detector._run_models(detector, frame, detector.options("laptop", None, None, PointerMode.laser))
    assert builtin.calls == [[63]] and extra.calls == [[0]]

    seg = model_result()
    det = detect_result([(0, 0.97, [101, 99, 499, 401])], oiv)
    output = Detector._extract_output([seg, det], None, 30, canonical=detector._canonical)
    assert [(d.name, d.confidence) for d in output.detections] == [("cup", 0.8), ("mouse", 0.85), ("laptop", 0.97)]
