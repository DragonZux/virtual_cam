"""Detect compact green laser spots with clear colour evidence, including white cores.

Red lasers use the trained model in laser_model.py; this module only serves green.
A single-frame heuristic, not a trained or calibrated classifier. Similar LEDs
can still be ambiguous; no temporal state is shared between browser requests.
Candidates first pass fixed gates (brightness, shape, local colour), then are
ranked by what separates a real dot from LEDs and reflections on the uploaded
test photos: a clipped (overexposed) core, a small compact core, strong local
contrast and a strongly tinted halo.
White cores need a coloured halo spread around them; weak white-light colour
casts are rejected even if this loses an almost completely washed-out laser.
The browser may pass `hint`, the last stable spot it tracked: candidates near it
win over brighter look-alikes elsewhere, which keeps the dot from jumping.

Speed: follow a hint in a padded crop at the original resolution, falling back
to the full frame on a miss. Whole-frame work is uint8 OpenCV only; colour and
tint are computed just in the small patches around candidates.
"""
from __future__ import annotations

import cv2
import numpy as np

from models import LaserColor, LaserSpot

# A hand-held pointer moves this far between frames at most (pixels at 640 px on the long side)
HINT_RADIUS = 40

# OpenCV hue is 0..179.
GREEN_HUE_MIN = 40
GREEN_HUE_MAX = 85
WHITE_HALO_MIN_SATURATION = 40
WHITE_HALO_MIN_TINT = 20
WHITE_HALO_MIN_COVERAGE = 0.35


def _colour(hue: np.ndarray) -> np.ndarray:
    return (hue >= GREEN_HUE_MIN) & (hue <= GREEN_HUE_MAX)


def _tint(bgr: np.ndarray) -> np.ndarray:
    b, g, r = (bgr[:, :, i].astype(np.float32) for i in range(3))
    # Green must beat BOTH others: an average also rewards yellow (G ~= R) and
    # cyan (G ~= B), including their desaturated white cores.
    return g - np.maximum(r, b)


def _candidates(frame: np.ndarray, hsv: np.ndarray, brightness: int,
                white_core: bool, scale: float) -> list[tuple[tuple[float, float], float]]:
    height, width = frame.shape[:2]
    value = hsv[:, :, 2]
    # min(B,G,R) finds neutral cores; V also supports saturated coloured cores.
    light = cv2.min(cv2.min(frame[:, :, 0], frame[:, :, 1]), frame[:, :, 2]) if white_core else value
    background = cv2.GaussianBlur(light, (0, 0), max(2, 3 * scale))
    # Chroma subsampling can tint/darken the white core. The requested V peak
    # is checked below; allow its weaker colour channels to fall a little lower.
    core_threshold = max(120, brightness - 30) if white_core else brightness
    # uint8 subtract saturates at 0, so this equals `light - background >= 25`
    mask = (light >= core_threshold) & (cv2.subtract(light, background) >= 25)
    if not white_core:
        mask &= cv2.inRange(hsv, (GREEN_HUE_MIN, 120, 0), (GREEN_HUE_MAX, 255, 255)) > 0
    count, labels, stats, centres = cv2.connectedComponentsWithStats(mask.view(np.uint8), connectivity=8)
    if count <= 1:
        return []
    # Shape gates for every component at once; only survivors get the per-patch checks.
    w, h, area = stats[1:, 2], stats[1:, 3], stats[1:, 4]
    longest, shortest = np.maximum(w, h), np.minimum(w, h)
    keep = ((area >= (1 if white_core else 2)) & (longest <= max(6, 20 * scale))
            & (longest <= (1.8 if white_core else 1.5) * shortest) & (area >= 0.55 * w * h))
    found = []
    for i in np.flatnonzero(keep) + 1:
        x, y, w, h, area = (int(v) for v in stats[i])
        # Cheapest gate first: most bright specks never reach the requested peak.
        core_value = value[y:y + h, x:x + w][labels[y:y + h, x:x + w] == i]
        peak = float(core_value.max())
        if peak < brightness:
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
        tint = _tint(frame[top:bottom, left:right])
        colour_ok = _colour(patch[:, :, 0])
        if white_core:
            # Colour must extend beyond the bright component. A few tinted
            # pixels inside a reflection are insufficient. Allow asymmetric
            # halos: JPEG chroma subsampling can erase one side of a real dot.
            surround = halo & ~core
            coloured = (surround & colour_ok & (patch[:, :, 1] >= WHITE_HALO_MIN_SATURATION)
                        & (tint >= WHITE_HALO_MIN_TINT))
            if np.count_nonzero(coloured) < max(3, WHITE_HALO_MIN_COVERAGE * np.count_nonzero(surround)):
                continue
        else:
            coloured = halo & colour_ok & (patch[:, :, 1] >= 12) & (tint >= 10)
            if np.count_nonzero(coloured) < 2:
                continue
        contrast = peak - float(np.median(patch[:, :, 2][ring]))
        # Use the upper background quartile for white cores so a nearby green
        # surface cannot supply their halo colour simply by covering <50% of
        # the ring. A compact laser has stronger colour than its surroundings.
        background_tint = float(np.percentile(tint[ring], 75)) if white_core else float(np.median(tint[ring]))
        chromatic = float(np.percentile(tint[coloured], 75)) - background_tint
        if contrast < 30 or chromatic < (15 if white_core else 40):
            continue
        fill = area / (w * h)
        if white_core:
            whiteness = float(light[top:bottom, left:right][core].max()) / 255
            # Weak tint needs a clipped core; an isolated pixel needs a strong
            # halo, otherwise text, sensor noise and LEDs dominate.
            if (whiteness < 0.9 and chromatic < 25) or (area == 1 and chromatic < 60):
                continue
            score = (0.35 * min(1, contrast / 100) + 0.15 * min(1, chromatic / 20)
                     + 0.3 * fill + 0.2 * whiteness)
        else:
            score = 0.45 * min(1, contrast / 150) + 0.3 * min(1, chromatic / 100) + 0.25 * fill
        if score < 0.75:
            continue
        # Ranking: the gate score above saturates near 1 for LEDs and reflections too.
        clipped = np.count_nonzero(core_value >= 250) / area
        size = area / (scale * scale)  # core area at 640 px on the long side
        rank = (0.35 * min(1, contrast / 200) + 0.25 * min(1, chromatic / 60)
                + 0.25 * clipped + 0.15 * min(1, 6 / size))
        found.append(((float(cx), float(cy)), round(float(rank), 3)))
    return found


