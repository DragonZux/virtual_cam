"""Chạy model YOLO / MediaPipe thật (chậm ~20 giây, cần file model ở MODEL_DIR): pytest -m model"""
import pytest
from pathlib import Path

import cv2
import numpy as np

from core.config import settings
from services.detector import Detector
from tests.helpers import hand_pointing_at, jpeg
from services.pointing import object_at_point
from models import PointerMode, LaserColor


@pytest.mark.model
def test_real_models_analyze_frame():
    detector = Detector(settings)
    detector.start()
    try:
        assert detector.ready.wait(180), detector.error
        assert detector.error is None
        assert "person" not in detector.classes and "laptop" in detector.classes
        result = detector.analyze(jpeg(640, 480), detector.options(None, None, None))
        assert result.hand_detected is False
        assert result.selected is None
        assert result.resolution.width == 640
        # Exercise real CUDA mask indexing, comparing the fast path to all contours.
        import ultralytics
        frame = cv2.imread(str(Path(ultralytics.__file__).parent / "assets" / "bus.jpg"))
        assert frame is not None
        frame = cv2.resize(frame, (480, 640))
        raw = detector._predict(detector.models[0], frame, ["bus"], 0.3)
        assert raw.masks is not None
        all_polygons = raw.cpu().masks.xy
        for x, y in [(240, 320), (470, 630), (40, 400)]:
            hand = hand_pointing_at(x / 480, y / 640)
            fast = detector._extract_output(raw, hand, 30)
            assert object_at_point(fast.polygons, (x, y), 30) == object_at_point(all_polygons, (x, y), 30)
        # Put a synthetic green laser on a dark part of the real bus image.
        # Real YOLO still has to identify/segment the object after the JPEG round trip.
        mask = np.zeros(frame.shape[:2], np.uint8)
        cv2.fillPoly(mask, [np.asarray(all_polygons[0], np.int32)], 255)
        interior = cv2.distanceTransform(mask, cv2.DIST_L2, 3)
        value = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)[:, :, 2]
        candidates = np.where((interior > 12) & (value < 120), interior, 0)
        assert candidates.max() > 0
        y, x = np.unravel_index(candidates.argmax(), candidates.shape)
        cv2.circle(frame, (int(x), int(y)), 5, (30, 255, 35), -1)
        cv2.circle(frame, (int(x), int(y)), 2, (255, 255, 255), -1)
        ok, encoded = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 94])
        assert ok
        laser_result = detector.analyze(encoded.tobytes(), detector.options("bus", 0.25, None, PointerMode.laser, LaserColor.green))
        assert laser_result.laser is not None
        assert np.linalg.norm(np.array(laser_result.laser.point) - [x, y]) <= 2
        assert laser_result.selected is not None and laser_result.selected.name == "bus"
        assert laser_result.hand_detected is False and laser_result.tip is None
        tracked = detector.analyze(encoded.tobytes(), detector.options(
            "bus", 0.25, None, PointerMode.laser, LaserColor.green,
            laser_hint=tuple(laser_result.laser.point),
        ))
        assert tracked.laser is not None and tracked.laser.point == laser_result.laser.point
        assert tracked.selected is not None and tracked.selected.name == "bus"
    finally:
        detector.close()
