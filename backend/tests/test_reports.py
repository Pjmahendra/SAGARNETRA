from tests.conftest import login
from tests.test_pipeline import _seed_positions_for, _seed_static


async def test_report_requires_incident(client):
    h = await login(client, "officer@test.in", "Officer@12345")
    assert (await client.post("/api/reports", headers=h, json={"incident_id": "nope"})).status_code == 404
    assert (await client.get("/api/reports/nope", headers=h)).status_code == 404


async def test_report_created_from_incident_and_listed(client, monkeypatch):
    from app.services import weather
    from app.services.weather import fallback_series

    async def fake_fetch(lat, lon, start, end, **_):
        return fallback_series(start, end)

    monkeypatch.setattr(weather, "fetch", fake_fetch)
    await _seed_static(client.db)  # type: ignore[attr-defined]
    h = await login(client, "officer@test.in", "Officer@12345")

    det = await client.post("/api/detect", headers=h, data={"sample_id": "guj-01"})
    await _seed_positions_for(client.db, det.json()["centroid"], det.json()["heading_deg"])  # type: ignore[attr-defined]
    inc = (await client.post("/api/incidents", headers=h, json={"detection_id": det.json()["detection_id"]})).json()

    r1 = await client.post("/api/reports", headers=h, json={"incident_id": inc["id"]})
    assert r1.status_code == 201, r1.text
    body = r1.json()
    assert body["incident_code"] == inc["code"] and body["revision"] == 1
    assert body["snapshot"]["top_vessel"] == inc["top_vessel"] and body["snapshot"]["hashes"]["tile_sha256"]

    r2 = await client.post("/api/reports", headers=h, json={"incident_id": inc["id"]})
    assert r2.json()["revision"] == 2, "a second export on the same incident is a new revision, not a duplicate"

    lst = await client.get("/api/reports", headers=h)
    assert lst.status_code == 200
    ids = [r["id"] for r in lst.json()]
    assert body["id"] in ids and r2.json()["id"] in ids

    got = await client.get(f"/api/reports/{body['id']}", headers=h)
    assert got.status_code == 200 and got.json()["revision"] == 1

    updated = await client.get(f"/api/incidents/{inc['id']}", headers=h)
    events = [e["type"] for e in updated.json()["events"]]
    assert events.count("report") == 2


async def test_report_requires_auth(client):
    assert (await client.get("/api/reports")).status_code == 401
    assert (await client.post("/api/reports", json={"incident_id": "x"})).status_code == 401
