"""The fast path must preserve mask indices and pointing decisions."""
from types import SimpleNamespace

import numpy as np

from services.detector import Detector
from services.pointing import object_at_point
from tests.helpers import hand_pointing_at, rectangle


class Masks:
    def __init__(self, polygons):
        self.polygons = polygons
        self.requested = []

    def __getitem__(self, indices):
        self.requested.append(indices)
        return SimpleNamespace(xy=[self.polygons[i] for i in indices])


def model_result():
    polygons = [rectangle(0, 0, 30, 30), rectangle(100, 100, 500, 400), rectangle(300, 220, 340, 260)]
    boxes = SimpleNamespace(
        cls=np.array([0, 1, 2]), conf=np.array([0.8, 0.9, 0.85]),
        xyxy=np.array([[0, 0, 30, 30], [100, 100, 500, 400], [300, 220, 340, 260]]),
    )
    boxes.cpu = lambda: boxes
    return SimpleNamespace(boxes=boxes, masks=Masks(polygons), orig_shape=(480, 640), names={0: "cup", 1: "laptop", 2: "mouse"})


def test_no_hand_keeps_detections_without_downloading_masks():
    result = model_result()
    output = Detector._extract_output(result, None, 30)
    assert len(output.detections) == 3
    assert result.masks.requested == []
    assert all(len(p) == 0 for p in output.polygons)


def test_only_nearby_masks_are_read_and_original_indices_preserved():
    result = model_result()
    output = Detector._extract_output(result, hand_pointing_at(0.5, 0.5), 30)
    assert result.masks.requested == [[1, 2]]
    assert len(output.polygons[0]) == 0
    assert object_at_point(output.polygons, (320, 240), 30) == 1
    assert output.detections[1].name == "laptop"


def test_near_miss_with_tolerance_is_not_removed_by_box_filter():
    result = model_result()
    output = Detector._extract_output(result, hand_pointing_at(520 / 640, 0.5), 30)
    assert result.masks.requested == [[1]]
    assert object_at_point(output.polygons, (520, 240), 30) == 1


def test_no_nearby_box_skips_mask_download():
    result = model_result()
    output = Detector._extract_output(result, hand_pointing_at(0.99, 0.99), 30)
    assert result.masks.requested == []
    assert object_at_point(output.polygons, (633, 475), 30) is None


def test_missing_masks_and_empty_detections():
    result = SimpleNamespace(boxes=None, masks=None, orig_shape=(480, 640))
    output = Detector._extract_output(result, hand_pointing_at(0.5, 0.5), 30)
    assert output.polygons == []
    assert output.detections == []
