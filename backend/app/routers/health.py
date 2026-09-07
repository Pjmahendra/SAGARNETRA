from __future__ import annotations

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


@router.get("/api/health", response_model=HealthOut)
async def health(db: Db, settings: Annotated[Settings, Depends(get_settings)]):
    db_ok = await ping(db)
    model = model_status()
    return HealthOut(
        status="ok" if db_ok else "degraded",
        database="connected" if db_ok else "disconnected",
        model=model,
        ais_collector="stopped",
        version=settings.version,
    )
