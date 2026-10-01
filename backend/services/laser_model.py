"""ADVR's red laser YOLOv5l6, exported as TorchScript (no legacy YOLO imports)."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from models import LaserSpot

# A hand-held pointer moves this far between frames at most (pixels at 640 px on the long side)
HINT_RADIUS = 40


class LaserUnavailable(RuntimeError):
    """The trained laser detector is not available; never silently use colour rules."""


def prepare_frame(frame: np.ndarray, size: int, stride: int = 64):
    """YOLOv5 AutoShape letterbox, RGB/CHW float32; preserve its half-pad mapping."""
    height, width = frame.shape[:2]
    gain = size / max(height, width)
    target_h, target_w = (int(np.ceil(v * gain / stride) * stride) for v in (height, width))
    gain = min(target_h / height, target_w / width)
    resized_w, resized_h = round(width * gain), round(height * gain)
    pad_x, pad_y = (target_w - resized_w) / 2, (target_h - resized_h) / 2
    resized = (frame if (resized_w, resized_h) == (width, height) else
               cv2.resize(frame, (resized_w, resized_h), interpolation=cv2.INTER_LINEAR))
    padded = cv2.copyMakeBorder(resized, round(pad_y - 0.1), round(pad_y + 0.1),
                               round(pad_x - 0.1), round(pad_x + 0.1), cv2.BORDER_CONSTANT,
                               value=(114, 114, 114))
    rgb = np.ascontiguousarray(padded[:, :, ::-1].transpose(2, 0, 1)[None], dtype=np.float32) / 255.0
    return rgb, gain, (pad_x, pad_y)


def select_spot(prediction: np.ndarray, shape: tuple[int, int], gain: float,
                padding: tuple[float, float], confidence: float,
                hint: tuple[int, int] | None = None, *, hint_radius: float | None = None) -> LaserSpot | None:
    """Decode one-class xywh/objectness/class rows; hints only select current detections."""
    rows = np.asarray(prediction).reshape(-1, 6)
    scores = rows[:, 4] * rows[:, 5]
    valid = np.isfinite(rows).all(axis=1) & (scores >= confidence) & (scores <= 1)
    valid &= (rows[:, 2] > 0) & (rows[:, 3] > 0)
    rows, scores = rows[valid], scores[valid]
    if not len(rows):
        return None
    height, width = shape
    centers = (rows[:, :2] - np.array(padding)) / gain
    inside = (centers[:, 0] >= 0) & (centers[:, 0] < width) & (centers[:, 1] >= 0) & (centers[:, 1] < height)
    centers, scores = centers[inside], scores[inside]
    if not len(centers):
        return None
    # Only a single point is returned: overlapping duplicate boxes do not affect
    # the highest-confidence choice, so an NMS dependency is unnecessary here.
    indices = np.arange(len(centers))
    if hint is not None:
        radius = HINT_RADIUS * max(shape) / 640 if hint_radius is None else hint_radius
        nearby = indices[np.linalg.norm(centers - np.array(hint), axis=1) <= radius]
        if len(nearby):
            indices = nearby
    winner = indices[np.argmax(scores[indices])]
    x, y = np.rint(centers[winner]).astype(int)
    return LaserSpot(point=[int(np.clip(x, 0, width - 1)), int(np.clip(y, 0, height - 1))],
                     score=round(float(scores[winner]), 4))


class LaserModel:
    def __init__(self, path: Path, device: str, size: int = 1280, confidence: float = 0.55,
                 crop_size: int = 384):
        # Constructor runs only in Detector's background loader, not on import.
        import torch

        if not path.is_file():
            raise FileNotFoundError(f"Thiếu model laser {path.name}. Chạy python docker/prepare_laser_model.py hoặc khởi động lại container.")
        extra = {"config.json": ""}
        self.model: Any = torch.jit.load(str(path), map_location=device, _extra_files=extra).eval()
        meta = json.loads(extra["config.json"])
        if meta.get("format") != "virtual-cam-laser-v1" or meta.get("color") != "red" or meta.get("stride") != 64:
            raise ValueError("Model laser không đúng định dạng ADVR đã xuất cho Virtual Cam.")
        self.torch = torch
        self.device = device
        self.dtype = torch.float16 if device.startswith("cuda") else torch.float32
        self.model.to(dtype=self.dtype)
        self.size = size
        self.confidence = confidence
        self.crop_size = crop_size

    def warm_up(self) -> None:
        # Warm both acquisition orientations and tracking before accepting frames.
        for shape in ((720, 1280, 3), (1280, 720, 3)):
            self._detect(np.zeros(shape, dtype=np.uint8), self.size)
        if 0 < self.crop_size < self.size:
            self._detect(np.zeros((self.crop_size, self.crop_size, 3), dtype=np.uint8), self.crop_size)

    def detect(self, frame: np.ndarray, hint: tuple[int, int] | None = None) -> LaserSpot | None:
        """Try a current-frame crop near this client's hint, then reacquire on the full frame.

        Scale the crop with the full-frame input size so small spots keep their
        pixel size at the network. No previous detection or image is cached.
        """
        height, width = frame.shape[:2]
        if (hint is not None and 0 < self.crop_size < self.size and
                0 <= hint[0] < width and 0 <= hint[1] < height):
            side = max(1, round(self.crop_size * max(height, width) / self.size))
            # Very narrow images cannot provide a square crop at the original scale.
            if side <= min(height, width):
                left = max(0, min(width - side, hint[0] - side // 2))
                top = max(0, min(height - side, hint[1] - side // 2))
                local_hint = (hint[0] - left, hint[1] - top)
                radius = HINT_RADIUS * max(height, width) / 640
                spot = self._detect(frame[top:top + side, left:left + side], self.crop_size,
                                    local_hint, hint_radius=radius)
                if spot is not None:
                    point = [spot.point[0] + left, spot.point[1] + top]
                    # A distant LED inside the crop must not prevent full-frame reacquisition.
                    if np.hypot(point[0] - hint[0], point[1] - hint[1]) <= radius:
                        return spot.model_copy(update={"point": point})
        return self._detect(frame, self.size, hint)

    def _detect(self, frame: np.ndarray, size: int, hint: tuple[int, int] | None = None,
                *, hint_radius: float | None = None) -> LaserSpot | None:
        pixels, gain, padding = prepare_frame(frame, size)
        with self.torch.inference_mode():
            output = self.model(self.torch.from_numpy(pixels).to(device=self.device, dtype=self.dtype))
            raw = output[0] if isinstance(output, (tuple, list)) else output
            # Transfer only plausible spots from the GPU, not every anchor.
            rows = raw[0]
            rows = rows[rows[:, 4] * rows[:, 5] >= self.confidence]
            prediction = rows.detach().cpu().numpy()
        return select_spot(prediction, frame.shape[:2], gain, padding, self.confidence, hint,
                           hint_radius=hint_radius)


class YoloLaserModel:
    """Custom Ultralytics detector trained with one class: the laser spot."""
    def __init__(self, path: Path, device: str, size: int, confidence: float):
        from ultralytics import YOLO

        self.model = YOLO(str(path))
        if self.model.task != "detect" or len(self.model.names) != 1:
            raise ValueError("Model laser .pt phải là YOLO detect được huấn luyện với đúng một lớp chấm laser.")
        self.device, self.size, self.confidence = device, size, confidence

    def warm_up(self) -> None:
        self.detect(np.zeros((480, 640, 3), dtype=np.uint8))

    def detect(self, frame: np.ndarray, hint: tuple[int, int] | None = None) -> LaserSpot | None:
        result = self.model.predict(frame, device=self.device, imgsz=self.size,
                                    conf=self.confidence, verbose=False)[0]
        boxes = result.boxes.cpu()
        if not len(boxes):
            return None
        centers = (boxes.xyxy.numpy()[:, :2] + boxes.xyxy.numpy()[:, 2:]) / 2
        scores = boxes.conf.numpy()
        indices = np.arange(len(scores))
        if hint is not None:
            near = indices[np.linalg.norm(centers - np.array(hint), axis=1) <= HINT_RADIUS * max(frame.shape[:2]) / 640]
            if len(near):
                indices = near
        winner = indices[np.argmax(scores[indices])]
        height, width = frame.shape[:2]
        x, y = np.rint(centers[winner]).astype(int)
        return LaserSpot(point=[int(np.clip(x, 0, width - 1)), int(np.clip(y, 0, height - 1))],
                         score=round(float(scores[winner]), 4))
