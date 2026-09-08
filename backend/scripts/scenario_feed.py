"""Scenario feed — the "in-between" spill generator (stand-in for the live CDSE collector).

Between real Sentinel-1 passes there's nothing new, so the officer's queue would sit idle. This picks a bundled REAL
Sentinel-1 tile, runs the trained model, and writes an UNVERIFIED detection dated now into a watch zone — a fresh spill
to review, any time. Everything is real (imagery + model output); only the trigger and the map placement are scenario,
so each detection is tagged feed="scenario" and shown apart from feed="live" (real CDSE) in the UI.

Usage:
    python -m scripts.scenario_feed            # inject one now
    python -m scripts.scenario_feed --loop 900 # one every 15 min
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import random
import sys
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ml import SAMPLES_DIR  # noqa: E402
from ml.infer import Detector  # noqa: E402
from ml.preprocess import load_tile  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.db import connect, new_id  # noqa: E402


def _bbox_in_zone(geometry: dict) -> tuple[float, float, float, float]:
    ring = geometry["coordinates"][0]
    lons = [c[0] for c in ring]
    lats = [c[1] for c in ring]
    w, s, e, n = min(lons), min(lats), max(lons), max(lats)
    cx = random.uniform(w + 0.15, e - 0.15) if e - w > 0.4 else (w + e) / 2
    cy = random.uniform(s + 0.12, n - 0.12) if n - s > 0.4 else (s + n) / 2
    return (cx - 0.12, cy - 0.10, cx + 0.12, cy + 0.10)


async def inject_one(db, det: Detector) -> tuple[str, float, bool] | None:
    zones = await db.watch_zones.find({}, {"geometry": 1, "name": 1}).to_list(50)
    tiles = [p for p in SAMPLES_DIR.glob("*.png")]
    if not zones or not tiles:
        return None
    z = random.choice(zones)
    tile_path = random.choice(tiles)
    bbox = _bbox_in_zone(z["geometry"])
    data = tile_path.read_bytes()
    tile = load_tile(data, tile_path.name)
    r = det.detect(tile, bbox)
    now = datetime.now(UTC)
    doc = {
        "_id": new_id("det"),
        "created_at": now,
        "created_by": None,
        "zone_id": z["_id"],
        "feed": "scenario",  # vs "live" (real CDSE); distinguished in the UI
        "source": {"kind": "scenario", "tile": tile_path.stem, "scene": f"S1 scenario · {tile_path.stem}", "acquired_at": now},
        "engine": r.engine,
        "model_name": r.model_name,
        "confidence": r.confidence,
        "area_km2": r.area_km2,
        "centroid": list(r.centroid) if r.centroid else None,
        "geometry": {"type": "Polygon", "coordinates": [[list(p) for p in r.polygon]]} if len(r.polygon) >= 4 else None,
        "heading_deg": r.heading_deg,
        "elongation": r.elongation,
        "class_pixels": r.class_pixels,
        "inference_ms": r.inference_ms,
        "tile_shape": list(tile.shape),
        "bbox": list(bbox),
        "tile_sha256": hashlib.sha256(data).hexdigest(),
        "mask_sha256": hashlib.sha256(r.mask_png.encode()).hexdigest(),
        "verification": None,
    }
    await db.detections.insert_one(doc)
    return z["name"], r.confidence, len(r.polygon) >= 4


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--loop", type=int, default=0, help="seconds between injections (0 = inject one and exit)")
    args = ap.parse_args()
    settings = get_settings()
    client, db = await connect(settings)
    det = Detector()
    try:
        while True:
            res = await inject_one(db, det)
            if res:
                print(f"scenario detection in {res[0]}: engine={det.engine} conf={res[1]:.2f} spill={res[2]} @ {datetime.now(UTC):%H:%M:%SZ}")
            if not args.loop:
                break
            await asyncio.sleep(args.loop)
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())
