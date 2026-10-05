import json
import time
from types import SimpleNamespace

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from core.config import settings
from main import app
from models import Detection, LaserSpot
from services import rtsp_stream
from services.detector import Detector, ModelOutput
from services.rtsp_stream import check_url, display_url, open_capture, redact
from tests.helpers import FAKE_NAMES, FakeModels, rectangle

URL = "rtsp://admin:secret@10.0.9.41:8554/camera"
SHOWN = "rtsp://10.0.9.41:8554/camera"
OTHER = "rtsp://10.0.9.48:8080/h264_ulaw.sdp"


class FakeCapture:
    """VideoCapture giả: `opened` = kết nối được, phát khung 1920x1080 liên tục (~100 khung/giây)."""

    def __init__(self, url, opened=True):
        self.url = url
        self.opened = opened
        self.released = False

    def isOpened(self):
        return self.opened

    def read(self):
        time.sleep(0.01)
        return True, np.full((1080, 1920, 3), 120, dtype=np.uint8)

    def release(self):
        self.released = True


def start_server(monkeypatch, captures):
    monkeypatch.setattr(Detector, "start", lambda self: None)

    def fake_open(url):
        captures.append(FakeCapture(url, opened="missing" not in url))
        return captures[-1]

    monkeypatch.setattr(rtsp_stream, "open_capture", fake_open)
    return TestClient(app)


def prepare_detector():
    detector = app.state.detector
    detector._set_classes(FAKE_NAMES)
    models = FakeModels()
    # Chấm laser giữa khung 1280x720, nằm trên một cái cốc
    models.output = ModelOutput(
        landmarks=None,
        detections=[Detection(name="cup", confidence=0.937, box=[600, 320, 700, 420])],
        polygons=[rectangle(600, 320, 700, 420)],
        laser=LaserSpot(point=[640, 360], score=0.9),
    )
    detector._run_models = models
    detector.ready.set()
    return models


def wait_released(captures):
    # Luồng đọc tự dừng ở nền ngay sau khung đang đọc
    deadline = time.monotonic() + 2
    while not all(capture.released for capture in captures) and time.monotonic() < deadline:
        time.sleep(0.01)
    assert all(capture.released for capture in captures)


@pytest.fixture
def live(monkeypatch):
    captures = []
    with start_server(monkeypatch, captures) as client:
        models = prepare_detector()
        yield SimpleNamespace(client=client, models=models, captures=captures, hub=app.state.live_hub)
    wait_released(captures)


def saved_state():
    return json.loads((settings.DATA_DIR / "camera.json").read_text(encoding="utf-8"))


def receive(socket):
    """Khung JPEG (ndarray) hoặc bản tin JSON (dict)."""
    message = socket.receive()
    if message.get("bytes") is not None:
        return cv2.imdecode(np.frombuffer(message["bytes"], dtype=np.uint8), cv2.IMREAD_COLOR)
    return json.loads(message["text"])


def receive_until(socket, predicate, limit=500):
    for _ in range(limit):
        message = receive(socket)
        if predicate(message):
            return message
    raise AssertionError("Không nhận được bản tin mong đợi")


def drain(socket):
    """TestClient đệm mọi bản tin chưa đọc (không giới hạn): bỏ những gì máy chủ đã gửi trước lúc này."""
    while socket._send_rx.statistics().current_buffer_used:
        socket.receive()


def is_result(message):
    return isinstance(message, dict) and message["type"] == "result"


def is_camera(message, **fields):
    return isinstance(message, dict) and message["type"] == "camera" and all(message[k] == v for k, v in fields.items())


@pytest.mark.parametrize("url", ["http://cam/x", "file:///etc/passwd", "rtsp://", "rtsp://cam/a b", "-i rtsp://cam"])
def test_only_rtsp_urls_are_opened(url):
    with pytest.raises(ValueError):
        check_url(url)
    assert check_url(" rtsp://10.0.9.41:8554/camera ") == "rtsp://10.0.9.41:8554/camera"


