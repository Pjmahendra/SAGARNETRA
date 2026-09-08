"""SAR oil-spill dataset loader → 1-channel tiles + binary index masks (0 sea, 1 oil).

Targets the public Kaggle Sentinel-1 oil-spill sets (e.g. Deep-SAR SOS), whose masks are binary PNGs (0 background,
255 oil). Layout is auto-detected and may nest a source folder, e.g. `<root>/<split>/sentinel/{image,label}`; the
`sentinel` source is preferred over `palsar` when both are present, matching SAGARNETRA's Sentinel-1 focus.

Preprocessing matches serving (ml/preprocess.normalise_for_model): grayscale, /255, then (x-mean)/std with the same
mean/std written into the ONNX sidecar. Widening to the 5-class Krestenitis scheme later needs only CLASSES + this
mask decode to change.
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torch.utils.data import Dataset

from . import CLASSES, OIL, SEA

log = logging.getLogger("sagarnetra.ml.dataset")

IMG_EXTS = (".jpg", ".jpeg", ".png", ".tif", ".tiff")
IMAGE_DIR_NAMES = ("images", "image", "img", "sar")
MASK_DIR_NAMES = ("labels_1D", "labels_1d", "labels", "label", "masks", "mask", "gt", "annotations")


def _find_dir(root: Path, names: tuple[str, ...]) -> Path | None:
    for n in names:
        p = root / n
        if p.is_dir():
            return p
    return None


def _resolve_split(root: Path, split: str) -> tuple[Path, Path]:
    """(image_dir, mask_dir) for a split, tolerating a source subfolder (sentinel/palsar). Prefers sentinel."""
    base = root / split if (root / split).is_dir() else root
    img, msk = _find_dir(base, IMAGE_DIR_NAMES), _find_dir(base, MASK_DIR_NAMES)
    if img and msk:
        return img, msk
    subs = sorted((d for d in base.iterdir() if d.is_dir()), key=lambda d: 0 if "sentinel" in d.name.lower() else 1)
    for sub in subs:
        img, msk = _find_dir(sub, IMAGE_DIR_NAMES), _find_dir(sub, MASK_DIR_NAMES)
        if img and msk:
            return img, msk
    raise FileNotFoundError(
        f"could not locate image/mask dirs for split '{split}' under {root} "
        f"(looked directly and one level down into source subfolders)."
    )


def _mask_to_index(mask_img: Image.Image) -> np.ndarray:
    """Binary decode: bright (oil, ~255) -> OIL, everything else -> SEA. Works for single-channel or RGB masks."""
    a = np.array(mask_img)
    if a.ndim == 3:
        a = a[..., 0]
    return np.where(a > 127, OIL, SEA).astype(np.int64)


class KrestenitisDataset(Dataset):
    def __init__(
        self,
        root: str | Path,
        split: str = "train",
        img_size: int = 256,
        mean: float = 0.5,
        std: float = 0.25,
        augment: bool = False,
    ) -> None:
        self.img_dir, self.mask_dir = _resolve_split(Path(root), split)
        self.img_size = img_size
        self.mean, self.std = mean, std
        self.augment = augment
        masks = {p.stem: p for p in self.mask_dir.iterdir() if p.suffix.lower() in IMG_EXTS}
        self.items: list[tuple[Path, Path]] = []
        for img in sorted(self.img_dir.iterdir()):
            if img.suffix.lower() in IMG_EXTS and img.stem in masks:
                self.items.append((img, masks[img.stem]))
        if not self.items:
            raise FileNotFoundError(f"no image/mask pairs matched in {self.img_dir} vs {self.mask_dir}")
        log.info("%s split: %d image/mask pairs from %s", split, len(self.items), root)

    def __len__(self) -> int:
        return len(self.items)

    def _resize(self, gray: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        s = self.img_size
        g = np.array(Image.fromarray(gray).resize((s, s), Image.BILINEAR))
        m = np.array(Image.fromarray(mask.astype(np.uint8)).resize((s, s), Image.NEAREST)).astype(np.int64)
        return g, m

    def __getitem__(self, i: int) -> tuple[torch.Tensor, torch.Tensor]:
        img_p, mask_p = self.items[i]
        gray = np.array(Image.open(img_p).convert("L"))
        mask = _mask_to_index(Image.open(mask_p))
        gray, mask = self._resize(gray, mask)

        if self.augment:
            if np.random.rand() < 0.5:
                gray, mask = gray[:, ::-1].copy(), mask[:, ::-1].copy()
            if np.random.rand() < 0.5:
                gray, mask = gray[::-1].copy(), mask[::-1].copy()
            k = int(np.random.randint(0, 4))
            if k:
                gray, mask = np.rot90(gray, k).copy(), np.rot90(mask, k).copy()

        x = (gray.astype(np.float32) / 255.0 - self.mean) / self.std
        return torch.from_numpy(x)[None], torch.from_numpy(mask)


def class_weights(ds: KrestenitisDataset, n_classes: int = len(CLASSES)) -> torch.Tensor:
    """Median-frequency balancing: weight_c = median(freq) / freq_c. Damps the dominant sea class."""
    counts = np.zeros(n_classes, np.float64)
    for _, mask in ((ds[i]) for i in range(len(ds))):
        binc = np.bincount(mask.numpy().ravel(), minlength=n_classes)
        counts += binc[:n_classes]
    freq = counts / counts.sum()
    freq[freq == 0] = np.nan
    w = np.nan_to_num(np.nanmedian(freq) / freq, nan=0.0)
    return torch.tensor(w, dtype=torch.float32)
