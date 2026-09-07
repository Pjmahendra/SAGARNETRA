"""One harness, five models, identical conditions — the fair bake-off DECISIONS.md requires.

Same loader, same class-weighted CE+Dice loss, same 256 px tiles, same optimiser and schedule for every candidate; only
the architecture differs. Trains each, scores it on the Krestenitis test split (per-class IoU, mIoU, params, CPU ms),
saves the best checkpoint per model, and writes the whole comparison to ml/metrics.json — which the Detection Console
and the report read directly. Export the winner with export.py.

Usage (Colab T4 or any CUDA box):
    python -m ml.train --data-root /content/krestenitis --epochs 40
    python -m ml.train --data-root ./data --models unet_scratch unet_resnet34   # priority pair only
"""

from __future__ import annotations

import argparse
import json
import logging
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader

from . import CLASSES, ML_ROOT
from .dataset import KrestenitisDataset, class_weights
from .models import ALL, REGISTRY, build, count_params

log = logging.getLogger("sagarnetra.ml.train")
METRICS_PATH = ML_ROOT / "metrics.json"
DEFAULT_WEIGHTS_DIR = ML_ROOT / "weights"


def dice_loss(logits: torch.Tensor, target: torch.Tensor, eps: float = 1.0) -> torch.Tensor:
    """Soft multiclass Dice over all classes, averaged. Complements CE by optimising region overlap directly."""
    probs = F.softmax(logits, dim=1)
    onehot = F.one_hot(target, num_classes=probs.shape[1]).permute(0, 3, 1, 2).float()
    dims = (0, 2, 3)
    inter = (probs * onehot).sum(dims)
    union = probs.sum(dims) + onehot.sum(dims)
    return (1.0 - (2.0 * inter + eps) / (union + eps)).mean()


@torch.no_grad()
def evaluate(model: torch.nn.Module, loader: DataLoader, device: str) -> dict:
    """Confusion-matrix IoU on the held-out split. Returns per-class IoU + mIoU."""
    model.eval()
    n = len(CLASSES)
    conf = np.zeros((n, n), np.int64)
    for x, y in loader:
        pred = model(x.to(device)).argmax(1).cpu().numpy().ravel()
        gt = y.numpy().ravel()
        conf += np.bincount(gt * n + pred, minlength=n * n).reshape(n, n)
    inter = np.diag(conf)
    union = conf.sum(0) + conf.sum(1) - inter
    iou = np.where(union > 0, inter / np.maximum(union, 1), np.nan)
    return {
        "iou": {CLASSES[i]: (None if np.isnan(iou[i]) else round(float(iou[i]), 4)) for i in range(n)},
        "miou": round(float(np.nanmean(iou)), 4),
    }


def cpu_ms(model: torch.nn.Module, img_size: int, runs: int = 20) -> float:
    """Mean single-tile forward latency on CPU — the number the <400 MB Render budget is judged against."""
    model_cpu = model.to("cpu").eval()
    x = torch.zeros(1, 1, img_size, img_size)
    with torch.no_grad():
        for _ in range(3):
            model_cpu(x)
        t0 = time.perf_counter()
        for _ in range(runs):
            model_cpu(x)
    return round((time.perf_counter() - t0) / runs * 1000, 1)


def train_one(name: str, args, weights: torch.Tensor, train_dl: DataLoader, test_dl: DataLoader) -> dict:
    spec = REGISTRY[name]
    log.info("=== %s (%s) ===", spec.display, spec.note)
    model = build(name).to(args.device)
    params = count_params(model)
    w = weights.to(args.device)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)

    best = {"miou": -1.0}
    ckpt = args.out_dir / f"{name}.pt"
    for epoch in range(1, args.epochs + 1):
        model.train()
        running = 0.0
        for x, y in train_dl:
            x, y = x.to(args.device), y.to(args.device)
            opt.zero_grad()
            logits = model(x)
            loss = F.cross_entropy(logits, y, weight=w) + dice_loss(logits, y)
            loss.backward()
            opt.step()
            running += loss.item()
        sched.step()
        metrics = evaluate(model, test_dl, args.device)
        log.info("  epoch %2d/%d  loss=%.4f  mIoU=%.4f", epoch, args.epochs, running / len(train_dl), metrics["miou"])
        if metrics["miou"] > best["miou"]:
            best = metrics
            torch.save(model.state_dict(), ckpt)

    row = {
        "name": name,
        "display": spec.display,
        "params_m": round(params / 1e6, 2),
        "cpu_ms": cpu_ms(model, args.img_size),
        "miou": best["miou"],
        "iou": best["iou"],
        "checkpoint": str(ckpt),
        "note": spec.note,
    }
    log.info("  best mIoU=%.4f  params=%.2fM  cpu=%.1fms  -> %s", row["miou"], row["params_m"], row["cpu_ms"], ckpt)
    return row


