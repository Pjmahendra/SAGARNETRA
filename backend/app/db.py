"""Mongo connection, index management and id helpers."""

from __future__ import annotations

import logging
import secrets
from typing import Any

from fastapi import Request
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING, GEOSPHERE

from .config import Settings

log = logging.getLogger("sagarnetra.db")


def new_id(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(6)}"


def out(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    """Expose `_id` as `id` and drop server-only fields."""
    if doc is None:
        return None
    d = dict(doc)
    d["id"] = d.pop("_id")
    d.pop("password_hash", None)
    return d


async def connect(settings: Settings) -> tuple[Any, AsyncIOMotorDatabase]:
    if settings.mongodb_uri.startswith("mongomock://"):
        from mongomock_motor import AsyncMongoMockClient  # test-only dependency

        client = AsyncMongoMockClient()
    else:
        client = AsyncIOMotorClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000, tz_aware=True)
    return client, client[settings.mongodb_db]


async def ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    specs = [
        ("users", [("email", ASCENDING)], {"unique": True}),
        ("watch_zones", [("geometry", GEOSPHERE)], {}),
        ("detections", [("geometry", GEOSPHERE)], {}),
        ("detections", [("created_at", DESCENDING)], {}),
        ("incidents", [("status", ASCENDING), ("created_at", DESCENDING)], {}),
        ("incidents", [("detected_at", DESCENDING)], {}),
        ("vessels", [("mmsi", ASCENDING)], {"unique": True}),
        ("ais_positions", [("mmsi", ASCENDING), ("ts", DESCENDING)], {}),
        ("ais_positions", [("geometry", GEOSPHERE)], {}),
        (
            "ais_positions",
            [("ts", ASCENDING)],
            {"expireAfterSeconds": 7 * 24 * 3600, "partialFilterExpression": {"source": "live"}},
        ),
        ("audit", [("at", DESCENDING)], {}),
        ("reports", [("incident_id", ASCENDING)], {}),
    ]
    for coll, keys, opts in specs:
        try:
            await db[coll].create_index(keys, **opts)
        except Exception as e:  # mongomock lacks some index types; never block startup on an index
            log.warning("index %s %s skipped: %s", coll, keys, e)


async def ping(db: AsyncIOMotorDatabase) -> bool:
    try:
        await db.command("ping")
        return True
    except Exception:
        return False


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db
