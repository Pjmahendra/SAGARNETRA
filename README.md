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
| [docs/build-plan.html](docs/build-plan.html) | Full build plan: roles, features, every module, data model, API, schedule, demo |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Dated log of decisions |
| [docs/research.md](docs/research.md) | Verified research dossier and prior art |
| [docs/PROJECT_REPORT.md](docs/PROJECT_REPORT.md) | Full verified project & engineering report (architecture, provenance, worked case) |
| [docs/PPT_HANDOFF.md](docs/PPT_HANDOFF.md) | SIH deck progress/handoff — what's in `docs/SAGARNETRA_SIH26143_Deck_6Page.pptx` and how to keep editing it |
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
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env          # then set JWT_SECRET
python -m scripts.seed_db     # admin@sagarnetra.in / Admin@123
uvicorn app.main:app --reload --port 8000
```

Frontend on http://localhost:5173, API on http://localhost:8000, API docs at http://localhost:8000/docs.

Seeding creates two officer accounts, split strictly by data source: `officer@sagarnetra.in` (15 scenario sectors) and `officer.ais@sagarnetra.in` (2 live-AIS sectors — Chennai–Ennore and the Dover Strait), both `Officer@123`.

## Status

- **Built:** frontend shell, auth + admin + read API, SAR detection (ONNX U-Net with a heuristic fallback), the full create-incident pipeline (weather → drift backtrack → AIS candidates → 8-feature explainable ranking), immutable evidence-pack reports with chain-of-custody hashes, a live AIS recorder feeding two real sectors, and a national grid of 16 Indian sectors with deterministic scenario traffic sized to each one's real busyness.
- **A worked case** in the Dover Strait is ranked against ~120 real recorded AIS vessels, 7 with genuine MMSIs and tracks — every evidence pack states which of its inputs are real.
- **Next:** run the 5-model training pipeline once the Krestenitis dataset lands, bring in real Sentinel-1 tiles, and add the admin create-user form.

See [docs/DECISIONS.md](docs/DECISIONS.md) for the dated decision log and [docs/build-plan.html](docs/build-plan.html) for the full schedule.
