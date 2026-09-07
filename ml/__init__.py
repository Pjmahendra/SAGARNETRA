"""SAGARNETRA ML package: SAR oil-spill segmentation, post-processing and georeferencing.

Class codes follow the Krestenitis et al. 2019 benchmark:
0 sea, 1 oil spill, 2 look-alike, 3 ship, 4 land.
"""

from pathlib import Path

ML_ROOT = Path(__file__).resolve().parent
WEIGHTS_DIR = ML_ROOT / "weights"
SAMPLES_DIR = ML_ROOT / "samples"

CLASSES = ("sea", "oil", "lookalike", "ship", "land")
SEA, OIL, LOOKALIKE, SHIP, LAND = range(5)
