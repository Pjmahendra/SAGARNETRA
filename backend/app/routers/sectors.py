"""Officer command view: the sectors and each sector's review queue."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from ..deps import Db, Officer
from ..services import sectors as sectors_svc
from ..services.sectors import zone_filter

router = APIRouter(prefix="/api/sectors", tags=["sectors"])


@router.get("")
async def list_sectors(user: Officer, db: Db):
    return await sectors_svc.list_sectors(db, user)


@router.get("/{zone_id}")
async def sector_detail(zone_id: str, user: Officer, db: Db):
    # Scoped like the list: a sector outside the officer's own is not theirs to open, and 404
    # rather than 403 so the endpoint does not confirm that a sector they cannot see exists.
    allowed = zone_filter(user).get("zone_id", {}).get("$in")
    if allowed is not None and zone_id not in allowed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sector not found")
    doc = await sectors_svc.sector_detail(db, zone_id)
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sector not found")
    return doc