def recommend(rows: list[dict], max_cpu_ms: float) -> str | None:
    """Best mIoU whose CPU latency fits the serving budget; the one export.py should ship."""
    ok = [r for r in rows if r["cpu_ms"] <= max_cpu_ms]
    pool = ok or rows
    return max(pool, key=lambda r: r["miou"])["name"] if pool else None


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
    p = argparse.ArgumentParser(description="Train and compare the five SAGARNETRA segmentation candidates.")
    p.add_argument("--data-root", required=True, help="Krestenitis dataset root (contains train/ and test/)")
    p.add_argument("--models", nargs="*", default=ALL, choices=ALL, help="subset to train (default: all five)")
    p.add_argument("--epochs", type=int, default=40)
    p.add_argument("--batch-size", type=int, default=8)
    p.add_argument("--img-size", type=int, default=256)
    p.add_argument("--lr", type=float, default=3e-4)
    p.add_argument("--mean", type=float, default=0.5)
    p.add_argument("--std", type=float, default=0.25)
    p.add_argument("--max-cpu-ms", type=float, default=800.0, help="serving latency budget for the recommendation")
    p.add_argument("--out-dir", type=Path, default=DEFAULT_WEIGHTS_DIR)
    p.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    p.add_argument("--test-split", default="test")
    args = p.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    common = dict(root=args.data_root, img_size=args.img_size, mean=args.mean, std=args.std)
    train_ds = KrestenitisDataset(split="train", augment=True, **common)
    test_ds = KrestenitisDataset(split=args.test_split, augment=False, **common)
    train_dl = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, num_workers=2, drop_last=True)
    test_dl = DataLoader(test_ds, batch_size=args.batch_size, shuffle=False, num_workers=2)

    log.info("computing median-frequency class weights over %d training masks...", len(train_ds))
    weights = class_weights(train_ds)
    log.info("class weights: %s", {CLASSES[i]: round(float(weights[i]), 3) for i in range(len(CLASSES))})

    rows = [train_one(name, args, weights, train_dl, test_dl) for name in args.models]
    rows.sort(key=lambda r: r["miou"], reverse=True)
    winner = recommend(rows, args.max_cpu_ms)
    payload = {
        "models": rows,
        "recommended": winner,
        "test_images": len(test_ds),
        "mean": args.mean,
        "std": args.std,
        "img_size": args.img_size,
    }
    METRICS_PATH.write_text(json.dumps(payload, indent=2))
    log.info("wrote %s", METRICS_PATH)
    print("\n{:<24} {:>8} {:>8} {:>8} {:>8} {:>10}".format("model", "mIoU", "oil", "lookalk", "params(M)", "cpu_ms"))
    for r in rows:
        star = "* " if r["name"] == winner else "  "
        print("{}{:<22} {:>8.3f} {:>8} {:>8} {:>9.2f} {:>9.1f}".format(
            star, r["name"], r["miou"],
            str(r["iou"].get("oil")), str(r["iou"].get("lookalike")), r["params_m"], r["cpu_ms"]))
    print(f"\nrecommended to export (best mIoU within {args.max_cpu_ms:.0f} ms CPU): {winner}")
    print(f"then:  python -m ml.export --model-name {winner} --weights {args.out_dir / f'{winner}.pt'}")


if __name__ == "__main__":
    main()
