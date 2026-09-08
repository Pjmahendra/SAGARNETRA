"""Sectors = watch zones, seen through the officer's operational lens.

Powers the command view: each sector carries a globe center + map bbox, a count of detections still awaiting review
(verification is None), and its open incidents. The per-sector queue is what the officer works through — pending
(unconfirmed) detections first — turning "pick a tile" into "clear this sector".
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from motor.motor_asyncio import AsyncIOMotorDatabase
from shapely.geometry import Point, shape

from ..db import out

log = logging.getLogger(__name__)


#: A live vessel counts as present only while its last report is this recent. Matches the window the
#: Vessels page and the vessels_tracked KPI use, so no two numbers on screen can disagree.
LIVE_WINDOW_H = 2


async def vessels_now(db: AsyncIOMotorDatabase) -> dict[str, int]:
    """Vessels currently in each zone, counted from the vessels themselves.

    `watch_zones.vessels_now` is a seeded field that nothing ever updated, so it reported fiction:
    zero for the Dover Strait while the recorder had 189 real ships in it, and 61 for Gujarat which
    holds 8. Counting is one grouped query, and a number on an officer's screen has to be true.
    """
    cutoff = datetime.now(UTC) - timedelta(hours=LIVE_WINDOW_H)
    pipeline = [
        {"$match": {"zone_id": {"$ne": None},
                    "$or": [{"source": {"$ne": "live"}}, {"last_seen": {"$gte": cutoff}}]}},
        {"$group": {"_id": "$zone_id", "n": {"$sum": 1}}},
    ]
    try:
        return {d["_id"]: d["n"] async for d in db.vessels.aggregate(pipeline)}
    except Exception as e:  # mongomock lacks parts of the aggregation pipeline; never break a page
        log.warning("vessels_now aggregate unavailable (%s); counting per zone", e)
        out_counts: dict[str, int] = {}
        async for z in db.watch_zones.find({}, {"_id": 1}):
            out_counts[z["_id"]] = await db.vessels.count_documents({
                "zone_id": z["_id"],
                "$or": [{"source": {"$ne": "live"}}, {"last_seen": {"$gte": cutoff}}],
            })
        return out_counts


async def feed_by_zone(db: AsyncIOMotorDatabase) -> dict[str, str]:
    """Where each sector's vessels come from: "live", "scenario", or "none".

    Only two sectors on the platform carry a real AIS feed — Chennai–Ennore and the Dover Strait,
    the two with AISStream receiver coverage. Every other sector's ships are the reconstruction we
    generated. That distinction is the most important thing on the screen and it was invisible: the
    header's AIS light is platform-wide, so it went green next to *every* sector in the dropdown
    and implied fifteen live feeds that do not exist.

    Derived from the vessels themselves rather than a hardcoded list, for the same reason
    `vessels_now` is counted: the moment a sector starts receiving real AIS, the console should say
    so without anybody editing a constant.
    """
    pipeline = [
        {"$match": {"zone_id": {"$ne": None}}},
        {"$group": {"_id": {"z": "$zone_id", "s": "$source"}, "n": {"$sum": 1}}},
    ]
    tally: dict[str, set[str]] = {}
    try:
        async for d in db.vessels.aggregate(pipeline):
            tally.setdefault(d["_id"]["z"], set()).add(d["_id"]["s"] or "scenario")
    except Exception as e:  # mongomock lacks parts of the pipeline; never break a page over a badge
        log.warning("feed_by_zone aggregate unavailable (%s); reporting no feed", e)
        return {}
    return {z: ("live" if "live" in s else "scenario") for z, s in tally.items()}


def zone_filter(user: dict) -> dict:
    """Mongo filter restricting a query to the officer's own sectors.

    Scope follows the *role*, not the length of the list. An admin sees everything; an officer sees
    the zones they are assigned, and an officer assigned none sees nothing.

    That last case used to fall through to "no filter", which meant a newly created officer with no
    sectors silently saw every zone in the country — the opposite of the intent, and the failure
    mode you would least want to discover in front of an auditor. An impossible filter is the safe
    default: an unassigned account is inert until an admin gives it a sector.

    This is what keeps live Dover traffic and the Indian scenario apart. They share the same
    collections and are separated by who is asking.
    """
    if user.get("role") == "admin":
        return {}
    return {"zone_id": {"$in": user.get("zone_ids") or []}}


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


async def list_sectors(db: AsyncIOMotorDatabase, user: dict | None = None) -> list[dict]:
    """The officer's own sectors. `user=None` means unscoped, which only admin paths should use."""
    counts = await vessels_now(db)
    feeds = await feed_by_zone(db)
    scope = zone_filter(user) if user else {}
    zone_scope = {"_id": scope["zone_id"]} if scope else {}
    sectors = []
    async for z in db.watch_zones.find(zone_scope).sort("name", 1):
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
            "vessels_now": counts.get(z["_id"], 0),
            "feed": feeds.get(z["_id"], "none"),
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
    feeds = await feed_by_zone(db)
    return {
        "sector": {"id": z["_id"], "name": z["name"], "region": z.get("region"), "center": center, "bbox": bbox,
                   "feed": feeds.get(zone_id, "none")},
        "detections": [_detection_summary(d) for d in dets],
        "incidents": [out(i) for i in incs],
    }
