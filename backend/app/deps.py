from __future__ import annotations

from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorDatabase

from .config import Settings, get_settings
from .db import get_db
from .security import decode_token

bearer = HTTPBearer(auto_error=False)

ROLE_RANK = {"officer": 1, "admin": 2}


async def get_current_user(
    request: Request,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = decode_token(creds.credentials, settings)
    except jwt.ExpiredSignatureError as e:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Session expired", headers={"WWW-Authenticate": "Bearer"}
        ) from e
    except jwt.PyJWTError as e:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Invalid token", headers={"WWW-Authenticate": "Bearer"}
        ) from e
    user = await db.users.find_one({"_id": payload["sub"]})
    if user is None or not user.get("active", False):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account not found or disabled")
    request.state.user = user
    return user


def require_role(role: str):
    """Roles nest: admin satisfies officer."""

    async def _dep(user: Annotated[dict, Depends(get_current_user)]) -> dict:
        if ROLE_RANK.get(user["role"], 0) < ROLE_RANK[role]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"{role.capitalize()} role required")
        return user

    return _dep


CurrentUser = Annotated[dict, Depends(get_current_user)]
Officer = Annotated[dict, Depends(require_role("officer"))]
Admin = Annotated[dict, Depends(require_role("admin"))]
Db = Annotated[AsyncIOMotorDatabase, Depends(get_db)]
