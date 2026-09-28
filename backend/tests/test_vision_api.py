from core.config import settings
from models import Detection
from services.detector import ModelOutput

from tests.helpers import hand_pointing_at, jpeg, rectangle

FRAME_URL = "/api/vision/frame"
JPEG_HEADERS = {"Content-Type": "image/jpeg"}


def post_frame(client, body=None, params=None):
    return client.post(FRAME_URL, content=jpeg() if body is None else body, headers=JPEG_HEADERS, params=params)


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/api").json()["docs"] == "/docs"


def test_status_ready_lists_targets_without_person(client):
    body = client.get("/api/vision/status").json()
    assert body["phase"] == "ready"
    assert body["classes"] == ["cup", "laptop", "mouse", "keyboard"]
    assert body["defaults"] == {"targets": ["laptop", "mouse", "keyboard"], "confidence": 0.8, "tolerance": 30}
    assert body["share_urls"] == []


def test_status_while_starting_hides_classes(client, detector):
    detector.ready.clear()
    body = client.get("/api/vision/status").json()
    assert body["phase"] == "starting"
    assert body["classes"] == []


def test_status_reports_load_error(client, detector):
    detector.ready.clear()
    detector.error = "Thiếu model bàn tay hand_landmarker.task."
    body = client.get("/api/vision/status").json()
    assert body["phase"] == "error"
    assert body["error"] == detector.error
    assert post_frame(client).json()["detail"] == detector.error


def test_frame_requires_jpeg_content_type(client):
    response = client.post(FRAME_URL, content=jpeg(), headers={"Content-Type": "image/png"})
    assert response.status_code == 415


def test_frame_waits_for_detector(client, detector):
    detector.ready.clear()
    assert post_frame(client).status_code == 503


def test_frame_rejects_unknown_or_excluded_target(client):
    response = post_frame(client, params={"targets": "laptop,person,ghost"})
    assert response.status_code == 400
    assert "person" in response.json()["detail"] and "ghost" in response.json()["detail"]


def test_frame_rejects_out_of_range_options(client):
    assert post_frame(client, params={"conf": 2}).status_code == 422
    assert post_frame(client, params={"tolerance": -1}).status_code == 422


def test_frame_rejects_invalid_or_empty_image(client):
    assert post_frame(client, body=b"not a jpeg").status_code == 400
    assert post_frame(client, body=b"").status_code == 400
    assert post_frame(client, body=jpeg(8, 8)).status_code == 400


def test_frame_rejects_oversized_body(client):
    response = post_frame(client, body=b"0" * (settings.MAX_FRAME_BYTES + 1))
    assert response.status_code == 413


def test_frame_uses_server_defaults_when_browser_sends_none(client, fake_models):
    assert post_frame(client).status_code == 200
    options = fake_models.calls[-1]
    assert options.targets == ("laptop", "mouse", "keyboard")
    assert options.confidence == settings.DEFAULT_CONFIDENCE
    assert options.tolerance == settings.DEFAULT_TOLERANCE_PX


def test_frame_applies_browser_options(client, fake_models):
    assert post_frame(client, params={"targets": "cup,laptop,cup", "conf": 0.5, "tolerance": 0}).status_code == 200
    options = fake_models.calls[-1]
    assert (options.targets, options.confidence, options.tolerance) == (("cup", "laptop"), 0.5, 0)


def test_frame_selects_object_under_fingertip(client, fake_models):
    fake_models.output = ModelOutput(
        landmarks=hand_pointing_at(0.5, 0.5),
        detections=[Detection(name="laptop", confidence=0.91, box=[100, 100, 540, 380])],
        polygons=[rectangle(100, 100, 540, 380)],
    )
    body = post_frame(client).json()
    assert body["hand_detected"] is True
    assert body["tip"] == [320, 240]
    assert len(body["landmarks"]) == 21
    assert body["resolution"] == {"width": 640, "height": 480}
    assert body["selected"]["name"] == "laptop"
    assert body["selected"]["index"] == 0
    assert body["selected"]["polygon"][0] == [100.0, 100.0]
    assert body["detections"][0]["box"] == [100, 100, 540, 380]


def test_frame_prefers_object_the_fingertip_is_deepest_in(client, fake_models):
    fake_models.output = ModelOutput(
        landmarks=hand_pointing_at(0.5, 0.5),
        detections=[
            Detection(name="laptop", confidence=0.9, box=[40, 40, 600, 440]),
            Detection(name="mouse", confidence=0.7, box=[300, 220, 340, 260]),
        ],
        polygons=[rectangle(40, 40, 600, 440), rectangle(300, 220, 340, 260)],
    )
    assert post_frame(client).json()["selected"]["name"] == "laptop"


def test_frame_tolerance_accepts_near_miss(client, fake_models):
    # Đầu ngón tay (320, 240) cách mép phải của vật thể 20px
    fake_models.output = ModelOutput(
        landmarks=hand_pointing_at(0.5, 0.5),
        detections=[Detection(name="keyboard", confidence=0.8, box=[100, 200, 300, 280])],
        polygons=[rectangle(100, 200, 300, 280)],
    )
    assert post_frame(client, params={"tolerance": 30}).json()["selected"]["name"] == "keyboard"
    assert post_frame(client, params={"tolerance": 10}).json()["selected"] is None


def test_frame_without_hand_selects_nothing(client, fake_models):
    fake_models.output = ModelOutput(
        landmarks=None,
        detections=[Detection(name="laptop", confidence=0.9, box=[0, 0, 640, 480])],
        polygons=[rectangle(0, 0, 640, 480)],
    )
    body = post_frame(client).json()
    assert body["hand_detected"] is False
    assert body["tip"] is None and body["selected"] is None
    assert len(body["detections"]) == 1


def test_frame_busy_returns_429(client, detector, monkeypatch):
    monkeypatch.setattr(settings, "BUSY_WAIT_SECONDS", 0.01)
    detector.lock.acquire()
    try:
        response = post_frame(client)
    finally:
        detector.lock.release()
    assert response.status_code == 429
    assert response.headers["Retry-After"] == "1"


def test_unexpected_error_is_reported_without_details(client, detector):
    def broken(frame, options):
        raise RuntimeError("CUDA out of memory")

    detector._run_models = broken
    response = post_frame(client)
    assert response.status_code == 500
    assert "CUDA" not in response.json()["detail"]


def test_unknown_api_path_is_404(client):
    assert client.get("/api/nope").status_code == 404
