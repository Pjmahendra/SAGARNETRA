from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..config import Settings, get_settings
from ..db import out
from ..deps import CurrentUser, Db
from ..schemas import ChangePasswordIn, LoginIn, LoginOut, UserOut
from ..security import create_token, hash_password, verify_password
from ..services import audit, users

router = APIRouter(prefix="/api/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)


@router.post("/login", response_model=LoginOut)
@limiter.limit(lambda: get_settings().login_rate_limit)
async def login(request: Request, body: LoginIn, db: Db, settings: Annotated[Settings, Depends(get_settings)]):
    user = await users.find_by_email(db, body.email)
    # Same message for unknown email and wrong password so the endpoint doesn't leak which emails exist.
    if user is None or not verify_password(body.password, user["password_hash"]):
        await audit.log(db, body.email, "login.failed")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email or password is incorrect")
    if not user.get("active", False):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is disabled. Contact your administrator.")
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"last_login": datetime.now(UTC)}})
    await audit.log(db, user["email"], "login")
    return LoginOut(access_token=create_token(user["_id"], user["role"], settings), user=UserOut(**out(user)))


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser):
    return UserOut(**out(user))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(user: CurrentUser, db: Db):
    # Tokens are stateless; logout is an audit event and the client discards the token.
    await audit.log(db, user["email"], "logout")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(body: ChangePasswordIn, user: CurrentUser, db: Db):
    if not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"password_hash": hash_password(body.new_password), "must_change_password": False}},
    )
    await audit.log(db, user["email"], "password.change")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
