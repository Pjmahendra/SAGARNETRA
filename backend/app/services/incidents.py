"""Create an incident from a confirmed detection: drift → candidate ships → ranking → stored evidence pack."""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from motor.motor_asyncio import AsyncIOMotorDatabase
from shapely.geometry import Point, shape

from ..db import new_id
from . import audit, drift, weather
from .drift import KM_PER_DEG_LAT, km_per_deg_lon
from .ranking import CANDIDATE_RADIUS, LOOKBACK_H, Report, rank

log = logging.getLogger("sagarnetra.incidents")


def _acquired_at(detection: dict) -> datetime:
    src = detection.get("source") or {}
    t = src.get("acquired_at") or detection["created_at"]
    return t if t.tzinfo else t.replace(tzinfo=UTC)


def _search_bbox(zones: list[dict], centroid: list[float]) -> tuple[float, float, float, float]:
    lons = [centroid[0]] + [z["center"][0] for z in zones]
    lats = [centroid[1]] + [z["center"][1] for z in zones]
    pad_km = max(z["semi_major_km"] for z in zones) * CANDIDATE_RADIUS + 5.0
    lat0 = sum(lats) / len(lats)
    dlon, dlat = pad_km / km_per_deg_lon(lat0), pad_km / KM_PER_DEG_LAT
    return min(lons) - dlon, min(lats) - dlat, max(lons) + dlon, max(lats) + dlat


async def _positions(db: AsyncIOMotorDatabase, bbox, start: datetime, end: datetime) -> dict[str, list[Report]]:
    w, s, e, n = bbox
    query: dict = {"ts": {"$gte": start, "$lte": end}}
    ring = [[w, s], [e, s], [e, n], [w, n], [w, s]]
    docs: list[dict]
    try:
        docs = await db.ais_positions.find(
            {**query, "geometry": {"$geoWithin": {"$geometry": {"type": "Polygon", "coordinates": [ring]}}}}
        ).to_list(200_000)
    except Exception:  # in-memory Mongo lacks $geoWithin; filter in Python
        docs = [
            d
            for d in await db.ais_positions.find(query).to_list(200_000)
            if w <= d["geometry"]["coordinates"][0] <= e and s <= d["geometry"]["coordinates"][1] <= n
        ]
    grouped: dict[str, list[Report]] = defaultdict(list)
    for d in docs:
        lon, lat = d["geometry"]["coordinates"]
        ts = d["ts"] if d["ts"].tzinfo else d["ts"].replace(tzinfo=UTC)
        grouped[d["mmsi"]].append(Report(ts, lon, lat, d.get("sog"), d.get("cog"), d.get("draft")))
    return grouped


async def _zone_name(db: AsyncIOMotorDatabase, centroid: list[float]) -> tuple[str, str | None]:
    pt = Point(centroid)
    async for z in db.watch_zones.find({}, {"name": 1, "geometry": 1}):
        try:
            if z.get("geometry") and shape(z["geometry"]).contains(pt):
                return z["name"], z["_id"]
        except Exception:
            continue
    return "Outside watch zones", None


async def _next_code(db: AsyncIOMotorDatabase, when: datetime) -> str:
    doc = await db.counters.find_one_and_update(
        {"_id": f"incident-{when.year}"}, {"$inc": {"seq": 1}}, upsert=True, return_document=True
    )
    return f"INC-{when.year}-{doc['seq']:03d}"


async def _history(db: AsyncIOMotorDatabase, mmsis: list[str]) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    async for inc in db.incidents.find({"ranking.mmsi": {"$in": mmsis}}, {"ranking.mmsi": 1, "ranking.tier": 1}):
        for r in inc.get("ranking", []):
            if r["mmsi"] in mmsis and r["tier"] in ("prime", "poi"):
                counts[r["mmsi"]] += 1
    return counts


