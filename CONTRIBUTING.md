# Contributing to SAGARNETRA

Thanks for helping. This is a hackathon project with a small team, so the process is light but the checks are real.

## Set up

Follow **Quick start** in the [README](README.md). You do not need an AIS key or a trained model to work on most of the code: the frontend runs on mock data, the backend tests run on in-memory Mongo, and the detector falls back to a heuristic.

## Workflow

1. Branch from `main`: `feat/<short-name>`, `fix/<short-name>` or `docs/<short-name>`.
2. Make your change, with a test if it touches backend behaviour.
3. Run the checks below.
4. Open a pull request using the template. CI must be green before merge.

## Checks (same as CI)

```bash
cd backend && pytest -q && ruff check .
cd web && npm run lint && npm run build
```

## Conventions

- **Backend:** routers stay thin, logic lives in `backend/app/services/`. Settings come from environment variables via pydantic-settings.
- **Frontend:** pages in `web/src/pages/`, API client in `web/src/lib/api.ts`, Zustand for UI state, TanStack Query for server data.
- **Units:** every number shown to an officer carries a unit. Timestamps are UTC. Coordinates are decimal degrees, 4 places.
- **Honesty about data:** anything generated must be labelled as scenario or synthetic in the UI and in evidence packs. Never present generated data as real.
- **Framing:** the product targets *inspection*, not culprit attribution. Keep wording consistent with that.
- **Decisions:** when you change a locked decision, append a dated entry to [docs/DECISIONS.md](docs/DECISIONS.md). Append, never rewrite.

## Commit messages

Short imperative subject line saying what changed and why it matters, for example `Scope sectors by role, and stop /api/sectors leaking other officers' water`.

## Never commit

`.env` files, `ml/data/`, `ml/weights/*.pt`, `node_modules`, `.venv`, or anyone else's material. The sample tiles in `ml/samples/` are synthetic on purpose; do not replace them with licensed imagery.
