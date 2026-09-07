from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query, status

from ..db import new_id, out
from ..deps import Admin, Db
from ..schemas import AdminUserOut, AuditOut, UserCreateIn, UserCreateOut, UserPatchIn, ZoneIn, ZoneOut
from ..security import hash_password, temp_password
from ..services import audit, users

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users", response_model=list[AdminUserOut])
async def list_users(_: Admin, db: Db):
    docs = await db.users.find().sort("created_at", 1).to_list(500)
    return [AdminUserOut(**out(d)) for d in docs]


@router.post("/users", response_model=UserCreateOut, status_code=status.HTTP_201_CREATED)
async def create_user(body: UserCreateIn, admin: Admin, db: Db):
    if await users.find_by_email(db, body.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "A user with this email already exists")
    if body.zone_ids:
        known = {z["_id"] async for z in db.watch_zones.find({"_id": {"$in": body.zone_ids}}, {"_id": 1})}
        missing = set(body.zone_ids) - known
        if missing:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown zone ids: {', '.join(sorted(missing))}")
    pw = temp_password()
    doc = await users.create_user(
        db,
        email=body.email,
        name=body.name,
        password=pw,
        role=body.role,
        org=body.org,
        region=body.region,
        zone_ids=body.zone_ids,
    )
    await audit.log(db, admin["email"], "user.create", doc["email"])
    return UserCreateOut(user=AdminUserOut(**out(doc)), temp_password=pw)


@router.patch("/users/{user_id}", response_model=AdminUserOut)
async def patch_user(user_id: str, body: UserPatchIn, admin: Admin, db: Db):
    changes = body.model_dump(exclude_none=True)
    if not changes:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nothing to update")
    if user_id == admin["_id"] and changes.get("active") is False:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot disable your own account")
    if user_id == admin["_id"] and changes.get("role") == "officer":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot demote your own account")
    res = await db.users.find_one_and_update({"_id": user_id}, {"$set": changes}, return_document=True)
    if res is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    await audit.log(db, admin["email"], "user.update", f"{res['email']}:{','.join(changes)}")
    return AdminUserOut(**out(res))


@router.post("/users/{user_id}/reset-password")
async def reset_password(user_id: str, admin: Admin, db: Db):
    pw = temp_password()
    res = await db.users.find_one_and_update(
        {"_id": user_id},
        {"$set": {"password_hash": hash_password(pw), "must_change_password": True}},
        return_document=True,
    )
    if res is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    await audit.log(db, admin["email"], "user.reset_password", res["email"])
    return {"temp_password": pw}


@router.get("/zones", response_model=list[ZoneOut])
async def list_zones(_: Admin, db: Db):
    docs = await db.watch_zones.find().sort("name", 1).to_list(200)
    return [ZoneOut(**out(d)) for d in docs]


@router.post("/zones", response_model=ZoneOut, status_code=status.HTTP_201_CREATED)
async def create_zone(body: ZoneIn, admin: Admin, db: Db):
    g = body.geometry
    if g.get("type") != "Polygon" or not g.get("coordinates"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "geometry must be a GeoJSON Polygon")
    doc = {
        "_id": new_id("z"),
        "name": body.name,
        "region": body.region,
        "geometry": g,
        "last_scene_at": None,
        "vessels_now": 0,
        "created_by": admin["_id"],
        "created_at": datetime.now(UTC),
    }
    await db.watch_zones.insert_one(doc)
    await audit.log(db, admin["email"], "zone.create", body.name)
    return ZoneOut(**out(doc))


@router.get("/audit", response_model=list[AuditOut])
async def list_audit(_: Admin, db: Db, limit: int = Query(default=100, ge=1, le=1000)):
    docs = await db.audit.find().sort("at", -1).to_list(limit)
    return [AuditOut(**out(d)) for d in docs]
