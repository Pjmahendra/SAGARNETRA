# SAGARNETRA

Maritime oil-spill intelligence platform for Smart India Hackathon 2026, problem statement SIH26143. Team AZIMUTH.

One pipeline, end to end: Sentinel-1 SAR scene → U-Net detects the slick → geolocate + drift backtrack to origin zones → AIS ships in those zones → categorise + explainable risk ranking → officer evidence pack (inspection targeting, not culprit attribution).

## Where the truth lives

- `docs/build-plan.html` and `docs/SAGARNETRA_Build_Plan.pdf`: the full build plan (roles, features, every module's stack, data model, API, 10-week schedule, demo script). Read this before changing architecture.
- `docs/DECISIONS.md`: dated log of locked decisions. Append, never rewrite.
- `docs/research.md`: verified research dossier. Cerulean (SkyTruth) is prior art; our differentiators are inspection-targeting framing, look-alike discrimination for Indian waters, drift backtrack, one fused calibrated score, Indian Coast Guard workflow.

## Build status

- Done: repo; frontend shell (`web/`, mock mode or real API via `VITE_API_BASE`); backend auth + admin + read endpoints + seed + tests (`backend/`); detection service (`ml/` + `backend/app/routers/detect.py`): upload or sample tile → ONNX U-Net if `ml/weights/*.onnx` exists else heuristic → polygon, area, centroid, heading, mask overlay, persisted detection, officer verify (confirmed / lookalike+reason / uncertain). Sample tiles in `ml/samples/` are SYNTHETIC placeholders, watermarked and flagged `synthetic: true`.
- Done: create-incident pipeline (`backend/app/services/{weather,drift,ranking,incidents}.py`, router `incidents.py`): Open-Meteo wind+current → backtracked origin ellipses at t-6/12/24 h → candidates from `ais_positions` → eight-feature score → stored incident with events; endpoints for events (note/status/inspection/psc_request), rerank, tracks. Seed writes ~1,150 scenario AIS positions (`source: scenario`).
- Done: 5-model training pipeline (`ml/{models,dataset,train,export}.py` + `notebooks/train_colab.ipynb`, deps in `ml/requirements-train.txt`): one shared harness trains all five candidates (unet_scratch, unet_resnet34, unetpp_resnet34, deeplabv3p_resnet50, fpn_effb3), scores per-class IoU/mIoU/params/CPU-ms on the Krestenitis test split, writes `ml/metrics.json`, exports the winner to `weights/<name>.onnx` + sidecar. Push-button once the dataset lands; see DECISIONS.md 2026-09-08. Training itself still needs the Krestenitis dataset.
- Next: run the training (needs Krestenitis dataset), AIS live collector (needs AISSTREAM_API_KEY), real Sentinel-1 tiles (needs CDSE token), report PDF (regressed — see below), Cesium, admin create-user form.

## Layout

```
web/       React 19 + TypeScript + Vite 8 + Tailwind v4. Deploys to Vercel.
backend/   FastAPI on Python 3.13, Motor/MongoDB, PyJWT, bcrypt. Deploys to Render (Docker).
ml/        U-Net (PyTorch) trained on Colab, exported to ONNX, served with onnxruntime.
docs/      plan, decisions, research.
```

## Locked decisions (summary; details in docs/DECISIONS.md)

- Two roles only: `admin` (provisions users, watch zones, audit, health) and `officer` (the main user). No public signup. Roles nest: admin can do everything officer can.
- Auth: email + bcrypt (cost 12) + HS256 JWT, 12 h expiry, token in localStorage, `Authorization: Bearer`. No refresh tokens for now.
- Python 3.13 for backend and ML (already on this Mac). Not 3.14.
- Serve the model with onnxruntime, not torch, so Render memory stays under 400 MB.
- Globe: Cesium for the app map (Live Map). `cobe` for the landing hero and the Dashboard "Where the slicks are" panel (`web/src/components/SpillGlobe.tsx`) — clickable per-incident dots, tier-coloured, two-way selection with the incident list.
- Database: MongoDB Atlas M0, GeoJSON + 2dsphere indexes. Local dev: `brew services start mongodb-community` or `docker compose up`.
- Heuristic dark-spot fallback always available; the API reports `engine: "unet" | "heuristic"` and the UI shows it.
- Demo incident's historical AIS tracks are a generated scenario; the live feed (AISStream) is real. Say so in the UI and the pitch.

## Conventions

- Backend: routers thin, logic in `backend/app/services/`. Settings from env via pydantic-settings. Tests in `backend/tests/` run against in-memory Mongo.
- Frontend: pages in `web/src/pages/`, API client in `web/src/lib/api.ts`, auth in `web/src/auth/`, map in `web/src/map/`, Zustand for UI state, TanStack Query for server data.
- Every number shown to the officer carries a unit. Timestamps in UTC. Coordinates as decimal degrees, 4 places.
- Never commit: `.env`, `ml/data/`, `ml/weights/*.pt`, `node_modules`, `.venv`.

## Commands

```
cd web && npm install && npm run dev            # frontend on http://localhost:5173
cd backend && python3.13 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env                             # then set JWT_SECRET
python -m scripts.seed_db                        # admin@sagarnetra.in / Admin@123, officer@sagarnetra.in / Officer@123
uvicorn app.main:app --reload --port 8000        # backend on http://localhost:8000, docs at /docs
pytest -q && ruff check .                        # tests run on in-memory Mongo, no server needed
docker compose up -d                             # local MongoDB on 27017 (or: brew services start mongodb-community)
```

## Working with Claude on this repo

Sessions and memory are local to the machine, so switching Claude accounts keeps context. If you start a fresh session, this file plus `docs/DECISIONS.md` and the build plan are enough to continue. Update `docs/DECISIONS.md` whenever a decision changes.
