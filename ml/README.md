# ml/

| File | Purpose |
|---|---|
| `preprocess.py` | PNG/JPEG/GeoTIFF → 8-bit grayscale with a fixed dB stretch; keeps the GeoTIFF affine + CRS |
| `heuristic.py` | Classic dark-spot fallback. Always labelled `engine="heuristic"` |
| `infer.py` | `Detector`: ONNX U-Net if `weights/*.onnx` exists, else heuristic. Tiled 256 px inference with 32 px overlap. Oil mask → polygon, area km², centroid, heading, confidence, overlay PNG |
| `geo.py` | pixel → lon/lat (affine or bbox), UTM area, long-axis bearing, elongation |
| `overlay.py` | class map → transparent RGBA PNG (base64) |
| `unet.py` | Custom U-Net definition (the from-scratch candidate; training only) |
| `models.py` | Registry of the five candidates behind one `build(name)` |
| `dataset.py` | Krestenitis loader → 1-ch tiles + 5-class index masks (train/serve preprocessing parity) |
| `train.py` | Shared harness: trains + scores every candidate, writes `metrics.json` |
| `export.py` | Winning checkpoint → `weights/<name>.onnx` + sidecar, with an onnxruntime self-check |
| `requirements-train.txt` | Training-only deps (torch/smp/timm) — kept out of the backend image |
| `weights/` | `*.onnx` + sidecar `*.json` (`mean`, `std`, `name`). Git-ignored except `.gitkeep` |
| `samples/` | demo tiles + `bboxes.json` |
| `metrics.json` | comparison table written by `train.py`, shown on the console + report |

## Training — five-model bake-off (Colab T4)

Five candidates, all pre-existing/ImageNet-pretrained except the scratch baseline, trained under one identical harness
(same loader, class-weighted CE + Dice, 256 px tiles, 40 epochs) and scored on the Krestenitis 110-image test split
(per-class IoU, mIoU, params, CPU ms). See `docs/DECISIONS.md` (2026-09-08) for the rationale per model.

| id | model | why |
|---|---|---|
| `unet_scratch` | Custom U-Net | no-transfer baseline |
| `unet_resnet34` | U-Net + ResNet-34 | Cerulean production parity |
| `unetpp_resnet34` | U-Net++ + ResNet-34 | dense skips, thin-slick boundaries |
| `deeplabv3p_resnet50` | DeepLabV3+ + ResNet-50 | Krestenitis/Zhang family, ASPP |
| `fpn_effb3` | FPN + EfficientNet-B3 | best accuracy-per-MB for CPU serving |

```bash
pip install -r ml/requirements-train.txt
python -m ml.train  --data-root /path/to/krestenitis --epochs 40      # all five (or --models a b for a subset)
python -m ml.export --model-name <winner> --weights ml/weights/<winner>.pt
```

Only the winner (best mIoU within the CPU-latency budget) is exported and served; the other four remain rows in
`metrics.json` and appear in the Detection Console comparison table. `notebooks/train_colab.ipynb` drives all of this.

### Getting the Krestenitis dataset (the training blocker)

The console shows `HEURISTIC` / "pending training" until real weights exist. To train for real:

1. **Request the dataset** — Krestenitis et al. 2019 "Oil Spill Detection Dataset" from MKLab (CERTH-ITI):
   https://m4d.iti.gr/oil-spill-detection-dataset/ (fill the form; they email a download link). 1002 train + 110 test SAR patches, 5 classes (sea, oil, look-alike, ship, land).
2. **Unzip** to a folder with this layout (our loader auto-detects it; `labels_1D` index masks preferred):
   ```
   krestenitis/
     train/{images, labels_1D}
     test/{images,  labels_1D}
   ```
3. **Train + export** (Colab T4 recommended — open `notebooks/train_colab.ipynb`, or locally):
   ```bash
   pip install -r ml/requirements-train.txt
   python -m ml.train  --data-root /path/to/krestenitis --epochs 40
   python -m ml.export --model-name <winner> --weights ml/weights/<winner>.pt
   ```
4. **Drop `ml/weights/<winner>.onnx` + `.json` on the API server and commit `ml/metrics.json`.** Restart the API →
   `/api/health` flips `model: heuristic → unet`, and the Detection Console shows the real 5-model comparison. No app
   code changes needed.
