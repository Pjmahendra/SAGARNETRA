"""Drift, ranking and the create-incident pipeline on the scenario positions (no network: weather is patched)."""

from collections import defaultdict
from datetime import UTC, datetime, timedelta

import pytest

from app.services import weather
from app.services.drift import backtrack
from app.services.ranking import Report, ellipse_radius, rank
from app.services.weather import fallback_series
from scripts.demo_scenario import ACQ, ORIGIN_ZONES, POSITIONS, SAMPLES, VESSELS, ZONES, build_positions
from tests.conftest import login


def test_backtrack_goes_upwind_and_grows():
    centroid = (69.426, 21.056)
    wx = fallback_series(ACQ - timedelta(hours=30), ACQ)  # wind from 225 (blows to NE), current to 45
    zones = backtrack(centroid, ACQ, wx)
    assert [z["hours_before"] for z in zones] == [6, 12, 24]
    for z in zones:
        assert z["center"][0] < centroid[0] and z["center"][1] < centroid[1], "origin must lie south-west of the slick"
        assert 30 <= z["bearing_deg"] <= 60
    assert zones[0]["semi_major_km"] < zones[1]["semi_major_km"] < zones[2]["semi_major_km"]
    # 24 h at ~1.5 km/h is roughly 30-40 km away
    d_lon = (centroid[0] - zones[2]["center"][0]) * 104
    d_lat = (centroid[1] - zones[2]["center"][1]) * 111
    assert 20 < (d_lon**2 + d_lat**2) ** 0.5 < 60


def test_ellipse_radius():
    z = {"center": [69.0, 21.0], "semi_major_km": 10, "semi_minor_km": 5, "bearing_deg": 0}
    assert ellipse_radius(69.0, 21.0, z) < 1e-6
    assert abs(ellipse_radius(69.0, 21.0 + 10 / 111.32, z) - 1.0) < 0.02  # 10 km north = major axis edge
    assert ellipse_radius(69.0 + 10 / 103.9, 21.0, z) > 1.8  # 10 km east = twice the minor axis


def _grouped():
    g = defaultdict(list)
    for p in POSITIONS:
        lon, lat = p["geometry"]["coordinates"]
        g[p["mmsi"]].append(Report(p["ts"], lon, lat, p["sog"], p["cog"], p["draft"]))
    return g


def test_ranking_puts_the_dark_tanker_first():
    statics = {v["mmsi"]: v for v in VESSELS}
    rows = rank(_grouped(), statics, ORIGIN_ZONES, ACQ, 42.0)
    assert rows, "candidates expected"
    top = rows[0]
    assert top["mmsi"] == "419001234" and top["tier"] == "prime"
    feats = {f["key"]: f for f in top["features"]}
    assert feats["gap"]["normalised"] > 0.1 and "gap" in feats["gap"]["raw"]
    assert feats["draft"]["normalised"] > 0.5
    assert feats["heading"]["normalised"] > 0.9
    assert top["behaviour"] == "dark"
    assert any(pt.get("gap") for pt in top["track"])
    names = [r["name"] for r in rows]
    assert "TUG VISHWAS" not in names or rows[-1]["tier"] == "cleared"
    assert all(rows[i]["score"] >= rows[i + 1]["score"] for i in range(len(rows) - 1))


async def _seed_static(db):
    for name, docs in {"watch_zones": ZONES, "vessels": VESSELS, "samples": SAMPLES}.items():
        await db[name].insert_many(docs)


async def _seed_positions_for(db, centroid, heading):
    """Lay the scenario tracks around the zones the (patched, fallback) weather will produce, as the real seed does."""
    wx = fallback_series(ACQ - timedelta(hours=30), ACQ)
    zones = backtrack((centroid[0], centroid[1]), ACQ, wx)
    await db.ais_positions.insert_many(build_positions(zones=zones, centroid=centroid, heading=heading, acq=ACQ))