def test_passwords_are_not_logged_or_shown():
    assert redact("rtsp://admin:secret@10.0.0.2:554/live") == "rtsp://***@10.0.0.2:554/live"
    assert display_url("rtsp://admin:secret@10.0.0.2:554/live") == "rtsp://10.0.0.2:554/live"
    assert display_url("rtsp://10.0.0.2/live") == "rtsp://10.0.0.2/live"


def test_closed_rtsp_port_is_reported_with_host_and_port():
    # Cổng 1 trên máy này không có dịch vụ: báo ngay, không chờ FFmpeg hết giờ
    with pytest.raises(ConnectionError, match=r"127\.0\.0\.1:1\b"):
        open_capture("rtsp://admin:secret@127.0.0.1:1/Streaming/Channels/101")


def test_camera_runs_on_the_server_without_any_viewer_and_publishes_the_selection(live):
    client = live.client
    assert client.get("/api/camera").json()["status"] == "off"
    with client.websocket_connect("/api/vision/ws") as watcher:
        assert watcher.receive_json() == {"type": "selection.snapshot", "sessions": []}
        started = client.put("/api/camera", json={"url": URL, "name": " Cam Vũ "})
        assert started.status_code == 200
        # Khung 1920x1080 được thu về cạnh dài 1280; trình duyệt chỉ thấy địa chỉ không có mật khẩu
        assert started.json() == {"status": "live", "url": SHOWN, "name": "Cam Vũ", "detect": True, "error": None,
                                  "width": 1280, "height": 720}
        assert saved_state()["url"] == URL and saved_state()["name"] == "Cam Vũ"
        # Không có trang nào mở: máy chủ vẫn nhận diện và phát vật đã xác nhận cho view3d
        event = watcher.receive_json()
        assert event["type"] == "selection.changed" and event["connected"] is True
        assert event["selected"] == {"name": "cup", "confidence": 0.94}
        assert event["pointer_mode"] == "laser" and event["source"] == "camera"

        with client.websocket_connect("/api/camera/ws") as camera:
            assert is_camera(receive(camera), status="live", url=SHOWN, name="Cam Vũ", detect=True)
            camera.send_json({"type": "options", "targets": ["cup"], "confidence": 0.5, "dwell_ms": 0})
            image = receive_until(camera, lambda m: isinstance(m, np.ndarray))
            assert image.shape[:2] == (720, 1280)
            result = receive_until(camera, lambda m: is_result(m) and live.models.calls[-1].targets == ("cup",))
            assert result["result"]["resolution"] == {"width": 1280, "height": 720}
            assert result["result"]["laser"]["point"] == [640, 360]
            assert result["tracking"]["held"]["name"] == "cup" and result["latency_ms"] >= 0
            options = live.models.calls[-1]
            assert options.pointer_mode == "laser" and options.confidence == 0.5 and options.laser_hint == (640, 360)
            assert saved_state()["options"] == {"targets": ["cup"], "confidence": 0.5, "dwell_ms": 0}

            # Tạm dừng (chung cho máy chủ): kết quả ngừng, hình vẫn chạy; view3d thấy không còn vật đang chọn
            assert client.put("/api/camera/detect", json={"detect": False}).json()["detect"] is False
            paused = watcher.receive_json()
            assert paused["session_id"] == event["session_id"] and paused["selected"] is None
            receive_until(camera, lambda m: is_camera(m, detect=False))
            drain(camera)
            messages = [receive(camera) for _ in range(20)]
            assert not any(is_result(m) for m in messages[2:])
            assert any(isinstance(m, np.ndarray) for m in messages)
            assert saved_state()["detect"] is False
            client.put("/api/camera/detect", json={"detect": True})
            assert watcher.receive_json()["selected"]["name"] == "cup"

        # Đóng trang xem: camera vẫn chạy
        time.sleep(0.2)
        assert client.get("/api/camera").json()["status"] == "live"
        assert len(live.captures) == 1 and not live.captures[0].released

        assert client.delete("/api/camera").status_code == 204
        ended = watcher.receive_json()
        assert ended["session_id"] == event["session_id"] and ended["connected"] is False
    assert client.get("/api/camera").json()["status"] == "off"
    assert saved_state()["url"] is None


