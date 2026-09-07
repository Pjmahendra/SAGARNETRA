"""Segment a SAR tile and turn the oil class into a georeferenced polygon.

Detector.detect(...) picks the ONNX U-Net when a weights file exists and falls back to the heuristic otherwise.
Both paths return the same DetectionResult so the API and UI do not care which engine answered.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from . import CLASSES, OIL, WEIGHTS_DIR, heuristic
from .geo import BBox, LonLat, elongation, long_axis_bearing, pixel_to_lonlat, ring_area_km2, ring_centroid
from .overlay import class_map_png_base64
from .preprocess import Tile, normalise_for_model

log = logging.getLogger("sagarnetra.ml")

MIN_OIL_BLOB_PX = 40
TILE = 256
OVERLAP = 32


@dataclass
class DetectionResult:
    engine: str  # "unet" | "heuristic"
    confidence: float
    area_km2: float
    centroid: LonLat | None
    polygon: list[LonLat]
    polygon_px: list[tuple[int, int]]
    heading_deg: float
    elongation: float
    class_pixels: dict[str, int]
    inference_ms: int
    mask_png: str
    model_name: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


class OnnxUNet:
    def __init__(self, path: Path):
        import onnxruntime as ort

        self.path = path
        self.session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name
        meta_path = path.with_suffix(".json")
        meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
        self.mean = float(meta.get("mean", 0.5))
        self.std = float(meta.get("std", 0.25))
        self.name = meta.get("name", path.stem)

    def _run(self, x: np.ndarray) -> np.ndarray:
        out = self.session.run(None, {self.input_name: x[None, None].astype(np.float32)})[0][0]
        out = out - out.max(axis=0, keepdims=True)
        e = np.exp(out)
        return e / e.sum(axis=0, keepdims=True)

    def segment(self, gray: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        x = normalise_for_model(gray, self.mean, self.std)
        h, w = x.shape
        step = TILE - OVERLAP
        ph = max(TILE, int(np.ceil((h - OVERLAP) / step)) * step + OVERLAP)
        pw = max(TILE, int(np.ceil((w - OVERLAP) / step)) * step + OVERLAP)
        xp = np.pad(x, ((0, ph - h), (0, pw - w)), mode="reflect")
        acc = np.zeros((len(CLASSES), ph, pw), np.float32)
        cnt = np.zeros((ph, pw), np.float32)
        for y0 in range(0, ph - TILE + 1, step):
            for x0 in range(0, pw - TILE + 1, step):
                acc[:, y0 : y0 + TILE, x0 : x0 + TILE] += self._run(xp[y0 : y0 + TILE, x0 : x0 + TILE])
                cnt[y0 : y0 + TILE, x0 : x0 + TILE] += 1
        probs = (acc / cnt)[:, :h, :w]
        return probs.argmax(axis=0).astype(np.uint8), probs


class Detector:
    def __init__(self, weights_dir: Path = WEIGHTS_DIR):
        self.model: OnnxUNet | None = None
        candidates = sorted(weights_dir.glob("*.onnx")) if weights_dir.exists() else []
        if candidates:
            try:
                self.model = OnnxUNet(candidates[0])
                log.info("loaded ONNX model %s", candidates[0].name)
            except Exception as e:  # fall back rather than fail startup
                log.exception("could not load %s: %s", candidates[0], e)

    @property
    def engine(self) -> str:
        return "unet" if self.model else "heuristic"

    def detect(self, tile: Tile, bbox: BBox | None = None) -> DetectionResult:
        t0 = time.perf_counter()
        if self.model:
            class_map, probs = self.model.segment(tile.gray)
        else:
            class_map, probs = heuristic.segment(tile.gray)
        ms = int((time.perf_counter() - t0) * 1000)

        oil = (class_map == OIL).astype(np.uint8)
        n, labels, stats, _ = cv2.connectedComponentsWithStats(oil, connectivity=8)
        keep = np.zeros_like(oil)
        for i in range(1, n):
            if stats[i, cv2.CC_STAT_AREA] >= MIN_OIL_BLOB_PX:
                keep[labels == i] = 1
        keep = cv2.dilate(keep, np.ones((3, 3), np.uint8), iterations=1)
        class_map = class_map.copy()
        class_map[(class_map == OIL) & (keep == 0)] = 0

        counts = {name: int((class_map == i).sum()) for i, name in enumerate(CLASSES)}
        contours, _ = cv2.findContours(keep, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        polygon: list[LonLat] = []
        polygon_px: list[tuple[int, int]] = []
        centroid = None
        area = 0.0
        heading = 0.0
        elong = 1.0
        confidence = 0.0
        if contours:
            c = max(contours, key=cv2.contourArea)
            approx = cv2.approxPolyDP(c, 1.0, True).reshape(-1, 2)
            if len(approx) >= 3:
                ring_px = np.vstack([approx, approx[:1]])
                polygon_px = [(int(x), int(y)) for x, y in ring_px]
                heading = long_axis_bearing(approx)
                elong = elongation(approx)
                confidence = float(probs[OIL][keep == 1].mean()) if (keep == 1).any() else 0.0
                try:
                    polygon = pixel_to_lonlat(ring_px, tile.shape, bbox, tile.transform, tile.crs)
                    area = round(ring_area_km2(polygon), 3)
                    centroid = ring_centroid(polygon)
                except ValueError:
                    polygon, area, centroid = [], 0.0, None  # no georeference: pixel results only

        return DetectionResult(
            engine=self.engine,
            confidence=round(confidence, 3),
            area_km2=area,
            centroid=centroid,
            polygon=[(round(x, 6), round(y, 6)) for x, y in polygon],
            polygon_px=polygon_px,
            heading_deg=heading,
            elongation=elong,
            class_pixels=counts,
            inference_ms=ms,
            mask_png=class_map_png_base64(class_map),
            model_name=self.model.name if self.model else None,
        )


def load_metrics() -> list[dict[str, Any]]:
    p = WEIGHTS_DIR.parent / "metrics.json"
    if not p.exists():
        return []
    try:
        data = json.loads(p.read_text())
        return data if isinstance(data, list) else data.get("models", [])
    except json.JSONDecodeError:
        return []
