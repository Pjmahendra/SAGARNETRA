from tests.conftest import login


async def test_officer_cannot_use_admin_endpoints(client):
    h = await login(client, "officer@test.in", "Officer@12345")
    assert (await client.get("/api/admin/users", headers=h)).status_code == 403
    assert (await client.get("/api/admin/audit", headers=h)).status_code == 403


async def test_officer_can_read_data_endpoints(client):
    h = await login(client, "officer@test.in", "Officer@12345")
    for path in ["/api/overview", "/api/incidents", "/api/vessels/live", "/api/reports", "/api/detect/samples"]:
        r = await client.get(path, headers=h)
        assert r.status_code == 200, path
    assert (await client.get("/api/incidents/nope", headers=h)).status_code == 404


async def test_admin_creates_officer_with_zones_then_officer_logs_in(client):
    h = await login(client, "admin@test.in", "Admin@12345")
    z = await client.post(
        "/api/admin/zones",
        headers=h,
        json={
            "name": "Test Lane",
            "region": "West",
            "geometry": {"type": "Polygon", "coordinates": [[[72, 18], [73, 18], [73, 19], [72, 19], [72, 18]]]},
        },
    )
    assert z.status_code == 201
    zone_id = z.json()["id"]

    bad = await client.post(
        "/api/admin/users", headers=h, json={"email": "new@test.in", "name": "New", "zone_ids": ["z-missing"]}
    )
    assert bad.status_code == 400

    r = await client.post(
        "/api/admin/users",
        headers=h,
        json={"email": "new@test.in", "name": "Lt. New", "org": "ICG West", "region": "West", "zone_ids": [zone_id]},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["user"]["role"] == "officer" and body["user"]["zone_ids"] == [zone_id]
    assert body["user"]["must_change_password"] is True

    dup = await client.post("/api/admin/users", headers=h, json={"email": "new@test.in", "name": "Again"})
    assert dup.status_code == 409

    lo = await client.post("/api/auth/login", json={"email": "new@test.in", "password": body["temp_password"]})
    assert lo.status_code == 200 and lo.json()["user"]["must_change_password"] is True


async def test_admin_disables_user_and_login_fails(client):
    h = await login(client, "admin@test.in", "Admin@12345")
    users = (await client.get("/api/admin/users", headers=h)).json()
    officer = next(u for u in users if u["email"] == "officer@test.in")
    r = await client.patch(f"/api/admin/users/{officer['id']}", headers=h, json={"active": False})
    assert r.status_code == 200 and r.json()["active"] is False
    assert (
        await client.post("/api/auth/login", json={"email": "officer@test.in", "password": "Officer@12345"})
    ).status_code == 403


async def test_admin_cannot_disable_or_demote_self(client):
    h = await login(client, "admin@test.in", "Admin@12345")
    me = (await client.get("/api/auth/me", headers=h)).json()
    assert (await client.patch(f"/api/admin/users/{me['id']}", headers=h, json={"active": False})).status_code == 400
    assert (await client.patch(f"/api/admin/users/{me['id']}", headers=h, json={"role": "officer"})).status_code == 400


async def test_reset_password_forces_change(client):
    h = await login(client, "admin@test.in", "Admin@12345")
    users = (await client.get("/api/admin/users", headers=h)).json()
    officer = next(u for u in users if u["email"] == "officer@test.in")
    r = await client.post(f"/api/admin/users/{officer['id']}/reset-password", headers=h)
    assert r.status_code == 200
    lo = await client.post("/api/auth/login", json={"email": "officer@test.in", "password": r.json()["temp_password"]})
    assert lo.status_code == 200 and lo.json()["user"]["must_change_password"] is True
