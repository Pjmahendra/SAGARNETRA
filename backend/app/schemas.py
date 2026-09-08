"""Pydantic schemas shared by routers. Field names mirror web/src/lib/types.ts."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field

Role = Literal["admin", "officer"]
# The five Indian Coast Guard regions, plus "Europe" for the North Sea liaison account: that is
# the one sector where AISStream has receiver coverage, so it is where live AIS is demonstrated.
Region = Literal["West", "North-West", "East", "North-East", "A&N", "Europe"]


class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: Role
    org: str
    region: Region | None = None
    zone_ids: list[str] = []
    must_change_password: bool = False


class AdminUserOut(UserOut):
    active: bool
    created_at: datetime
    last_login: datetime | None = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class LoginOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserOut


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10, max_length=256)


class UserCreateIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=120)
    role: Role = "officer"
    org: str = Field(default="", max_length=160)
    region: Region | None = None
    zone_ids: list[str] = []


class UserCreateOut(BaseModel):
    user: AdminUserOut
    temp_password: str


class UserPatchIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    role: Role | None = None
    org: str | None = Field(default=None, max_length=160)
    region: Region | None = None
    zone_ids: list[str] | None = None
    active: bool | None = None


class ZoneIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    region: Region
    geometry: dict[str, Any]  # GeoJSON Polygon


class ZoneOut(BaseModel):
    id: str
    name: str
    region: Region
    geometry: dict[str, Any] | None = None
    last_scene_at: datetime | None = None
    vessels_now: int = 0
    #: "live" (real recorded AIS), "scenario" (the seeded reconstruction) or "none". Derived from
    #: the vessels in the sector, never stored, so it cannot go stale against the data it describes.
    feed: Literal["live", "scenario", "none"] = "none"


class AuditOut(BaseModel):
    id: str
    at: datetime
    who: str
    action: str
    target: str


class HealthOut(BaseModel):
    status: Literal["ok", "degraded"]
    database: Literal["connected", "disconnected"]
    model: Literal["unet", "heuristic", "missing"]
    ais_collector: Literal["running", "stopped"]
    version: str
