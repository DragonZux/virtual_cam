"""Tìm vật thể dưới đầu ngón trỏ (logic của finger_select.py bản desktop, tách ra để test không cần model)."""
from __future__ import annotations

from collections.abc import Sequence
from typing import Any

import cv2
import numpy as np

# Chỉ số điểm đầu ngón trỏ trong 21 điểm của MediaPipe Hand Landmarker
INDEX_FINGER_TIP = 8


def index_tip(landmarks: Sequence[Any] | None, width: int, height: int) -> tuple[int, int] | None:
    """Toạ độ pixel của đầu ngón trỏ, kẹp trong khung hình."""
    if not landmarks:
        return None
    tip = landmarks[INDEX_FINGER_TIP]
    x = min(max(int(tip.x * width), 0), width - 1)
    y = min(max(int(tip.y * height), 0), height - 1)
    return x, y


def object_at_point(polygons: Sequence[np.ndarray], point: tuple[int, int] | None, tolerance: float) -> int | None:
    """Chỉ số mask được chỉ vào, hoặc None — cùng quy tắc với find_object_at_point của finger_select.py.

    Bỏ mask mà đầu ngón tay nằm ngoài mép quá `tolerance` pixel; còn lại ưu tiên mask đầu ngón tay nằm
    sâu bên trong nhất (khoảng cách tới mép lớn nhất), bằng nhau thì vật nhỏ hơn.
    """
    if point is None:
        return None
    best: tuple[tuple[float, float], int] | None = None
    for i, polygon in enumerate(polygons):
        if len(polygon) < 3:
            continue
        contour = np.asarray(polygon, dtype=np.float32)
        # > 0: bên trong, = 0: trên mép, < 0: bên ngoài (khoảng cách tới mép)
        distance = cv2.pointPolygonTest(contour, (float(point[0]), float(point[1])), True)
        if distance < -tolerance:
            continue
        key = (-distance, cv2.contourArea(contour))
        if best is None or key < best[0]:
            best = (key, i)
    return best[1] if best else None


def object_at_laser(polygons: Sequence[np.ndarray], point: tuple[int, int] | None, tolerance: float = 4) -> int | None:
    """Prefer a containing mask over a near miss, then the smaller containing object.

    A mouse on a desk should win over an overlapping desk mask. The small edge
    allowance compensates for segmentation around a bright spot, not finger size.
    """
    if point is None:
        return None
    best = None
    for i, polygon in enumerate(polygons):
        if len(polygon) < 3:
            continue
        contour = np.asarray(polygon, dtype=np.float32)
        distance = cv2.pointPolygonTest(contour, (float(point[0]), float(point[1])), True)
        if distance < -tolerance:
            continue
        key = (0 if distance >= 0 else 1, 0 if distance >= 0 else -distance, cv2.contourArea(contour))
        if best is None or key < best[0]:
            best = (key, i)
    return best[1] if best else None
