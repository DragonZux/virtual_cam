"""Synthetic image checks exercise colour, JPEG loss, ambiguity and mask selection.

The colour heuristic only serves green lasers (red uses the trained model).
They do not measure accuracy on real cameras; collect footage for that separately.
"""
from types import SimpleNamespace

import cv2
import numpy as np
import pytest

from models import LaserColor, LaserSpot
from services.detector import Detector
from services.laser import detect_laser
from services.pointing import object_at_laser
from tests.helpers import hand_pointing_at, rectangle
from tests.test_detector_output import model_result
from tests.test_vision_api import post_frame

GREEN = (30, 255, 35)
RED = (30, 35, 255)


def scene(color="green", radius=4, white_core=False, scale=1):
    frame = np.full((480 * scale, 640 * scale, 3), 75, dtype=np.uint8)
    cv2.circle(frame, (320 * scale, 240 * scale), radius * scale, GREEN if color == "green" else RED, -1)
    if white_core:
        cv2.circle(frame, (320 * scale, 240 * scale), max(1, radius // 2) * scale, (255, 255, 255), -1)
    return frame


def encode(frame, quality=94):
    ok, data = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    assert ok
    return data.tobytes()


def jpeg_round_trip(frame, quality=94):
    return cv2.imdecode(np.frombuffer(encode(frame, quality), np.uint8), cv2.IMREAD_COLOR)


@pytest.mark.parametrize("white_core,scale,radius", [(False, 1, 2), (True, 1, 5), (True, 2, 4)])
def test_green_spot_survives_jpeg(white_core, scale, radius):
    spot = detect_laser(jpeg_round_trip(scene(radius=radius, white_core=white_core, scale=scale)))
    assert spot is not None
    assert np.linalg.norm(np.array(spot.point) - [320 * scale, 240 * scale]) <= 2
    assert spot.color == LaserColor.green


@pytest.mark.parametrize("kind", ["blank", "white", "large", "line", "dim", "low_contrast", "wrong_colour", "ambiguous"])
def test_rejects_common_non_laser_or_ambiguous_frames(kind):
    image = np.full((480, 640, 3), 75, np.uint8)
    if kind == "white":
        cv2.circle(image, (320, 240), 4, (255, 255, 255), -1)
    elif kind == "large":
        cv2.rectangle(image, (100, 100), (400, 300), (0, 255, 0), -1)
    elif kind == "line":
        cv2.line(image, (310, 240), (330, 240), (0, 255, 0), 2)
    elif kind == "dim":
        cv2.circle(image, (320, 240), 4, (0, 170, 0), -1)
    elif kind == "low_contrast":
        image[:] = 245
        cv2.circle(image, (320, 240), 4, (0, 255, 0), -1)
    elif kind == "wrong_colour":
        image = scene("red")
    elif kind == "ambiguous":
        image = scene()
        cv2.circle(image, (160, 120), 4, GREEN, -1)
    assert detect_laser(image) is None


def test_brightness_adjustment_and_frame_isolation():
    image = np.full((480, 640, 3), 50, np.uint8)
    cv2.circle(image, (320, 240), 4, (0, 180, 0), -1)
    assert detect_laser(image, 200) is None
    assert detect_laser(image, 160) is not None
    assert detect_laser(np.full_like(image, 50), 160) is None


def test_yellow_green_print_is_not_a_green_laser():
    hsv = np.zeros((480, 640, 3), np.uint8)
    hsv[:, :, 2] = 75
    cv2.circle(hsv, (320, 240), 4, (35, 100, 240), -1)
    assert detect_laser(cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)) is None


@pytest.mark.parametrize("quality", [None, 94, 82])
@pytest.mark.parametrize("hint", [None, (320, 240)])
@pytest.mark.parametrize("kind", ["tinted_white", "mint_white", "green_specks", "green_edge"])
def test_white_reflection_needs_a_green_halo(kind, hint, quality):
    image = np.full((480, 640, 3), 75, np.uint8)
    if kind in ("tinted_white", "mint_white"):
        # White light with a weak colour cast, not a distinct green halo.
        bgr = (210, 240, 220) if kind == "tinted_white" else (215, 240, 215)
        cv2.circle(image, (320, 240), 5, bgr, -1)
    elif kind == "green_specks":
        image[240, 324] = image[241, 324] = (30, 190, 35)
    else:
        # A reflection beside a green surface must not borrow its colour.
        image[:, 324:] = (30, 190, 35)
    cv2.circle(image, (320, 240), 3, (255, 255, 255), -1)
    if quality is not None:
        image = jpeg_round_trip(image, quality)
    assert detect_laser(image, hint=hint) is None


@pytest.mark.parametrize("quality", [None, 94])
@pytest.mark.parametrize("white_core", [False, True])
@pytest.mark.parametrize("bgr", [(30, 140, 255), (245, 35, 255), (30, 255, 255), (255, 40, 30), RED, (255, 255, 30)])
def test_rejects_other_bright_colours(bgr, white_core, quality):
    image = np.full((480, 640, 3), 75, np.uint8)
    cv2.circle(image, (320, 240), 5, bgr, -1)
    if white_core:
        cv2.circle(image, (320, 240), 2, (255, 255, 255), -1)
    if quality is not None:
        image = jpeg_round_trip(image, quality)
    assert detect_laser(image) is None


@pytest.mark.parametrize("quality", [None, 94, 82])
def test_green_dot_wins_over_a_white_reflection_even_with_hint(quality):
    image = scene(white_core=True, radius=5)
    cv2.circle(image, (120, 100), 5, (210, 240, 220), -1)
    cv2.circle(image, (120, 100), 2, (255, 255, 255), -1)
    if quality is not None:
        image = jpeg_round_trip(image, quality)
    spot = detect_laser(image, hint=(120, 100))
    assert spot is not None
    assert np.linalg.norm(np.array(spot.point) - [320, 240]) <= 2


@pytest.mark.parametrize("quality", [None, 94, 82])
def test_white_core_keeps_an_asymmetric_green_halo(quality):
    image = np.full((480, 640, 3), 75, np.uint8)
    cv2.circle(image, (320, 240), 5, (120, 210, 100), -1)
    image[:, :320] = 75
    cv2.circle(image, (320, 240), 1, (255, 255, 255), -1)
    if quality is not None:
        image = jpeg_round_trip(image, quality)
    spot = detect_laser(image)
    assert spot is not None
    assert np.linalg.norm(np.array(spot.point) - [320, 240]) <= 2


def test_laser_selects_small_containing_object_and_never_distant_background():
    polygons = [rectangle(40, 40, 600, 440), rectangle(300, 220, 340, 260)]
    assert object_at_laser(polygons, (320, 240)) == 1
    # A containing object wins over a smaller mask just outside the spot.
    assert object_at_laser(polygons, (342, 240)) == 0
    assert object_at_laser(polygons[1:], (345, 240)) is None
    assert object_at_laser(polygons, None) is None


def test_api_runs_laser_without_hand_and_keeps_mask_indices(client, detector, monkeypatch):
    raw = model_result()
    monkeypatch.setattr(detector.models[0], "model", SimpleNamespace(predict=lambda *a, **kw: [raw]))
    monkeypatch.setattr(detector, "_run_models", Detector._run_models.__get__(detector))
    predictions = iter([LaserSpot(point=[320, 240], color=LaserColor.red, score=0.79), None])
    monkeypatch.setattr(detector, "_laser", SimpleNamespace(detect=lambda frame, hint: next(predictions)))

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


def two_spots():
    image = scene()
    cv2.circle(image, (120, 100), 4, GREEN, -1)
    return jpeg_round_trip(image)


def test_hint_keeps_following_the_tracked_spot_among_look_alikes():
    image = two_spots()
    assert detect_laser(image) is None  # hai chấm giống nhau: không đoán
    assert detect_laser(image, hint=(325, 236)).point == [320, 240]
    assert detect_laser(image, hint=(118, 104)).point == [120, 100]
    # Gợi ý xa mọi chấm (vd. chấm vừa tắt): quay về luật chọn cả khung
    assert detect_laser(image, hint=(600, 450)) is None
    assert detect_laser(jpeg_round_trip(scene()), hint=(600, 450)).point == [320, 240]


def test_api_passes_laser_hint_and_rejects_bad_format(client, fake_models):
    assert post_frame(client, params={"pointer_mode": "laser", "laser_hint": "320,240"}).status_code == 200
    assert fake_models.calls[-1].laser_hint == (320, 240)
    assert post_frame(client, params={"laser_hint": "320,240"}).status_code == 200
    assert fake_models.calls[-1].laser_hint is None  # chỉ dùng ở chế độ laser
    assert post_frame(client, params={"pointer_mode": "laser", "laser_hint": "abc"}).status_code == 422


def real_photo_like_scene():
    """Số đo từ ảnh thật (bàn phím, laser đỏ) đổi kênh R↔G thành laser xanh: laser lõi ~3x3 cháy trắng + quầng;
    LED lõi nhỏ không cháy; vệt phản chiếu trên màn hình điện thoại lõi to, dài."""
    image = np.full((720, 1280, 3), 70, np.uint8)
    cv2.circle(image, (480, 380), 4, (140, 110, 210), -1)
    cv2.circle(image, (480, 380), 1, (255, 255, 255), -1)
    cv2.circle(image, (530, 300), 3, (110, 100, 170), -1)
    cv2.circle(image, (530, 300), 1, (205, 205, 235), -1)
    cv2.ellipse(image, (400, 520), (10, 6), 0, 0, 360, (120, 90, 200), -1)
    cv2.ellipse(image, (400, 520), (7, 4), 0, 0, 360, (228, 228, 248), -1)
    return jpeg_round_trip(np.ascontiguousarray(image[:, :, [0, 2, 1]]))


def test_clipped_compact_dot_beats_led_and_reflection():
    spot = detect_laser(real_photo_like_scene())
    assert spot is not None and np.linalg.norm(np.array(spot.point) - [480, 380]) <= 2


@pytest.mark.parametrize("scale", [1, 2, 3])
@pytest.mark.parametrize("center", [(8, 8), (320, 240), (632, 472)])
def test_hint_crop_preserves_full_frame_coordinates_and_score(scale, center):
    image = np.full((480 * scale, 640 * scale, 3), 65, np.uint8)
    point = tuple(v * scale for v in center)
    cv2.circle(image, point, 4 * scale, GREEN, -1)
    cv2.circle(image, point, 2 * scale, (255, 255, 255), -1)
    image = jpeg_round_trip(image)
    full = detect_laser(image)
    tracked = detect_laser(image, hint=point)
    assert full is not None and tracked is not None
    assert tracked.point == full.point
    assert tracked.score == pytest.approx(full.score, abs=0.005)


@pytest.mark.parametrize("offset", [39, 40, 41, 120])
def test_hint_search_boundary_and_reacquisition(offset):
    image = scene(white_core=True, scale=2)
    full = detect_laser(image)
    tracked = detect_laser(image, hint=(640 + offset * 2, 480))
    assert full is not None and tracked == full


@pytest.mark.parametrize("hint", [(640, 480), (0, 0), (99999, 99999), (-10, -10)])
def test_hint_does_not_accept_large_reflections_cut_by_crop(hint):
    image = np.full((960, 1280, 3), 60, np.uint8)
    cv2.rectangle(image, (450, 470), (830, 490), (40, 255, 45), -1)
    cv2.rectangle(image, (450, 476), (830, 484), (255, 255, 255), -1)
    assert detect_laser(image, hint=hint) is None


def test_hint_miss_still_applies_full_frame_ambiguity():
    image = two_spots()
    assert detect_laser(image, hint=(500, 400)) is None
    # A previously tracked spot disappearing must not leave a cached detection.
    assert detect_laser(image, hint=(320, 240)) is not None
    assert detect_laser(np.full_like(image, 70), hint=(320, 240)) is None
