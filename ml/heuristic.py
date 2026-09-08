"""Classic dark-spot segmentation used when no trained model is available (binary: sea vs oil).

Finds dark, smooth patches that stand out from both the whole scene and their wider surroundings and labels them
oil; everything else is sea. Not a substitute for the trained U-Net — always reported as engine="heuristic".
"""

from __future__ import annotations

import cv2
import numpy as np

from . import OIL, SEA

Z_GLOBAL = 2.5  # how many robust std-devs darker than the scene median
Z_LOCAL = 1.5  # ... and darker than the wide local background
MIN_AREA_FRAC = 0.003


def _odd(n: int) -> int:
    return n if n % 2 else n + 1


def segment(gray: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Return (class_map uint8 HxW in {SEA, OIL}, probs float32 2xHxW)."""
    h, w = gray.shape
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
    probs = np.zeros((2, h, w), np.float32)
    probs[SEA] = 0.9

    n, labels, stats, _ = cv2.connectedComponentsWithStats(dark, connectivity=8)
    min_area = max(40, int(MIN_AREA_FRAC * h * w))
    for i in range(1, n):
        if int(stats[i, cv2.CC_STAT_AREA]) < min_area:
            continue
        comp = labels == i
        contrast = float(np.clip(z_global[comp].mean() / 6.0, 0, 1))
        p = 0.5 + 0.4 * contrast
        class_map[comp] = OIL
        probs[OIL, comp] = p
        probs[SEA, comp] = 1.0 - p
    return class_map, probs
