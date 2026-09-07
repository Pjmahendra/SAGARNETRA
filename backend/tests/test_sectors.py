from datetime import UTC, datetime

from tests.conftest import login

ZONE = {
    "_id": "z-test",
    "name": "Test Sector",
    "region": "West",
    "geometry": {"type": "Polygon", "coordinates": [[[72.0, 18.0], [73.0, 18.0], [73.0, 19.0], [72.0, 19.0], [72.0, 18.0]]]},
    "vessels_now": 5,
}


async def _seed_sector(client) -> None:
    await client.db.watch_zones.insert_one(dict(ZONE))
    await client.db.detections.insert_one({
        "_id": "det-x", "zone_id": "z-test", "created_at": datetime(2026, 9, 1, tzinfo=UTC),
        "engine": "heuristic", "confidence": 0.5, "area_km2": 1.0, "centroid": [72.5, 18.5],
        "geometry": {"type": "Polygon", "coordinates": [[[72.4, 18.4], [72.6, 18.4], [72.6, 18.6], [72.4, 18.4]]]},
        "verification": None, "source": {"scene": "S1 test"},
    })


async def test_sectors_requires_auth(client):
    assert (await client.get("/api/sectors")).status_code == 401


async def test_sectors_list_reports_pending_and_center(client):
    await _seed_sector(client)
    h = await login(client, "officer@test.in", "Officer@12345")
    r = await client.get("/api/sectors", headers=h)
    assert r.status_code == 200
    sec = next(s for s in r.json() if s["id"] == "z-test")
    assert sec["pending"] == 1
    assert sec["center"] == [72.5, 18.5]
    assert sec["bbox"] == [72.0, 18.0, 73.0, 19.0]


async def test_sector_detail_queue_and_404(client):
    await _seed_sector(client)
    h = await login(client, "officer@test.in", "Officer@12345")
    d = await client.get("/api/sectors/z-test", headers=h)
    assert d.status_code == 200
    body = d.json()
    assert body["sector"]["name"] == "Test Sector"
    assert len(body["detections"]) == 1
    assert body["detections"][0]["verified"] is False and body["detections"][0]["has_spill"] is True
    assert (await client.get("/api/sectors/nope", headers=h)).status_code == 404
