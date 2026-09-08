from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends
from ml import WEIGHTS_DIR

from ..config import Settings, get_settings
from ..db import ping
from ..deps import Db
from ..schemas import HealthOut

router = APIRouter(tags=["health"])


def model_status() -> str:
    if WEIGHTS_DIR.exists() and any(WEIGHTS_DIR.glob("*.onnx")):
        return "unet"
    return "heuristic"


#: A recording is "running" while a real AIS report has landed this recently. The Dover Strait sees
#: several a second, so this is generous — it survives a reconnect without flickering the light.
AIS_FRESH_MIN = 15


async def ais_status(db) -> str:
    """Whether the live AIS recorder is actually feeding us, judged by the data it writes.

    This used to be the literal string "stopped", so the console showed a red AIS light even with
    the recorder running and real ships arriving — the one part of the platform that is genuinely
    live was the one part reporting dead. There is no process to ask (the collector is a separate
    script, and on Render it is a separate dyno), so the honest signal is the freshest live report:
    if AIS arrived in the last few minutes, AIS is up.
    """
    cutoff = datetime.now(UTC) - timedelta(minutes=AIS_FRESH_MIN)
    try:
        fresh = await db.vessels.find_one({"source": "live", "last_seen": {"$gte": cutoff}}, {"_id": 1})
    except Exception:  # a health check must never be the thing that goes down
        return "stopped"
    return "running" if fresh else "stopped"


@router.get("/api/health", response_model=HealthOut)
async def health(db: Db, settings: Annotated[Settings, Depends(get_settings)]):
    db_ok = await ping(db)
    model = model_status()
    return HealthOut(
        status="ok" if db_ok else "degraded",
        database="connected" if db_ok else "disconnected",
        model=model,
        ais_collector=await ais_status(db),
        version=settings.version,
    )
