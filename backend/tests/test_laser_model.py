"""Coordinates/confidence and API routing for the trained red-laser detector."""
from types import SimpleNamespace

import cv2
import numpy as np
import pytest

from models import LaserSpot, PointerMode
from services.detector import Detector
from services.laser_model import LaserModel, prepare_frame, select_spot
from tests.test_vision_api import post_frame


def scene():
    """Nền xám với một chấm đỏ ở giữa khung 640x480."""
    frame = np.full((480, 640, 3), 75, dtype=np.uint8)
    cv2.circle(frame, (320, 240), 4, (30, 35, 255), -1)
    return frame


def test_letterbox_uses_rgb_and_keeps_portrait_coordinate_mapping():
    frame = np.zeros((800, 400, 3), np.uint8)
    frame[:, :] = [10, 20, 30]
    pixels, gain, padding = prepare_frame(frame, 1280)
    assert pixels.shape == (1, 3, 1280, 640)
    np.testing.assert_allclose(pixels[0, :, 400, 200], np.array([30, 20, 10]) / 255)
    assert gain == 1.6 and padding == (0, 0)
    # Network center (320, 640) maps to original pixel (200, 400).
    spot = select_spot(np.array([[320, 640, 8, 8, 0.9, 0.8]]), (800, 400), gain, padding, 0.55)
    assert spot.point == [200, 400] and spot.score == 0.72


def test_odd_padding_and_brightness_are_not_confused_with_model_confidence():
    _, gain, padding = prepare_frame(np.zeros((725, 1280, 3), np.uint8), 1280)
    assert gain == 1 and padding == (0, 21.5)
    rows = np.array([[702, 274.5, 8, 8, 0.95, 0.4], [702, 274.5, 8, 8, 0.8, 0.9]])
    spot = select_spot(rows, (725, 1280), gain, padding, 0.55)
    assert spot.point == [702, 253] and spot.score == 0.72


def test_hint_uses_only_current_detections_and_reacquires_when_far_away():
    rows = np.array([[100, 100, 8, 8, 0.9, 1], [320, 240, 8, 8, 0.7, 1]])
    assert select_spot(rows, (480, 640), 1, (0, 0), 0.55).point == [100, 100]
    assert select_spot(rows, (480, 640), 1, (0, 0), 0.55, (325, 235)).point == [320, 240]
    assert select_spot(rows, (480, 640), 1, (0, 0), 0.55, (630, 470)).point == [100, 100]
    assert select_spot(np.empty((0, 6)), (480, 640), 1, (0, 0), 0.55, (320, 240)) is None


@pytest.mark.parametrize("row", [
    [100, -10, 8, 8, 0.9, 1], [100, 500, 8, 8, 0.9, 1],
    [100, 100, -8, 8, 0.9, 1], [100, 100, 8, 8, float("nan"), 1],
    [100, 100, 8, 8, 0.54, 1],
])
def test_invalid_or_padded_predictions_are_not_selected(row):
    assert select_spot(np.array([row]), (480, 640), 1, (0, 0), 0.55) is None


def test_missing_red_model_returns_503_but_hand_still_works(client, detector, monkeypatch):
    monkeypatch.setattr(detector, "_run_models", Detector._run_models.__get__(detector))
    monkeypatch.setattr(detector, "_predict", lambda *args: None)
    monkeypatch.setattr(detector, "_detect_hand", lambda frame: None)
    detector.laser_error = "Missing trained laser model"
    response = post_frame(client, params={"pointer_mode": "laser"})
    assert response.status_code == 503 and response.json()["detail"] == detector.laser_error
    status = client.get("/api/vision/status").json()
    assert status["phase"] == "ready" and status["laser_model"] is None
    assert status["laser_error"] == detector.laser_error
    response = post_frame(client)
    assert response.status_code == 200 and response.json()["laser"] is None


def test_red_model_receives_hint_without_object_confidence(detector, monkeypatch):
    calls = []
    def detect(frame, hint):
        calls.append(hint)
        return LaserSpot(point=[320, 240], score=0.72)
    detector._laser = SimpleNamespace(detect=detect)
    monkeypatch.setattr(detector, "_predict", lambda *args: None)
    options = detector.options(None, 0.95, None, PointerMode.laser, (320, 240))
    result = Detector._run_models(detector, scene(), options)
    assert result.laser.score == 0.72 and calls == [(320, 240)]
    assert result.landmarks is None


