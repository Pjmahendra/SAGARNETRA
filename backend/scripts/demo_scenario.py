"""The demo incident: Gujarat offshore lane, 6 Sep 2026. Mirrors web/src/lib/mock/data.ts so both modes agree.

Tracks and ranking here are a generated scenario (decision 2026-09-07); the incident is flagged is_demo=True.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta

from shapely.geometry import Point, shape

ACQ = datetime(2026, 9, 6, 1, 12, tzinfo=UTC)
#: The instant the reconstructed scenario is frozen at. Scenario vessels report just before it, so
#: the fleet reads as one coherent moment rather than ships scattered across arbitrary dates.
SCENARIO_NOW = datetime(2026, 9, 7, 5, 58, tzinfo=UTC)


def hb(h: float) -> datetime:
    return ACQ - timedelta(hours=h)


WEIGHTS = {
    "spatial": 25,
    "temporal": 15,
    "gap": 20,
    "heading": 10,
    "manoeuvre": 10,
    "draft": 8,
    "type": 8,
    "history": 4,
}
LABELS = {
    "spatial": "Spatial fit",
    "temporal": "Temporal fit",
    "gap": "AIS gap",
    "heading": "Heading match",
    "manoeuvre": "Manoeuvre",
    "draft": "Draft change",
    "type": "Type prior",
    "history": "History",
}


def features(f: dict[str, tuple[float, str]]) -> dict:
    rows = [
        {
            "key": k,
            "label": LABELS[k],
            "raw": f[k][1],
            "normalised": f[k][0],
            "weight": WEIGHTS[k],
            "contribution": round(f[k][0] * WEIGHTS[k], 1),
        }
        for k in WEIGHTS
    ]
    score = round(sum(r["contribution"] for r in rows))
    tier = "prime" if score >= 65 else "poi" if score >= 35 else "cleared"
    return {"features": rows, "score": score, "tier": tier}


def line(a, b, n, t0=24.0, t1=0.0):
    return [
        {
            "t": hb(t0 - (t0 - t1) * i / (n - 1)),
            "p": [a[0] + (b[0] - a[0]) * i / (n - 1), a[1] + (b[1] - a[1]) * i / (n - 1)],
        }
        for i in range(n)
    ]


SLICK_POLYGON = [
    [69.395, 21.072],
    [69.412, 21.081],
    [69.431, 21.079],
    [69.448, 21.068],
    [69.456, 21.052],
    [69.449, 21.037],
    [69.432, 21.031],
    [69.415, 21.036],
    [69.402, 21.049],
    [69.395, 21.072],
]
SLICK_CENTROID = [69.426, 21.056]
ORIGIN_ZONES = [
    {"hours_before": 6, "center": [69.335, 20.985], "semi_major_km": 3.0, "semi_minor_km": 1.8, "bearing_deg": 42},
    {"hours_before": 12, "center": [69.245, 20.912], "semi_major_km": 6.0, "semi_minor_km": 3.6, "bearing_deg": 42},
    {"hours_before": 24, "center": [69.062, 20.775], "semi_major_km": 12.0, "semi_minor_km": 7.2, "bearing_deg": 42},
]

# ---- Watch zones (sectors) -----------------------------------------------------------------------
# The Indian sectors follow the real Indian Coast Guard command structure: five regions
# (North-West, West, East, North-East, Andaman & Nicobar) subdivided into district-sized patrol
# sectors, together covering the whole mainland coast plus both island territories. Three boxes
# for a 7,500 km coastline was a demo prop; this is a plan an officer could recognise.
#
# Two hard rules, both load-bearing:
#   * Sectors must not overlap. A detection is filed under the *first* zone whose outline contains
#     it (`sectors.zone_for_point`), so an overlap would make that assignment arbitrary. The boxes
#     below share edges but never interiors, and `python -m scripts.check_sectors` proves it.
#   * `traffic` is the scenario AIS population laid down in that sector, set from the real relative
#     busyness of the water — Mumbai and Kandla carry India's container and crude traffic, the
#     Lakshadweep Sea and the Nicobars genuinely do not. A quiet sector reading 5 vessels is a true
#     statement about quiet water, not missing data.
#
# `last_scene_at` is deliberately absent for most sectors: Sentinel-1's revisit means only a few
# sectors have a recent scene at any moment, and the console says so rather than implying
# nationwide simultaneous coverage.
def _box(w, s, e, n):
    return {"type": "Polygon", "coordinates": [[[w, s], [e, s], [e, n], [w, n], [w, s]]]}


#: (id, name, region, west, south, east, north, scenario vessel population)
_SECTOR_TABLE = [
    # North-West Region — HQ Gandhinagar. India's crude and container gateway.
    ("z-kut", "Gulf of Kutch — Kandla & Mundra", "North-West", 68.2, 22.0, 70.4, 23.4, 34),
    ("z-guj", "Gujarat Offshore Lane", "North-West", 68.2, 20.4, 70.4, 22.0, 22),
    ("z-bmh", "Bombay High Oilfield", "North-West", 70.4, 19.0, 72.2, 20.6, 18),
    # West Region — HQ Mumbai.
    ("z-mum", "Mumbai Approaches", "West", 72.2, 18.4, 73.1, 19.3, 46),
    ("z-rat", "Ratnagiri–Vengurla", "West", 72.4, 16.0, 73.6, 18.4, 9),
    ("z-goa", "Goa–Karwar Offshore", "West", 72.6, 14.4, 74.0, 16.0, 14),
    ("z-mng", "Mangaluru–Malpe", "West", 73.4, 12.8, 74.9, 14.4, 12),
    ("z-koc", "Kochi–Kozhikode", "West", 74.4, 9.4, 76.3, 12.8, 19),
    ("z-lak", "Lakshadweep Sea", "West", 71.0, 8.0, 74.4, 12.6, 5),
    # East Region — HQ Chennai.
    ("z-cmn", "Cape Comorin & Gulf of Mannar", "East", 76.4, 7.6, 79.0, 9.6, 11),
    ("z-cor", "Palk Bay–Coromandel", "East", 79.0, 9.6, 80.6, 12.0, 8),
    # Chennai–Ennore turns out to have real AISStream receiver coverage — 25 ships recorded, ~17
    # heard in any two-hour window. DECISIONS 2026-09-08 said Indian coverage was ~zero; that was
    # measured over the Gulf of Kutch only and is wrong for the east coast. So this sector is
    # seeded with NO scenario traffic: its vessels are real live Indian AIS, which is worth far
    # more to the pitch than 27 invented hulls, and mixing the two in one sector would waste it.
    ("z-che", "Chennai–Ennore", "East", 80.2, 12.8, 80.9, 13.6, 0),
    ("z-vsk", "Kakinada–Visakhapatnam", "East", 81.6, 14.0, 84.2, 18.2, 21),
    # North-East Region — HQ Kolkata.
    ("z-par", "Paradip–Dhamra", "North-East", 84.2, 18.2, 87.4, 21.0, 16),
    ("z-snd", "Sandheads & Haldia Approaches", "North-East", 87.4, 20.4, 89.2, 21.8, 13),
    # Andaman & Nicobar Region — HQ Port Blair. The Great Channel carries Malacca-bound traffic.
    ("z-and", "Andaman & Nicobar Sea", "A&N", 91.0, 6.0, 94.5, 14.0, 6),
]

#: Sectors with a recent SAR scene. Everything else honestly reports no scene yet.
_LAST_SCENE = {
    "z-guj": ACQ,
    "z-kut": datetime(2026, 9, 5, 1, 0, tzinfo=UTC),
    "z-mum": datetime(2026, 9, 4, 1, 5, tzinfo=UTC),
    "z-che": datetime(2026, 9, 5, 0, 31, tzinfo=UTC),
    "z-vsk": datetime(2026, 9, 6, 0, 28, tzinfo=UTC),
    "z-koc": datetime(2026, 9, 6, 1, 22, tzinfo=UTC),
    "z-par": datetime(2026, 9, 3, 0, 25, tzinfo=UTC),
    "z-bmh": datetime(2026, 9, 4, 1, 8, tzinfo=UTC),
}

ZONES = [
    {
        "_id": zid,
        "name": name,
        "region": region,
        "last_scene_at": _LAST_SCENE.get(zid),
        "traffic": traffic,
        "geometry": _box(w, s, e, n),
    }
    for zid, name, region, w, s, e, n, traffic in _SECTOR_TABLE
] + [
    {
        # The live-AIS zone. AISStream's free feed is community shore receivers, which are dense
        # here and absent off India (see DECISIONS 2026-09-08), so this is the only watch zone
        # where `scripts.ais_collector` actually records real vessels. It is also a genuine
        # oil-discharge enforcement area: Bonn Agreement aerial surveillance covers exactly this
        # water. Kept as a separate zone with its own officer so real live traffic is never mixed
        # into the Indian sectors, which run on the reconstructed scenario.
        # Deliberately the Dover Strait rather than the whole North Sea: the busiest shipping lane
        # in the world, dense enough to be convincing and small enough that "vessels in my sector"
        # stays a number an officer could actually work through. A basin-sized box returned 5,600
        # ships, which is a database dump, not a sector.
        "_id": "z-nsc",
        "name": "Dover Strait",
        "region": "Europe",
        "last_scene_at": datetime(2026, 9, 7, 5, 42, tzinfo=UTC),
        "traffic": 0,  # never seeded: this sector's vessels are the real ones off the recorder
        "geometry": _box(0.5, 50.3, 2.6, 51.5),
    }
]

# ---- The two data sources, kept in separate hands -------------------------------------------------
# The platform runs on two kinds of AIS and the demo turns on never letting them blur. So the split
# is drawn by *data source*, not by geography, and it decides sector ownership:
#
#   LIVE      Chennai–Ennore and the Dover Strait. Real AISStream receiver coverage, recorded by
#             scripts/ais_collector. Never seeded — every ship in these two sectors is a real
#             report from a real hull. Held by the live-feed watch officer.
#   SCENARIO  The other fifteen Indian sectors. Vessels are the reconstruction we generated, all
#             stamped source:"scenario" and badged "demo" in the UI. Held by the Indian officer.
#
# One officer per source means an account can never show both at once, so nothing on screen during
# either demo is a mixture — you log in and everything you are looking at has one provenance.
LIVE_ZONE_IDS = ["z-che", "z-nsc"]
SCENARIO_ZONE_IDS = [z["_id"] for z in ZONES if z["_id"] not in LIVE_ZONE_IDS]


def _rank(v: dict, f: dict) -> dict:
    return {**v, **features(f)}


RANKING = sorted(
    [
        _rank(
            {
                "mmsi": "419001234",
                "name": "MT SAURASHTRA PRIDE",
                "type_group": "tanker",
                "flag": "IN",
                "behaviour": "dark",
                "track": line([68.82, 20.58], [69.18, 20.86], 4, 24, 13)
                + [
                    {"t": hb(12.6), "p": [69.205, 20.882], "gap": True},
                    {"t": hb(11.9), "p": [69.29, 20.945], "gap": True},
                ]
                + line([69.31, 20.96], [69.86, 21.38], 4, 11.5, 0),
            },
            {
                "spatial": (0.94, "0.4 km from t-12h zone centre"),
                "temporal": (0.85, "51 min inside zone"),
                "gap": (0.78, "42 min transponder gap at 12:36Z"),
                "heading": (0.91, "course 041° vs slick axis 042°"),
                "manoeuvre": (0.70, "speed 11.8 → 6.1 kn"),
                "draft": (0.75, "draft 12.4 → 11.6 m"),
                "type": (1.0, "tanker"),
                "history": (0.0, "no prior incidents"),
            },
        ),
        _rank(
            {
                "mmsi": "419002345",
                "name": "MV KONKAN TRADER",
                "type_group": "cargo",
                "flag": "IN",
                "behaviour": "transiting",
                "track": line([68.95, 20.72], [69.75, 21.30], 7),
            },
            {
                "spatial": (0.62, "2.1 km from t-12h zone edge"),
                "temporal": (0.55, "33 min inside zone"),
                "gap": (0.0, "no gap"),
                "heading": (0.88, "course 044° vs 042°"),
                "manoeuvre": (0.1, "steady 13.2 kn"),
                "draft": (0.0, "not reported"),
                "type": (0.7, "cargo"),
                "history": (0.0, "none"),
            },
        ),
        _rank(
            {
                "mmsi": "470003456",
                "name": "MT GULF ASTER",
                "type_group": "tanker",
                "flag": "AE",
                "behaviour": "transiting",
                "track": line([69.60, 20.60], [69.05, 21.10], 7),
            },
            {
                "spatial": (0.48, "4.8 km from t-24h zone edge"),
                "temporal": (0.30, "18 min inside zone"),
                "gap": (0.0, "no gap"),
                "heading": (0.12, "course 318° vs 042°"),
                "manoeuvre": (0.0, "steady 12.4 kn"),
                "draft": (0.0, "draft constant 9.8 m"),
                "type": (1.0, "tanker"),
                "history": (0.0, "none"),
            },
        ),
        _rank(
            {
                "mmsi": "563004567",
                "name": "MV OCEAN HARMONY",
                "type_group": "cargo",
                "flag": "SG",
                "behaviour": "transiting",
                "track": line([68.70, 21.05], [69.70, 21.55], 7),
            },
            {
                "spatial": (0.30, "9.5 km from nearest zone"),
                "temporal": (0.0, "never inside"),
                "gap": (0.0, "no gap"),
                "heading": (0.55, "course 062°"),
                "manoeuvre": (0.0, "steady"),
                "draft": (0.0, "not reported"),
                "type": (0.7, "cargo"),
                "history": (0.0, "none"),
            },
        ),
        _rank(
            {
                "mmsi": "636006789",
                "name": "MV MERIDIAN STAR",
                "type_group": "cargo",
                "flag": "LR",
                "behaviour": "transiting",
                "track": line([69.90, 20.70], [69.10, 20.55], 7),
            },
            {
                "spatial": (0.22, "12 km from t-24h zone"),
                "temporal": (0.0, "never inside"),
                "gap": (0.0, "no gap"),
                "heading": (0.05, "course 262°"),
                "manoeuvre": (0.0, "steady"),
                "draft": (0.0, "not reported"),
                "type": (0.7, "cargo"),
                "history": (0.0, "none"),
            },
        ),
        _rank(
            {
                "mmsi": "419005678",
                "name": "FV JAL SHAKTI",
                "type_group": "fishing",
                "flag": "IN",
                "behaviour": "loitering",
                "track": line([69.30, 21.15], [69.36, 21.19], 7),
            },
            {
                "spatial": (0.35, "7.2 km from t-6h zone"),
                "temporal": (0.0, "never inside"),
                "gap": (0.15, "24 min gap (class B)"),
                "heading": (0.2, "variable"),
                "manoeuvre": (0.4, "loitering 1.3 kn"),
                "draft": (0.0, "n/a"),
                "type": (0.2, "fishing"),
                "history": (0.0, "none"),
            },
        ),
        _rank(
            {
                "mmsi": "419008901",
                "name": "MV SAGAR RANI",
                "type_group": "passenger",
                "flag": "IN",
                "behaviour": "transiting",
                "track": line([69.05, 21.30], [69.95, 21.60], 7),
            },
            {
                "spatial": (0.12, "18 km from nearest zone"),
                "temporal": (0.0, "never inside"),
                "gap": (0.0, "no gap"),
                "heading": (0.3, "course 070°"),
                "manoeuvre": (0.0, "steady 17 kn"),
                "draft": (0.0, "n/a"),
                "type": (0.4, "passenger"),
                "history": (0.0, "none"),
            },
        ),
        _rank(
            {
                "mmsi": "419007890",
                "name": "TUG VISHWAS",
                "type_group": "tug",
                "flag": "IN",
                "behaviour": "anchored",
                "track": line([69.62, 21.22], [69.62, 21.22], 7),
            },
            {
                "spatial": (0.05, "26 km from nearest zone"),
                "temporal": (0.0, "never inside"),
                "gap": (0.0, "no gap"),
                "heading": (0.0, "anchored"),
                "manoeuvre": (0.0, "anchored"),
                "draft": (0.0, "n/a"),
                "type": (0.3, "tug"),
                "history": (0.0, "none"),
            },
        ),
    ],
    key=lambda r: -r["score"],
)

INCIDENT_DEMO_HAND_AUTHORED = {
    "_id": "inc-041",
    "code": "INC-2026-041",
    "status": "investigating",
    "zone": "Gujarat Offshore Lane",
    "zone_id": "z-guj",
    "detected_at": ACQ,
    "area_km2": 4.21,
    "confidence": 0.91,
    "engine": "unet",
    "centroid": SLICK_CENTROID,
    "top_tier": RANKING[0]["tier"],
    "top_vessel": RANKING[0]["name"],
    "assigned_to": "Lt. A. Menon",
    "is_demo": True,
    "scene": "S1A_IW_GRDH_1SDV_20260906T011203_20260906T011228_060412_078A1C_5D2E",
    "polygon": SLICK_POLYGON,
    "heading_deg": 42,
    "origin_zones": ORIGIN_ZONES,
    "drift_inputs": {
        "wind_kn": 14.2,
        "wind_dir_deg": 225,
        "current_kn": 0.6,
        "current_dir_deg": 40,
        "source": "Open-Meteo Marine + Forecast, hourly, 2026-09-05T00Z to 2026-09-06T02Z",
    },
    "ranking": RANKING,
    "events": [
        {
            "at": datetime(2026, 9, 6, 4, 2, tzinfo=UTC),
            "who": "system",
            "type": "detected",
            "text": "Slick detected by U-Net on tile 3 of scene 5D2E. Confidence 0.91.",
        },
        {
            "at": datetime(2026, 9, 6, 5, 41, tzinfo=UTC),
            "who": "Lt. A. Menon",
            "type": "status",
            "text": "Opened investigation. Drift and ranking computed.",
        },
        {
            "at": datetime(2026, 9, 6, 6, 10, tzinfo=UTC),
            "who": "Lt. A. Menon",
            "type": "note",
            "text": "Tanker gap coincides with t-12h zone. Requesting AIS static data from Kandla VTS.",
        },
    ],
    "hashes": {
        "tile_sha256": "9f2c1e7a44b0d3e1c5a8f6b2d9e0c7a1b3f4d5e6a7b8c9d0e1f2a3b4c5d6e7f8",
        "mask_sha256": "4b1d9e0c7a1b3f4d5e6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e",
    },
    "created_at": datetime(2026, 9, 6, 5, 41, tzinfo=UTC),
}

INCIDENTS = [
    {
        "_id": "inc-040",
        "code": "INC-2026-040",
        "status": "closed",
        "zone": "Mumbai Approaches",
        "zone_id": "z-mum",
        "detected_at": datetime(2026, 8, 29, 1, 5, tzinfo=UTC),
        "area_km2": 1.37,
        "confidence": 0.64,
        "engine": "heuristic",
        "centroid": [72.61, 18.84],
        "top_tier": "poi",
        "top_vessel": "MV WESTERN GLORY",
        "assigned_to": "Lt. A. Menon",
        "is_demo": True,
        "scene": "S1A_IW_GRDH_1SDV_20260829T010512_20260829T010537_060295_0785F1_4F91",
        "polygon": [],
        "heading_deg": 110,
        "origin_zones": [],
        "drift_inputs": {},
        "ranking": [],
        "events": [],
        "hashes": {},
        "created_at": datetime(2026, 8, 29, 3, 0, tzinfo=UTC),
    },
    {
        "_id": "inc-039",
        "code": "INC-2026-039",
        "status": "detected",
        "zone": "Chennai–Ennore",
        "zone_id": "z-che",
        "detected_at": datetime(2026, 8, 24, 0, 31, tzinfo=UTC),
        "area_km2": 0.58,
        "confidence": 0.77,
        "engine": "unet",
        "centroid": [80.42, 13.21],
        "top_tier": None,
        "top_vessel": None,
        "assigned_to": None,
        "is_demo": True,
        "scene": "S1A_IW_GRDH_1SDV_20260824T003101_20260824T003126_060222_078320_3B27",
        "polygon": [],
        "heading_deg": 75,
        "origin_zones": [],
        "drift_inputs": {},
        "ranking": [],
        "events": [],
        "hashes": {},
        "created_at": datetime(2026, 8, 24, 2, 0, tzinfo=UTC),
    },
]

def slick_polygon(centroid, area_km2, heading_deg, *, ratio=5.5, n=30, seed=0):
    """A plausible slick outline around a centroid, with exactly the stated area.

    The recorded spills are catalogue entries: a position, an area and a long-axis bearing, with no
    stored mask. Without an outline the map can only draw a dot, which reads as "nothing detected"
    rather than "a 0.7 km² slick". So the outline is derived from the numbers the record does carry
    — a bilge discharge is long and thin, hence the 5.5:1 default — and then scaled so the drawn
    polygon's area equals `area_km2` exactly. Nothing is invented that the record does not state,
    and the shape is deterministic in `seed`, so re-seeding never moves it.
    """
    lon0, lat0 = centroid
    b = math.sqrt(area_km2 / (math.pi * ratio))  # semi-minor axis, km
    a = ratio * b
    th = math.radians(heading_deg or 0)

    # Ellipse in (along-axis, across-axis) km, gently rippled so it does not read as clip art.
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        wob = 1 + 0.13 * math.sin(3 * t + seed) + 0.06 * math.sin(5 * t + 2 * seed)
        pts.append((a * math.cos(t) * wob, b * math.sin(t) * wob))

    # Rescale to the stated area: the ripple changes it, and the number on screen must be the truth.
    shoelace = abs(sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))) / 2
    k = math.sqrt(area_km2 / shoelace) if shoelace else 1.0

    km_per_deg_lat = 110.574
    km_per_deg_lon = 111.320 * math.cos(math.radians(lat0))
    ring = []
    for along, across in pts:
        north = k * (along * math.cos(th) - across * math.sin(th))
        east = k * (along * math.sin(th) + across * math.cos(th))
        ring.append([round(lon0 + east / km_per_deg_lon, 6), round(lat0 + north / km_per_deg_lat, 6)])
    ring.append(ring[0])
    return ring


def _demo_inc(_id, code, status, zone, zone_id, dt, area, conf, engine, centroid, top_tier=None, top_vessel=None):
    """A lightweight recorded spill for a region (no ranking/geometry). 'detected' ones are unconfirmed and route to
    the console; the rest are confirmed cases. Centroids sit inside the region's sample tile so a detected one
    deep-links onto its scene."""
    # A stable per-incident heading and ripple, derived from the id so they never shift between seeds.
    n = int(_id[-2:])
    heading = (n * 37) % 180
    return {
        "_id": _id, "code": code, "status": status, "zone": zone, "zone_id": zone_id,
        "detected_at": dt, "area_km2": area, "confidence": conf, "engine": engine, "centroid": centroid,
        "top_tier": top_tier, "top_vessel": top_vessel, "assigned_to": None, "is_demo": True,
        "scene": "S1A_IW_GRDH · Sentinel-1",
        "heading_deg": heading,
        "polygon": slick_polygon(centroid, area, heading, seed=n % 7),
        "origin_zones": [], "drift_inputs": {}, "ranking": [], "events": [], "hashes": {}, "created_at": dt,
    }


# More recorded spills per region, so each watch zone has a queue to work from the (synthetic) satellite database.
INCIDENTS += [
    _demo_inc("inc-036", "INC-2026-036", "detected", "Gujarat Offshore Lane", "z-guj", datetime(2026, 9, 3, 1, 20, tzinfo=UTC), 1.8, 0.71, "unet", [69.42, 21.06]),
    _demo_inc("inc-035", "INC-2026-035", "investigating", "Gujarat Offshore Lane", "z-guj", datetime(2026, 9, 1, 1, 15, tzinfo=UTC), 3.1, 0.79, "unet", [69.50, 21.10], "poi", "MV KATHIAWAR"),
    _demo_inc("inc-034", "INC-2026-034", "closed", "Gujarat Offshore Lane", "z-guj", datetime(2026, 8, 20, 1, 10, tzinfo=UTC), 0.9, 0.63, "heuristic", [69.35, 20.98]),
    _demo_inc("inc-033", "INC-2026-033", "detected", "Mumbai Approaches", "z-mum", datetime(2026, 9, 2, 1, 5, tzinfo=UTC), 0.9, 0.66, "unet", [72.60, 18.85]),
    _demo_inc("inc-032", "INC-2026-032", "investigating", "Mumbai Approaches", "z-mum", datetime(2026, 8, 27, 1, 0, tzinfo=UTC), 2.2, 0.74, "unet", [72.65, 18.90], "poi", "MT ARABIAN DAWN"),
    _demo_inc("inc-031", "INC-2026-031", "detected", "Chennai–Ennore", "z-che", datetime(2026, 9, 4, 0, 40, tzinfo=UTC), 0.7, 0.77, "unet", [80.42, 13.20]),
    _demo_inc("inc-030", "INC-2026-030", "closed", "Chennai–Ennore", "z-che", datetime(2026, 8, 18, 0, 35, tzinfo=UTC), 1.1, 0.60, "heuristic", [80.45, 13.25], "poi", "MV CORO STAR"),
]

# The two hand-written records above predate slick_polygon and carried an area with no outline, so
# they drew on the map as a bare dot — which reads as "nothing found" next to a stated 1.37 km².
# Every recorded spill now has an outline matching its own area.
for _inc in INCIDENTS:
    if not _inc.get("polygon"):
        _n = int(_inc["_id"][-2:])
        _inc["polygon"] = slick_polygon(
            _inc["centroid"], _inc["area_km2"], _inc.get("heading_deg") or (_n * 37) % 180, seed=_n % 7
        )

_DEST = ["INMUN", "INKDL", "AEJEA", "SGSIN", None, "INPBD", "INOKH", None]
VESSELS = [
    {
        "_id": f"v-{r['mmsi']}",
        "mmsi": r["mmsi"],
        "imo": None if r["type_group"] == "fishing" else str(9_300_000 + i * 1571),
        "name": r["name"],
        "type_group": r["type_group"],
        "flag": r["flag"],
        "length_m": 18 if r["type_group"] == "fishing" else 32 if r["type_group"] == "tug" else 180 + i * 11,
        "destination": _DEST[i],
        "sog_kn": 0 if r["behaviour"] == "anchored" else 1.3 if r["behaviour"] == "loitering" else 11 + i,
        "cog_deg": [41, 44, 318, 62, 262, 95, 70, 0][i],
        "position": r["track"][-1]["p"],
        "last_seen": datetime(2026, 9, 7, 5, 58, tzinfo=UTC),
    }
    for i, r in enumerate(RANKING)
]


# ---- Background sector traffic -------------------------------------------------------------------
# The eight vessels above are the *case*: hand-authored, individually reasoned, the ones the ranking
# argues about. They are not the sea. Without a background population every sector outside Gujarat
# reads "0 vessels", which is not a quiet sector — it is an empty database, and an officer can tell
# the difference at a glance.
#
# So each Indian sector gets a scenario population sized to its real busyness (see `traffic` in
# _SECTOR_TABLE). These are labelled `source: "scenario"` exactly like the case vessels and are
# deterministic — same seed, same fleet, every run — so a number quoted in the pitch stays true.
# The Dover Strait is excluded on purpose: that sector's ships come off the live recorder, and
# mixing one invented hull into real AIS would poison the only genuinely real dataset we have.

#: Flags weighted to what actually transits the Indian EEZ, with the MID that MMSI encodes.
_FLEET_FLAGS = [
    ("IN", "419"), ("IN", "419"), ("IN", "419"), ("PA", "351"), ("LR", "636"),
    ("MH", "538"), ("SG", "563"), ("AE", "470"), ("HK", "477"), ("MT", "249"),
]
_FLEET_TYPES = [
    ("cargo", 0.34), ("tanker", 0.24), ("fishing", 0.22),
    ("container", 0.12), ("tug", 0.05), ("passenger", 0.03),
]
_HULL_A = ["MAITRI", "SAGAR", "KAVERI", "ASIAN", "OCEAN", "GULF", "PACIFIC", "STAR", "NORDIC",
           "ORIENT", "DESH", "JAG", "CORAL", "MONSOON", "SILVER", "GOLDEN", "BLUE", "GREAT"]
_HULL_B = ["PIONEER", "TRADER", "VOYAGER", "SPIRIT", "GLORY", "HORIZON", "MARINER", "EXPRESS",
           "PRIDE", "BREEZE", "CHAMPION", "HARMONY", "VENTURE", "LEADER", "PROSPER", "DAWN"]
_PORTS = ["INBOM", "INKDL", "INMUN", "INCOK", "INMAA", "INVTZ", "INPRT", "INHAL", "INTUT",
          "AEJEA", "SGSIN", "LKCMB", "OMSOH", None]


def _pick(seq, n: int):
    """Deterministic choice. A plain modulo over a hash keeps every run identical without a global RNG."""
    return seq[n % len(seq)]


def _weighted_type(n: int) -> str:
    x = (n % 1000) / 1000.0
    acc = 0.0
    for name, w in _FLEET_TYPES:
        acc += w
        if x < acc:
            return name
    return "cargo"


def _traffic_vessels() -> list[dict]:
    """Scenario AIS population for every Indian sector, sized by that sector's real traffic."""
    docs: list[dict] = []
    seq = 0
    for z in ZONES:
        n_ships = z.get("traffic") or 0
        if not n_ships:
            continue
        w, s, e, n = _bbox_of(z["geometry"])
        # A lane bearing per sector: ships in a shipping lane are not scattered at random headings.
        lane = (sum(ord(c) for c in z["_id"]) * 37) % 360
        for _ in range(n_ships):
            seq += 1
            h = seq * 2654435761 % 1_000_003  # Knuth multiplicative; spreads consecutive ships apart
            flag, mid = _pick(_FLEET_FLAGS, h)
            kind = _weighted_type(h // 7)
            # Fishing boats hug the coast and wander; traders hold the lane.
            wander = 40 if kind == "fishing" else 8
            lon = round(w + (e - w) * ((h % 977) / 977.0) * 0.92 + (e - w) * 0.04, 4)
            lat = round(s + (n - s) * (((h // 977) % 983) / 983.0) * 0.92 + (n - s) * 0.04, 4)
            moving = kind != "tug" or h % 3
            docs.append({
                "_id": f"v-{mid}{400000 + seq:06d}",
                "mmsi": f"{mid}{400000 + seq:06d}",
                "imo": None if kind == "fishing" else str(9_100_000 + seq * 37),
                "name": f"{'MT' if kind == 'tanker' else 'MV'} {_pick(_HULL_A, h)} {_pick(_HULL_B, h // 13)}",
                "type_group": kind,
                "flag": flag,
                "length_m": {"fishing": 16 + h % 12, "tug": 28 + h % 8, "tanker": 145 + h % 130,
                             "container": 190 + h % 140, "passenger": 90 + h % 60}.get(kind, 110 + h % 90),
                "destination": _pick(_PORTS, h // 31),
                "sog_kn": 0.0 if not moving else round(2.0 + (h % 130) / 10.0, 1),
                "cog_deg": (lane + (h % (2 * wander)) - wander) % 360,
                "position": [lon, lat],
                "zone_id": z["_id"],
                # Staggered across the last two hours so the list is not one implausible instant.
                "last_seen": SCENARIO_NOW - timedelta(minutes=h % 115),
                "source": "scenario",
            })
    return docs


def _bbox_of(geometry: dict) -> tuple[float, float, float, float]:
    ring = geometry["coordinates"][0]
    lons = [c[0] for c in ring]
    lats = [c[1] for c in ring]
    return min(lons), min(lats), max(lons), max(lats)


#: Background fleet, ~270 ships across the 16 Indian sectors. Built once at import.
TRAFFIC_VESSELS = _traffic_vessels()

SAMPLES = [
    {
        "_id": "guj-01",
        "label": "Gujarat lane, 6 Sep 01:12Z",
        "scene": "S1A_IW_GRDH 5D2E · tile 3",
        "acquired_at": ACQ,
        "bbox": [69.30, 20.95, 69.55, 21.15],
        "image_url": "/sar/guj-01.png",
        "synthetic": False,  # real Sentinel-1 tile (Deep-SAR test set); positioned in the zone as scenario
    },
    {
        "_id": "mum-02",
        "label": "Mumbai approaches, 29 Aug",
        "scene": "S1A_IW_GRDH 4F91 · tile 7",
        "acquired_at": datetime(2026, 8, 29, 1, 5, tzinfo=UTC),
        "bbox": [72.50, 18.75, 72.75, 18.95],
        "image_url": "/sar/mum-02.png",
        "synthetic": False,  # real Sentinel-1 tile (Deep-SAR test set); positioned in the zone as scenario
    },
    {
        "_id": "che-03",
        "label": "Chennai–Ennore, 24 Aug",
        "scene": "S1A_IW_GRDH 3B27 · tile 2",
        "acquired_at": datetime(2026, 8, 24, 0, 31, tzinfo=UTC),
        "bbox": [80.30, 13.10, 80.55, 13.30],
        "image_url": "/sar/che-03.png",
        "synthetic": False,  # real Sentinel-1 tile (Deep-SAR test set); positioned in the zone as scenario
    },
    {
        "_id": "kut-04",
        "label": "Gulf of Kutch, clean sea",
        "scene": "S1A_IW_GRDH 5C11 · tile 1",
        "acquired_at": datetime(2026, 9, 5, 1, 0, tzinfo=UTC),
        "bbox": [68.90, 22.40, 69.15, 22.60],
        "image_url": "/sar/kut-04.png",
        "synthetic": False,  # real Sentinel-1 tile (Deep-SAR test set); positioned in the zone as scenario
    },
    # ---- Dover Strait -----------------------------------------------------------------------
    # These two exist so the live-AIS officer has a sector to *work*, not just a vessel list.
    # `acquired_at` is set by the seed to sit at the end of the actual AIS recording, because the
    # whole point of a Dover case is that the backtrack runs against real recorded tracks: a
    # hardcoded date would fall outside the recording and rank nobody.
    {
        "_id": "dov-05",
        "label": "Dover Strait, northbound lane",
        "scene": "S1A_IW_GRDH 7A44 · tile 5",
        "acquired_at": None,
        "bbox": [1.40, 50.90, 1.65, 51.10],
        "image_url": "/sar/dov-05.png",
        "synthetic": True,
    },
    {
        "_id": "dov-06",
        "label": "Belgian approach, clean sea",
        "scene": "S1A_IW_GRDH 7A44 · tile 9",
        "acquired_at": None,
        "bbox": [1.90, 51.20, 2.15, 51.40],
        "image_url": "/sar/dov-06.png",
        "synthetic": True,
    },
]

#: Tiles whose acquisition time the seed pins to the live AIS recording rather than a fixed date.
LIVE_SAMPLE_IDS = ["dov-05", "dov-06"]
#: The Dover case: confirmed, promoted to an incident, ranked against real vessels.
DOVER_SAMPLE = "dov-05"

# File each sample tile under the sector its footprint sits in, so the detection console can show
# an officer the scenes for their own region instead of every tile in the country.
for _s in SAMPLES:
    _w, _s_lat, _e, _n = _s["bbox"]
    _c = Point((_w + _e) / 2, (_s_lat + _n) / 2)
    _s["zone_id"] = next((z["_id"] for z in ZONES if shape(z["geometry"]).contains(_c)), None)

#: Reports are no longer hand-authored fixtures: the seed exports a real one from the real demo
#: incident through app.services.reports, so a seeded pack and an officer-made pack are identical.
REPORTS: list[dict] = []


# ---- AIS position reports (source="scenario") ----------------------------------------------------------------
# Tracks are laid out RELATIVE to origin zones, so the guilty tanker really crosses the t-12h zone whichever way the
# weather on the day pushes the drift. The seed calls build_positions() with zones computed by the real drift service;
# tests call it with the hand-authored ORIGIN_ZONES above.

KM_PER_DEG_LAT = 111.32


def _kmdeg_lon(lat):
    return KM_PER_DEG_LAT * math.cos(math.radians(lat))


def _offset(p, east_km, north_km):
    return [p[0] + east_km / _kmdeg_lon(p[1]), p[1] + north_km / KM_PER_DEG_LAT]


def _along(p, bearing_deg, km):
    b = math.radians(bearing_deg)
    return _offset(p, km * math.sin(b), km * math.cos(b))


ROLES = {
    # mmsi: (through-point rule, time offset hours before ACQ when at that point, course offset vs slick axis, speed kn)
    "419001234": ("z12", 12.25, 0, 11.8),  # guilty tanker: through the t-12h zone centre, on the slick axis
    "419002345": ("z12_side", 11.6, 3, 13.2),  # cargo 3 km off the zone, same lane
    "470003456": ("z24_edge", 23.0, 90, 12.4),  # tanker crossing the t-24h zone edge on a different course
    "563004567": ("far", 12.0, 20, 14.0),  # cargo 15 km off
    "636006789": ("far2", 20.0, 220, 12.0),  # cargo far, opposite direction
    "419005678": ("loiter", 8.0, 0, 1.3),  # fishing boat loitering 9 km away
    "419008901": ("far3", 6.0, 28, 17.0),  # passenger, fast, 20 km off
    "419007890": ("anchor", 0.0, 0, 0.0),  # tug at anchor 25 km away
}


def _through_point(rule, zones, centroid, heading):
    z = {z["hours_before"]: z for z in zones}
    if rule == "z12":
        return z[12]["center"]
    if rule == "z12_side":
        return _along(z[12]["center"], heading + 90, 3.0 + z[12]["semi_minor_km"])
    if rule == "z24_edge":
        return _along(z[24]["center"], heading + 90, z[24]["semi_minor_km"] * 0.9)
    if rule == "far":
        return _along(centroid, heading - 90, 15.0)
    if rule == "far2":
        return _along(centroid, heading + 135, 22.0)
    if rule == "loiter":
        return _along(centroid, heading + 60, 9.0)
    if rule == "far3":
        return _along(centroid, heading - 140, 20.0)
    return _along(centroid, heading + 20, 25.0)


def build_positions(
    zones=ORIGIN_ZONES, centroid=SLICK_CENTROID, heading=42.0, acq=ACQ, step_min: int = 10
) -> list[dict]:
    """Every vessel reports every `step_min` minutes for t-30h..t0. The tanker is silent for ~42 min while crossing the
    t-12h zone, slows from 11.8 to 6.1 kn around it, and its reported draft drops 12.4 -> 11.6 m afterwards."""
    out: list[dict] = []
    by_mmsi = {v["mmsi"]: v for v in VESSELS_STATIC}
    for mmsi, (rule, t_off, course_off, speed) in ROLES.items():
        v = by_mmsi[mmsi]
        p0 = _through_point(rule, zones, centroid, heading)
        course = (heading + course_off) % 360
        t0 = acq - timedelta(hours=t_off)
        t = acq - timedelta(hours=30)
        while t <= acq:
            hours_before = (acq - t).total_seconds() / 3600
            if mmsi == "419001234" and 11.9 < hours_before < 12.6:  # transponder off inside the t-12h zone
                t += timedelta(minutes=step_min)
                continue
            dt_h = (t - t0).total_seconds() / 3600
            sog = speed
            draft = None
            if mmsi == "419001234":
                sog = 6.1 if 11.5 < hours_before < 13.2 else 11.8
                draft = 12.4 if hours_before > 12.6 else 11.6
                # distance travelled accounts for the slow stretch
                km = 11.8 * 1.852 * dt_h - (11.8 - 6.1) * 1.852 * _overlap_hours(hours_before, 11.5, 13.2, t_off)
            elif v["type_group"] == "tanker":
                draft = 9.8
                km = speed * 1.852 * dt_h
            elif rule == "loiter":
                km = 0.4 * math.sin(dt_h * 1.7) + 0.2 * dt_h
            else:
                km = speed * 1.852 * dt_h
            p = _along(p0, course, km)
            out.append(
                {
                    "_id": f"pos-{mmsi}-{int(hours_before * 60)}",
                    "mmsi": mmsi,
                    "ts": t,
                    "geometry": {"type": "Point", "coordinates": [round(p[0], 6), round(p[1], 6)]},
                    "sog": round(sog, 1),
                    "cog": 0
                    if rule == "anchor"
                    else round(course + (25 * math.sin(dt_h * 3) if rule == "loiter" else 0)) % 360,
                    "heading": 0 if rule == "anchor" else round(course),
                    "draft": draft,
                    "nav_status": "at anchor" if rule == "anchor" else "under way",
                    "source": "scenario",
                }
            )
            t += timedelta(minutes=step_min)
    return out


def _overlap_hours(hours_before, lo, hi, t_off):
    """Hours of the slow stretch [lo, hi] (hours before ACQ) that lie between the through-time and this report."""
    a, b = sorted((t_off, hours_before))
    return max(0.0, min(b, hi) - max(a, lo))


def vessel_docs(positions: list[dict]) -> list[dict]:
    """Static vessel records with position/last_seen taken from the newest scenario report."""
    latest = {}
    for p in positions:
        if p["mmsi"] not in latest or p["ts"] > latest[p["mmsi"]]["ts"]:
            latest[p["mmsi"]] = p
    docs = []
    for v in VESSELS_STATIC:
        lp = latest.get(v["mmsi"])
        docs.append(
            {
                **v,
                "position": lp["geometry"]["coordinates"] if lp else v["position"],
                "sog_kn": lp["sog"] if lp else v["sog_kn"],
                "cog_deg": lp["cog"] if lp else v["cog_deg"],
                "last_seen": lp["ts"] if lp else v["last_seen"],
            }
        )
    return docs


VESSELS_STATIC = VESSELS
POSITIONS = build_positions()
