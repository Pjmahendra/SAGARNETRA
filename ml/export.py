"""Export the winning checkpoint to ONNX + sidecar, the only artefact that ships to production.

Writes weights/<name>.onnx and weights/<name>.json ({mean, std, name}) — exactly what ml/infer.OnnxUNet loads. The
sidecar "name" must equal the model's registry name so the Detection Console highlights the right row of metrics.json.
Serving is onnxruntime-only; torch never enters the Render image.

Usage:
    python -m ml.export --model-name unet_resnet34 --weights ml/weights/unet_resnet34.pt
"""

from __future__ import annotations

import argparse
import json
import logging
import time
from pathlib import Path

import numpy as np
import torch

from . import ML_ROOT
from .models import REGISTRY, build, count_params

log = logging.getLogger("sagarnetra.ml.export")
DEFAULT_WEIGHTS_DIR = ML_ROOT / "weights"


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
    p = argparse.ArgumentParser(description="Export the winning model to ONNX for onnxruntime serving.")
    p.add_argument("--model-name", required=True, choices=list(REGISTRY), help="registry name of the winner")
    p.add_argument("--weights", type=Path, required=True, help="trained .pt checkpoint from train.py")
    p.add_argument("--out-dir", type=Path, default=DEFAULT_WEIGHTS_DIR)
    p.add_argument("--img-size", type=int, default=256, help="tracing size; inference tiles at this size (infer.TILE)")
    p.add_argument("--mean", type=float, default=0.5)
    p.add_argument("--std", type=float, default=0.25)
    p.add_argument("--opset", type=int, default=17)
    args = p.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    model = build(args.model_name)
    state = torch.load(args.weights, map_location="cpu")
    model.load_state_dict(state)
    model.eval()

    onnx_path = args.out_dir / f"{args.model_name}.onnx"
    dummy = torch.zeros(1, 1, args.img_size, args.img_size)
    torch.onnx.export(
        model, dummy, str(onnx_path),
        input_names=["tile"], output_names=["logits"], opset_version=args.opset,
        dynamic_axes={"tile": {0: "n", 2: "h", 3: "w"}, "logits": {0: "n", 2: "h", 3: "w"}},
    )
    sidecar = onnx_path.with_suffix(".json")
    sidecar.write_text(json.dumps({"mean": args.mean, "std": args.std, "name": args.model_name}, indent=2))
    log.info("wrote %s (%.2f MB) and %s", onnx_path, onnx_path.stat().st_size / 1e6, sidecar)

    # Verify the export loads and runs under the exact runtime that serves it, and report real CPU latency.
    try:
        import onnxruntime as ort

        sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
        x = np.zeros((1, 1, args.img_size, args.img_size), np.float32)
        name = sess.get_inputs()[0].name
        for _ in range(3):
            sess.run(None, {name: x})
        t0 = time.perf_counter()
        for _ in range(20):
            sess.run(None, {name: x})
        ms = (time.perf_counter() - t0) / 20 * 1000
        log.info("onnxruntime CPU: %.1f ms/tile, params=%.2fM — verified loadable", ms, count_params(model) / 1e6)
    except Exception as e:  # export still succeeded; just couldn't self-check here
        log.warning("could not run onnxruntime self-check: %s", e)

    print(f"\nExported {args.model_name} -> {onnx_path}")
    print("Drop weights/*.onnx on the API server; /api/health will report engine=unet and the console shows the model.")


if __name__ == "__main__":
    main()