@pytest.fixture
def no_network(monkeypatch):
    async def fake_fetch(lat, lon, start, end, **_):
        return fallback_series(start, end)

    monkeypatch.setattr(weather, "fetch", fake_fetch)


async def test_create_incident_end_to_end(client, no_network):
    await _seed_static(client.db)  # type: ignore[attr-defined]
    h = await login(client, "officer@test.in", "Officer@12345")

    det = await client.post("/api/detect", headers=h, data={"sample_id": "guj-01"})
    assert det.status_code == 200, det.text
    det_id = det.json()["detection_id"]
    assert det.json()["has_spill"]
    await _seed_positions_for(client.db, det.json()["centroid"], det.json()["heading_deg"])  # type: ignore[attr-defined]

    r = await client.post("/api/incidents", headers=h, json={"detection_id": det_id})
    assert r.status_code == 201, r.text
    inc = r.json()
    assert inc["code"] == "INC-2026-001" and inc["status"] == "investigating"
    assert inc["zone"] == "Gujarat Offshore Lane" and inc["is_demo"] is True
    assert inc["detected_at"].startswith("2026-09-06T01:12")
    assert len(inc["origin_zones"]) == 3 and inc["drift_inputs"]["weather_source"] == "fallback"
    assert inc["ranking"] and inc["ranking"][0]["mmsi"] == "419001234"
    assert inc["top_tier"] == "prime" and inc["top_vessel"] == "MT SAURASHTRA PRIDE"
    assert inc["hashes"]["tile_sha256"]
    assert len(inc["events"]) == 2

    # idempotent: creating again from the same detection returns the same incident
    again = await client.post("/api/incidents", headers=h, json={"detection_id": det_id})
    assert again.status_code == 201 and again.json()["id"] == inc["id"]

    got = await client.get(f"/api/incidents/{inc['id']}", headers=h)
    assert got.status_code == 200 and got.json()["code"] == inc["code"]
    lst = await client.get("/api/incidents", headers=h)
    assert any(i["id"] == inc["id"] for i in lst.json())

    ev = await client.post(
        f"/api/incidents/{inc['id']}/events", headers=h, json={"type": "inspection", "mmsi": "419001234"}
    )
    assert ev.status_code == 200 and ev.json()["status"] == "inspection_requested" and len(ev.json()["events"]) == 3
    bad = await client.post(f"/api/incidents/{inc['id']}/events", headers=h, json={"type": "note", "text": "  "})
    assert bad.status_code == 400

    rr = await client.post(f"/api/incidents/{inc['id']}/rerank", headers=h)
    assert rr.status_code == 200 and rr.json()["ranking"][0]["mmsi"] == "419001234"

    tracks = await client.get(f"/api/incidents/{inc['id']}/tracks", headers=h)
    assert tracks.status_code == 200 and tracks.json()[0]["track"]


async def test_create_incident_rejects_lookalike_and_missing(client, no_network):
    await _seed_static(client.db)  # type: ignore[attr-defined]
    h = await login(client, "officer@test.in", "Officer@12345")
    assert (await client.post("/api/incidents", headers=h, json={"detection_id": "nope"})).status_code == 404
    det = await client.post("/api/detect", headers=h, data={"sample_id": "guj-01"})
    det_id = det.json()["detection_id"]
    await client.post(f"/api/detect/{det_id}/verify", headers=h, json={"decision": "lookalike", "reason": "rain_cell"})
    assert (await client.post("/api/incidents", headers=h, json={"detection_id": det_id})).status_code == 409


def test_positions_have_a_real_gap_for_the_tanker():
    ts = sorted(p["ts"] for p in POSITIONS if p["mmsi"] == "419001234")
    gaps = [(b - a).total_seconds() / 60 for a, b in zip(ts, ts[1:], strict=False)]
    assert max(gaps) >= 40 and sum(1 for g in gaps if g > 20) == 1
    assert all(t.tzinfo is not None and t.utcoffset() == datetime.now(UTC).utcoffset() for t in ts[:3])
