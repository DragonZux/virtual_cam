"""Detect compact laser spots, including white cores with faint coloured halos.

A single-frame heuristic, not a trained or calibrated classifier. Similar LEDs
can still be ambiguous; no temporal state is shared between browser requests.
"""
from __future__ import annotations

import cv2
import numpy as np

from models import LaserColor, LaserSpot


def _candidates(
    frame: np.ndarray, hsv: np.ndarray, chroma: np.ndarray, colour: np.ndarray,
    brightness: int, white_core: bool,
) -> list[tuple[tuple[int, int], float]]:
    height, width = frame.shape[:2]
    scale = max(width, height) / 640
    # min(B,G,R) finds neutral cores; V also supports saturated coloured cores.
    light = np.min(frame, axis=2) if white_core else hsv[:, :, 2]
    background = cv2.GaussianBlur(light, (0, 0), max(2, 3 * scale))
    # Chroma subsampling can tint/darken the white core. The requested V peak
    # is checked below; allow its weaker colour channels to fall a little lower.
    core_threshold = max(120, brightness - 30) if white_core else brightness
    mask = (light >= core_threshold) & (light.astype(np.int16) - background.astype(np.int16) >= 25)
    if not white_core:
        mask &= colour & (hsv[:, :, 1] >= 120)
    count, labels, stats, centres = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    found = []
    for i in range(1, count):
        x, y, w, h, area = stats[i]
        aspect_limit = 1.8 if white_core else 1.5
        # Do not scale the minimum area: distant spots can be only a few pixels.
        if (area < (1 if white_core else 2) or max(w, h) > max(6, 20 * scale)
                or max(w, h) > aspect_limit * min(w, h) or area / (w * h) < 0.55):
            continue
        cx, cy = centres[i]
        radius = max(w, h) / 2
        padding = int(np.ceil(max(5, 4 * scale) + radius))
        left, top = max(0, x - padding), max(0, y - padding)
        right, bottom = min(width, x + w + padding), min(height, y + h + padding)
        yy, xx = np.ogrid[top:bottom, left:right]
        distance = (xx - cx) ** 2 + (yy - cy) ** 2
        core = labels[top:bottom, left:right] == i
        halo = distance <= (radius + max(1, scale)) ** 2
        ring = (distance >= (radius + max(2, 2 * scale)) ** 2) & (distance <= (radius + padding) ** 2)
        if np.count_nonzero(ring) < 8:
            continue
        patch = hsv[top:bottom, left:right]
        tint = chroma[top:bottom, left:right]
        # Camera clipping/JPEG can leave only a faint pink or green halo.
        # Require a local colour increase, not just a uniformly warm surface.
        coloured = halo & colour[top:bottom, left:right] & (patch[:, :, 1] >= 12) & (tint >= 10)
        if np.count_nonzero(coloured) < 2:
            continue
        peak = float(np.max(patch[:, :, 2][core]))
        contrast = peak - float(np.median(patch[:, :, 2][ring]))
        chromatic = float(np.percentile(tint[coloured], 75)) - float(np.median(tint[ring]))
        if peak < brightness or contrast < 30 or chromatic < (5 if white_core else 40):
            continue
        fill = float(area) / (w * h)
        if white_core:
            whiteness = float(np.max(np.min(frame[top:bottom, left:right], axis=2)[core])) / 255
            # Weak tint needs a clipped core; an isolated pixel needs a strong
            # halo, otherwise text, sensor noise and LEDs dominate.
            if (whiteness < 0.9 and chromatic < 25) or (area == 1 and chromatic < 60):
                continue
            score = (0.35 * min(1, contrast / 100) + 0.15 * min(1, chromatic / 20)
                     + 0.3 * fill + 0.2 * whiteness)
        else:
            score = 0.45 * min(1, contrast / 150) + 0.3 * min(1, chromatic / 100) + 0.25 * fill
        if score >= 0.75:
            found.append(((round(cx), round(cy)), round(float(score), 3)))
    return found


def detect_laser(frame: np.ndarray, color: LaserColor, min_brightness: int = 200) -> LaserSpot | None:
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    b, g, r = cv2.split(frame.astype(np.float32))
    hue = hsv[:, :, 0]
    if color == LaserColor.red:
        # A red laser can appear pink/magenta through a camera.
        colour = (hue <= 15) | (hue >= 150)
        chroma = r - (g + b) * 0.5
    else:
        colour = (hue >= 40) & (hue <= 85)
        chroma = g - (r + b) * 0.5
    candidates = sorted(
        _candidates(frame, hsv, chroma, colour, min_brightness, True)
        + _candidates(frame, hsv, chroma, colour, min_brightness, False),
        key=lambda item: item[1], reverse=True,
    )
    # Merge a core and saturated halo describing the same physical point.
    unique = []
    merge_distance = max(2, 3 * max(frame.shape[:2]) / 640)
    for point, score in candidates:
        if all(np.hypot(point[0] - p[0], point[1] - p[1]) > merge_distance for p, _ in unique):
            unique.append((point, score))
    if not unique or (len(unique) > 1 and unique[1][1] >= unique[0][1] * 0.85):
        return None
    point, score = unique[0]
    return LaserSpot(point=list(point), color=color, score=score)
