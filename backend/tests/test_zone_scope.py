"""Sector scoping is a boundary, so it gets tests of its own.

Two officers share one database and must not see each other's water: that separation is the whole
reason the demo can show live European AIS beside the reconstructed Indian case without either
contaminating the other.
"""

from tests.conftest import login

ZONE_A = {
    "_id": "z-a", "name": "Sector A", "region": "West",
    "geometry": {"type": "Polygon", "coordinates": [[[70.0, 18.0], [71.0, 18.0], [71.0, 19.0], [70.0, 19.0], [70.0, 18.0]]]},
}
ZONE_B = {
    "_id": "z-b", "name": "Sector B", "region": "Europe",
    "geometry": {"type": "Polygon", "coordinates": [[[1.0, 50.0], [2.0, 50.0], [2.0, 51.0], [1.0, 51.0], [1.0, 50.0]]]},
}


async def _seed(client):
    await client.db.watch_zones.insert_many([dict(ZONE_A), dict(ZONE_B)])
    await client.db.vessels.insert_many([
        {"_id": "v-a", "mmsi": "1", "name": "A SHIP", "zone_id": "z-a", "source": "scenario",
         "type_group": "tanker", "flag": "IN", "imo": None, "length_m": None, "destination": None,
         "sog_kn": 1, "cog_deg": 1, "position": [70.5, 18.5], "last_seen": "2026-09-08T00:00:00Z"},
        {"_id": "v-b", "mmsi": "2", "name": "B SHIP", "zone_id": "z-b", "source": "scenario",
         "type_group": "cargo", "flag": "GB", "imo": None, "length_m": None, "destination": None,
         "sog_kn": 1, "cog_deg": 1, "position": [1.5, 50.5], "last_seen": "2026-09-08T00:00:00Z"},
    ])
    await client.db.users.update_one({"email": "officer@test.in"}, {"$set": {"zone_ids": ["z-a"]}})


async def test_officer_sees_only_their_own_sector(client):
    await _seed(client)
    h = await login(client, "officer@test.in", "Officer@12345")

    names = [z["name"] for z in (await client.get("/api/sectors", headers=h)).json()]
    assert "Sector A" in names and "Sector B" not in names

    ships = [v["name"] for v in (await client.get("/api/vessels/live", headers=h)).json()]
    assert ships == ["A SHIP"]

    zones = [z["name"] for z in (await client.get("/api/overview", headers=h)).json()["zones"]]
    assert zones == ["Sector A"]


async def test_officer_cannot_open_another_sector(client):
    await _seed(client)
    h = await login(client, "officer@test.in", "Officer@12345")
    assert (await client.get("/api/sectors/z-a", headers=h)).status_code == 200
    # 404, not 403: the endpoint must not confirm that a sector they cannot see exists.
    assert (await client.get("/api/sectors/z-b", headers=h)).status_code == 404


async def test_officer_with_no_sectors_sees_nothing(client):
    """The default that used to be inverted: an unassigned account is inert, not omniscient."""
    await _seed(client)
    await client.db.users.update_one({"email": "officer@test.in"}, {"$set": {"zone_ids": []}})
    h = await login(client, "officer@test.in", "Officer@12345")
    assert (await client.get("/api/sectors", headers=h)).json() == []
    assert (await client.get("/api/vessels/live", headers=h)).json() == []
    assert (await client.get("/api/incidents", headers=h)).json() == []


async def test_admin_sees_every_sector(client):
    await _seed(client)
    h = await login(client, "admin@test.in", "Admin@12345")
    names = [z["name"] for z in (await client.get("/api/sectors", headers=h)).json()]
    assert "Sector A" in names and "Sector B" in names