def _spots(frame: np.ndarray, brightness: int, scale: float) -> list[tuple[tuple[int, int], float]]:
    """Rank/merge a region, using the full frame's scale for every size gate."""
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    # Every candidate must reach this peak. Dark frames need no blur or labels.
    if cv2.minMaxLoc(hsv[:, :, 2])[1] < brightness:
        return []
    candidates = sorted(
        _candidates(frame, hsv, brightness, True, scale)
        + _candidates(frame, hsv, brightness, False, scale),
        key=lambda item: item[1], reverse=True,
    )
    # Merge pieces of one physical dot: its white core and coloured halo, or a
    # halo split in two by JPEG chroma loss around a small core.
    merge_distance = 6 * scale
    groups: list[list[tuple[tuple[float, float], float]]] = []
    for point, score in candidates:
        group = next((g for g in groups if np.hypot(point[0] - g[0][0][0], point[1] - g[0][0][1]) <= merge_distance), None)
        if group is None:
            groups.append([(point, score)])
        else:
            group.append((point, score))
    unique = []
    for group in groups:
        weight = sum(score for _, score in group)
        x = sum(p[0] * score for p, score in group) / weight
        y = sum(p[1] * score for p, score in group) / weight
        unique.append(((round(x), round(y)), group[0][1]))
    return unique


def detect_laser(frame: np.ndarray, min_brightness: int = 200,
                 hint: tuple[int, int] | None = None) -> LaserSpot | None:
    height, width = frame.shape[:2]
    scale = max(width, height) / 640
    radius = HINT_RADIUS * scale
    if hint is not None and 0 <= hint[0] < width and 0 <= hint[1] < height:
        # Include complete components, their colour/contrast rings and the blur
        # kernel beyond the search radius. Cropping must not shrink the size
        # gates or turn a cut-off reflection into a compact laser candidate.
        padding = int(np.ceil(radius + max(24, 48 * scale)))
        left, top = max(0, hint[0] - padding), max(0, hint[1] - padding)
        right, bottom = min(width, hint[0] + padding + 1), min(height, hint[1] + padding + 1)
        if left > 0 or top > 0 or right < width or bottom < height:
            local = _spots(frame[top:bottom, left:right], min_brightness, scale)
            for (x, y), score in local:
                point = (x + left, y + top)
                if np.hypot(point[0] - hint[0], point[1] - hint[1]) <= radius:
                    return LaserSpot(point=list(point), color=LaserColor.green, score=score)

    unique = _spots(frame, min_brightness, scale)
    if hint is not None:
        # Keep following the tracked dot; a far look-alike (LED, reflection) must not steal it.
        near = [c for c in unique if np.hypot(c[0][0] - hint[0], c[0][1] - hint[1]) <= radius]
        if near:
            point, score = near[0]
            return LaserSpot(point=list(point), color=LaserColor.green, score=score)
    if not unique or (len(unique) > 1 and unique[1][1] >= unique[0][1] * 0.85):
        return None
    point, score = unique[0]
    return LaserSpot(point=list(point), color=LaserColor.green, score=score)