async def compute_pipeline(
    db: AsyncIOMotorDatabase, centroid: list[float], acquired_at: datetime, heading_deg: float
) -> dict:
    start = acquired_at - timedelta(hours=LOOKBACK_H)
    wx = await weather.fetch(centroid[1], centroid[0], start, acquired_at)
    zones = drift.backtrack((centroid[0], centroid[1]), acquired_at, wx)
    inputs = drift.drift_inputs(wx, start, acquired_at)
    grouped = await _positions(db, _search_bbox(zones, centroid), start, acquired_at)
    statics = {v["mmsi"]: v async for v in db.vessels.find({"mmsi": {"$in": list(grouped)}})}
    history = await _history(db, list(grouped))
    ranking = rank(grouped, statics, zones, acquired_at, heading_deg, history)
    return {"origin_zones": zones, "drift_inputs": inputs, "ranking": ranking, "candidates_considered": len(grouped)}


async def create_incident(db: AsyncIOMotorDatabase, detection: dict, user: dict) -> dict:
    if not detection.get("centroid") or not detection.get("geometry"):
        raise ValueError("Detection has no slick polygon; nothing to investigate")
    acquired_at = _acquired_at(detection)
    centroid = detection["centroid"]
    result = await compute_pipeline(db, centroid, acquired_at, float(detection.get("heading_deg") or 0.0))
    zone_name, zone_id = await _zone_name(db, centroid)
    now = datetime.now(UTC)
    top = result["ranking"][0] if result["ranking"] else None
    src = detection.get("source") or {}
    doc = {
        "_id": new_id("inc"),
        "code": await _next_code(db, acquired_at),
        "status": "investigating",
        "zone": zone_name,
        "zone_id": zone_id,
        "detection_id": detection["_id"],
        "detected_at": acquired_at,
        "area_km2": detection["area_km2"],
        "confidence": detection["confidence"],
        "engine": detection["engine"],
        "centroid": centroid,
        "top_tier": top["tier"] if top else None,
        "top_vessel": top["name"] if top else None,
        "assigned_to": user["name"],
        "assigned_to_id": user["_id"],
        "is_demo": bool(src.get("kind") == "sample"),
        "scene": src.get("scene") or src.get("filename") or "uploaded tile",
        "polygon": detection["geometry"]["coordinates"][0],
        "heading_deg": detection.get("heading_deg", 0),
        "origin_zones": result["origin_zones"],
        "drift_inputs": result["drift_inputs"],
        "ranking": result["ranking"],
        "candidates_considered": result["candidates_considered"],
        "events": [
            {
                "at": detection["created_at"],
                "who": "system",
                "type": "detected",
                "text": f"Slick detected by {detection['engine']} on {src.get('scene') or 'uploaded tile'}. Confidence {detection['confidence']:.2f}.",
            },
            {
                "at": now,
                "who": user["name"],
                "type": "status",
                "text": f"Opened investigation. Drift backtracked ({result['drift_inputs'].get('weather_source')}), {result['candidates_considered']} vessels considered, {len(result['ranking'])} ranked.",
            },
        ],
        "hashes": {"tile_sha256": detection.get("tile_sha256"), "mask_sha256": detection.get("mask_sha256")},
        "created_at": now,
    }
    await db.incidents.insert_one(doc)
    await db.detections.update_one({"_id": detection["_id"]}, {"$set": {"incident_id": doc["_id"]}})
    await audit.log(db, user["email"], "incident.create", doc["code"])
    return doc


async def rerank(db: AsyncIOMotorDatabase, incident: dict, user: dict) -> dict:
    acquired_at = (
        incident["detected_at"] if incident["detected_at"].tzinfo else incident["detected_at"].replace(tzinfo=UTC)
    )
    result = await compute_pipeline(db, incident["centroid"], acquired_at, float(incident.get("heading_deg") or 0.0))
    top = result["ranking"][0] if result["ranking"] else None
    event = {
        "at": datetime.now(UTC),
        "who": user["name"],
        "type": "rerank",
        "text": f"Ranking recomputed: {result['candidates_considered']} vessels considered, {len(result['ranking'])} ranked.",
    }
    doc = await db.incidents.find_one_and_update(
        {"_id": incident["_id"]},
        {
            "$set": {**result, "top_tier": top["tier"] if top else None, "top_vessel": top["name"] if top else None},
            "$push": {"events": event},
        },
        return_document=True,
    )
    await audit.log(db, user["email"], "incident.rerank", incident["code"])
    return doc
