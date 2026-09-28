"""ADVR's red laser YOLOv5l6, exported as TorchScript (no legacy YOLO imports)."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from models import LaserColor, LaserSpot
from services.laser import HINT_RADIUS


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
    resized = cv2.resize(frame, (resized_w, resized_h), interpolation=cv2.INTER_LINEAR)
    padded = cv2.copyMakeBorder(resized, round(pad_y - 0.1), round(pad_y + 0.1),
                               round(pad_x - 0.1), round(pad_x + 0.1), cv2.BORDER_CONSTANT,
                               value=(114, 114, 114))
    rgb = np.ascontiguousarray(padded[:, :, ::-1].transpose(2, 0, 1)[None], dtype=np.float32) / 255.0
    return rgb, gain, (pad_x, pad_y)


def select_spot(prediction: np.ndarray, shape: tuple[int, int], gain: float,
                padding: tuple[float, float], confidence: float,
                hint: tuple[int, int] | None = None) -> LaserSpot | None:
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
        nearby = indices[np.linalg.norm(centers - np.array(hint), axis=1) <= HINT_RADIUS * max(shape) / 640]
        if len(nearby):
            indices = nearby
    winner = indices[np.argmax(scores[indices])]
    x, y = np.rint(centers[winner]).astype(int)
    return LaserSpot(point=[int(np.clip(x, 0, width - 1)), int(np.clip(y, 0, height - 1))],
                     color=LaserColor.red, score=round(float(scores[winner]), 4))


class LaserModel:
    def __init__(self, path: Path, device: str, size: int = 1280, confidence: float = 0.55):
        # Constructor runs only in Detector's background loader, not on import.
        import torch

        if not path.is_file():
            raise FileNotFoundError(f"Thiếu model laser {path.name}. Chạy python scripts/prepare_laser_model.py rồi khởi động lại.")
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

    def detect(self, frame: np.ndarray, hint: tuple[int, int] | None = None) -> LaserSpot | None:
        pixels, gain, padding = prepare_frame(frame, self.size)
        with self.torch.inference_mode():
            output = self.model(self.torch.from_numpy(pixels).to(device=self.device, dtype=self.dtype))
            raw = output[0] if isinstance(output, (tuple, list)) else output
            # Transfer only plausible spots from the GPU, not every anchor.
            rows = raw[0]
            rows = rows[rows[:, 4] * rows[:, 5] >= self.confidence]
            prediction = rows.detach().cpu().numpy()
        return select_spot(prediction, frame.shape[:2], gain, padding, self.confidence, hint)
