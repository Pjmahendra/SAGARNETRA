"""The demo incident: Gujarat offshore lane, 6 Sep 2026. Mirrors web/src/lib/mock/data.ts so both modes agree.

Tracks and ranking here are a generated scenario (decision 2026-09-07); the incident is flagged is_demo=True.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta

ACQ = datetime(2026, 9, 6, 1, 12, tzinfo=UTC)


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

ZONES = [
    {
        "_id": "z-guj",
        "name": "Gujarat Offshore Lane",
        "region": "North-West",
        "last_scene_at": ACQ,
        "vessels_now": 61,
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[68.6, 20.4], [70.2, 20.4], [70.2, 21.9], [68.6, 21.9], [68.6, 20.4]]],
        },
    },
    {
        "_id": "z-mum",
        "name": "Mumbai Approaches",
        "region": "West",
        "last_scene_at": datetime(2026, 9, 4, 1, 5, tzinfo=UTC),
        "vessels_now": 58,
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[72.2, 18.4], [73.1, 18.4], [73.1, 19.3], [72.2, 19.3], [72.2, 18.4]]],
        },
    },
    {
        "_id": "z-che",
        "name": "Chennai–Ennore",
        "region": "East",
        "last_scene_at": datetime(2026, 9, 5, 0, 31, tzinfo=UTC),
        "vessels_now": 24,
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[80.2, 12.8], [80.9, 12.8], [80.9, 13.6], [80.2, 13.6], [80.2, 12.8]]],
        },
    },
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
        "vessels_now": 0,
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[0.5, 50.3], [2.6, 50.3], [2.6, 51.5], [0.5, 51.5], [0.5, 50.3]]],
        },
    },
]

#: Zones whose vessels come from the live AIS recorder rather than the seeded scenario.
LIVE_ZONE_IDS = ["z-nsc"]
INDIAN_ZONE_IDS = ["z-guj", "z-mum", "z-che"]


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

def _demo_inc(_id, code, status, zone, zone_id, dt, area, conf, engine, centroid, top_tier=None, top_vessel=None):
    """A lightweight recorded spill for a region (no ranking/geometry). 'detected' ones are unconfirmed and route to
    the console; the rest are confirmed cases. Centroids sit inside the region's sample tile so a detected one
    deep-links onto its scene."""
    return {
        "_id": _id, "code": code, "status": status, "zone": zone, "zone_id": zone_id,
        "detected_at": dt, "area_km2": area, "confidence": conf, "engine": engine, "centroid": centroid,
        "top_tier": top_tier, "top_vessel": top_vessel, "assigned_to": None, "is_demo": True,
        "scene": "S1A_IW_GRDH synthetic tile", "polygon": [], "heading_deg": 0,
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

SAMPLES = [
    {
        "_id": "guj-01",
        "label": "Gujarat lane, 6 Sep 01:12Z",
        "scene": "S1A_IW_GRDH 5D2E · tile 3",
        "acquired_at": ACQ,
        "bbox": [69.30, 20.95, 69.55, 21.15],
        "image_url": "/sar/guj-01.png",
        "synthetic": True,
    },
    {
        "_id": "mum-02",
        "label": "Mumbai approaches, 29 Aug",
        "scene": "S1A_IW_GRDH 4F91 · tile 7",
        "acquired_at": datetime(2026, 8, 29, 1, 5, tzinfo=UTC),
        "bbox": [72.50, 18.75, 72.75, 18.95],
        "image_url": "/sar/mum-02.png",
        "synthetic": True,
    },
    {
        "_id": "che-03",
        "label": "Chennai–Ennore, 24 Aug",
        "scene": "S1A_IW_GRDH 3B27 · tile 2",
        "acquired_at": datetime(2026, 8, 24, 0, 31, tzinfo=UTC),
        "bbox": [80.30, 13.10, 80.55, 13.30],
        "image_url": "/sar/che-03.png",
        "synthetic": True,
    },
    {
        "_id": "kut-04",
        "label": "Gulf of Kutch, clean sea",
        "scene": "S1A_IW_GRDH 5C11 · tile 1",
        "acquired_at": datetime(2026, 9, 5, 1, 0, tzinfo=UTC),
        "bbox": [68.90, 22.40, 69.15, 22.60],
        "image_url": "/sar/kut-04.png",
        "synthetic": True,
    },
]

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
