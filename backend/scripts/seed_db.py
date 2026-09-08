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
from shapely.geometry import Point, shape  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.db import connect, ensure_indexes  # noqa: E402
from app.services import drift, incidents, reports, weather  # noqa: E402
from app.services.ranking import LOOKBACK_H  # noqa: E402
from app.services.users import create_user, find_by_email  # noqa: E402
from scripts.demo_scenario import (  # noqa: E402
    INCIDENTS,
    LIVE_ZONE_IDS,
    REPORTS,
    SAMPLES,
    SCENARIO_ZONE_IDS,
    TRAFFIC_VESSELS,
    ZONES,
    build_positions,
    vessel_docs,
)

# `traffic` is a seeding instruction, not sector data, so it is dropped before the zone is stored.
WATCH_ZONES = [{k: v for k, v in z.items() if k != "traffic"} for z in ZONES]
STATIC_COLLECTIONS = {"watch_zones": WATCH_ZONES, "incidents": INCIDENTS, "samples": SAMPLES, "reports": REPORTS}
DEMO_SAMPLE = "guj-01"


async def upsert(db, name: str, docs: list[dict]) -> None:
    if docs:
        await db[name].bulk_write([ReplaceOne({"_id": d["_id"]}, d, upsert=True) for d in docs])
    print(f"{name}: {len(docs)} documents")


#: Accounts renamed since an earlier seed, {old email: new email}. Renamed rather than recreated so
#: the operator keeps their password and their audit history; a second account with the same job
#: would leave a stale one holding sectors it no longer owns.
RENAMED = {"officer.eu@sagarnetra.in": "officer.ais@sagarnetra.in"}


async def migrate_emails(db) -> None:
    for old, new in RENAMED.items():
        if await find_by_email(db, new):
            continue
        doc = await find_by_email(db, old)
        if doc:
            await db.users.update_one({"_id": doc["_id"]}, {"$set": {"email": new}})
            print(f"users: renamed {old} -> {new} (password unchanged)")


