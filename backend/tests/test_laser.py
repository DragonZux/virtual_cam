"""Synthetic image checks exercise colour, JPEG loss, ambiguity and mask selection.

They do not measure accuracy on real cameras; collect footage for that separately.
"""
from types import SimpleNamespace

import cv2
import numpy as np
import pytest

from models import LaserColor
from services.detector import Detector
from services.laser import detect_laser
from services.pointing import object_at_laser
from tests.helpers import hand_pointing_at, rectangle
from tests.test_detector_output import model_result
from tests.test_vision_api import post_frame


def scene(color="red", radius=4, white_core=False, scale=1):
    frame = np.full((480 * scale, 640 * scale, 3), 75, dtype=np.uint8)
    cv2.circle(frame, (320 * scale, 240 * scale), radius * scale,
               (30, 35, 255) if color == "red" else (30, 255, 35), -1)
    if white_core:
        cv2.circle(frame, (320 * scale, 240 * scale), max(1, radius // 2) * scale, (255, 255, 255), -1)
    return frame


def encode(frame, quality=94):
    ok, data = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    assert ok
    return data.tobytes()


@pytest.mark.parametrize("color", [LaserColor.red, LaserColor.green])
@pytest.mark.parametrize("white_core,scale,radius", [(False, 1, 2), (True, 1, 5), (True, 2, 4)])
def test_coloured_spot_survives_jpeg(color, white_core, scale, radius):
    image = cv2.imdecode(np.frombuffer(encode(scene(color, radius, white_core, scale)), np.uint8), cv2.IMREAD_COLOR)
    spot = detect_laser(image, color)
    assert spot is not None
    assert np.linalg.norm(np.array(spot.point) - [320 * scale, 240 * scale]) <= 2
    assert spot.color == color


@pytest.mark.parametrize("kind", ["blank", "white", "large", "line", "dim", "low_contrast", "wrong_colour", "ambiguous"])
def test_rejects_common_non_laser_or_ambiguous_frames(kind):
    image = np.full((480, 640, 3), 75, np.uint8)
    if kind == "white":
        cv2.circle(image, (320, 240), 4, (255, 255, 255), -1)
    elif kind == "large":
        cv2.rectangle(image, (100, 100), (400, 300), (0, 0, 255), -1)
    elif kind == "line":
        cv2.line(image, (310, 240), (330, 240), (0, 0, 255), 2)
    elif kind == "dim":
        cv2.circle(image, (320, 240), 4, (0, 0, 170), -1)
    elif kind == "low_contrast":
        image[:] = 245
        cv2.circle(image, (320, 240), 4, (0, 0, 255), -1)
    elif kind == "wrong_colour":
        image = scene("green")
    elif kind == "ambiguous":
        image = scene()
        cv2.circle(image, (160, 120), 4, (30, 35, 255), -1)
    assert detect_laser(image, LaserColor.red) is None


def test_brightness_adjustment_and_frame_isolation():
    image = np.full((480, 640, 3), 50, np.uint8)
    cv2.circle(image, (320, 240), 4, (0, 0, 180), -1)
    assert detect_laser(image, LaserColor.red, 200) is None
    assert detect_laser(image, LaserColor.red, 160) is not None
    assert detect_laser(np.full_like(image, 50), LaserColor.red, 160) is None


def test_yellow_green_print_is_not_a_green_laser():
    hsv = np.zeros((480, 640, 3), np.uint8)
    hsv[:, :, 2] = 75
    cv2.circle(hsv, (320, 240), 4, (35, 100, 240), -1)
    assert detect_laser(cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR), LaserColor.green) is None


def test_laser_selects_small_containing_object_and_never_distant_background():
    polygons = [rectangle(40, 40, 600, 440), rectangle(300, 220, 340, 260)]
    assert object_at_laser(polygons, (320, 240)) == 1
    # A containing object wins over a smaller mask just outside the spot.
    assert object_at_laser(polygons, (342, 240)) == 0
    assert object_at_laser(polygons[1:], (345, 240)) is None
    assert object_at_laser(polygons, None) is None


def test_api_runs_laser_without_hand_and_keeps_mask_indices(client, detector, monkeypatch):
    raw = model_result()
    monkeypatch.setattr(detector, "_model", SimpleNamespace(predict=lambda *a, **kw: [raw]))
    monkeypatch.setattr(detector, "_run_models", Detector._run_models.__get__(detector))

    def no_hand(*args):
        pytest.fail("Laser mode must not run MediaPipe")

    monkeypatch.setattr(detector, "_detect_hand", no_hand)
    response = post_frame(client, body=encode(scene(white_core=True)), params={"pointer_mode": "laser"})
    assert response.status_code == 200
    body = response.json()
    assert body["pointer_mode"] == "laser"
    assert body["hand_detected"] is False and body["tip"] is None and body["landmarks"] == []
    assert body["laser"]["point"] == [320, 240]
    assert body["selected"]["name"] == "mouse" and body["selected"]["index"] == 2
    assert raw.masks.requested == [[1, 2]]
    raw.masks.requested.clear()
    body = post_frame(client, params={"pointer_mode": "laser"}).json()
    assert body["laser"] is None and body["selected"] is None
    assert raw.masks.requested == []


def test_laser_never_falls_back_to_a_visible_hand(client, fake_models):
    fake_models.output.landmarks = hand_pointing_at(0.5, 0.5)
    body = post_frame(client, params={"pointer_mode": "laser"}).json()
    assert body["tip"] is None and body["selected"] is None and not body["hand_detected"]


@pytest.mark.parametrize("params", [
    {"pointer_mode": "unknown"}, {"laser_color": "blue"}, {"laser_brightness": 159}, {"laser_brightness": 251},
])
def test_invalid_laser_options_are_rejected(client, params):
    assert post_frame(client, params=params).status_code == 422


def test_api_applies_green_and_brightness(client, fake_models):
    assert post_frame(client, params={"pointer_mode": "laser", "laser_color": "green", "laser_brightness": 175}).status_code == 200
    opts = fake_models.calls[-1]
    assert (opts.pointer_mode, opts.laser_color, opts.laser_brightness) == ("laser", "green", 175)
