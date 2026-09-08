"""Generate clearly-labelled SYNTHETIC placeholder tiles so the console works before real Sentinel-1 tiles are bundled.

Replace with real tiles exported from Copernicus Browser (same ids, same bboxes in bboxes.json) and delete this script's
outputs. Never present these as satellite imagery.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
SPECS = {
    "guj-01": {"spill": (0.55, 0.5, 120, 30, 0.72), "ships": [(0.62, 0.33)], "bbox": [69.30, 20.95, 69.55, 21.15]},
    "mum-02": {"spill": (0.45, 0.55, 60, 22, 1.9), "ships": [(0.2, 0.2), (0.8, 0.7)], "bbox": [72.50, 18.75, 72.75, 18.95]},
    "che-03": {"spill": (0.5, 0.45, 45, 18, 1.3), "ships": [], "bbox": [80.30, 13.10, 80.55, 13.30]},
    "kut-04": {"spill": None, "ships": [(0.3, 0.6)], "bbox": [68.90, 22.40, 69.15, 22.60]},
    # Dover Strait. The one sector with a deep live AIS recording, so a slick here can be
    # backtracked against several hundred *real* vessel tracks rather than a written scenario —
    # which is why it gets a tile at all. Placed mid-strait, across the northbound lane.
    "dov-05": {"spill": (0.48, 0.52, 105, 26, 0.55), "ships": [(0.7, 0.28), (0.25, 0.75)],
               "bbox": [1.40, 50.90, 1.65, 51.10]},
    # A clean tile off the Belgian approach, so the Dover queue has something to review and dismiss.
    "dov-06": {"spill": None, "ships": [(0.4, 0.35), (0.72, 0.62)], "bbox": [1.90, 51.20, 2.15, 51.40]},
}
# NOTE ON ORDER: the seed for each tile is 100 + its index here, so appending keeps every existing
# tile byte-identical. Never insert in the middle — it silently regenerates tiles whose SHA-256 is
# already recorded in an exported evidence pack's chain of custody.


def make(seed: int, spec: dict, size=(512, 352)) -> Image.Image:
    rng = np.random.default_rng(seed)
    w, h = size
    img = rng.gamma(4.0, 32.0, (h, w))
    yy, xx = np.mgrid[0:h, 0:w]
    img *= 1 + 0.08 * np.sin(xx / 60.0) * np.cos(yy / 45.0)  # gentle swell texture
    if spec["spill"]:
        fx, fy, a, b, ang = spec["spill"]
        cx, cy = w * fx, h * fy
        dx = (xx - cx) * np.cos(ang) + (yy - cy) * np.sin(ang)
        dy = -(xx - cx) * np.sin(ang) + (yy - cy) * np.cos(ang)
        r = (dx / a) ** 2 + (dy / b) ** 2
        img *= np.where(r < 1, 0.22 + 0.25 * r, 1.0)
    img = img.clip(0, 255).astype(np.uint8)
    pil = Image.fromarray(img)
    d = ImageDraw.Draw(pil)
    for fx, fy in spec["ships"]:
        x, y = int(w * fx), int(h * fy)
        d.rectangle([x - 2, y - 4, x + 2, y + 4], fill=255)
    return pil


if __name__ == "__main__":
    for i, (sid, spec) in enumerate(SPECS.items()):
        make(100 + i, spec).save(HERE / f"{sid}.png")
    json.dump({k: v["bbox"] for k, v in SPECS.items()}, open(HERE / "bboxes.json", "w"), indent=2)
    print("wrote", ", ".join(f"{k}.png" for k in SPECS), "and bboxes.json")
