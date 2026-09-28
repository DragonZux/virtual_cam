"""Synthetic laser timings, without loading YOLO or opening the camera.

Run from the project root: .cam/Scripts/python scripts/benchmark_laser.py
Optionally compare a saved laser.py: --baseline path/to/laser_before.py
This measures the laser stage only, not camera FPS or real-world accuracy.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import sys
import time

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from models import LaserColor  # noqa: E402
from services.laser import detect_laser  # noqa: E402


def scenes():
    rng = np.random.default_rng(42)
    for width, height in ((640, 480), (1280, 720), (1920, 1080)):
        frame = rng.integers(45, 95, (height, width, 3), dtype=np.uint8)
        center = (width // 2, height // 2)
        scale = width / 640
        cv2.circle(frame, center, round(4 * scale), (60, 45, 255), -1)
        cv2.circle(frame, center, max(1, round(scale)), (255, 255, 255), -1)
        ok, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 94])
        assert ok
        frame = cv2.imdecode(jpeg, cv2.IMREAD_COLOR)
        for name, hint in (("acquire", None), ("track", center), ("reacquire", (20, 20))):
            yield f"{width}x{height}/{name}", frame, hint
        yield f"{width}x{height}/dark", np.full_like(frame, 70), None


def measure(functions, frame, hint, iterations):
    elapsed = {name: [] for name in functions}
    spots = {}
    for iteration in range(iterations + 5):
        # Interleave variants to reduce bias from background load/CPU clocks.
        order = list(functions.items())
        if iteration % 2:
            order.reverse()
        for name, function in order:
            started = time.perf_counter()
            spots[name] = function(frame, LaserColor.red, hint=hint)
            if iteration >= 5:
                elapsed[name].append((time.perf_counter() - started) * 1000)
    return {name: {
        "median_ms": round(float(np.median(values)), 3),
        "p95_ms": round(float(np.percentile(values, 95)), 3),
        "point": spots[name].point if spots[name] else None,
    } for name, values in elapsed.items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path)
    parser.add_argument("--iterations", type=int, default=50)
    args = parser.parse_args()
    if args.iterations < 1:
        parser.error("--iterations must be positive")
    # Match the application's OpenCV setting (Ultralytics disables its pool).
    cv2.setNumThreads(1)
    functions = {"current": detect_laser}
    if args.baseline:
        spec = importlib.util.spec_from_file_location("laser_baseline", args.baseline)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        functions = {"baseline": module.detect_laser, **functions}
    results = {}
    for name, frame, hint in scenes():
        results[name] = measure(functions, frame, hint, args.iterations)
    print(json.dumps({"opencv": cv2.__version__, "iterations": args.iterations, "scenes": results}, indent=2))


if __name__ == "__main__":
    main()
