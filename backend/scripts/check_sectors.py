"""Prove the sector grid is sane before it is seeded.

A detection is filed under the *first* watch zone whose outline contains it, so two overlapping
sectors would make that assignment arbitrary — and the officer who owns the detection would depend
on dictionary order. That is exactly the kind of bug that stays invisible until an audit.

Run:  python -m scripts.check_sectors
"""

from __future__ import annotations

import sys
from collections import Counter

from shapely.geometry import Point, shape

from scripts.demo_scenario import INCIDENTS, SAMPLES, TRAFFIC_VESSELS, ZONES


def main() -> int:
    errors: list[str] = []
    shapes = {z["_id"]: shape(z["geometry"]) for z in ZONES}

    ids = [z["_id"] for z in ZONES]
    for zid, n in Counter(ids).items():
        if n > 1:
            errors.append(f"duplicate sector id {zid} ({n}x)")

    # Shared edges are fine and expected; shared *area* is not.
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            overlap = shapes[a].intersection(shapes[b]).area
            if overlap > 1e-9:
                errors.append(f"{a} and {b} overlap by {overlap:.4f} deg^2")

    # Everything the seed files under a sector must actually land in one.
    for inc in INCIDENTS:
        pt = Point(*inc["centroid"])
        holder = next((z for z, g in shapes.items() if g.contains(pt)), None)
        if holder is None:
            errors.append(f"incident {inc['_id']} at {inc['centroid']} is in no sector")
        elif holder != inc.get("zone_id"):
            errors.append(f"incident {inc['_id']} says {inc.get('zone_id')} but sits in {holder}")

    for s in SAMPLES:
        if s.get("zone_id") is None:
            errors.append(f"sample tile {s['_id']} footprint is in no sector")

    for v in TRAFFIC_VESSELS:
        if not shapes[v["zone_id"]].contains(Point(*v["position"])):
            errors.append(f"vessel {v['mmsi']} placed outside its own sector {v['zone_id']}")
            break  # one is enough to prove the generator is wrong

    for e in errors:
        print(f"FAIL  {e}")
    if errors:
        return 1

    print(f"OK    {len(ZONES)} sectors, no overlaps")
    print(f"OK    {len(INCIDENTS)} incidents and {len(SAMPLES)} tiles all filed in a sector")
    print(f"OK    {len(TRAFFIC_VESSELS)} scenario vessels all inside their own sector")
    by_region = Counter(z["region"] for z in ZONES)
    for region, n in sorted(by_region.items()):
        print(f"      {region:<12} {n} sectors")
    return 0


if __name__ == "__main__":
    sys.exit(main())
