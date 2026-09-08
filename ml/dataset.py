"""Krestenitis et al. 2019 oil-spill dataset → 1-channel SAR tiles + 5-class index masks.

The public dataset (MKLab, requested manually — the human blocker) ships as train/ and test/ folders, each with an
image dir and a mask dir. Masks are usually single-channel index PNGs (labels_1D) or palettised 'P' PNGs whose pixel
values ARE the class indices; both read straight to 0..4. RGB masks fall back to a palette map. Layout is auto-detected
so the same loader works across the few distributions that float around.

Preprocessing matches serving exactly (ml/preprocess.normalise_for_model): grayscale, /255, then (x-mean)/std with the
same mean/std that get written into the ONNX sidecar. Keep them identical or the served model sees a different
distribution than it trained on.
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torch.utils.data import Dataset

from . import CLASSES, LAND, LOOKALIKE, OIL, SEA, SHIP

log = logging.getLogger("sagarnetra.ml.dataset")

IMG_EXTS = (".jpg", ".jpeg", ".png", ".tif", ".tiff")
IMAGE_DIR_NAMES = ("images", "image", "img", "sar")
MASK_DIR_NAMES = ("labels_1D", "labels_1d", "labels", "label", "masks", "mask", "gt", "annotations")

# Krestenitis RGB palette → class index, used ONLY when masks are stored as RGB. Verify against your copy's README;
# labels_1D / palettised PNGs are preferred and bypass this entirely.
RGB_TO_IDX: dict[tuple[int, int, int], int] = {
    (0, 0, 0): SEA,
    (0, 255, 255): OIL,
    (255, 0, 0): LOOKALIKE,
    (153, 76, 0): SHIP,
    (0, 153, 0): LAND,
}


def _find_dir(root: Path, names: tuple[str, ...]) -> Path | None:
    for n in names:
        p = root / n
        if p.is_dir():
            return p
    return None


def _resolve_split(root: Path, split: str) -> tuple[Path, Path]:
    """Return (image_dir, mask_dir) for a split, tolerating a few common folder layouts."""
    base = root / split
    if not base.is_dir():
        # some copies use train/val instead of train/test, or lay images/masks at the root
        base = root if _find_dir(root, IMAGE_DIR_NAMES) else base
    img = _find_dir(base, IMAGE_DIR_NAMES)
    msk = _find_dir(base, MASK_DIR_NAMES)
    if img is None or msk is None:
        raise FileNotFoundError(
            f"could not locate image/mask dirs for split '{split}' under {root}. "
            f"Expected e.g. {split}/images and {split}/labels_1D."
        )
    return img, msk


def _mask_to_index(mask_img: Image.Image) -> np.ndarray:
    """Palettised/single-channel masks are already indices; RGB masks are mapped via the palette."""
    if mask_img.mode in ("P", "L", "I", "I;16"):
        return np.array(mask_img).astype(np.int64)
    rgb = np.array(mask_img.convert("RGB"))
    out = np.zeros(rgb.shape[:2], np.int64)
    for (r, g, b), idx in RGB_TO_IDX.items():
        out[(rgb[..., 0] == r) & (rgb[..., 1] == g) & (rgb[..., 2] == b)] = idx
    return out


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
            if np.random.rand() < 0.5:  # horizontal flip
                gray, mask = gray[:, ::-1].copy(), mask[:, ::-1].copy()
            if np.random.rand() < 0.5:  # vertical flip
                gray, mask = gray[::-1].copy(), mask[::-1].copy()
            k = int(np.random.randint(0, 4))  # 90-degree rotations
            if k:
                gray, mask = np.rot90(gray, k).copy(), np.rot90(mask, k).copy()

        x = (gray.astype(np.float32) / 255.0 - self.mean) / self.std
        return torch.from_numpy(x)[None], torch.from_numpy(mask)


def class_weights(ds: KrestenitisDataset, n_classes: int = len(CLASSES)) -> torch.Tensor:
    """Median-frequency balancing (Eigen & Fergus): weight_c = median(freq) / freq_c. Damps the huge sea-class prior."""
    counts = np.zeros(n_classes, np.float64)
    for _, mask in ((ds[i]) for i in range(len(ds))):
        binc = np.bincount(mask.numpy().ravel(), minlength=n_classes)
        counts += binc[:n_classes]
    freq = counts / counts.sum()
    freq[freq == 0] = np.nan
    w = np.nan_to_num(np.nanmedian(freq) / freq, nan=0.0)
    return torch.tensor(w, dtype=torch.float32)
