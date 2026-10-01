from pathlib import Path
from types import SimpleNamespace
import sys

import numpy as np
import pytest

from services.laser_model import YoloLaserModel


@pytest.mark.parametrize("task,names", [("segment", {0: "spot"}), ("detect", {0: "spot", 1: "other"})])
def test_custom_laser_requires_one_detection_class(monkeypatch, task, names):
    monkeypatch.setitem(sys.modules, "ultralytics", SimpleNamespace(YOLO=lambda _: SimpleNamespace(task=task, names=names)))
    with pytest.raises(ValueError, match="YOLO detect"):
        YoloLaserModel(Path("laser.pt"), "cpu", 1280, 0.55)


def test_custom_laser_uses_current_detections_and_hint(monkeypatch):
    class Boxes:
        xyxy = SimpleNamespace(numpy=lambda: np.array([[80, 80, 120, 120], [300, 220, 340, 260]]))
        conf = SimpleNamespace(numpy=lambda: np.array([0.95, 0.75]))

        def cpu(self):
            return self

        def __len__(self):
            return 2

    calls = []

    def predict(frame, **options):
        calls.append(options)
        return [SimpleNamespace(boxes=Boxes())]

    candidate = SimpleNamespace(task="detect", names={0: "laser"}, predict=predict)
    monkeypatch.setitem(sys.modules, "ultralytics", SimpleNamespace(YOLO=lambda _: candidate))
    model = YoloLaserModel(Path("laser.pt"), "cpu", 1280, 0.55)
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    assert model.detect(frame).point == [100, 100]
    assert model.detect(frame, (320, 240)).point == [320, 240]
    assert calls[0]["conf"] == 0.55 and calls[0]["imgsz"] == 1280
    candidate.predict = lambda *args, **kwargs: [SimpleNamespace(boxes=SimpleNamespace(cpu=lambda: []))]
    assert model.detect(frame, (320, 240)) is None
