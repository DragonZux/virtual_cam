"""Detect one visible red/green laser spot, independently for each browser frame.

This is a colour/brightness detector, not a trained model. Small coloured LEDs
and reflections can look identical; reject ambiguous frames instead of guessing.
"""
from __future__ import annotations

import cv2
import numpy as np

from models import LaserColor, LaserSpot


def detect_laser(frame: np.ndarray, color: LaserColor, min_brightness: int = 200) -> LaserSpot | None:
    height, width = frame.shape[:2]
    scale = max(width, height) / 640
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    # JPEG chroma subsampling can darken the coloured halo around a white core.
    # Build candidates at a lower threshold, then require a bright peak inside.
    halo_brightness = max(100, min_brightness - 45)
    if color == LaserColor.red:
        mask = cv2.bitwise_or(
            cv2.inRange(hsv, (0, 70, halo_brightness), (12, 255, 255)),
            cv2.inRange(hsv, (168, 70, halo_brightness), (179, 255, 255)),
        )
    else:
        # Exclude yellow lettering/highlights near hue 30..35.
        mask = cv2.inRange(hsv, (40, 70, halo_brightness), (85, 255, 255))
    # Keep tiny spots; erosion/opening would erase them. External contours also
    # preserve the centre of an overexposed white core surrounded by colour.
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates: list[LaserSpot] = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < max(1, scale * scale) or area > np.pi * (12 * scale) ** 2:
            continue
        (cx, cy), radius = cv2.minEnclosingCircle(contour)
        if radius > max(3, 12 * scale) or area / (np.pi * radius * radius) < 0.35:
            continue
        x, y, w, h = cv2.boundingRect(contour)
        if max(w, h) > 3 * min(w, h):
            continue
        moments = cv2.moments(contour)
        cx, cy = moments["m10"] / moments["m00"], moments["m01"] / moments["m00"]
        outer = int(np.ceil(radius * 2 + max(3, 3 * scale)))
        left, right = max(0, int(cx) - outer), min(width, int(cx) + outer + 1)
        top, bottom = max(0, int(cy) - outer), min(height, int(cy) + outer + 1)
        yy, xx = np.ogrid[top:bottom, left:right]
        distance = (xx - cx) ** 2 + (yy - cy) ** 2
        inner = distance <= max(radius, 1) ** 2
        ring = (distance >= (radius + max(2, 2 * scale)) ** 2) & (distance <= outer ** 2)
        if not np.any(inner) or np.count_nonzero(ring) < 8:
            continue
        values = hsv[top:bottom, left:right, 2]
        peak = float(np.max(values[inner]))
        contrast = peak - float(np.median(values[ring]))
        if peak < min_brightness or contrast < 25:
            continue
        compactness = min(1.0, area / (np.pi * radius * radius))
        # A ranking score, deliberately not described as a calibrated probability.
        score = 0.55 * min(1.0, contrast / 150) + 0.25 * peak / 255 + 0.2 * compactness
        candidates.append(LaserSpot(point=[round(cx), round(cy)], color=color, score=round(score, 3)))
    candidates.sort(key=lambda spot: spot.score, reverse=True)
    if not candidates or (len(candidates) > 1 and candidates[1].score >= candidates[0].score * 0.85):
        return None
    return candidates[0]
