# SAGARNETRA — Architecture (for the deck)

*Maritime oil-spill intelligence for the Indian Coast Guard · Smart India Hackathon 2026 · PS SIH26143 · Team AZIMUTH*

Each `##` section below maps to roughly one slide.

---

## 1. One line
A satellite spots an oil slick at sea → SAGARNETRA works out **where the oil came from**, cross-references **which ships were there**, and hands a Coast Guard officer a **ranked, explainable list of vessels to inspect.**

## 2. The problem
- Illegal/operational oil discharge at sea is chronic and **largely unattributed** — a decade of Sentinel-1 over one corridor found 355 spills, **0 vessels attributed** (Elshahat 2024).
- Satellites see the *slick*, not the *source* — and slicks drift for hours before imaging.
- Coast Guards can't board every ship. They need **targeting**: which arriving vessel to inspect first.

## 3. Our positioning (the defensible thesis)
SAGARNETRA is an **inspection-targeting / triage tool — not an accusation engine.**
It outputs a *boarding-priority shortlist*; enforcement is confirmed by boarding + oil-sample match. This is honest (SAR can't prove a source alone) and plugs into the mechanism that actually works. *(Prior art: SkyTruth Cerulean — we cite it ourselves; our edge is Indian-waters focus, physical drift backtrack, one calibrated explainable score, and ICG workflow.)*

## 4. End-to-end pipeline
```
Sentinel-1 SAR tile
  → (1) DETECT      U-Net segments the oil slick (area, centroid, heading, confidence)
  → (2) VERIFY      officer confirms / dismisses look-alike / marks uncertain
  → (3) BACKTRACK   wind + ocean current, integrated backwards → origin zones t-6/12/24h
  → (4) CORRELATE   AIS tracks that were inside those zones at those times
  → (5) RANK        8 weighted features → one 0-100 score, each with evidence
  → EVIDENCE PACK   ranked vessels + drift + timeline → printable report
```
Why backtrack: the satellite images a slick *after* it has drifted from its source; we integrate the motion backwards to find the origin, then match AIS there.

## 5. System architecture (3 tiers)
```
FRONTEND  React 19 + TypeScript + Vite + Tailwind        (deploy: Vercel)
          Leaflet (real satellite map) · cobe (globe) · TanStack Query · Zustand
                     │  REST + JWT (Bearer)
BACKEND   FastAPI + Motor (async MongoDB) + PyJWT + bcrypt (deploy: Render/Docker)
          onnxruntime (model serving) · Open-Meteo (weather) · AISStream (live AIS)
                     │
ML        U-Net (PyTorch → ONNX), trained offline on Colab, served via onnxruntime
DATA      MongoDB (GeoJSON + 2dsphere indexes)
```

## 6. Detection model — ours vs pre-existing
- **Our model:** a U-Net trained by us on **real Sentinel-1 SAR** (public Deep-SAR / Krestenitis-lineage set, ~4,200 tiles). Binary segmentation (sea / oil). **mIoU ≈ 0.675, oil IoU ≈ 0.62.** Exported to **ONNX**, served with onnxruntime (small footprint, <400 MB).
- **Benchmarked against published SOTA:** DeepLabV3+ **65%** (Krestenitis 2019), U-Net/LinkNet/PSPNet, and a **pretrained U-Net ResNet-34 (79% mIoU)** we downloaded and verified.
- **Two engines, side by side in the console:** the trained **U-Net** vs a classic **dark-spot heuristic** baseline — click either to run on a tile and compare. Honest fallback: if no trained weights are present, the heuristic answers, always labelled.
- 5-class upgrade path (sea/oil/look-alike/ship/land) ready once the gated Krestenitis set is obtained — same pipeline.

## 7. The ranking model (the explainable core)
Each candidate vessel scores **0–100** = sum of 8 weighted features, each emitting a human-readable evidence string:

| Feature | Weight | Signal |
|---|---|---|
| Spatial fit | 25 | closeness of the track to an origin zone |
| AIS gap | 20 | transponder silence ("going dark") near the zone |
| Temporal fit | 15 | time spent inside the zone's time window |
| Heading match | 10 | course vs. the slick's long axis |
| Manoeuvre | 10 | speed drop / course change |
| Draft change | 8 | tanker riding higher after offloading |
| Type prior | 8 | tanker > cargo > other |
| History | 4 | prior incidents |

Tiers: **prime ≥ 65**, person-of-interest 35–64, cleared < 35. Nothing is a black box — the investigation view shows every feature's contribution.

## 8. Drift + AIS correlation
- **Drift:** first-order Lagrangian backtrack — slick velocity = surface current + 3% wind — stepped backwards to origin ellipses at t-6/12/24h that **grow with uncertainty**. Weather is **real, live** from Open-Meteo (marine + forecast), with an honest climatological fallback.
- **AIS:** vessels are matched inside the origin zones/time-windows; tracks interpolated so transponder gaps still register.

## 9. Real data vs scenario (our integrity line)
| Element | Status |
|---|---|
| Satellite imagery (detect) | **Real** Sentinel-1 SAR tiles |
| Detection model | **Real** — our U-Net, trained on real SAR |
| Weather / current (drift) | **Real** — live Open-Meteo per slick + time |
| **Live AIS (Dover Strait)** | **Real** — recorded live from AISStream |
| AIS history for the India demo | **Scenario** — generated, clearly labelled |
| Nothing is hardcoded | new spills arrive via the scenario feed / live CDSE collector |

Two officer accounts demonstrate both modes: **India = labelled scenario**, **Dover = real live AIS**.

## 10. Officer experience (the app)
- **Dashboard:** cobe globe of sectors → click a sector → dives into the real Leaflet map with the slick, drift ellipses, AIS tracks.
- **Detect console:** run U-Net or heuristic on a tile, read the evidence, confirm/dismiss → opens an incident.
- **Incidents:** pending-first boarding worklist; click for a wind + AIS quick-look; tag vessels for inspection.
- **Investigation:** full evidence pack — slick facts, drift assumptions, ranked vessels with per-feature bars, timeline, export.
- **Reports:** immutable, revisioned evidence pack, printable (A4).
- **Admin:** provision officers, assign ICG sectors, audit log, system health.

## 11. Security & roles
- Two roles: **admin** (provisions users, sectors, audit, health) and **officer** (casework); roles nest.
- **bcrypt** (cost 12) + **HS256 JWT** (12 h), rate-limited login with uniform errors (no user enumeration), CORS locked, **audit log** on every action, **zone-scoped** data access.

## 12. Tech stack (one glance)
**Frontend:** React 19, TypeScript, Vite, Tailwind v4, Leaflet, cobe, TanStack Query, Zustand, Framer Motion.
**Backend:** Python 3.13, FastAPI, Motor/MongoDB, PyJWT, bcrypt, onnxruntime, httpx, slowapi.
**ML:** PyTorch (train), segmentation-models-pytorch, ONNX/onnxruntime (serve), OpenCV, rasterio, shapely, pyproj.
**External (free):** Open-Meteo (weather), AISStream (live AIS), Copernicus/CDSE (Sentinel-1).
**Infra:** MongoDB Atlas, Vercel (web), Render (API), GitHub Actions CI.

## 13. What's genuinely novel (differentiators)
1. **Inspection-targeting framing** (defensible, not "we caught the culprit").
2. **Physically-modelled drift backtrack** to origin zones (not just geometric).
3. **One calibrated, fully-explainable fused score** with published thresholds.
4. **Region-specific** look-alike focus for Indian waters.
5. **ICG sector workflow** + officer evidence pack.

## 14. Roadmap / honest limitations
- Model is an early prototype → full 5-model Colab bake-off + real 5-class training on the Krestenitis set.
- Live satellite ingestion (**CDSE collector** scaffolded) turns on with a free token → real coordinates, auto-updating per pass.
- Sentinel-1 revisits every ~1–6 days (physics) — the drift-uncertainty model accounts for it.

---
*Full build detail: `docs/PROJECT_REPORT.md`, `docs/DECISIONS.md`, `docs/research.md`.*
