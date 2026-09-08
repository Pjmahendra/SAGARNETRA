"""The evidence pack: an immutable snapshot of an incident at the moment an officer exported it.

The rendered document is the frontend's print view; this module owns what gets frozen. A report is
deliberately *not* a live view of the incident — re-ranking or closing the case later must not
silently rewrite a document somebody has already filed. Each export is a new revision, and the
print view compares the snapshot against the incident as it stands and says so if they differ.

Shared by the router and the seed so a seeded report and an exported one are the same shape,
produced by the same code.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from ..db import new_id


def snapshot(inc: dict) -> dict:
    """The numbers as they stood, enough to render a report header without re-reading the incident."""
    ranking = inc.get("ranking") or []
    top = ranking[0] if ranking else None
    return {
        "zone": inc.get("zone"),
        "detected_at": inc.get("detected_at"),
        "area_km2": inc.get("area_km2"),
        "confidence": inc.get("confidence"),
        "engine": inc.get("engine"),
        "scene": inc.get("scene"),
        "centroid": inc.get("centroid"),
        "status": inc.get("status"),
        "is_demo": inc.get("is_demo", False),
        # Frozen because the pack states it in words. Without it a Dover pack, whose ranking is
        # built entirely from real recorded AIS, would carry the boilerplate saying its vessel
        # history is a scenario — a false statement in a document meant to be evidence.
        "ais_source": inc.get("ais_source", "scenario"),
        "ranked_count": len(ranking),
        "candidates_considered": inc.get("candidates_considered"),
        "top_vessel": top["name"] if top else None,
        "top_mmsi": top["mmsi"] if top else None,
        "top_score": top["score"] if top else None,
        "top_tier": top["tier"] if top else None,
        "weather_source": (inc.get("drift_inputs") or {}).get("weather_source"),
        "hashes": inc.get("hashes") or {},
    }


def build(inc: dict, *, by_name: str, by_id: str, revision: int, at: datetime | None = None) -> dict:
    """A report document. `zone_id` is copied up so the sector filter applies without a join."""
    return {
        "_id": new_id("rep"),
        "incident_id": inc["_id"],
        "incident_code": inc["code"],
        "zone_id": inc.get("zone_id"),
        "revision": revision,
        "generated_by": by_name,
        "generated_by_id": by_id,
        "generated_at": at or datetime.now(UTC),
        "snapshot": snapshot(inc),
    }


def export_event(revision: int, report_id: str, who: str, at: datetime) -> dict[str, Any]:
    """The line the export writes into the incident's own timeline, for chain of custody."""
    return {
        "at": at,
        "who": who,
        "type": "report",
        "text": f"Evidence pack exported (revision {revision}, {report_id}).",
    }
