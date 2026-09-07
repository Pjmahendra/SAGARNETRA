# SAGARNETRA web

React 19 + TypeScript + Vite 8 + Tailwind v4.

```bash
npm install
npm run dev        # http://localhost:5173, runs on bundled mock data when VITE_API_BASE is empty
npm run build      # type-check + production build
npm run lint
```

Set `VITE_API_BASE=http://localhost:8000` in `.env` to talk to the FastAPI backend.

Demo accounts in mock mode: `officer@sagarnetra.in / Officer@123`, `admin@sagarnetra.in / Admin@123`.
