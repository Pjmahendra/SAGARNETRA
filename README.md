# SAGARNETRA

**Maritime oil-spill intelligence for the Indian Coast Guard.**
Smart India Hackathon 2026 · PS SIH26143 · Team AZIMUTH

SAGARNETRA finds oil slicks in Sentinel-1 radar imagery, works out where the oil came from, pulls every ship that was there, and hands a pollution officer a ranked, explainable list of vessels to inspect.

```
SAR scene → U-Net detects slick → geolocate + drift backtrack → AIS ships in the zone → categorise + rank → officer evidence pack
```

## Documents

| File | What it is |
|---|---|
| [docs/build-plan.html](docs/build-plan.html) · [PDF](docs/SAGARNETRA_Build_Plan.pdf) | Full build plan: roles, features, every module, data model, API, schedule, demo |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Dated log of decisions |
| [docs/research.md](docs/research.md) | Verified research dossier and prior art |
| [CLAUDE.md](CLAUDE.md) | Working context for anyone (or any AI session) picking up the repo |

## Repository

```
web/       React 19 + TypeScript + Vite + Tailwind v4 (frontend, Vercel)
backend/   FastAPI + MongoDB (API + ML serving, Render)
ml/        U-Net training, export, inference (PyTorch → ONNX)
docs/      plan, decisions, research
```

## Run locally

```bash
# database
docker compose up -d

# frontend
cd web && npm install && npm run dev

# backend
cd backend
python3.13 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend on http://localhost:5173, API on http://localhost:8000, API docs at http://localhost:8000/docs.

## Status

Week 1 of 10. See the schedule in the build plan.
