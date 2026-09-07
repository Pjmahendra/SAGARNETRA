# ml/

| File | Purpose |
|---|---|
| `preprocess.py` | PNG/JPEG/GeoTIFF → 8-bit grayscale with a fixed dB stretch; keeps the GeoTIFF affine + CRS |
| `heuristic.py` | Classic dark-spot fallback. Always labelled `engine="heuristic"` |
| `infer.py` | `Detector`: ONNX U-Net if `weights/*.onnx` exists, else heuristic. Tiled 256 px inference with 32 px overlap. Oil mask → polygon, area km², centroid, heading, confidence, overlay PNG |
| `geo.py` | pixel → lon/lat (affine or bbox), UTM area, long-axis bearing, elongation |
| `overlay.py` | class map → transparent RGBA PNG (base64) |
| `unet.py` | PyTorch model definition (training only) |
| `weights/` | `*.onnx` + sidecar `*.json` (`mean`, `std`, `name`). Git-ignored except `.gitkeep` |
| `samples/` | demo tiles + `bboxes.json` |
| `metrics.json` | comparison table written by the training notebook, shown on the console |

Training (Colab): three candidates (custom U-Net, U-Net + ResNet-34, DeepLabV3+ ResNet-50) on Krestenitis et al. 2019,
class-weighted CE + Dice, 40 epochs, per-class IoU on the 110-image test split. Export the winner to `weights/unet_sar.onnx`.
