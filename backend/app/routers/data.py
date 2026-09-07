"""Read endpoints the console consumes. Data comes from seeded collections until the live pipeline fills them."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, status

from ..db import out
from ..deps import Db, Officer

router = APIRouter(prefix="/api", tags=["data"])


@router.get("/overview")
async def overview(_: Officer, db: Db):
    now = datetime.now(UTC)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    incidents = (
        await db.incidents.find({}, {"ranking": 0, "events": 0, "polygon": 0}).sort("detected_at", -1).to_list(1000)
    )
    month = [i for i in incidents if i["detected_at"] >= month_start]
    zones = [out(z) for z in await db.watch_zones.find({}, {"geometry": 0}).sort("name", 1).to_list(200)]
    recent = [out(a) for a in await db.audit.find({"action": {"$ne": "login.failed"}}).sort("at", -1).to_list(8)]
    days = [(now - timedelta(days=13 - k)).date() for k in range(14)]
    trend = [
        {"day": d.strftime("%m-%d"), "slicks": sum(1 for i in incidents if i["detected_at"].date() == d)} for d in days
    ]
    return {
        "open_incidents": sum(1 for i in incidents if i["status"] != "closed"),
        "slicks_this_month": len(month),
        "area_km2_this_month": round(sum(i["area_km2"] for i in month), 2),
        "vessels_tracked": await db.vessels.count_documents({}),
        "zones": zones,
        "recent": [
            {"id": a["id"], "at": a["at"], "who": a["who"], "what": f"{a['action']} {a['target']}".strip(" -")}
            for a in recent
        ],
        "trend": trend,
    }


@router.get("/vessels/live")
async def vessels_live(_: Officer, db: Db):
    docs = await db.vessels.find().sort("name", 1).to_list(2000)
    return [out(d) for d in docs]


@router.get("/vessels/{mmsi}")
async def vessel(mmsi: str, _: Officer, db: Db):
    doc = await db.vessels.find_one({"mmsi": mmsi})
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vessel not found")
    return out(doc)


@router.get("/reports")
async def reports(_: Officer, db: Db):
    docs = await db.reports.find().sort("generated_at", -1).to_list(500)
    return [out(d) for d in docs]
