"""Stage 3: first-order Lagrangian backtrack of the slick centroid.

Slick velocity = surface current + LEEWAY x wind (wind is reported as the direction it blows FROM, so it is reversed).
We step backwards from acquisition time and record the position at each requested hour. Uncertainty grows linearly:
semi-major along the drift direction, semi-minor across it. OpenDrift is the stated upgrade path (decision 2026-09-07).
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta

from .weather import KMH_PER_KN, WeatherSeries

LEEWAY = 0.03
KM_PER_DEG_LAT = 111.32
GROWTH_ALONG_KM_PER_H = 0.5
GROWTH_ACROSS_KM_PER_H = 0.3
MIN_AXIS_KM = 0.8


def km_per_deg_lon(lat: float) -> float:
    return KM_PER_DEG_LAT * math.cos(math.radians(lat))


def _vector_kmh(speed_kn: float, to_deg: float) -> tuple[float, float]:
    v = speed_kn * KMH_PER_KN
    rad = math.radians(to_deg)
    return v * math.sin(rad), v * math.cos(rad)  # east, north


def bearing_deg(from_pt: tuple[float, float], to_pt: tuple[float, float]) -> float:
    mid_lat = (from_pt[1] + to_pt[1]) / 2
    dx = (to_pt[0] - from_pt[0]) * km_per_deg_lon(mid_lat)
    dy = (to_pt[1] - from_pt[1]) * KM_PER_DEG_LAT
    return (math.degrees(math.atan2(dx, dy)) + 360) % 360


def backtrack(
    centroid: tuple[float, float],
    acquired_at: datetime,
    weather: WeatherSeries,
    hours: tuple[int, ...] = (6, 12, 24),
    step_minutes: int = 15,
) -> list[dict]:
    lon, lat = centroid
    t = acquired_at
    elapsed_h = 0.0
    dt_h = step_minutes / 60.0
    targets = sorted(hours)
    zones: list[dict] = []
    path: list[tuple[float, float]] = [(lon, lat)]
    for target in targets:
        while elapsed_h + 1e-9 < target:
            w = weather.at(t)
            ce, cn = _vector_kmh(w.current_kn, w.current_to_deg)
            we, wn = _vector_kmh(w.wind_kn, (w.wind_from_deg + 180.0) % 360.0)
            ve, vn = ce + LEEWAY * we, cn + LEEWAY * wn
            # step backwards
            lon -= (ve * dt_h) / km_per_deg_lon(lat)
            lat -= (vn * dt_h) / KM_PER_DEG_LAT
            t -= timedelta(minutes=step_minutes)
            elapsed_h += dt_h
            path.append((lon, lat))
        zones.append(
            {
                "hours_before": target,
                "center": [round(lon, 6), round(lat, 6)],
                "semi_major_km": round(max(MIN_AXIS_KM, GROWTH_ALONG_KM_PER_H * target), 2),
                "semi_minor_km": round(max(MIN_AXIS_KM * 0.6, GROWTH_ACROSS_KM_PER_H * target), 2),
                "bearing_deg": round(bearing_deg((lon, lat), centroid)),
                "at": (acquired_at - timedelta(hours=target)).isoformat(),
            }
        )
    return zones


def drift_inputs(weather: WeatherSeries, start: datetime, end: datetime) -> dict:
    s = weather.summary()
    label = (
        "Open-Meteo Marine + Forecast"
        if weather.source == "open-meteo"
        else "climatological fallback (weather service unreachable)"
    )
    s["source"] = f"{label}, hourly, {start.strftime('%Y-%m-%dT%HZ')} to {end.strftime('%Y-%m-%dT%HZ')}"
    s["leeway"] = LEEWAY
    s["weather_source"] = weather.source
    return s
