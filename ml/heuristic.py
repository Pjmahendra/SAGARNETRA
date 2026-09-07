"""Classic dark-spot segmentation used when no trained model is available.

Not a substitute for the U-Net: it finds dark, smooth patches that stand out from both the whole scene and their wider
surroundings, labels compact ones as oil and very large diffuse ones as look-alikes, and marks small bright targets as
ships. Always reported as engine="heuristic".
"""

from __future__ import annotations

import cv2
import numpy as np

from . import LOOKALIKE, OIL, SEA, SHIP

Z_GLOBAL = 2.5  # how many robust std-devs darker than the scene median
Z_LOCAL = 1.5  # ... and darker than the wide local background
MIN_AREA_FRAC = 0.003


def _odd(n: int) -> int:
    return n if n % 2 else n + 1


def segment(gray: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Return (class_map uint8 HxW, probs float32 5xHxW)."""
    h, w = gray.shape
    fine = cv2.medianBlur(gray, 5).astype(np.float32)
    smooth = cv2.GaussianBlur(cv2.medianBlur(gray, 7).astype(np.float32), (0, 0), 4)
    med = float(np.median(smooth))
    mad = float(np.median(np.abs(smooth - med))) * 1.4826 + 1e-3
    background = cv2.blur(smooth, (_odd(max(31, w // 3)), _odd(max(31, h // 3))))

    z_global = (med - smooth) / mad
    z_local = (background - smooth) / mad
    dark = ((z_global > Z_GLOBAL) & (z_local > Z_LOCAL)).astype(np.uint8)
    dark = cv2.morphologyEx(dark, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    dark = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))

    class_map = np.full((h, w), SEA, np.uint8)
    probs = np.zeros((5, h, w), np.float32)
    probs[SEA] = 0.9

    n, labels, stats, _ = cv2.connectedComponentsWithStats(dark, connectivity=8)
    min_area = max(40, int(MIN_AREA_FRAC * h * w))
    for i in range(1, n):
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area < min_area:
            continue
        comp = labels == i
        bw, bh = int(stats[i, cv2.CC_STAT_WIDTH]), int(stats[i, cv2.CC_STAT_HEIGHT])
        fill = area / max(1, bw * bh)
        contrast = float(np.clip(z_global[comp].mean() / 6.0, 0, 1))
        # very large or ragged, low-contrast patches read as wind shadow / bloom; compact dark patches read as oil
        is_lookalike = area > 0.25 * h * w or (fill < 0.25 and contrast < 0.5)
        cls = LOOKALIKE if is_lookalike else OIL
        p = 0.5 + 0.4 * contrast
        class_map[comp] = cls
        probs[:, comp] = 0.0
        probs[cls, comp] = p
        probs[SEA, comp] = 1.0 - p

    # bright compact targets: ships
    bright = (fine > med + 9.0 * mad).astype(np.uint8)
    bright = cv2.morphologyEx(bright, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(bright, connectivity=8)
    for i in range(1, n):
        area = int(stats[i, cv2.CC_STAT_AREA])
        if 4 <= area <= 0.001 * h * w:
            comp = labels == i
            class_map[comp] = SHIP
            probs[:, comp] = 0.0
            probs[SHIP, comp] = 0.7
            probs[SEA, comp] = 0.3
    return class_map, probs
