from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from ..db import out
from ..deps import Db, Officer
from ..services import audit, incidents
from ..services.sectors import zone_filter

router = APIRouter(prefix="/api/incidents", tags=["incidents"])

STATUSES = ("detected", "investigating", "inspection_requested", "closed")


class CreateIn(BaseModel):
    detection_id: str


class EventIn(BaseModel):
    type: Literal["note", "status", "inspection", "psc_request"]
    text: str = Field(default="", max_length=2000)
    status: Literal["detected", "investigating", "inspection_requested", "closed"] | None = None
    mmsi: str | None = None


@router.get("")
async def list_incidents(user: Officer, db: Db):
    docs = (
        await db.incidents.find(zone_filter(user), {"ranking": 0, "events": 0, "polygon": 0, "origin_zones": 0})
        .sort("detected_at", -1)
        .to_list(500)
    )
    return [out(d) for d in docs]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create(body: CreateIn, user: Officer, db: Db):
    det = await db.detections.find_one({"_id": body.detection_id})
    if det is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Detection not found")
    if det.get("incident_id"):
        existing = await db.incidents.find_one({"_id": det["incident_id"]})
        if existing:
            return out(existing)
    ver = det.get("verification") or {}
    if ver.get("decision") in ("lookalike",):
        raise HTTPException(status.HTTP_409_CONFLICT, "This detection was dismissed as a look-alike")
    try:
        doc = await incidents.create_incident(db, det, user)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from e
    return out(doc)


@router.get("/{incident_id}")
async def get_incident(incident_id: str, _: Officer, db: Db):
    doc = await db.incidents.find_one({"_id": incident_id})
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Incident not found")
    return out(doc)


@router.get("/{incident_id}/tracks")
async def tracks(incident_id: str, _: Officer, db: Db):
    doc = await db.incidents.find_one(
        {"_id": incident_id}, {"ranking.mmsi": 1, "ranking.name": 1, "ranking.type_group": 1, "ranking.track": 1}
    )
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Incident not found")
    return doc.get("ranking", [])


@router.post("/{incident_id}/events")
async def add_event(incident_id: str, body: EventIn, user: Officer, db: Db):
    inc = await db.incidents.find_one({"_id": incident_id}, {"code": 1, "status": 1})
    if inc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Incident not found")
    if body.type == "status" and body.status is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "status is required for a status event")
    if body.type in ("note",) and not body.text.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Note text is required")
    text = body.text.strip()
    updates: dict = {}
    if body.type == "status":
        updates["status"] = body.status
        text = text or f"Status changed to {body.status}"
    elif body.type == "inspection":
        updates["status"] = "inspection_requested"
        text = text or f"Vessel {body.mmsi or ''} marked for inspection".strip()
    elif body.type == "psc_request":
        updates["status"] = "inspection_requested"
        text = text or f"Port State Control request drafted for {body.mmsi or 'top suspect'}"
    event = {"at": datetime.now(UTC), "who": user["name"], "type": body.type, "text": text, "mmsi": body.mmsi}
    doc = await db.incidents.find_one_and_update(
        {"_id": incident_id},
        {"$push": {"events": event}, **({"$set": updates} if updates else {})},
        return_document=True,
    )
    await audit.log(db, user["email"], f"incident.{body.type}", inc["code"])
    return out(doc)


@router.post("/{incident_id}/rerank")
async def rerank(incident_id: str, user: Officer, db: Db):
    inc = await db.incidents.find_one({"_id": incident_id})
    if inc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Incident not found")
    return out(await incidents.rerank(db, inc, user))
