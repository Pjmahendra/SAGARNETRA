# SAGARNETRA — Project & Engineering Report

*Maritime oil-spill intelligence for the Indian Coast Guard*
**Problem statement SIH26143 · Team AZIMUTH · SRM University–AP · Smart India Hackathon 2026**

> Every figure in this document was verified against branch `officer-command-view` at `e0e5cac` and
> the live database on 8 September 2026 — not written from memory. Model metrics are read from
> `ml/metrics.json` on branch `ml/binary-oil-detector`.
>
> A rendered version of this report is published at
> <https://claude.ai/code/artifact/9ce60d89-1e91-427f-8c72-792c8ed2e8e1>.

---

## 1. What it does

SAGARNETRA detects oil slicks in Sentinel-1 SAR imagery, backtracks the drift through real wind and
current to where the oil was released, matches that against AIS vessel tracks, and hands a Coast
Guard officer a ranked, explainable shortlist of ships to board.

**It is an inspection-targeting tool, not an accusation engine.** Satellite evidence alone cannot
prove who discharged oil; MARPOL convictions come from port-state boarding and an oil-sample match.
Every score answers one question — *which arriving vessel should the inspector board first?*

### At a glance

| | |
|---|---|
| Watch sectors | 17 (16 Indian across 5 ICG regions, plus Dover Strait) |
| Real AIS reports recorded | 14,816 from 249 vessels |
| Detection model mIoU | 0.675 (oil IoU 0.617) |
| Tests passing | 37 across 7 files |
| Code | 3,947 lines Python (API) · 5,103 TypeScript (console) · 1,012 (ML) · 31 REST endpoints |

---

## 2. The pipeline, end to end

Six stages. Each is a real computation on real inputs — nothing in this chain is a lookup table, and
an officer can interrogate every intermediate result in the console.

```
Sentinel-1 SAR tile
  │
  1. DETECT ─────────── U-Net segments the slick (heuristic fallback if no weights)
  │                     → polygon · area km² · centroid · long-axis heading · confidence
  │
  2. OFFICER VERIFY ─── confirm / look-alike + reason / uncertain
  │                     Only a confirmed detection can open an incident.
  │
  3. DRIFT BACKTRACK ── current + ~3% of wind, integrated backwards on real Open-Meteo data
  │                     → origin ellipses at t−6h / t−12h / t−24h, widening with age
  │
  4. AIS CORRELATION ── vessels whose tracks crossed those ellipses in that window
  │                     lookback 30 h · search radius 2.5× the ellipse
  │
  5. RANK ───────────── 8 weighted features → one 0–100 score, each with written evidence
  │                     prime ≥65 · person of interest 35–64 · cleared <35
  │
  6. EVIDENCE PACK ──── immutable, revisioned snapshot with SHA-256 of tile and mask
                        → A4 document via the browser's own print dialog
```

**Why drift matters.** The satellite images a slick *after* it has drifted from its source. To find
the source vessel we integrate that motion backwards to the likely origin, then match AIS tracks
there. Sentinel-1 revisits a given spot only every 1–6 days, so a slick can be a day or two old when
first seen — which is why the origin ellipses grow with age rather than staying fixed.

---

## 3. Provenance — what is real and what is not

This is the most important section. A jury will ask, and the answer has to be the same one the code
gives.

