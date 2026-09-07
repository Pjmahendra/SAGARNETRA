import jwt

from app.config import get_settings
from tests.conftest import login


async def test_health_is_public(client):
    r = await client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["database"] == "connected"
    assert body["model"] in {"unet", "heuristic", "missing"}


async def test_login_returns_token_and_user(client):
    r = await client.post("/api/auth/login", json={"email": "Officer@test.in", "password": "Officer@12345"})
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["role"] == "officer"
    assert "password_hash" not in body["user"]
    claims = jwt.decode(body["access_token"], get_settings().jwt_secret, algorithms=["HS256"])
    assert claims["role"] == "officer"


async def test_wrong_password_and_unknown_email_same_message(client):
    a = await client.post("/api/auth/login", json={"email": "officer@test.in", "password": "nope-nope"})
    b = await client.post("/api/auth/login", json={"email": "nobody@test.in", "password": "nope-nope"})
    assert a.status_code == b.status_code == 401
    assert a.json()["detail"] == b.json()["detail"]


async def test_disabled_account_is_rejected(client):
    r = await client.post("/api/auth/login", json={"email": "gone@test.in", "password": "Gone@12345"})
    assert r.status_code == 403


async def test_me_requires_token(client):
    assert (await client.get("/api/auth/me")).status_code == 401
    assert (await client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-token"})).status_code == 401


async def test_me_with_token(client):
    h = await login(client, "officer@test.in", "Officer@12345")
    r = await client.get("/api/auth/me", headers=h)
    assert r.status_code == 200 and r.json()["email"] == "officer@test.in"


async def test_expired_token_is_rejected(client):
    s = get_settings()
    token = jwt.encode({"sub": "u-x", "role": "officer", "exp": 1}, s.jwt_secret, algorithm="HS256")
    r = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401 and r.json()["detail"] == "Session expired"


async def test_change_password(client):
    h = await login(client, "officer@test.in", "Officer@12345")
    bad = await client.post(
        "/api/auth/change-password", json={"current_password": "wrong", "new_password": "NewPass@12345"}, headers=h
    )
    assert bad.status_code == 400
    ok = await client.post(
        "/api/auth/change-password",
        json={"current_password": "Officer@12345", "new_password": "NewPass@12345"},
        headers=h,
    )
    assert ok.status_code == 204
    assert (
        await client.post("/api/auth/login", json={"email": "officer@test.in", "password": "NewPass@12345"})
    ).status_code == 200


async def test_login_writes_audit(client):
    await login(client, "officer@test.in", "Officer@12345")
    h = await login(client, "admin@test.in", "Admin@12345")
    r = await client.get("/api/admin/audit", headers=h)
    actions = [a["action"] for a in r.json()]
    assert "login" in actions
