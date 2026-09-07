"""Stage 5: categorise every candidate vessel and fuse eight features into one explainable 0-100 score.

Inputs are plain AIS position reports grouped by MMSI (from `ais_positions`, live or scenario: the code cannot tell),
the origin zones from drift.py, and the slick's long-axis heading. Weights live in WEIGHTS and nowhere else.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta

from .drift import KM_PER_DEG_LAT, km_per_deg_lon

WEIGHTS: dict[str, int] = {
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
TYPE_PRIOR = {"tanker": 1.0, "cargo": 0.7, "passenger": 0.4, "tug": 0.3, "fishing": 0.2, "other": 0.3}
TIER_PRIME, TIER_POI = 65, 35
GAP_THRESHOLD_MIN = 20
CANDIDATE_RADIUS = 2.5  # normalised ellipse radii; 1.0 is the ellipse edge
SAMPLE_MIN = 5
LOOKBACK_H = 30


@dataclass
class Report:
    t: datetime
    lon: float
    lat: float
    sog: float | None = None
    cog: float | None = None
    draft: float | None = None


def ellipse_radius(lon: float, lat: float, zone: dict) -> float:
    """Normalised radius of a point in the zone's ellipse frame: <=1 inside, 1 on the edge."""
    cx, cy = zone["center"]
    e = (lon - cx) * km_per_deg_lon(cy)
    n = (lat - cy) * KM_PER_DEG_LAT
    b = math.radians(zone["bearing_deg"])
    along = e * math.sin(b) + n * math.cos(b)
    across = e * math.cos(b) - n * math.sin(b)
    return math.hypot(along / max(zone["semi_major_km"], 1e-3), across / max(zone["semi_minor_km"], 1e-3))


def zone_window(zone: dict, acquired_at: datetime) -> tuple[datetime, datetime]:
    centre = acquired_at - timedelta(hours=zone["hours_before"])
    half = timedelta(hours=max(1.5, 0.35 * zone["hours_before"]))
    return centre - half, centre + half


def interpolate(
    reports: list[Report], start: datetime, end: datetime, step_min: int = SAMPLE_MIN
) -> list[tuple[datetime, float, float]]:
    """Linear interpolation of the track at fixed steps, spanning gaps (that is where dark ships hide)."""
    pts = sorted(reports, key=lambda r: r.t)
    if not pts:
        return []
    out = []
    t = max(start, pts[0].t)
    stop = min(end, pts[-1].t)
    i = 0
    while t <= stop:
        while i + 1 < len(pts) and pts[i + 1].t < t:
            i += 1
        a = pts[i]
        b = pts[i + 1] if i + 1 < len(pts) else a
        span = (b.t - a.t).total_seconds()
        k = 0.0 if span <= 0 else (t - a.t).total_seconds() / span
        out.append((t, a.lon + (b.lon - a.lon) * k, a.lat + (b.lat - a.lat) * k))
        t += timedelta(minutes=step_min)
    return out


def _circ_diff(a: float, b: float) -> float:
    d = abs(a - b) % 360
    return min(d, 360 - d)


def _axis_similarity(course: float, axis: float) -> float:
    """Slick axis is undirected: 041° matches both 041° and 221°."""
    d = _circ_diff(course, axis)
    d = min(d, 180 - d)
    return max(0.0, math.cos(math.radians(d)))