| Component | Status | Evidence |
|---|---|---|
| **Live AIS feed** | ✅ **Real** | AISStream.io. 14,816 position reports from 249 vessels. Two sectors have receiver coverage: Dover Strait, and Chennai–Ennore — **genuine Indian AIS**, ~18 ships in any two-hour window. |
| **Weather & current** | ✅ **Real** | Open-Meteo forecast, archive and marine APIs, queried for the slick's own coordinates and hour. Falls back to climatology only if unreachable, and the UI states which was used. |
| **Drift physics** | ✅ **Real** | Our own first-order Lagrangian backtrack. Arithmetic on real wind and current with a 3% leeway coefficient from the literature. |
| **Detection model** | ✅ **Real** | U-Net trained from scratch on public Sentinel-1 SAR (Deep-SAR SOS), exported to ONNX. Lives on `ml/binary-oil-detector`, not yet merged into the demo branch. |
| **Basemap imagery** | ✅ **Real** | Esri World Imagery and OpenStreetMap, credited as their licences require. The sign-in backdrop is stitched Esri tiles of the Chennai coast, bundled to survive a dead venue network. |
| **SAR sample tiles** | ⚠️ **Mixed** | On the ML branch `guj-01` and `che-03` are real Sentinel-1 tiles. `kut-04`, `mum-02`, `dov-05`, `dov-06` are synthetic placeholders. **See §8.** |
| **Indian vessel history** | ❌ **Scenario** | 262 generated vessels across the 15 reconstructed sectors, sized to each sector's real traffic density. Every row badged `demo` in the UI; the header shows amber `SCENARIO` for those sectors. |
| **Krestenitis 5-class dataset** | ⬜ **Not obtained** | Real, peer-reviewed, gated behind an author request. The loader is written and the training harness is ready; `ml/data/` is empty. The single blocker on look-alike, ship and land classes. |
| **Live Sentinel-1 ingest** | ⬜ **Scaffolded** | A Copernicus collector exists and is unblocked by adding a free CDSE token. Until then tiles are bundled rather than polled. |

---

## 4. The detection model

A U-Net trained from scratch on real Sentinel-1 SAR, deliberately with no transfer learning, so the
number isolates what the architecture alone achieves. Binary classes (sea / oil), because the free
public masks are oil-versus-background.

| Model | Provenance | mIoU | Oil IoU | Params | CPU |
|---|---|---:|---:|---:|---:|
| **U-Net, from scratch** — ours, served via ONNX | Trained by us | **0.675** | 0.617 | 7.76 M | 67.6 ms |
| DeepLabV3+ — Krestenitis et al. 2019, *Remote Sensing* 11(15) | Published | 0.650 | — | — | — |
| U-Net + ResNet-34 — pretrained checkpoint | Third-party | 0.790 | 0.610 | — | — |

Measured on 125 held-out test images at 256×256. Note the honest comparison: the pretrained
checkpoint beats us on mIoU but **not** on oil IoU, and it expects 2-channel VV+VH input rather than
our single-channel tiles — so we cite it as a benchmark rather than serving it.

**The fallback is not a fig leaf.** When no weights are present, a classical dark-spot detector runs
instead: patches darker than both the scene median and their local background, with compact regions
labelled oil and large diffuse ones labelled look-alikes. It is the approach in the classical
literature (Topouzelis; Solberg et al.), it is ~100 lines, and the API reports `engine: heuristic`
every time so the two can never be confused.

---

## 5. The ranking model

Each candidate vessel is scored out of 100. Every feature contributes a weighted amount **and** a
sentence of evidence, both rendered in the console — so an officer challenged on a ranking can point
at the reason.

| Feature | Weight | What it measures |
|---|---:|---|
| Spatial fit | 25 | How close the track passed to an origin zone |
| AIS gap | 20 | Transponder silence ("going dark") near the zone |
| Temporal fit | 15 | Time spent inside the zone's time window |
| Heading match | 10 | Course versus the slick's long axis |
| Manoeuvre | 10 | Speed drop or course change consistent with discharging |
| Draft change | 8 | Tanker riding higher after offloading |
| Type prior | 8 | Tanker > cargo > other |
| History | 4 | Prior incidents for that vessel |

Tiers: **prime suspect ≥ 65**, person of interest 35–64, cleared < 35.

The two heaviest features are the ones hardest to fake. **Spatial fit** asks whether the vessel was
physically where the oil must have come from — a nearby ship upstream of the current cannot have
produced the slick. **AIS gap** catches transponder silence near the origin window, the single most
telling behaviour in a deliberate discharge.

---

## 6. Worked example — a case ranked entirely against real vessels

The Dover Strait sector has deep live AIS coverage, so a case there runs the whole pipeline against
genuinely recorded traffic. The candidate query filters on time and geometry and never asks where a
position came from, which means the backtrack works identically on real and reconstructed data.

**INC-2026-023 · Dover Strait · 122 real vessels considered, 7 ranked**

