"""Live Sentinel-1 collector — the real, no-hardcoding ingestion path (scaffold; needs a free CDSE token to run).

For each watch zone it asks the Copernicus Data Space Ecosystem (CDSE) for new Sentinel-1 GRD scenes over the zone,
downloads them, tiles, runs the trained model, and writes detections with REAL coordinates (from the scene's own
geotransform via ml/geo) and REAL acquisition times, tagged feed="live". A per-zone "last seen" cursor means only new
scenes are pulled. This is the production counterpart to scenario_feed.py — same DB, same review flow, real data.

Run:  python -m scripts.s1_collector --once      (or --loop 3600)
Needs CDSE_TOKEN (or CDSE_USER/CDSE_PASS) in the environment / backend/.env. Without it, exits cleanly.

CDSE reference:
  Catalogue (OData):  https://catalogue.dataspace.copernicus.eu/odata/v1/Products
  Download:           https://zipper.dataspace.copernicus.eu/odata/v1/Products({id})/$value  (Bearer token)
  Token (password):   https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import httpx  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.db import connect  # noqa: E402

log = logging.getLogger("sagarnetra.s1")

CATALOGUE = "https://catalogue.dataspace.copernicus.eu/odata/v1/Products"
TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"


async def cdse_token(settings) -> str | None:
    """A bearer token: use CDSE_TOKEN if given, else exchange CDSE_USER/CDSE_PASS for one."""
    tok = getattr(settings, "cdse_token", "") or ""
    if tok:
        return tok
    user = getattr(settings, "cdse_user", "") or ""
    pw = getattr(settings, "cdse_pass", "") or ""
    if not (user and pw):
        return None
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(TOKEN_URL, data={
            "grant_type": "password", "client_id": "cdse-public", "username": user, "password": pw,
        })
        r.raise_for_status()
        return r.json()["access_token"]


def _zone_wkt(geometry: dict) -> str:
    ring = geometry["coordinates"][0]
    pts = ", ".join(f"{lon} {lat}" for lon, lat in ring)
    return f"POLYGON(({pts}))"


async def search_new_scenes(token: str, geometry: dict, since: datetime, limit: int = 5) -> list[dict]:
    """New Sentinel-1 GRD IW scenes intersecting the zone since `since`, newest first (CDSE OData)."""
    wkt = _zone_wkt(geometry)
    flt = (
        "Collection/Name eq 'SENTINEL-1' "
        "and contains(Name,'GRDH') "
        f"and OData.CSC.Intersects(area=geography'SRID=4326;{wkt}') "
        f"and ContentDate/Start gt {since.strftime('%Y-%m-%dT%H:%M:%S.000Z')}"
    )
    params = {"$filter": flt, "$orderby": "ContentDate/Start desc", "$top": str(limit)}
    async with httpx.AsyncClient(timeout=60, headers={"Authorization": f"Bearer {token}"}) as c:
        r = await c.get(CATALOGUE, params=params)
        r.raise_for_status()
        return r.json().get("value", [])


async def process_scene(db, det, token: str, scene: dict, zone_id: str) -> int:
    """Download a scene, tile it, run the model, write feed='live' detections with real coordinates.

    TODO (needs a token to test end to end): stream the product zip, open the VV GRD band with rasterio (it carries
    the geotransform + CRS), run Detector per 256 px tile, and for each oil polygon store a detection whose geometry
    comes from tile.transform via ml/geo.pixel_to_lonlat — i.e. REAL lon/lat, no assigned bbox. Mirror the doc shape
    in scripts/scenario_feed.py but with feed='live', source={kind:'sentinel1', scene:scene['Name']}, and
    acquired_at = scene ContentDate/Start.
    """
    log.info("would ingest %s into %s (implement download+tile+detect once CDSE_TOKEN is set)", scene.get("Name"), zone_id)
    return 0


async def run_once(db, det, token: str) -> None:
    zones = await db.watch_zones.find({}, {"geometry": 1, "name": 1}).to_list(50)
    since = datetime.now(UTC) - timedelta(days=7)  # replace with a per-zone cursor stored in the DB
    for z in zones:
        try:
            scenes = await search_new_scenes(token, z["geometry"], since)
            log.info("%s: %d new scene(s)", z["name"], len(scenes))
            for sc in scenes:
                await process_scene(db, det, token, sc, z["_id"])
        except Exception as e:
            log.warning("%s: CDSE query failed: %s", z["name"], e)


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--loop", type=int, default=0, help="seconds between polls (0 = one pass)")
    ap.add_argument("--once", action="store_true")
    args = ap.parse_args()
    settings = get_settings()
    token = await cdse_token(settings)
    if not token:
        print("CDSE_TOKEN (or CDSE_USER/CDSE_PASS) not set — get a free account at dataspace.copernicus.eu. "
              "Meanwhile use scripts/scenario_feed.py for the scenario feed.")
        return
    from ml.infer import Detector

    client, db = await connect(settings)
    det = Detector()
    try:
        while True:
            await run_once(db, det, token)
            if not args.loop:
                break
            await asyncio.sleep(args.loop)
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())
