# SAGARNETRA API

FastAPI on Python 3.13, MongoDB via Motor.

```bash
python3.13 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env            # set JWT_SECRET (python -c "import secrets;print(secrets.token_hex(32))")
docker compose -f ../docker-compose.yml up -d      # or: brew services start mongodb-community
python -m scripts.seed_db       # admin@sagarnetra.in / Admin@123, officer@sagarnetra.in / Officer@123
uvicorn app.main:app --reload --port 8000
```

Docs at http://localhost:8000/docs. Tests: `pytest -q` (runs against an in-memory Mongo, no server needed). Lint: `ruff check .`
