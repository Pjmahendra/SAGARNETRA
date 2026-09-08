"""Record real live AIS from AISStream.io into `vessels` and `ais_positions`.

Runs as its own process, not inside the API: it is a long-lived socket whose whole value is the
hours of data it accumulates, so it must survive `uvicorn --reload` and any API restart.

    export AISSTREAM_API_KEY=...            # or put it in backend/.env
    python -m scripts.ais_collector          # add --dry-run to prove data flows before committing

Everything it writes carries `source: "live"`, which keeps it cleanly separated from the seeded
`source: "scenario"` demo data: the incident pipeline keeps using the scenario tracks, the Vessels
page shows real ships, and nothing silently blends the two. `ensure_indexes` already gives live
positions a 7-day TTL, so the collection cannot grow without bound.

Bounding boxes come from the watch zones in the database, so the recorder and the app always agree
on what "inside a watch zone" means.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import logging
from datetime import UTC, datetime
from typing import Any

import websockets

from app.config import get_settings
from app.db import connect, ensure_indexes

log = logging.getLogger("ais")

STREAM_URL = "wss://stream.aisstream.io/v0/stream"
FLUSH_SECONDS = 5.0          # batch writes; AIS arrives far faster than Mongo needs to be touched
STATS_SECONDS = 60.0
POSITION_MIN_SECONDS = 30.0  # per-vessel throttle: a ship reporting every 2 s is noise for our purposes
MAX_BACKOFF = 60.0

# AIS "ship and cargo type" numeric codes, collapsed to the six groups the UI knows about.
_TYPE_RANGES: list[tuple[range, str]] = [
    (range(30, 31), "fishing"),
    (range(31, 33), "tug"),
    (range(52, 53), "tug"),
    (range(60, 70), "passenger"),
    (range(70, 80), "cargo"),
    (range(80, 90), "tanker"),
]

# Maritime Identification Digits -> ISO-3166 alpha-2, for the flag column. Covers the registries
# that actually appear in Indian-ocean traffic; anything else falls back to the raw MID, which is
# honest and still traceable rather than a wrong guess.
_MID: dict[str, str] = {
    "201": "AL", "202": "AD", "203": "AT", "204": "PT", "205": "BE", "206": "BY", "207": "BG",
    "208": "VA", "209": "CY", "210": "CY", "211": "DE", "212": "CY", "213": "GE", "214": "MD",
    "215": "MT", "218": "DE", "219": "DK", "220": "DK", "224": "ES", "225": "ES", "226": "FR",
    "227": "FR", "228": "FR", "229": "MT", "230": "FI", "231": "FO", "232": "GB", "233": "GB",
    "234": "GB", "235": "GB", "236": "GI", "237": "GR", "238": "HR", "239": "GR", "240": "GR",
    "241": "GR", "242": "MA", "243": "HU", "244": "NL", "245": "NL", "246": "NL", "247": "IT",
    "248": "MT", "249": "MT", "250": "IE", "251": "IS", "252": "LI", "253": "LU", "254": "MC",
    "255": "PT", "256": "MT", "257": "NO", "258": "NO", "259": "NO", "261": "PL", "262": "ME",
    "263": "PT", "264": "RO", "265": "SE", "266": "SE", "267": "SK", "268": "SM", "269": "CH",
    "270": "CZ", "271": "TR", "272": "UA", "273": "RU", "274": "MK", "275": "LV", "276": "EE",
    "277": "LT", "278": "SI", "279": "RS", "301": "AI", "303": "US", "304": "AG", "305": "AG",
    "306": "CW", "307": "AW", "308": "BS", "309": "BS", "310": "BM", "311": "BS", "312": "BZ",
    "314": "BB", "316": "CA", "319": "KY", "321": "CR", "323": "CU", "325": "DM", "327": "DO",
    "329": "GP", "330": "GD", "331": "GL", "332": "GT", "334": "HN", "336": "HT", "338": "US",
    "339": "JM", "341": "KN", "343": "LC", "345": "MX", "347": "MQ", "348": "MS", "350": "NI",
    "351": "PA", "352": "PA", "353": "PA", "354": "PA", "355": "PA", "356": "PA", "357": "PA",
    "358": "PR", "359": "SV", "361": "PM", "362": "TT", "364": "TC", "366": "US", "367": "US",
    "368": "US", "369": "US", "370": "PA", "371": "PA", "372": "PA", "373": "PA", "374": "PA",
    "375": "VC", "376": "VC", "377": "VC", "378": "VG", "379": "VI", "401": "AF", "403": "SA",
    "405": "BD", "408": "BH", "410": "BT", "412": "CN", "413": "CN", "414": "CN", "416": "TW",
    "417": "LK", "419": "IN", "422": "IR", "423": "AZ", "425": "IQ", "428": "IL", "431": "JP",
    "432": "JP", "434": "TM", "436": "KZ", "437": "UZ", "438": "JO", "440": "KR", "441": "KR",
    "443": "PS", "445": "KP", "447": "KW", "450": "LB", "451": "KG", "453": "MO", "455": "MV",
    "457": "MN", "459": "NP", "461": "OM", "463": "PK", "466": "QA", "468": "SY", "470": "AE",
    "471": "AE", "472": "TJ", "473": "YE", "475": "YE", "477": "HK", "478": "BA", "501": "AQ",
    "503": "AU", "506": "MM", "508": "BN", "510": "FM", "511": "PW", "512": "NZ", "514": "KH",
    "515": "KH", "516": "CX", "518": "CK", "520": "FJ", "523": "CC", "525": "ID", "529": "KI",
    "531": "LA", "533": "MY", "536": "MP", "538": "MH", "540": "NC", "542": "NU", "544": "NR",
    "546": "PF", "548": "PH", "553": "PG", "555": "PN", "557": "SB", "559": "AS", "561": "WS",
    "563": "SG", "564": "SG", "565": "SG", "566": "SG", "567": "TH", "570": "TO", "572": "TV",
    "574": "VN", "576": "VU", "577": "VU", "578": "WF", "601": "ZA", "603": "AO", "605": "DZ",
    "607": "TF", "608": "IO", "609": "BI", "610": "BJ", "611": "BW", "612": "CF", "613": "CM",
    "615": "CG", "616": "KM", "617": "CV", "618": "TF", "619": "CI", "620": "KM", "621": "DJ",
    "622": "EG", "624": "ET", "625": "ER", "626": "GA", "627": "GH", "629": "GM", "630": "GW",
    "631": "GQ", "632": "GN", "633": "BF", "634": "KE", "635": "TF", "636": "LR", "637": "LR",
    "638": "SS", "642": "LY", "644": "LS", "645": "MU", "647": "MG", "649": "ML", "650": "MZ",
    "654": "MR", "655": "MW", "656": "NE", "657": "NG", "659": "NA", "660": "RE", "661": "RW",
    "662": "SD", "663": "SN", "664": "SC", "665": "SH", "666": "SO", "667": "SL", "668": "ST",
    "669": "SZ", "670": "TD", "671": "TG", "672": "TN", "674": "TZ", "675": "UG", "676": "CD",
    "677": "TZ", "678": "ZM", "679": "ZW", "701": "AR", "710": "BR", "720": "BO", "725": "CL",
    "730": "CO", "735": "EC", "740": "FK", "745": "GF", "750": "GY", "755": "PY", "760": "PE",
    "765": "SR", "770": "UY", "775": "VE",
}


def type_group(code: Any) -> str:
    try:
        c = int(code)
    except (TypeError, ValueError):
        return "other"
    for r, name in _TYPE_RANGES:
        if c in r:
            return name
    return "other"


def flag_of(mmsi: str) -> str:
    return _MID.get(mmsi[:3], mmsi[:3])


def _clean(s: Any) -> str | None:
    """AIS pads text fields with '@' and spaces; an all-padding field means 'not set'."""
    if not isinstance(s, str):
        return None
    out = s.replace("@", " ").strip()
    return out or None


def _length_m(dim: Any) -> int | None:
    """Overall length is the distance bow-to-stern, reported as two offsets from the antenna."""
    if not isinstance(dim, dict):
        return None
    a, b = dim.get("A"), dim.get("B")
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and (a + b) > 0:
        return int(a + b)
    return None


async def zone_boxes(db: Any) -> list[list[list[float]]]:
    """AISStream wants [[[south, west], [north, east]], ...] — latitude first, unlike GeoJSON."""
    boxes: list[list[list[float]]] = []
    async for z in db.watch_zones.find({}, {"geometry": 1, "name": 1}):
        ring = (z.get("geometry") or {}).get("coordinates", [[]])[0]
        if not ring:
            continue
        lons = [p[0] for p in ring]
        lats = [p[1] for p in ring]
        boxes.append([[min(lats), min(lons)], [max(lats), max(lons)]])
        log.info("watching %s", z.get("name"))
    return boxes


class Collector:
    def __init__(self, db: Any, dry_run: bool = False) -> None:
        self.db = db
        self.dry_run = dry_run
        self.positions: list[dict] = []
        self.statics: dict[str, dict] = {}
        self.latest: dict[str, dict] = {}
        self.last_pos_at: dict[str, datetime] = {}
        self.seen_mmsi: set[str] = set()
        self.messages = 0
        self.written = 0
        self.started = datetime.now(UTC)

    def on_message(self, msg: dict) -> None:
        meta = msg.get("MetaData") or {}
        mmsi = str(meta.get("MMSI") or "").strip()
        if not mmsi:
            return
        self.messages += 1
        self.seen_mmsi.add(mmsi)
        kind = msg.get("MessageType")
        body = (msg.get("Message") or {}).get(kind) or {}

        if kind == "PositionReport":
            lat, lon = body.get("Latitude"), body.get("Longitude")
            if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
                return
            # AIS uses 91/181 for "position not available".
            if abs(lat) > 90 or abs(lon) > 180:
                return
            now = datetime.now(UTC)
            prev = self.last_pos_at.get(mmsi)
            if prev and (now - prev).total_seconds() < POSITION_MIN_SECONDS:
                return
            self.last_pos_at[mmsi] = now
            sog = body.get("Sog")
            cog = body.get("Cog")
            sog = round(float(sog), 1) if isinstance(sog, (int, float)) and sog < 102.3 else 0.0
            cog = round(float(cog)) % 360 if isinstance(cog, (int, float)) and cog < 360 else 0
            hdg = body.get("TrueHeading")
            hdg = hdg if isinstance(hdg, int) and hdg < 360 else cog
            self.positions.append({
                "mmsi": mmsi,
                "ts": now,
                "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
                "sog": sog,
                "cog": cog,
                "heading": hdg,
                "draft": None,
                "nav_status": body.get("NavigationalStatus"),
                "source": "live",
            })
            self.latest[mmsi] = {
                "position": [round(lon, 6), round(lat, 6)], "sog_kn": sog, "cog_deg": cog, "last_seen": now,
            }

        elif kind == "ShipStaticData":
            imo = body.get("ImoNumber")
            self.statics[mmsi] = {
                "name": _clean(body.get("Name")) or _clean(meta.get("ShipName")) or f"MMSI {mmsi}",
                "imo": str(imo) if isinstance(imo, int) and imo > 0 else None,
                "type_group": type_group(body.get("Type")),
                "length_m": _length_m(body.get("Dimension")),
                "destination": _clean(body.get("Destination")),
            }

    async def flush(self) -> None:
        positions, statics, latest = self.positions, self.statics, self.latest
        self.positions, self.statics, self.latest = [], {}, {}
        if self.dry_run:
            self.written += len(positions)
            return

        if positions:
            with contextlib.suppress(Exception):  # duplicate _id is not a reason to drop a batch
                await self.db.ais_positions.insert_many(positions, ordered=False)
            self.written += len(positions)

        # One upsert per vessel that changed, carrying whichever of static/position we just saw.
        # A position report arrives long before the ship's static record does, so a vessel is first
        # inserted with placeholder identity and filled in later. Mongo rejects an update naming the
        # same field in both operators, so the defaults are only those keys this batch did not set.
        for mmsi in set(statics) | set(latest):
            doc = {**statics.get(mmsi, {}), **latest.get(mmsi, {}), "mmsi": mmsi, "source": "live"}
            doc["flag"] = flag_of(mmsi)
            defaults = {
                "_id": f"v-{mmsi}",
                "name": f"MMSI {mmsi}",
                "imo": None,
                "type_group": "other",
                "length_m": None,
                "destination": None,
                "position": [0.0, 0.0],
                "sog_kn": 0.0,
                "cog_deg": 0,
                "last_seen": datetime.now(UTC),
                "first_seen": datetime.now(UTC),
            }
            await self.db.vessels.update_one(
                {"mmsi": mmsi},
                {"$set": doc, "$setOnInsert": {k: v for k, v in defaults.items() if k not in doc}},
                upsert=True,
            )

    def stats(self) -> str:
        mins = (datetime.now(UTC) - self.started).total_seconds() / 60
        return (
            f"{self.messages:,} messages · {len(self.seen_mmsi):,} vessels · "
            f"{self.written:,} positions stored · {mins:.0f} min"
        )


async def run(dry_run: bool) -> None:
    settings = get_settings()
    key = settings.aisstream_api_key
    if not key:
        raise SystemExit(
            "AISSTREAM_API_KEY is not set. Get a free key at https://aisstream.io "
            "and put it in backend/.env"
        )

    client, db = await connect(settings)
    await ensure_indexes(db)
    boxes = await zone_boxes(db)
    if not boxes:
        raise SystemExit("No watch zones in the database. Run `python -m scripts.seed_db` first.")

    c = Collector(db, dry_run=dry_run)
    subscribe = json.dumps({
        "APIKey": key,
        "BoundingBoxes": boxes,
        "FilterMessageTypes": ["PositionReport", "ShipStaticData"],
    })

    async def periodic() -> None:
        last_stats = datetime.now(UTC)
        while True:
            await asyncio.sleep(FLUSH_SECONDS)
            await c.flush()
            if (datetime.now(UTC) - last_stats).total_seconds() >= STATS_SECONDS:
                log.info(c.stats())
                last_stats = datetime.now(UTC)

    task = asyncio.create_task(periodic())
    backoff = 1.0
    try:
        while True:
            try:
                async with websockets.connect(STREAM_URL, ping_interval=20, ping_timeout=20) as ws:
                    await ws.send(subscribe)
                    dry = " [dry run, nothing written]" if dry_run else ""
                    log.info("connected to AISStream, %d box(es)%s", len(boxes), dry)
                    backoff = 1.0
                    async for raw in ws:
                        try:
                            c.on_message(json.loads(raw))
                        except (ValueError, TypeError, KeyError) as e:
                            log.debug("skipped a message: %s", e)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                # The socket dropping is normal over 15 hours; never let it end the recording.
                log.warning("disconnected (%s); retrying in %.0fs", e, backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, MAX_BACKOFF)
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        await c.flush()
        log.info("stopped: %s", c.stats())
        client.close()


def main() -> None:
    ap = argparse.ArgumentParser(description="Record live AIS from AISStream into MongoDB")
    ap.add_argument("--dry-run", action="store_true", help="connect and count, but write nothing")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(run(args.dry_run))


if __name__ == "__main__":
    main()
