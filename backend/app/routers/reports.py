"""Stage 6: the evidence pack.

A report records that an export happened and freezes the numbers as they stood. What the officer
prints is the frontend's A4 view; this router owns the record, the revision count, and the entries
written into the incident timeline and the audit log for chain of custody.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from ..db import out
from ..deps import Db, Officer
from ..services import audit, reports
from ..services.sectors import zone_filter

router = APIRouter(prefix="/api/reports", tags=["reports"])


class CreateIn(BaseModel):
    incident_id: str


@router.get("")
async def list_reports(user: Officer, db: Db, limit: int = Query(default=200, ge=1, le=1000)):
    docs = await db.reports.find(zone_filter(user)).sort("generated_at", -1).to_list(limit)
    return [out(d) for d in docs]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_report(body: CreateIn, user: Officer, db: Db):
    inc = await db.incidents.find_one({"_id": body.incident_id})
    if inc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Incident not found")
    # An officer cannot export a case outside their own sector.
    allowed = zone_filter(user).get("zone_id", {}).get("$in")
    if allowed is not None and inc.get("zone_id") not in allowed:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This incident is outside your sector")

    now = datetime.now(UTC)
    revision = await db.reports.count_documents({"incident_id": inc["_id"]}) + 1
    doc = reports.build(inc, by_name=user["name"], by_id=user["_id"], revision=revision, at=now)
    await db.reports.insert_one(doc)
    await db.incidents.update_one(
        {"_id": inc["_id"]},
        {"$push": {"events": reports.export_event(revision, doc["_id"], user["name"], now)}},
    )
    await audit.log(db, user["email"], "report.export", f"{inc['code']} r{revision}")
    return out(doc)


@router.get("/{report_id}")
async def get_report(report_id: str, user: Officer, db: Db):
    doc = await db.reports.find_one({"_id": report_id, **zone_filter(user)})
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    return out(doc)
