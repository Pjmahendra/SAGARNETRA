"""Read endpoints the console consumes. Data comes from seeded collections until the live pipeline fills them."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, status

from ..db import out
from ..deps import Db, Officer
from ..services.sectors import zone_filter

router = APIRouter(prefix="/api", tags=["data"])


@router.get("/overview")
async def overview(user: Officer, db: Db):
    now = datetime.now(UTC)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    scope = zone_filter(user)
    incidents = (
        await db.incidents.find(scope, {"ranking": 0, "events": 0, "polygon": 0})
        .sort("detected_at", -1)
        .to_list(1000)
    )
    month = [i for i in incidents if i["detected_at"] >= month_start]
    zone_scope = {"_id": scope["zone_id"]} if scope else {}
    zones = [out(z) for z in await db.watch_zones.find(zone_scope, {"geometry": 0}).sort("name", 1).to_list(200)]
    recent = [out(a) for a in await db.audit.find({"action": {"$ne": "login.failed"}}).sort("at", -1).to_list(8)]
    days = [(now - timedelta(days=13 - k)).date() for k in range(14)]
    trend = [
        {"day": d.strftime("%m-%d"), "slicks": sum(1 for i in incidents if i["detected_at"].date() == d)} for d in days
    ]
    return {
        "open_incidents": sum(1 for i in incidents if i["status"] != "closed"),
        "slicks_this_month": len(month),
        "area_km2_this_month": round(sum(i["area_km2"] for i in month), 2),
        # Same filter the Vessels page uses, so the KPI and the list can never disagree.
        "vessels_tracked": await db.vessels.count_documents(_current_vessels(user)),
        "zones": zones,
        "recent": [
            {"id": a["id"], "at": a["at"], "who": a["who"], "what": f"{a['action']} {a['target']}".strip(" -")}
            for a in recent
        ],
        "trend": trend,
    }


#: A live vessel counts as "in the sector" only while its last report is this recent. Without it a
#: long recording turns the sector list into a history of everything that ever passed through.
LIVE_WINDOW_H = 2
VESSELS_CAP = 2000


def _current_vessels(user: dict) -> dict:
    """Vessels an officer should see now: their zones, and for live ships, recently heard.

    Seeded scenario ships are exempt from the time window — they are a fixed reconstruction of one
    night, so ageing them out would empty the demo sector.
    """
    cutoff = datetime.now(UTC) - timedelta(hours=LIVE_WINDOW_H)
    return {
        **zone_filter(user),
        "$or": [{"source": {"$ne": "live"}}, {"last_seen": {"$gte": cutoff}}],
    }


@router.get("/vessels/live")
async def vessels_live(user: Officer, db: Db):
    # Freshest first, so the cap keeps the vessels that matter rather than a slice of the alphabet.
    docs = await db.vessels.find(_current_vessels(user)).sort("last_seen", -1).to_list(VESSELS_CAP)
    return [out(d) for d in docs]


@router.get("/vessels/{mmsi}")
async def vessel(mmsi: str, _: Officer, db: Db):
    doc = await db.vessels.find_one({"mmsi": mmsi})
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vessel not found")
    return out(doc)

