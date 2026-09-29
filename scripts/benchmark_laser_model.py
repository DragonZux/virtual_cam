"""Compare full-frame red-laser inference with crop tracking on supplied photos.

Run: .cam/Scripts/python scripts/benchmark_laser_model.py path/to/laser.jpg
Uses the same weights, confidence and pixel scale for both paths. Measurements
cover laser inference only, not YOLO objects, transport, or camera FPS.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
import time

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from services.laser_model import LaserModel  # noqa: E402


def measure(model, frame, hint, crop_size, iterations):
    samples = {"full": [], "tracking": []}
    spots = {}
    for iteration in range(iterations + 3):
        order = [("full", 0), ("tracking", crop_size)]
        if iteration % 2:
            order.reverse()
        for name, crop in order:
            model.crop_size = crop
            start = time.perf_counter()
            spots[name] = model.detect(frame, hint)
            if iteration >= 3:
                samples[name].append((time.perf_counter() - start) * 1000)
    return {name: {
        "median_ms": round(float(np.median(values)), 2),
        "p95_ms": round(float(np.percentile(values, 95)), 2),
        "spot": spots[name].model_dump() if spots[name] else None,
    } for name, values in samples.items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("images", type=Path, nargs="+")
    parser.add_argument("--model", type=Path, default=ROOT / "models/laser-advr-yolov5l6.torchscript")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--size", type=int, default=1280)
    parser.add_argument("--crop-size", type=int, default=384)
    parser.add_argument("--confidence", type=float, default=0.55)
    parser.add_argument("--iterations", type=int, default=20)
    args = parser.parse_args()
    if args.iterations < 1 or args.size < 64 or args.size % 64 or args.crop_size < 64 or args.crop_size % 64:
        parser.error("iterations must be positive; sizes must be positive multiples of 64")
    import torch

    cv2.setNumThreads(1)
    device = ("cuda:0" if torch.cuda.is_available() else "cpu") if args.device == "auto" else args.device
    model = LaserModel(args.model, device, args.size, args.confidence, args.crop_size)
    model.warm_up()
    print(json.dumps({"device": device, "size": args.size, "crop_size": args.crop_size,
                      "iterations": args.iterations}), flush=True)
    for path in args.images:
        frame = cv2.imread(str(path))
        if frame is None:
            parser.error(f"Cannot read image: {path}")
        scale = min(1, 1280 / max(frame.shape[:2]))
        frame = cv2.resize(frame, (round(frame.shape[1] * scale), round(frame.shape[0] * scale)))
        # Match the browser's 1280px JPEG upload, including small-spot compression.
        ok, encoded = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 94])
        if not ok:
            parser.error(f"Cannot encode image: {path}")
        frame = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
        acquired = model.detect(frame)
        cases = {"acquire": None}
        if acquired:
            cases["track"] = tuple(acquired.point)
            height, width = frame.shape[:2]
            cases["reacquire"] = (0 if acquired.point[0] > width // 2 else width - 1,
                                  0 if acquired.point[1] > height // 2 else height - 1)
        for name, hint in cases.items():
            result = measure(model, frame, hint, args.crop_size, args.iterations)
            print(json.dumps({"image": path.name, "case": name, "hint": hint, **result}), flush=True)


if __name__ == "__main__":
    main()