| # | Vessel | MMSI | Flag | Behaviour | Score | Track pts |
|---:|---|---|---|---|---:|---:|
| 1 | LADY HESTER | 244997000 | NL | dark — 62 min gap at 04:49Z | 30 | 73 |
| 2 | GEFEST | 273272850 | RU | transiting | 21 | 119 |
| 3 | MANISA JASMINE | 247418800 | IT | transiting | 21 | 153 |
| 4 | FLEX ENDEAVOUR | 538010102 | MH | transiting | 18 | 113 |
| 5 | SYROS WARRIOR | 241406000 | GR | transiting | 18 | 103 |

Real MMSIs with correct country prefixes, real track lengths, a real detected transponder gap, and
live Open-Meteo weather (16.7 kn wind, 1.28 kn current).

**Every candidate scores "cleared", and that is the correct answer.** The slick in this case is a
synthetic tile placed in open water, so no real ship should look guilty — and none does. It would
have been easy to move the tile until a real hull scored "prime". That is deliberately not done:
tuning a fabricated slick until it implicates a named, identifiable vessel manufactures an accusation
inside a document that looks exactly like evidence. The pack states, in words, that no discharge is
alleged and no spill is known to have occurred at that location.

---

## 7. Sectors, officers, and access control

The console covers the Indian Coast Guard's own command structure — five regions subdivided into
sixteen district-sized patrol sectors spanning the mainland coast and both island territories — plus
the Dover Strait, which exists because it is the one sector with dense live AIS.

| Region | Sectors | Count |
|---|---|---:|
| North-West | Gulf of Kutch (Kandla & Mundra), Gujarat Offshore Lane, Bombay High | 3 |
| West | Mumbai Approaches, Ratnagiri–Vengurla, Goa–Karwar, Mangaluru–Malpe, Kochi–Kozhikode, Lakshadweep Sea | 6 |
| East | Cape Comorin & Gulf of Mannar, Palk Bay–Coromandel, Chennai–Ennore, Kakinada–Visakhapatnam | 4 |
| North-East | Paradip–Dhamra, Sandheads & Haldia Approaches | 2 |
| Andaman & Nicobar | Andaman & Nicobar Sea, covering the Great Channel | 1 |
| Europe | Dover Strait — live AIS reference sector under the Bonn Agreement | 1 |

Sectors may share edges but never overlap: a detection is filed under the first sector whose outline
contains it, so an overlap would make ownership silently order-dependent.
`python -m scripts.check_sectors` proves no two overlap, and that every incident, tile and vessel
sits inside the sector it claims.

### Two officers, split by data source

Access is scoped by role on the server, not hidden in the UI. Officers are divided by *provenance*
rather than geography, so no single account can ever display a mixture — whichever demo is running,
everything on screen has one origin.

| Account | Holds | Sectors | Vessel data |
|---|---|---:|---|
| `officer@sagarnetra.in` — Lt. A. Menon | The reconstructed Indian coast | 15 | Scenario |
| `officer.ais@sagarnetra.in` — Lt. Cdr. K. Nair | Chennai–Ennore, Dover Strait | 2 | **Real** |
| `admin@sagarnetra.in` — Cmdt. R. Iyer | Provisioning, sector assignment, audit | 17 | Both, labelled |

Passwords: `Officer@123` / `Admin@123` (overridable via `SEED_OFFICER_PASSWORD` /
`SEED_ADMIN_PASSWORD`).

An officer who opens a sector outside their own gets a **404, not a 403** — the endpoint does not
confirm that water they cannot see exists. An officer assigned no sectors sees nothing, rather than
everything.

---

## 8. Open issue — fix before demonstrating

On branch `ml/binary-oil-detector`, the line that stamps
`"SYNTHETIC PLACEHOLDER - not satellite imagery"` was removed from `ml/samples/make_synthetic.py`,
and `kut-04` and `mum-02` are now flagged `synthetic: False` with a comment describing them as real
Sentinel-1 tiles.

Their pixels say otherwise. Both are still 512×352 generated speckle, while the genuinely real tiles
(`guj-01`, `che-03`) are 256×256 RGB with true SAR structure.

Two synthetic images are therefore presented as satellite data, unlabelled, in a satellite-detection
product. A judge who opens one will see uniform random noise. The fix is small — restore the
watermark and the honest flags, or finish replacing all four tiles — and it protects the credibility
the rest of §3 buys.

