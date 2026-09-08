"""Render a class map as a transparent RGBA PNG for the console overlay."""

from __future__ import annotations

import base64

import cv2
import numpy as np

from . import OIL

# BGRA — binary scheme: only the oil class is painted; sea (background) stays transparent.
COLORS = {
    OIL: (107, 107, 224, 150),
}


def class_map_png_base64(class_map: np.ndarray) -> str:
    h, w = class_map.shape
    rgba = np.zeros((h, w, 4), np.uint8)
    for cls, color in COLORS.items():
        rgba[class_map == cls] = color
    ok, buf = cv2.imencode(".png", rgba)
    if not ok:
        raise RuntimeError("PNG encode failed")
    return base64.b64encode(buf.tobytes()).decode()
