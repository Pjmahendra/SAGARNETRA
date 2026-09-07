from __future__ import annotations

from datetime import UTC, datetime

from motor.motor_asyncio import AsyncIOMotorDatabase

from ..db import new_id


async def log(db: AsyncIOMotorDatabase, who: str, action: str, target: str = "-") -> None:
    await db.audit.insert_one(
        {"_id": new_id("log"), "at": datetime.now(UTC), "who": who, "action": action, "target": target}
    )
