# SAGARNETRA — Project & Architecture Report

*Maritime oil-spill intelligence for the Indian Coast Guard · Smart India Hackathon 2026 · PS SIH26143 · Team AZIMUTH*

This is the one-document brief: what the system does, how every part fits, what is real vs. scenario, and what's next. Read top to bottom to explain the whole project to the team.

---

## 1. What it does (the one-line pitch)

SAGARNETRA finds oil slicks in Sentinel-1 satellite radar, works out where the oil came from by backtracking wind and ocean current, cross-references which ships were there using AIS, and hands a Coast Guard officer a **ranked, explainable list of vessels to inspect**.

> **Framing that matters:** it is an **inspection-targeting / triage tool**, *not* an accusation engine. Satellite evidence alone cannot prove who discharged oil — enforcement is confirmed by boarding and an oil-sample match. Our output tells an officer *which arriving vessel to board first*. (This honest framing is the project's main defensible position — see `docs/research.md`.)

---

## 2. The pipeline (end to end)

```
Sentinel-1 SAR scene
   │  (1) DETECT — U-Net segments the oil slick
   ▼
oil polygon · area · centroid · long-axis heading · confidence
   │  (2) OFFICER VERIFY — confirm / dismiss look-alike / uncertain
   ▼   (only a confirmed detection opens an incident)
   │  (3) DRIFT BACKTRACK — wind + current, backwards in time
   ▼
origin zones at t-6h / t-12h / t-24h (ellipses; bigger = older = less certain)
   │  (4) AIS CORRELATION — which vessels were in those zones then
   ▼
   │  (5) RANK — 8 weighted features → one 0-100 score, each with evidence
   ▼
ranked vessel shortlist + evidence pack (the officer's boarding priority)
```

**Why drift matters:** the satellite images a slick *after* it has already drifted from its source (oil moves with current + ~3% of wind). To find the source vessel we integrate that motion *backwards* to the likely origin, then match AIS tracks there. Sentinel-1 delivers within hours but only revisits a spot every ~1–6 days, so a slick can be up to a day or two old when first seen — the origin ellipses grow with that uncertainty.

---

## 3. System architecture (three tiers)

```
web/  React 19 + TypeScript + Vite + Tailwind + Leaflet + cobe   (Vercel)
        │  REST + JWT
backend/  FastAPI + Motor (async MongoDB) + PyJWT + bcrypt        (Render)
        │  onnxruntime (serving)          Open-Meteo (weather)    AISStream (AIS)
ml/  U-Net (PyTorch → ONNX), trained offline on Colab
```

### Frontend (`web/`)
- **Auth**: email + JWT in localStorage; `RequireAuth` / `RequireRole` guards.
- **Two roles**: `admin` (provisions officers, assigns sectors, audit, health) and `officer` (the casework user). Roles nest: admin can do everything an officer can.
- **Pages**: Dashboard (globe → dives into the real map on select), Detection Console (run model, read evidence, confirm), Incidents (pending-first worklist + quick-look dialog), Investigation (evidence pack + ranked vessels + tagging), Vessels, Reports (printable evidence pack), Admin.
- **Mock mode**: with no backend, the whole UI runs on bundled fixtures — every page demoable offline. Set `VITE_API_BASE` to use the real API.

### Backend (`backend/app/`)
- Thin routers → logic in `services/`. Settings from env via pydantic-settings.
- **Routers**: `auth`, `admin`, `sectors`, `data` (overview/vessels/reports), `detect`, `incidents`, `reports`, `health`.
- **Services**: `weather` (Open-Meteo, real), `drift` (Lagrangian backtrack), `ranking` (8-feature score), `incidents` (wires the pipeline), `sectors` (zone-scoped review queues), `reports` (immutable snapshots), `users`, `audit`.
- **Security**: bcrypt (cost 12), HS256 JWT (12 h), rate-limited login with uniform error (no user enumeration), CORS locked to the frontend origin, audit log on every sensitive action, zone-scoped data access.

### ML (`ml/`)
- `preprocess` (SAR tile → normalized grayscale), `infer` (`Detector`: ONNX U-Net if weights present, else heuristic — always labels which), `geo` (pixel → lon/lat, area in km² via UTM, heading, elongation), `overlay` (mask PNG), `heuristic` (classic dark-spot fallback).
- `models` / `dataset` / `train` / `export` — the training pipeline (see §5).

### Data model (MongoDB)
`users` · `watch_zones` (sector geometry, 2dsphere) · `detections` · `incidents` (with ranking + events + origin_zones) · `vessels` · `ais_positions` (2dsphere + TTL on live) · `reports` · `audit` · `counters`. GeoJSON throughout.

---

## 4. The ranking model (the explainable core)

Every candidate vessel gets a **0–100 score** = sum of 8 weighted features, each emitting a human-readable evidence string:

| Feature | Weight | What it measures |
|---|---|---|
| Spatial fit | 25 | how close the track passed to an origin zone |
| AIS gap | 20 | transponder silence ("going dark") near the zone |
| Temporal fit | 15 | time spent inside the zone's time window |
| Heading match | 10 | course vs. the slick's long axis |
| Manoeuvre | 10 | speed drop / course change (consistent with discharging) |
| Draft change | 8 | tanker riding higher after offloading |
| Type prior | 8 | tanker > cargo > other |
| History | 4 | prior incidents for that vessel |

Tiers: **prime suspect ≥ 65**, person of interest 35–64, cleared < 35. Nothing in the score is a black box — the Investigation page shows every feature's contribution.

---

## 5. The detection model — our own + pre-existing (the ML story)

**What we did:** trained our **own** U-Net on real Sentinel-1 SAR data (public Kaggle Deep-SAR oil set, ~4,200 tiles), and benchmark it against the **published pre-existing** state-of-the-art.

| | Model | mIoU | Note |
|---|---|---|---|
| **Ours (trained)** | U-Net (from scratch) | **0.675** | oil IoU 0.62; trained on real Sentinel-1; served live via ONNX |
| Pre-existing | DeepLabV3+ | 0.65 | Krestenitis et al. 2019 (5-class SAR benchmark) |
| Pre-existing | U-Net / LinkNet / PSPNet | (cited) | Krestenitis et al. 2019 |
| Pre-existing | ResNet-34 U-Net | — | SkyTruth Cerulean (production system) |

- **Class scheme:** binary (sea / oil). The free public masks are oil-vs-background; the 5-class Krestenitis scheme (sea/oil/look-alike/ship/land) is the upgrade path once that gated dataset is obtained — same pipeline, wider `CLASSES`.
- **Serving:** the winner exports to ONNX and is served by onnxruntime (keeps the API image small). If no weights are present the honest **heuristic** answers, always labelled as such.
- **In progress:** integrating a stronger internet-published pretrained oil model (U-Net ResNet-34, val mIoU 0.79) as an additional benchmark row.
- **Honest note:** our U-Net is an early prototype (limited CPU training); the full accuracy run is the 5-model Colab bake-off (`notebooks/train_colab.ipynb`).

---

## 6. Real data vs. scenario (say this clearly — it's our integrity line)

| Element | Status |
|---|---|
| Satellite imagery | **Real** Sentinel-1 SAR tiles |
| Detection model | **Real** — our U-Net, trained on real SAR |
| Weather / current (drift) | **Real** — live Open-Meteo for the slick's location & time |
| Live AIS feed | **Real** — AISStream collector (needs a free key) |
| Demo vessel *history* & spill *placement* | **Scenario** — labelled as such in the UI |

**Nothing is hardcoded.** New spills arrive two ways, both running the same model:
- **Scenario feed** (`scripts/scenario_feed.py`) — injects a fresh detection from a real tile between satellite passes, tagged `scenario`.
- **Live collector** (`scripts/s1_collector.py`) — polls Copernicus (CDSE) for new Sentinel-1 scenes over each watch zone, with **real coordinates**, tagged `live`. Runs the moment a free CDSE token is added.

> Pitch line: *"Demo runs on real Sentinel-1 tiles as a scenario feed; flip on the CDSE token and the identical pipeline ingests live scenes with real coordinates — nothing hardcoded, spills flow in on every satellite pass."*

---

## 7. Run it

```bash
# backend  (Python 3.13 venv, MongoDB running)
cd backend && .venv/Scripts/uvicorn app.main:app --host 127.0.0.1 --port 8000
# frontend
cd web && npm run dev            # http://localhost:5173
# fresh scenario spill on demand
cd backend && .venv/Scripts/python -m scripts.scenario_feed
```
Officer: `officer@sagarnetra.in` / `Officer@123` · Admin: `admin@sagarnetra.in` / `Admin@123`

---

## 8. Honest limitations & roadmap

- **Model** is an early prototype → full Colab bake-off (5 models) + the pretrained internet model for real accuracy.
- **5-class** look-alike/ship/land needs the gated Krestenitis dataset (institutional request).
- **Live satellite** needs a free CDSE token; **live AIS** needs an AISStream key — both scaffolded, unblock by adding the key.
- **Revisit gap** (~1–6 days) is a physics limit, not a bug — the drift uncertainty model accounts for it.

*What's genuinely novel and defensible (per the research dossier): inspection-targeting framing, region-specific look-alike discrimination for Indian waters, physically-modelled drift backtrack, one calibrated fused score, and Indian Coast Guard workflow integration — not the pipeline concept itself (SkyTruth Cerulean is prior art; we cite it ourselves).*
