"""Hourly wind and surface current for a point and time window, from Open-Meteo (free, no key).

Wind direction is meteorological ("from"); current direction is oceanographic ("to"). Both are kept as reported and
interpreted in drift.py. If the service is unreachable the caller gets a flat climatological fallback and the result is
marked source="fallback" so the UI can say so.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import httpx

log = logging.getLogger("sagarnetra.weather")

WIND_URL = "https://api.open-meteo.com/v1/forecast"
WIND_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
KMH_PER_KN = 1.852


@dataclass(frozen=True)
class Hour:
    t: datetime
    wind_kn: float
    wind_from_deg: float
    current_kn: float
    current_to_deg: float


@dataclass
class WeatherSeries:
    hours: list[Hour]
    source: str  # "open-meteo" | "fallback"

    def at(self, t: datetime) -> Hour:
        """Nearest hour; clamps outside the window."""
        if not self.hours:
            raise ValueError("empty series")
        return min(self.hours, key=lambda h: abs((h.t - t).total_seconds()))

    def summary(self) -> dict:
        import math

        if not self.hours:
            return {}
        n = len(self.hours)

        # circular mean for directions
        def cmean(vals):
            x = sum(math.cos(math.radians(v)) for v in vals) / n
            y = sum(math.sin(math.radians(v)) for v in vals) / n
            return (math.degrees(math.atan2(y, x)) + 360) % 360

        return {
            "wind_kn": round(sum(h.wind_kn for h in self.hours) / n, 1),
            "wind_dir_deg": round(cmean([h.wind_from_deg for h in self.hours])),
            "current_kn": round(sum(h.current_kn for h in self.hours) / n, 2),
            "current_dir_deg": round(cmean([h.current_to_deg for h in self.hours])),
        }


def fallback_series(start: datetime, end: datetime) -> WeatherSeries:
    hours = []
    t = start.replace(minute=0, second=0, microsecond=0)
    while t <= end:
        hours.append(Hour(t, 10.0, 225.0, 0.5, 45.0))  # SW monsoon-ish default for the Arabian Sea
        t += timedelta(hours=1)
    return WeatherSeries(hours, "fallback")


async def fetch(lat: float, lon: float, start: datetime, end: datetime, *, timeout_s: float = 15.0) -> WeatherSeries:
    start, end = start.astimezone(UTC), end.astimezone(UTC)
    dates = {"start_date": start.date().isoformat(), "end_date": end.date().isoformat(), "timezone": "UTC"}
    wind_url = WIND_ARCHIVE_URL if (datetime.now(UTC) - end) > timedelta(days=60) else WIND_URL
    wind_params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "wind_speed_10m,wind_direction_10m",
        "wind_speed_unit": "kn",
        **dates,
    }
    marine_params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "ocean_current_velocity,ocean_current_direction",
        **dates,
    }
    try:
        async with httpx.AsyncClient(timeout=timeout_s) as client:
            wr, mr = await asyncio.gather(
                client.get(wind_url, params=wind_params), client.get(MARINE_URL, params=marine_params)
            )
        wr.raise_for_status()
        mr.raise_for_status()
        wh, mh = wr.json()["hourly"], mr.json()["hourly"]
        cur = {
            t: (v, d)
            for t, v, d in zip(mh["time"], mh["ocean_current_velocity"], mh["ocean_current_direction"], strict=True)
        }
        hours: list[Hour] = []
        for t, ws, wd in zip(wh["time"], wh["wind_speed_10m"], wh["wind_direction_10m"], strict=True):
            ts = datetime.fromisoformat(t).replace(tzinfo=UTC)
            if ts < start - timedelta(hours=1) or ts > end + timedelta(hours=1):
                continue
            cv, cd = cur.get(t, (None, None))
            if ws is None or wd is None:
                continue
            hours.append(
                Hour(
                    ts,
                    float(ws),
                    float(wd),
                    float(cv) / KMH_PER_KN if cv is not None else 0.0,
                    float(cd) if cd is not None else 0.0,
                )
            )
        if not hours:
            raise ValueError("no hourly rows in window")
        return WeatherSeries(hours, "open-meteo")
    except Exception as e:  # network, schema, or empty data: never fail the incident, degrade honestly
        log.warning("weather fetch failed (%s); using fallback series", e)
        return fallback_series(start, end)
