"""Officer command view: the sectors and each sector's review queue."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from ..deps import Db, Officer
from ..services import sectors as sectors_svc

router = APIRouter(prefix="/api/sectors", tags=["sectors"])


@router.get("")
async def list_sectors(_: Officer, db: Db):
    return await sectors_svc.list_sectors(db)


@router.get("/{zone_id}")
async def sector_detail(zone_id: str, _: Officer, db: Db):
    doc = await sectors_svc.sector_detail(db, zone_id)
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sector not found")
    return doc
