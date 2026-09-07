"""Load a SAR tile from PNG/JPEG/GeoTIFF into an 8-bit grayscale array plus any georeference it carries."""

from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Any

import numpy as np
from PIL import Image


@dataclass
class Tile:
    gray: np.ndarray  # uint8, HxW
    transform: Any | None = None  # rasterio Affine when the source was a GeoTIFF
    crs: Any | None = None  # rasterio CRS

    @property
    def shape(self) -> tuple[int, int]:
        return self.gray.shape[0], self.gray.shape[1]


def _to_uint8(arr: np.ndarray) -> np.ndarray:
    """Scale float/16-bit SAR amplitude to 8-bit using a fixed dB stretch so training and serving agree."""
    a = arr.astype(np.float32)
    if a.dtype != np.uint8 and (a.max() > 255 or a.min() < 0 or np.issubdtype(arr.dtype, np.floating)):
        a = np.where(a > 0, a, np.nan)
        db = 10.0 * np.log10(a)
        lo, hi = -25.0, 5.0  # typical Sentinel-1 GRD VV sea range
        a = np.clip((db - lo) / (hi - lo), 0, 1) * 255.0
        a = np.nan_to_num(a, nan=0.0)
    return np.clip(a, 0, 255).astype(np.uint8)


def load_tile(data: bytes, filename: str = "") -> Tile:
    name = filename.lower()
    if name.endswith((".tif", ".tiff")) or data[:4] in (b"II*\x00", b"MM\x00*"):
        import rasterio
        from rasterio.io import MemoryFile

        with MemoryFile(data) as mem, mem.open() as ds:
            band = ds.read(1)
            transform = ds.transform if ds.transform and not ds.transform.is_identity else None
            crs = ds.crs if ds.crs else None
        return Tile(_to_uint8(band), transform, crs)

    img = Image.open(io.BytesIO(data))
    if img.mode not in ("L", "I;16", "I", "F"):
        img = img.convert("L")
    arr = np.array(img)
    return Tile(_to_uint8(arr))


def normalise_for_model(gray: np.ndarray, mean: float, std: float) -> np.ndarray:
    return ((gray.astype(np.float32) / 255.0) - mean) / std