def test_only_one_camera_runs_and_viewers_follow_a_switch(live):
    client = live.client
    client.put("/api/camera", json={"url": URL, "name": "Cam Vũ"})
    with client.websocket_connect("/api/camera/ws") as camera:
        assert is_camera(receive(camera), url=SHOWN)
        assert client.put("/api/camera", json={"url": OTHER, "name": "Cam a An"}).json()["name"] == "Cam a An"
        receive_until(camera, lambda m: is_camera(m, url=OTHER, status="live", name="Cam a An"))
        assert isinstance(receive_until(camera, lambda m: isinstance(m, np.ndarray)), np.ndarray)
    wait_released(live.captures[:1])
    assert [capture.url for capture in live.captures] == [URL, OTHER]
    assert not live.captures[1].released
    # Chọn lại camera đang chạy: không mở lại luồng, chỉ đổi tên
    client.put("/api/camera", json={"url": OTHER, "name": "Cửa sau"})
    assert len(live.captures) == 2 and client.get("/api/camera").json()["name"] == "Cửa sau"


def test_hidden_viewer_gets_neither_frames_nor_results(live):
    live.client.put("/api/camera", json={"url": URL})
    with live.client.websocket_connect("/api/camera/ws") as camera:
        assert receive(camera)["type"] == "camera"
        camera.send_json({"type": "state", "video": False})
        deadline = time.monotonic() + 5
        while any(viewer.video for viewer in live.hub.viewers) and time.monotonic() < deadline:
            time.sleep(0.01)
        drain(camera)
        time.sleep(0.3)
        assert camera._send_rx.statistics().current_buffer_used <= 2
        # Bản tin sai → máy chủ đóng socket xem (camera vẫn chạy)
        camera.send_json({"type": "open", "url": URL})
        while (message := camera.receive())["type"] != "websocket.close":
            pass  # khung đang gửi dở lúc ẩn tab
        assert message["code"] == 1008
    assert live.client.get("/api/camera").json()["status"] == "live"


def test_unreachable_or_invalid_camera_is_not_kept(live):
    response = live.client.put("/api/camera", json={"url": "rtsp://10.0.9.41:8554/missing"})
    assert response.status_code == 502 and "RTSP" in response.json()["detail"]
    assert live.client.put("/api/camera", json={"url": "http://10.0.9.41/x"}).status_code == 400
    assert live.client.get("/api/camera").json()["status"] == "off"
    assert saved_state()["url"] is None


def test_server_restart_resumes_the_chosen_camera(monkeypatch):
    settings.DATA_DIR.mkdir(parents=True)
    (settings.DATA_DIR / "camera.json").write_text(json.dumps({
        "url": URL, "name": "Cam Vũ", "detect": False,
        "options": {"targets": ["cup"], "confidence": 0.6, "dwell_ms": 100},
    }), encoding="utf-8")
    captures = []
    with start_server(monkeypatch, captures) as client:
        prepare_detector()
        deadline = time.monotonic() + 5
        while client.get("/api/camera").json()["status"] != "live" and time.monotonic() < deadline:
            time.sleep(0.05)
        state = client.get("/api/camera").json()
        assert state["status"] == "live" and state["name"] == "Cam Vũ" and state["detect"] is False
        assert app.state.live_hub.options.confidence == 0.6
    wait_released(captures)
    # Tắt máy chủ không xoá lựa chọn
    assert saved_state()["url"] == URL


def test_connection_test_ping_on_the_camera_socket(live, caplog):
    with caplog.at_level("INFO", logger="hicas"):
        with live.client.websocket_connect("/api/camera/ws") as camera:
            assert receive(camera)["type"] == "camera"
            camera.send_json({"type": "ping", "source": "frontend"})
            answer = receive_until(camera, lambda m: isinstance(m, dict) and m["type"] == "pong")
    assert answer["source"] == "frontend" and answer["client"] == "testclient"
    assert any("Test kết nối từ frontend" in r.getMessage() for r in caplog.records)