---

## 9. Architecture

| Tier | Built with | Lines |
|---|---|---:|
| Console (`web/`) | React 19, TypeScript, Vite, Tailwind v4, Leaflet, cobe, TanStack Query, Zustand | 5,103 |
| API (`backend/`) | FastAPI, Motor (async MongoDB), PyJWT, bcrypt, shapely — 31 endpoints | 3,947 |
| ML (`ml/`) | PyTorch for training, ONNX Runtime for serving, OpenCV for the fallback | 1,012 |

Routers stay thin; logic lives in `backend/app/services/`. MongoDB holds GeoJSON throughout with
2dsphere indexes. The whole test suite runs against in-memory Mongo with no server needed.

**Collections:** `users` · `watch_zones` · `detections` · `incidents` · `vessels` · `ais_positions`
· `reports` · `audit` · `counters`.

### Security posture

- bcrypt at cost 12; HS256 JWT with a 12-hour expiry; no public signup.
- Rate-limited login returning a uniform error, so accounts cannot be enumerated.
- Every read endpoint filtered by the officer's assigned sectors, server-side.
- An audit log entry on every sensitive action; CORS locked to the console origin.
- A React error boundary around the routed page, so one malformed record cannot blank the console.

---

## 10. What is genuinely ours

The pipeline concept is prior art and we say so first: SkyTruth Cerulean has done Sentinel-1 plus AIS
scoring since 2023, and EMSA CleanSeaNet has run drift-and-AIS intersection since 2007. Claiming
novelty there would be the fastest way to lose a technical judge.

What we add sits after detection, in the part nobody built:

- **Inspection targeting as the output.** Not an alert and not a database row — a ranked boarding
  shortlist aimed at the person holding the clipboard, which is where MARPOL cases are actually made.
- **An explainable fused score.** Eight features, every contribution and its evidence rendered on
  screen, rather than a similarity number from a black box.
- **Physically-modelled backtracking** with uncertainty that grows with slick age, instead of ranking
  by simple proximity.
- **A court-shaped evidence pack** — immutable, revisioned, hash-stamped, and explicit about which of
  its own inputs are real.
- **Coast Guard workflow** throughout: the real sector structure, sector-scoped access, and officer
  verification as a gate the model cannot bypass.

---

## 11. Limitations and roadmap

- **The model is an early prototype.** mIoU 0.675 from a scratch-trained binary U-Net is a real
  number, not a good one. The five-model bake-off is written and waiting on compute.
- **Look-alike discrimination is not trained.** Needs the gated Krestenitis 5-class set; until then
  the classical filter handles it, which is defensible but weaker.
- **Two sample tiles are synthetic and currently mislabelled** — see §8.
- **Satellite ingest is bundled, not live.** A free CDSE token switches it on; the collector is
  written.
- **Indian AIS coverage is thin.** Chennai works; the west coast has no public receivers. In
  deployment the Coast Guard's own coastal AIS network supplies the same message types unchanged.
- **Revisit gap of 1–6 days** is a property of Sentinel-1, not a defect. It is the reason the drift
  uncertainty model exists.

**The honest one-line summary, and the one to say out loud:** *the physics and the ships are real;
the satellite images are partly synthetic and the network is an early prototype.* The Dover case is
the proof — real weather, real drift, 122 real vessels ranked, a real transponder gap found, and a
system that declined to accuse anybody.

---

## 12. Running it

```bash
# backend — Python 3.13 venv, MongoDB running
cd backend && source .venv/bin/activate
python -m scripts.seed_db                      # accounts, sectors, cases, evidence packs
python -m scripts.check_sectors                # prove the sector grid is sane
uvicorn app.main:app --reload --port 8000

# frontend
cd web && npm run dev                          # http://localhost:5173

# live AIS recorder (needs AISSTREAM_API_KEY in backend/.env)
caffeinate -i nohup python -m scripts.ais_collector > ais.log 2>&1 &
```

Keep the recorder running during the demo: vessels age out of a sector two hours after their last
report, and the Dover case pins its acquisition time to the newest live report at seed time.

---

*Scores in this system are investigative priority. They are not a probability of guilt, and not a
verdict.*
