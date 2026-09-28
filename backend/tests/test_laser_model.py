"""Coordinates/confidence and API routing for the trained red-laser detector."""
from types import SimpleNamespace

import numpy as np
import pytest

from models import LaserColor, LaserSpot, PointerMode
from services.detector import Detector
from services.laser_model import prepare_frame, select_spot
from tests.test_laser import encode, scene
from tests.test_vision_api import post_frame


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


def test_missing_red_model_returns_503_but_green_still_works(client, detector, monkeypatch):
    monkeypatch.setattr(detector, "_run_models", Detector._run_models.__get__(detector))
    monkeypatch.setattr(detector, "_predict", lambda *args: None)
    detector.laser_error = "Missing trained laser model"
    response = post_frame(client, params={"pointer_mode": "laser", "laser_color": "red"})
    assert response.status_code == 503 and response.json()["detail"] == detector.laser_error
    status = client.get("/api/vision/status").json()
    assert status["phase"] == "ready" and status["laser_model"] is None
    assert status["laser_error"] == detector.laser_error
    response = post_frame(client, body=encode(scene("green", white_core=True)),
                          params={"pointer_mode": "laser", "laser_color": "green"})
    assert response.status_code == 200 and response.json()["laser"]["color"] == "green"


def test_red_model_receives_hint_without_object_confidence_or_brightness(detector, monkeypatch):
    calls = []
    def detect(frame, hint):
        calls.append(hint)
        return LaserSpot(point=[320, 240], color=LaserColor.red, score=0.72)
    detector._laser = SimpleNamespace(detect=detect)
    monkeypatch.setattr(detector, "_predict", lambda *args: None)
    options = detector.options(None, 0.95, None, PointerMode.laser, LaserColor.red, 250, (320, 240))
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
