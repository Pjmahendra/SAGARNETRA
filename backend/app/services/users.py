from __future__ import annotations

from datetime import UTC, datetime

from motor.motor_asyncio import AsyncIOMotorDatabase

from ..db import new_id
from ..security import hash_password


async def create_user(
    db: AsyncIOMotorDatabase,
    *,
    email: str,
    name: str,
    password: str,
    role: str,
    org: str = "",
    region: str | None = None,
    zone_ids: list[str] | None = None,
    must_change_password: bool = True,
) -> dict:
    doc = {
        "_id": new_id("u"),
        "email": email.strip().lower(),
        "password_hash": hash_password(password),
        "name": name.strip(),
        "role": role,
        "org": org,
        "region": region,
        "zone_ids": zone_ids or [],
        "active": True,
        "must_change_password": must_change_password,
        "created_at": datetime.now(UTC),
        "last_login": None,
    }
    await db.users.insert_one(doc)
    return doc


async def find_by_email(db: AsyncIOMotorDatabase, email: str) -> dict | None:
    return await db.users.find_one({"email": email.strip().lower()})