def test_laser_initialization_failure_does_not_break_hand_readiness(detector, monkeypatch):
    def fail(*args):
        raise RuntimeError("invalid laser checkpoint")
    monkeypatch.setattr("services.detector.LaserModel", fail)
    detector._load_laser()
    assert detector._laser is None and detector.laser_error == "invalid laser checkpoint"
    assert detector.ready.is_set() and detector.error is None


def crop_model(monkeypatch, responses, size=1280, crop_size=384):
    """Exercise tracking control flow without loading torch or model weights."""
    model = LaserModel.__new__(LaserModel)
    model.size = size
    model.crop_size = crop_size
    calls = []
    def detect(frame, size, hint=None, *, hint_radius=None):
        calls.append((frame, size, hint, hint_radius))
        return responses[len(calls) - 1]
    monkeypatch.setattr(model, "_detect", detect)
    return model, calls


@pytest.mark.parametrize("shape,hint,region", [
    ((720, 1280), (702, 253), (510, 61, 384)),
    ((1280, 720), (360, 700), (168, 508, 384)),
    ((720, 1280), (2, 2), (0, 0, 384)),
    ((720, 1280), (1278, 718), (896, 336, 384)),
    ((360, 640), (320, 180), (224, 84, 192)),
    ((1080, 1920), (1000, 500), (712, 212, 576)),
])
def test_crop_preserves_scale_coordinates_and_only_returns_current_detection(monkeypatch, shape, hint, region):
    frame = np.arange(shape[0] * shape[1] * 3, dtype=np.uint8).reshape(*shape, 3)
    left, top, side = region
    local = LaserSpot(point=[hint[0] - left + 1, hint[1] - top + 1], score=0.73)
    model, calls = crop_model(monkeypatch, [local])
    spot = model.detect(frame, hint)
    assert spot.point == [hint[0] + 1, hint[1] + 1] and spot.score == 0.73
    assert len(calls) == 1
    crop, size, local_hint, radius = calls[0]
    np.testing.assert_array_equal(crop, frame[top:top + side, left:left + side])
    assert size / crop.shape[0] == pytest.approx(1280 / max(shape))
    assert local_hint == (hint[0] - left, hint[1] - top)
    assert radius == 40 * max(shape) / 640


@pytest.mark.parametrize("local", [None, LaserSpot(point=[10, 10], score=0.99)])
def test_missed_crop_or_distant_led_reacquires_on_same_full_frame(monkeypatch, local):
    frame = np.zeros((720, 1280, 3), np.uint8)
    moved = LaserSpot(point=[1100, 600], score=0.8)
    model, calls = crop_model(monkeypatch, [local, moved])
    assert model.detect(frame, (640, 360)) == moved
    assert len(calls) == 2
    assert calls[1][0] is frame and calls[1][1:3] == (1280, (640, 360))


def test_missing_laser_is_not_fabricated_from_hint_and_clients_do_not_share_state(monkeypatch):
    frame = np.zeros((720, 1280, 3), np.uint8)
    model, calls = crop_model(monkeypatch, [None, None, None])
    assert model.detect(frame, (640, 360)) is None
    assert model.detect(frame) is None
    assert len(calls) == 3 and calls[-1][0] is frame and calls[-1][2] is None


@pytest.mark.parametrize("hint,size,crop_size,shape", [
    (None, 1280, 384, (720, 1280)), ((-1, 20), 1280, 384, (720, 1280)),
    ((1280, 20), 1280, 384, (720, 1280)), ((20, 720), 1280, 384, (720, 1280)),
    ((640, 360), 1280, 0, (720, 1280)), ((640, 360), 384, 384, (720, 1280)),
    ((640, 360), 320, 384, (720, 1280)), ((640, 100), 1280, 384, (200, 1280)),
])
def test_acquisition_invalid_hint_or_disabled_crop_uses_full_frame(monkeypatch, hint, size, crop_size, shape):
    frame = np.zeros((*shape, 3), np.uint8)
    model, calls = crop_model(monkeypatch, [None], size, crop_size)
    assert model.detect(frame, hint) is None
    assert len(calls) == 1 and calls[0][0] is frame and calls[0][1] == size


def test_crop_keeps_full_frame_hint_radius_when_choosing_between_laser_and_led():
    # Both are in the crop; only the weaker point is within 80px of the hint.
    rows = np.array([[70, 192, 8, 8, 0.99, 1], [250, 192, 8, 8, 0.8, 1]])
    spot = select_spot(rows, (384, 384), 1, (0, 0), 0.55, (192, 192), hint_radius=80)
    assert spot.point == [250, 192]
