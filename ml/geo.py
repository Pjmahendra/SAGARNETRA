"""Pixel geometry to geography: rings, area in km², centroid and long-axis bearing."""

from __future__ import annotations

import math
from typing import Any

import cv2
import numpy as np
from pyproj import CRS, Transformer
from shapely.geometry import Polygon

LonLat = tuple[float, float]
BBox = tuple[float, float, float, float]  # west, south, east, north


def pixel_to_lonlat(points_px: np.ndarray, shape: tuple[int, int], bbox: BBox | None, transform: Any | None, crs: Any | None) -> list[LonLat]:
    """points_px: Nx2 array of (x, y) pixel coordinates."""
    h, w = shape
    if transform is not None:
        xs, ys = transform * (points_px[:, 0] + 0.5, points_px[:, 1] + 0.5)  # pixel centres
        xs, ys = np.asarray(xs), np.asarray(ys)
        if crs is not None and CRS.from_user_input(crs).to_epsg() != 4326:
            t = Transformer.from_crs(CRS.from_user_input(crs), CRS.from_epsg(4326), always_xy=True)
            xs, ys = t.transform(xs, ys)
        return [(float(x), float(y)) for x, y in zip(xs, ys, strict=True)]
    if bbox is None:
        raise ValueError("Tile has no georeference: supply a bbox [west, south, east, north]")
    west, south, east, north = bbox
    lon = west + (points_px[:, 0] + 0.5) / w * (east - west)
    lat = north - (points_px[:, 1] + 0.5) / h * (north - south)
    return [(float(x), float(y)) for x, y in zip(lon, lat, strict=True)]


def utm_crs_for(lon: float, lat: float) -> CRS:
    zone = int(math.floor((lon + 180) / 6) + 1)
    return CRS.from_epsg((32600 if lat >= 0 else 32700) + zone)


def ring_area_km2(ring: list[LonLat]) -> float:
    if len(ring) < 4:
        return 0.0
    poly = Polygon(ring)
    if poly.is_empty:
        return 0.0
    c = poly.centroid
    t = Transformer.from_crs(CRS.from_epsg(4326), utm_crs_for(c.x, c.y), always_xy=True)
    xs, ys = t.transform([p[0] for p in ring], [p[1] for p in ring])
    return float(Polygon(zip(xs, ys, strict=True)).area / 1e6)


def ring_centroid(ring: list[LonLat]) -> LonLat:
    c = Polygon(ring).centroid
    return (float(c.x), float(c.y))


def long_axis_bearing(contour_px: np.ndarray) -> float:
    """Compass bearing (0..180, north-up image) of the minimum-area rectangle's long side."""
    if len(contour_px) < 3:
        return 0.0
    (_, _), (rw, rh), angle = cv2.minAreaRect(contour_px.astype(np.float32))
    # OpenCV angle is the rotation of the 'width' side from the x axis, clockwise on screen.
    theta = angle if rw >= rh else angle + 90.0
    bearing = (90.0 - theta) % 180.0  # x-axis (east) is bearing 90; screen y is down
    return float(round(bearing, 1))


def elongation(contour_px: np.ndarray) -> float:
    if len(contour_px) < 3:
        return 1.0
    (_, _), (rw, rh), _ = cv2.minAreaRect(contour_px.astype(np.float32))
    a, b = max(rw, rh), max(min(rw, rh), 1e-6)
    return float(round(a / b, 2))
