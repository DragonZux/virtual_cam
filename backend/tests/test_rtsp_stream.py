import time

import cv2
import numpy as np
import pytest

from main import app
from routers.camera import get_stream_hub
from services.rtsp_stream import StreamHub, check_url, redact


class FakeCapture:
    """VideoCapture giả: `opened` = kết nối được, phát khung 1920x1080 liên tục."""

    def __init__(self, opened=True):
        self.opened = opened
        self.released = False

    def isOpened(self):
        return self.opened

    def read(self):
        time.sleep(0.01)
        return True, np.full((1080, 1920, 3), 120, dtype=np.uint8)

    def release(self):
        self.released = True


@pytest.fixture
def hub():
    captures = []

    def open_capture(url):
        captures.append(FakeCapture(opened="missing" not in url))
        return captures[-1]

    value = StreamHub(open_capture)
    value.captures = captures
    yield value
    value.shutdown()


@pytest.fixture
def stream_client(client, hub):
    app.dependency_overrides[get_stream_hub] = lambda: hub
    yield client


@pytest.mark.parametrize("url", ["http://cam/x", "file:///etc/passwd", "rtsp://", "rtsp://cam/a b", "-i rtsp://cam"])
def test_only_rtsp_urls_are_opened(url):
    with pytest.raises(ValueError):
        check_url(url)
    assert check_url(" rtsp://10.0.9.41:8554/camera ") == "rtsp://10.0.9.41:8554/camera"


def test_passwords_are_not_logged():
    assert redact("rtsp://admin:secret@10.0.0.2:554/live") == "rtsp://***@10.0.0.2:554/live"


def test_stream_serves_new_scaled_frames_and_shares_capture(stream_client, hub):
    opened = stream_client.post("/api/camera/streams", json={"url": "rtsp://10.0.9.41:8554/camera"})
    assert opened.status_code == 201
    info = opened.json()
    assert (info["width"], info["height"]) == (1920, 1080)
    response = stream_client.get(f"/api/camera/streams/{info['id']}/frame")
    assert response.status_code == 200 and response.headers["content-type"] == "image/jpeg"
    frame = cv2.imdecode(np.frombuffer(response.content, dtype=np.uint8), cv2.IMREAD_COLOR)
    assert frame.shape[:2] == (720, 1280)
    # Một URL chỉ mở một kết nối dù nhiều trình duyệt cùng xem
    other = stream_client.post("/api/camera/streams", json={"url": "rtsp://10.0.9.41:8554/camera"}).json()
    assert other["id"] != info["id"] and len(hub.captures) == 1
    assert stream_client.delete(f"/api/camera/streams/{info['id']}").status_code == 204
    assert stream_client.get(f"/api/camera/streams/{info['id']}/frame").status_code == 404
    assert stream_client.get(f"/api/camera/streams/{other['id']}/frame").status_code == 200


def test_unreachable_stream_reports_error(stream_client, hub):
    response = stream_client.post("/api/camera/streams", json={"url": "rtsp://10.0.9.41:8554/missing"})
    assert response.status_code == 502
    assert "RTSP" in response.json()["detail"]
    assert stream_client.post("/api/camera/streams", json={"url": "http://10.0.9.41/x"}).status_code == 400