def behaviour_of(reports: list[Report], longest_gap_min: float) -> str:
    if longest_gap_min > GAP_THRESHOLD_MIN:
        return "dark"
    sogs = [r.sog for r in reports if r.sog is not None]
    if sogs:
        med = sorted(sogs)[len(sogs) // 2]
        if med < 0.5:
            return "anchored"
        if med < 2.0:
            return "loitering"
    return "transiting"


def longest_gap_minutes(reports: list[Report], start: datetime, end: datetime) -> tuple[float, datetime | None]:
    pts = sorted((r for r in reports if start <= r.t <= end), key=lambda r: r.t)
    best, at = 0.0, None
    for a, b in zip(pts, pts[1:], strict=False):
        g = (b.t - a.t).total_seconds() / 60
        if g > best:
            best, at = g, a.t
    return best, at


def score_vessel(
    mmsi: str,
    static: dict,
    reports: list[Report],
    zones: list[dict],
    acquired_at: datetime,
    slick_heading: float,
    prior_incidents: int = 0,
) -> dict | None:
    start = acquired_at - timedelta(hours=LOOKBACK_H)
    samples = interpolate(reports, start, acquired_at)
    if not samples:
        return None

    # spatial + temporal against every zone in its own time window; keep the best zone
    best = {"zone": None, "r": math.inf, "inside_min": 0.0}
    for z in zones:
        ws, we = zone_window(z, acquired_at)
        rs = [ellipse_radius(lon, lat, z) for t, lon, lat in samples if ws <= t <= we]
        if not rs:
            continue
        r_min = min(rs)
        inside = sum(SAMPLE_MIN for r in rs if r <= 1.0)
        if r_min < best["r"] or (r_min == best["r"] and inside > best["inside_min"]):
            best = {"zone": z, "r": r_min, "inside_min": inside}
    if best["zone"] is None or best["r"] > CANDIDATE_RADIUS:
        return None
    z = best["zone"]
    ws, we = zone_window(z, acquired_at)
    near = sorted((r for r in reports if ws <= r.t <= we), key=lambda r: r.t)

    spatial = max(0.0, 1.0 - best["r"] / 2.0)
    temporal = min(1.0, best["inside_min"] / 60.0)

    gap_min, gap_at = longest_gap_minutes(reports, start, acquired_at)
    gap = 0.0 if gap_min <= GAP_THRESHOLD_MIN else min(1.0, (gap_min - GAP_THRESHOLD_MIN) / 100.0)

    cogs = [r.cog for r in near if r.cog is not None]
    course = sorted(cogs)[len(cogs) // 2] if cogs else None
    heading = _axis_similarity(course, slick_heading) if course is not None else 0.0

    sogs = [r.sog for r in near if r.sog is not None]
    drop = (max(sogs) - min(sogs)) if len(sogs) >= 2 else 0.0
    turn = max((_circ_diff(a, b) for a, b in zip(cogs, cogs[1:], strict=False)), default=0.0)
    manoeuvre = max(min(1.0, drop / 6.0) if drop > 3.0 else 0.0, min(1.0, turn / 60.0) if turn > 30.0 else 0.0)

    type_group = static.get("type_group", "other")
    drafts = [r.draft for r in sorted(reports, key=lambda r: r.t) if r.draft is not None]
    draft_drop = (max(drafts) - drafts[-1]) if len(drafts) >= 2 else 0.0
    draft = min(1.0, draft_drop / 1.0) if type_group == "tanker" and draft_drop > 0.2 else 0.0

    type_prior = TYPE_PRIOR.get(type_group, 0.3)
    history = min(1.0, prior_incidents / 2.0)

    km_edge = max(0.0, (best["r"] - 1.0) * z["semi_major_km"])
    feats = {
        "spatial": (
            spatial,
            f"{best['r'] * z['semi_major_km']:.1f} km from t-{z['hours_before']}h zone centre"
            if best["r"] > 1
            else f"inside t-{z['hours_before']}h zone, {best['r']:.2f} of radius",
        ),
        "temporal": (
            temporal,
            f"{int(best['inside_min'])} min inside zone"
            if best["inside_min"]
            else f"never inside ({km_edge:.1f} km outside edge)",
        ),
        "gap": (
            gap,
            f"{int(gap_min)} min transponder gap at {gap_at.strftime('%H:%MZ')}" if gap > 0 and gap_at else "no gap",
        ),
        "heading": (
            heading,
            f"course {int(course):03d}° vs slick axis {int(slick_heading):03d}°"
            if course is not None
            else "no course reports",
        ),
        "manoeuvre": (
            manoeuvre,
            f"speed {max(sogs):.1f} → {min(sogs):.1f} kn"
            if drop > 3
            else f"course change {int(turn)}°"
            if turn > 30
            else (f"steady {sogs[-1]:.1f} kn" if sogs else "no speed reports"),
        ),
        "draft": (
            draft,
            f"draft {max(drafts):.1f} → {drafts[-1]:.1f} m"
            if draft > 0
            else ("draft constant" if drafts else "not reported"),
        ),
        "type": (type_prior, type_group),
        "history": (history, f"{prior_incidents} prior incident(s)" if prior_incidents else "no prior incidents"),
    }
    rows = [
        {
            "key": k,
            "label": LABELS[k],
            "raw": raw,
            "normalised": round(v, 3),
            "weight": WEIGHTS[k],
            "contribution": round(v * WEIGHTS[k], 1),
        }
        for k, (v, raw) in feats.items()
    ]
    score = round(sum(r["contribution"] for r in rows))
    tier = "prime" if score >= TIER_PRIME else "poi" if score >= TIER_POI else "cleared"

    track = []
    prev = None
    for r in sorted(reports, key=lambda r: r.t):
        if r.t < start or r.t > acquired_at:
            continue
        pt = {"t": r.t.isoformat(), "p": [round(r.lon, 5), round(r.lat, 5)]}
        if prev is not None and (r.t - prev).total_seconds() / 60 > GAP_THRESHOLD_MIN:
            pt["gap"] = True
        track.append(pt)
        prev = r.t

    return {
        "mmsi": mmsi,
        "name": static.get("name", f"MMSI {mmsi}"),
        "type_group": type_group,
        "flag": static.get("flag", "??"),
        "behaviour": behaviour_of(reports, gap_min),
        "score": score,
        "tier": tier,
        "best_zone_h": z["hours_before"],
        "features": rows,
        "track": track,
    }


def rank(
    positions_by_mmsi: dict[str, list[Report]],
    statics: dict[str, dict],
    zones: list[dict],
    acquired_at: datetime,
    slick_heading: float,
    history: dict[str, int] | None = None,
) -> list[dict]:
    history = history or {}
    rows = []
    for mmsi, reports in positions_by_mmsi.items():
        row = score_vessel(
            mmsi, statics.get(mmsi, {}), reports, zones, acquired_at, slick_heading, history.get(mmsi, 0)
        )
        if row:
            rows.append(row)
    rows.sort(key=lambda r: (-r["score"], r["name"]))
    return rows
