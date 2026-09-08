from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from starlette.responses import JSONResponse

from .config import Settings, get_settings
from .db import connect, ensure_indexes
from .routers import admin, auth, data, detect, health, incidents, reports, sectors

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        client, db = await connect(settings)
        app.state.client, app.state.db = client, db
        await ensure_indexes(db)
        yield
        client.close()

    app = FastAPI(
        title="SAGARNETRA API",
        version=settings.version,
        description="Oil-spill detection, drift backtracking, AIS correlation and officer workflow.",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url=None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.state.limiter = auth.limiter

    @app.exception_handler(RateLimitExceeded)
    async def _rate_limited(_: Request, exc: RateLimitExceeded):
        return JSONResponse({"detail": "Too many sign-in attempts. Try again in a minute."}, status_code=429)

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(admin.router)
    app.include_router(data.router)
    app.include_router(detect.router)
    app.include_router(incidents.router)
    app.include_router(reports.router)
    app.include_router(sectors.router)
    return app


app = create_app()
