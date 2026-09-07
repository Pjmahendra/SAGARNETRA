"""Pydantic schemas shared by routers. Field names mirror web/src/lib/types.ts."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field

Role = Literal["admin", "officer"]
Region = Literal["West", "North-West", "East", "North-East", "A&N"]


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
    center: list[float] | None = None  # [lon, lat] centroid of geometry; lets the console orient a map on the zone
    last_scene_at: datetime | None = None
    vessels_now: int = 0


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