async def seed_accounts(db) -> dict:
    await migrate_emails(db)
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
            "ICG Maritime Surveillance, Porbandar",
            "North-West",
            SCENARIO_ZONE_IDS,
        ),
        # The live-feed watch: the only two sectors with real AIS receiver coverage, Chennai–Ennore
        # and the Dover Strait. Split by data source rather than geography, so this account shows
        # nothing but real recorded ships and the account above shows nothing but the
        # reconstruction. Neither can ever display a mixture, which is the whole point.
        # `region` is left unset on purpose: this officer's remit is a feed, not a coastline, and
        # inventing a region label would be the one dishonest field on the account.
        (
            "officer.ais@sagarnetra.in",
            "Lt. Cdr. K. Nair",
            os.getenv("SEED_OFFICER_PASSWORD", "Officer@123"),
            "officer",
            "Live AIS watch — Chennai–Ennore & Dover Strait",
            None,
            LIVE_ZONE_IDS,
        ),
    ]
    officer = None
    for email, name, pw, role, org, region, zones in accounts:
        doc = await find_by_email(db, email)
        if doc:
            # Passwords and activity are the operator's, so they are never touched. Everything
            # that describes the account's *job* is this script's to own: sectors, because a stale
            # zone list silently hides part of an officer's water, and name/org/region, because
            # those are what the console prints. Reconciling only the zone list left the live-AIS
            # officer still labelled "Bonn Agreement liaison, North Sea" after it took on an
            # Indian sector — the account did the right thing and described itself wrongly.
            want = {"zone_ids": zones, "region": region, "name": name, "org": org}
            drift = {k: v for k, v in want.items() if doc.get(k) != v}
            if drift:
                await db.users.update_one({"_id": doc["_id"]}, {"$set": drift})
                doc = await find_by_email(db, email)
                print(f"users: {email} exists, updated {', '.join(sorted(drift))}")
            else:
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
        # The demo incident belongs to the Gujarat sector, so it must be created by the Indian
        # officer. Matching on email, not "the last officer in the list", which silently handed
        # the case to the North Sea liaison as soon as a second officer was added.
        if email == "officer@sagarnetra.in":
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
    # File the scenario ships under the incident's own zone and mark them as scenario, so the
    # zone-scoped endpoints treat them exactly like live vessels and nothing has to special-case
    # seeded data. The Gujarat officer sees these; the North Sea officer never does.
    zone_id = next(z["_id"] for z in ZONES if shape(z["geometry"]).contains(Point(*centroid)))
    positions = [{**p, "zone_id": zone_id} for p in positions]
    vessels = [{**v, "zone_id": zone_id, "source": "scenario"} for v in vessel_docs(positions)]
    await upsert(db, "ais_positions", positions)
    await upsert(db, "vessels", vessels)
    print(f"demo: scenario vessels filed under {zone_id}")

    # Background traffic for every other Indian sector. Replaced wholesale each run so a changed
    # population never leaves last run's ships behind, and never touches source:"live" — the Dover
    # Strait's real recording is the one dataset the seed must not overwrite.
    await db.vessels.delete_many({"source": "scenario", "_id": {"$nin": [v["_id"] for v in vessels]}})
    await upsert(db, "vessels", TRAFFIC_VESSELS)
    seeded_sectors = len({v["zone_id"] for v in TRAFFIC_VESSELS})
    print(f"sectors: {len(TRAFFIC_VESSELS)} background vessels across {seeded_sectors} sectors "
          f"({len(SCENARIO_ZONE_IDS)} scenario sectors; the {len(LIVE_ZONE_IDS)} live ones are the recorder's)")

    # the detection an officer would have confirmed, then the incident exactly as the API creates it
    await db.incidents.delete_many({"is_demo": True, "_id": {"$nin": [i["_id"] for i in INCIDENTS]}})
    await db.detections.delete_many({"source.sample_id": DEMO_SAMPLE, "source.seeded": True})
    detection = {
        "_id": "det-demo-guj-01",
        "created_at": acq + timedelta(hours=2, minutes=50),
        "created_by": officer["_id"],
        "zone_id": "z-guj",
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

    # An already-exported evidence pack, so the Reports page has something real on a fresh seed.
    # Built through the same service the export endpoint uses, so a seeded pack and an officer's
    # pack are byte-identical in shape — no fixture to drift out of sync with the incident.
    # Each seed makes a NEW demo incident, so reports filed against previous ones were left
    # pointing at incidents that no longer exist — the Reports page listed them and every one
    # opened as "Report not found". Drop any report whose incident is gone, not just this one's.
    live = {i["_id"] async for i in db.incidents.find({}, {"_id": 1})}
    stale = [
        r["_id"]
        async for r in db.reports.find({}, {"incident_id": 1, "snapshot": 1})
        # Orphaned by an earlier seed, or written under the pre-snapshot schema. The old shape had
        # a `pages` count and no snapshot at all; it carried no zone_id either, so officers never
        # saw it and only an admin hit the missing field.
        if r["incident_id"] not in live or not r.get("snapshot")
    ]
    if stale:
        await db.reports.delete_many({"_id": {"$in": stale}})
        print(f"reports: removed {len(stale)} orphaned or pre-snapshot")
    await db.reports.delete_many({"incident_id": inc["_id"]})
    report = reports.build(inc, by_name=officer["name"], by_id=officer["_id"], revision=1)
    await db.reports.insert_one(report)
    await db.incidents.update_one(
        {"_id": inc["_id"]},
        {"$push": {"events": reports.export_event(1, report["_id"], officer["name"], report["generated_at"])}},
    )
    print(f"demo: evidence pack {report['_id']} (revision 1) exported for {inc['code']}")


async def seed_pending_detections(db) -> None:
    """Give each sector a review queue: run the detector on its sample tile and store an UNVERIFIED detection.
    This is what the officer works through in the command view. Synthetic tiles until real Sentinel-1 lands."""
    det = Detector()
    # kut-04 is a clean tile: it exists so the officer can review one and dismiss it.
    # The sector comes from the tile's own footprint, never a hardcoded pair — that list said
    # kut-04 was in z-guj, and when the Gulf of Kutch became its own sector the review silently
    # stayed filed under the sector next door.
    plan = ["mum-02", "che-03", "kut-04"]
    for sample_id in plan:
        sample = next((s for s in SAMPLES if s["_id"] == sample_id), None)
        zone_id = sample.get("zone_id") if sample else None
        p = SAMPLES_DIR / f"{sample_id}.png"
        if sample is None or not p.exists():
            continue
        data = p.read_bytes()
        tile = load_tile(data, p.name)
        r = det.detect(tile, tuple(sample["bbox"]))
        doc = {
            "_id": f"det-pending-{sample_id}",
            "created_at": sample["acquired_at"] + timedelta(hours=2),
            "created_by": None,
            "zone_id": zone_id,
            "source": {"kind": "sample", "sample_id": sample_id, "scene": sample.get("scene"),
                       "acquired_at": sample.get("acquired_at"), "seeded": True},
            "engine": r.engine,
            "model_name": r.model_name,
            "confidence": r.confidence,
            "area_km2": r.area_km2,
            "centroid": list(r.centroid) if r.centroid else None,
            "geometry": {"type": "Polygon", "coordinates": [[list(pt) for pt in r.polygon]]} if len(r.polygon) >= 4 else None,
            "heading_deg": r.heading_deg,
            "elongation": r.elongation,
            "class_pixels": r.class_pixels,
            "inference_ms": r.inference_ms,
            "tile_shape": list(tile.shape),
            "bbox": list(sample["bbox"]),
            "tile_sha256": hashlib.sha256(data).hexdigest(),
            "mask_sha256": hashlib.sha256(r.mask_png.encode()).hexdigest(),
            "verification": None,
        }
        await db.detections.replace_one({"_id": doc["_id"]}, doc, upsert=True)
        print(f"pending detection {doc['_id']} in {zone_id}: has_spill={len(r.polygon) >= 4}, conf={r.confidence}")


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
        await seed_pending_detections(db)
    finally:
        client.close()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--reset", action="store_true", help="drop demo collections and users first")
    asyncio.run(seed(reset=p.parse_args().reset))
