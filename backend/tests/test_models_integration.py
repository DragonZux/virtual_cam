"""Chạy model YOLO / MediaPipe thật (chậm ~20 giây, cần file model ở MODEL_DIR): pytest -m model"""
import pytest
from pathlib import Path

import cv2

from core.config import settings
from services.detector import Detector
from tests.helpers import hand_pointing_at, jpeg
from services.pointing import object_at_point


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
        raw = detector._predict(frame, ["bus"], 0.3)
        assert raw.masks is not None
        all_polygons = raw.cpu().masks.xy
        for x, y in [(240, 320), (470, 630), (40, 400)]:
            hand = hand_pointing_at(x / 480, y / 640)
            fast = detector._extract_output(raw, hand, 30)
            assert object_at_point(fast.polygons, (x, y), 30) == object_at_point(all_polygons, (x, y), 30)
    finally:
        detector.close()
