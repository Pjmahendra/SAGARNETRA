"""Sectors = watch zones, seen through the officer's operational lens.

Powers the command view: each sector carries a globe center + map bbox, a count of detections still awaiting review
(verification is None), and its open incidents. The per-sector queue is what the officer works through — pending
(unconfirmed) detections first — turning "pick a tile" into "clear this sector".
"""

from __future__ import annotations

from motor.motor_asyncio import AsyncIOMotorDatabase
from shapely.geometry import Point, shape

from ..db import out


def _center_bbox(geometry: dict | None) -> tuple[list[float] | None, list[float] | None]:
    if not geometry or not geometry.get("coordinates"):
        return None, None
    ring = geometry["coordinates"][0]
    lons = [c[0] for c in ring]
    lats = [c[1] for c in ring]
    bbox = [min(lons), min(lats), max(lons), max(lats)]
    center = [round((bbox[0] + bbox[2]) / 2, 5), round((bbox[1] + bbox[3]) / 2, 5)]
    return center, bbox


async def zone_for_point(db: AsyncIOMotorDatabase, lon: float, lat: float) -> tuple[str | None, str | None]:
    """(name, id) of the watch zone containing the point, or (None, None). Files each detection under a sector."""
    pt = Point(lon, lat)
    async for z in db.watch_zones.find({}, {"name": 1, "geometry": 1}):
        try:
            if z.get("geometry") and shape(z["geometry"]).contains(pt):
                return z["name"], z["_id"]
        except Exception:
            continue
    return None, None


def _detection_summary(d: dict) -> dict:
    return {
        "id": d["_id"],
        "created_at": d.get("created_at"),
        "engine": d.get("engine"),
        "confidence": d.get("confidence"),
        "area_km2": d.get("area_km2"),
        "centroid": d.get("centroid"),
        "bbox": d.get("bbox"),
        "has_spill": bool(d.get("geometry")),
        "verified": d.get("verification") is not None,
        "verification": d.get("verification"),
        "incident_id": d.get("incident_id"),
        "scene": (d.get("source") or {}).get("scene") or (d.get("source") or {}).get("filename"),
        "sample_id": (d.get("source") or {}).get("sample_id"),
    }


async def list_sectors(db: AsyncIOMotorDatabase) -> list[dict]:
    sectors = []
    async for z in db.watch_zones.find().sort("name", 1):
        center, bbox = _center_bbox(z.get("geometry"))
        sectors.append({
            "id": z["_id"],
            "name": z["name"],
            "region": z.get("region"),
            "center": center,
            "bbox": bbox,
            "pending": await db.detections.count_documents({"zone_id": z["_id"], "verification": None}),
            "open_incidents": await db.incidents.count_documents({"zone_id": z["_id"], "status": {"$ne": "closed"}}),
            "last_scene_at": z.get("last_scene_at"),
            "vessels_now": z.get("vessels_now", 0),
        })
    return sectors


async def sector_detail(db: AsyncIOMotorDatabase, zone_id: str) -> dict | None:
    z = await db.watch_zones.find_one({"_id": zone_id})
    if z is None:
        return None
    center, bbox = _center_bbox(z.get("geometry"))
    dets = await db.detections.find({"zone_id": zone_id}).to_list(200)
    # unreviewed first, then newest — the review queue order
    def _order(d: dict) -> tuple[bool, float]:
        ts = d["created_at"].timestamp() if d.get("created_at") else 0.0
        return (d.get("verification") is not None, -ts)
    dets.sort(key=_order)
    # keep polygon + origin_zones so the command map can draw the slick and drift ellipses; drop the heavy fields
    incs = (
        await db.incidents.find({"zone_id": zone_id}, {"ranking": 0, "events": 0})
        .sort("detected_at", -1)
        .to_list(100)
    )
    return {
        "sector": {"id": z["_id"], "name": z["name"], "region": z.get("region"), "center": center, "bbox": bbox},
        "detections": [_detection_summary(d) for d in dets],
        "incidents": [out(i) for i in incs],
    }
