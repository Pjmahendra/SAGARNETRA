"""Seed a database with the admin + officer accounts, watch zones, historical incidents and the demo scenario.

The demo incident is NOT inserted by hand: the seed runs the real pipeline. It segments the bundled Gujarat tile, fetches
the real weather for the acquisition time, backtracks the origin zones, lays the scenario ship tracks around those zones,
then creates the incident exactly as an officer clicking "Create incident" would. Whatever the weather did that night,
the guilty tanker's track crosses the computed t-12h zone.

Usage:  python -m scripts.seed_db [--reset]
Reads MONGODB_URI / MONGODB_DB / JWT_SECRET from the environment or backend/.env.
Passwords default to Admin@123 / Officer@123; override with SEED_ADMIN_PASSWORD / SEED_OFFICER_PASSWORD.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import hashlib  # noqa: E402
from datetime import timedelta  # noqa: E402

from ml import SAMPLES_DIR  # noqa: E402
from ml.infer import Detector  # noqa: E402
from ml.preprocess import load_tile  # noqa: E402
from pymongo import ReplaceOne  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.db import connect, ensure_indexes  # noqa: E402
from app.services import drift, incidents, weather  # noqa: E402
from app.services.ranking import LOOKBACK_H  # noqa: E402
from app.services.users import create_user, find_by_email  # noqa: E402
from scripts.demo_scenario import INCIDENTS, REPORTS, SAMPLES, ZONES, build_positions, vessel_docs  # noqa: E402

STATIC_COLLECTIONS = {"watch_zones": ZONES, "incidents": INCIDENTS, "samples": SAMPLES, "reports": REPORTS}
DEMO_SAMPLE = "guj-01"


async def upsert(db, name: str, docs: list[dict]) -> None:
    if docs:
        await db[name].bulk_write([ReplaceOne({"_id": d["_id"]}, d, upsert=True) for d in docs])
    print(f"{name}: {len(docs)} documents")


async def seed_accounts(db) -> dict:
    accounts = [
        (
            "admin@sagarnetra.in",
            "Cmdt. R. Iyer",
            os.getenv("SEED_ADMIN_PASSWORD", "Admin@123"),
            "admin",
            "ICG HQ, New Delhi",
            None,
            [],
        ),
        (
            "officer@sagarnetra.in",
            "Lt. A. Menon",
            os.getenv("SEED_OFFICER_PASSWORD", "Officer@123"),
            "officer",
            "ICG Region West, Porbandar",
            "North-West",
            ["z-guj", "z-mum"],
        ),
    ]
    officer = None
    for email, name, pw, role, org, region, zones in accounts:
        doc = await find_by_email(db, email)
        if doc:
            print(f"users: {email} exists, left unchanged")
        else:
            doc = await create_user(
                db,
                email=email,
                name=name,
                password=pw,
                role=role,
                org=org,
                region=region,
                zone_ids=zones,
                must_change_password=False,
            )
            print(f"users: created {email} ({role})")
        if role == "officer":
            officer = doc
    return officer


async def seed_demo_incident(db, officer: dict) -> None:
    sample = next(s for s in SAMPLES if s["_id"] == DEMO_SAMPLE)
    acq = sample["acquired_at"]
    data = (SAMPLES_DIR / f"{DEMO_SAMPLE}.png").read_bytes()
    tile = load_tile(data, f"{DEMO_SAMPLE}.png")
    det = Detector().detect(tile, tuple(sample["bbox"]))
    if not det.centroid or len(det.polygon) < 4:
        print("demo: sample tile produced no slick; skipping demo incident")
        return
    centroid = list(det.centroid)

    # real weather for that night -> real origin zones -> scenario tracks laid around them
    wx = await weather.fetch(centroid[1], centroid[0], acq - timedelta(hours=LOOKBACK_H), acq)
    zones = drift.backtrack((centroid[0], centroid[1]), acq, wx)
    print(f"demo: weather={wx.source}, t-12h origin at {zones[1]['center']}, bearing {zones[1]['bearing_deg']}")
    positions = build_positions(zones=zones, centroid=centroid, heading=det.heading_deg, acq=acq)
    await db.ais_positions.delete_many({"source": "scenario"})
    await upsert(db, "ais_positions", positions)
    await upsert(db, "vessels", vessel_docs(positions))

    # the detection an officer would have confirmed, then the incident exactly as the API creates it
    await db.incidents.delete_many({"is_demo": True, "_id": {"$nin": [i["_id"] for i in INCIDENTS]}})
    await db.detections.delete_many({"source.sample_id": DEMO_SAMPLE, "source.seeded": True})
    detection = {
        "_id": "det-demo-guj-01",
        "created_at": acq + timedelta(hours=2, minutes=50),
        "created_by": officer["_id"],
        "source": {
            "kind": "sample",
            "sample_id": DEMO_SAMPLE,
            "scene": sample["scene"],
            "acquired_at": acq,
            "seeded": True,
        },
        "engine": det.engine,
        "model_name": det.model_name,
        "confidence": det.confidence,
        "area_km2": det.area_km2,
        "centroid": centroid,
        "geometry": {"type": "Polygon", "coordinates": [[list(p) for p in det.polygon]]},
        "heading_deg": det.heading_deg,
        "elongation": det.elongation,
        "class_pixels": det.class_pixels,
        "inference_ms": det.inference_ms,
        "tile_shape": list(tile.shape),
        "bbox": list(sample["bbox"]),
        "tile_sha256": hashlib.sha256(data).hexdigest(),
        "mask_sha256": hashlib.sha256(det.mask_png.encode()).hexdigest(),
        "verification": {
            "decision": "confirmed",
            "reason": None,
            "note": "Seeded demo confirmation",
            "by": officer["_id"],
            "at": acq + timedelta(hours=3),
        },
    }
    await db.detections.replace_one({"_id": detection["_id"]}, detection, upsert=True)
    inc = await incidents.create_incident(db, detection, officer)
    top = inc["ranking"][0] if inc["ranking"] else None
    print(
        f"demo: {inc['code']} created, {inc['candidates_considered']} vessels considered, {len(inc['ranking'])} ranked, "
        f"top = {top['name'] if top else 'none'} ({top['score'] if top else '-'}/100, {top['tier'] if top else '-'})"
    )


async def seed(reset: bool = False) -> None:
    settings = get_settings()
    client, db = await connect(settings)
    try:
        if reset:
            for name in [*STATIC_COLLECTIONS, "users", "audit", "ais_positions", "vessels", "detections", "counters"]:
                await db[name].drop()
            print("dropped existing collections")
        await ensure_indexes(db)
        for name, docs in STATIC_COLLECTIONS.items():
            await upsert(db, name, docs)
        await db.incidents.delete_one({"_id": "inc-041"})  # legacy hand-authored demo incident
        officer = await seed_accounts(db)
        await seed_demo_incident(db, officer)
    finally:
        client.close()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--reset", action="store_true", help="drop demo collections and users first")
    asyncio.run(seed(reset=p.parse_args().reset))
