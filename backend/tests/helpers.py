"""Dữ liệu giả dùng chung cho test (khung JPEG, bàn tay, mask vật thể)."""
from types import SimpleNamespace

import cv2
import numpy as np

from services.detector import ModelOutput

# Một phần bảng lớp COCO; có "person" để kiểm tra lớp này bị loại khỏi danh sách mục tiêu
FAKE_NAMES = {0: "person", 41: "cup", 63: "laptop", 64: "mouse", 66: "keyboard"}


def jpeg(width: int = 640, height: int = 480) -> bytes:
    ok, buffer = cv2.imencode(".jpg", np.full((height, width, 3), 90, dtype=np.uint8))
    assert ok
    return buffer.tobytes()


def hand_pointing_at(x: float, y: float) -> list[SimpleNamespace]:
    """21 điểm MediaPipe giả, đầu ngón trỏ (điểm 8) ở toạ độ chuẩn hoá (x, y)."""
    points = [SimpleNamespace(x=0.5, y=0.9) for _ in range(21)]
    points[8] = SimpleNamespace(x=x, y=y)
    return points


def rectangle(x1: float, y1: float, x2: float, y2: float) -> np.ndarray:
    return np.array([[x1, y1], [x2, y1], [x2, y2], [x1, y2]], dtype=np.float32)


class FakeModels:
    """Thay `Detector._run_models`: trả kết quả đặt sẵn và ghi lại tuỳ chọn trình duyệt gửi lên."""

    def __init__(self):
        self.output = ModelOutput(landmarks=None, detections=[], polygons=[])
        self.calls = []

    def __call__(self, frame, options):
        self.calls.append(options)
        return self.output
