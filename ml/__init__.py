"""SAGARNETRA ML package: SAR oil-spill segmentation, post-processing and georeferencing.

Binary scheme (trained on the public Kaggle Sentinel-1 oil-spill masks, which are oil vs background):
0 sea (background), 1 oil spill. The 5-class Krestenitis scheme (sea/oil/look-alike/ship/land) is the upgrade
path once that gated dataset is obtained — the same pipeline retrains simply by widening CLASSES.
"""

from pathlib import Path

ML_ROOT = Path(__file__).resolve().parent
WEIGHTS_DIR = ML_ROOT / "weights"
SAMPLES_DIR = ML_ROOT / "samples"

CLASSES = ("sea", "oil")
SEA, OIL = range(2)
