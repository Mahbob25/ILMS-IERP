# Development Guide

## Prerequisites

- Docker Desktop (with docker compose plugin)
- The repo-root `.env` file (copy from `.env.example`; sensible local defaults are already baked into `docker-compose.yml`, so it works even without it)

---

## Quick Start (everything in Docker)

```bash
docker compose up -d
```

Runs the whole stack in containers:

| Service  | Reachable at              | Notes                                   |
|----------|---------------------------|-----------------------------------------|
| Caddy    | `http://localhost`        | Entry point (proxies API + frontend)    |
| Frontend | via Caddy `/` or `:3000`* | Next.js, `http://localhost:3000`        |
| Backend  | via Caddy `/api/v1` or `:8000`* | FastAPI, `http://localhost:8000` |
| Database | `localhost:5431`          | PostgreSQL 16 + pgvector                |

\* `3000` / `8000` are not published to the host — the browser always talks to `http://localhost`, and Caddy routes `/api/v1/*` and `/uploads/*` to the backend and everything else to the frontend. That keeps the app fully same-origin, so cookies/CORS/CSRF just work.

- **Migrations**: applied automatically when the backend container starts (`alembic upgrade head`). No manual step on fresh clones.
- **Seeded users**: `manager@institute.dev`, `secretary@institute.dev`, `teacher@institute.dev` (created by the seed migration).
- **Logs**: `docker compose logs -f backend` / `frontend` / `caddy`.

### Common commands

| Task | Command |
|------|---------|
| Start stack | `docker compose up -d` |
| Stop (keep data) | `docker compose stop` |
| Full reset | `docker compose down -v` (deletes DB data) |
| Rebuild after code change | `docker compose up -d --build` |
| Run migrations manually | `docker compose exec backend alembic upgrade head` |
| Create a migration | `docker compose exec backend alembic revision --autogenerate -m "description"` |
| Backend tests | `docker compose exec backend python -m pytest tests/ -v` |
| TypeScript check | `npx tsc --noEmit` (in `apps/erp/frontend/`) |
| Frontend build | `npm run build` (in `apps/erp/frontend/`) |

---

## Hot-reload development (DB in Docker, apps on host)

For live reload while editing:

```bash
docker compose up database -d          # only Postgres
```

Backend:

```bash
cd apps/erp/backend
python -m venv .venv
.venv\Scripts\activate                 # Windows
pip install -r requirements.txt
```

Create `apps/erp/backend/.env`:

```
DATABASE_URL=postgresql+asyncpg://lims:lims_secure_pass@localhost:5431/lims
JWT_SECRET_KEY=<generate-a-strong-random-key>
```

```bash
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Frontend:

```bash
cd apps/erp/frontend
npm install
npm run dev                             # http://localhost:3000
```

The Caddyfile always proxies to the compose service names (`backend:8000`, `frontend:3000`), so it only works when the app containers are running. When running apps on the host, access them directly (`http://localhost:3000`, `http://localhost:8000`); no Caddyfile edits needed.

---

## Environment variables

All settings live in the repo-root `.env`, read by docker compose:

- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` — database credentials (defaults: `lims` / `lims_secure_pass` / `lims`)
- `JWT_SECRET_KEY` — required in production; the compose default is for local dev only
- `ENVIRONMENT` — `development` locally, `production` on the server
- `CORS_ORIGINS` — comma-separated allowed browser origins
- `TIMEZONE` — default `Asia/Riyadh`
- `SENTRY_DSN` — optional error monitoring
- `TUNNEL_TOKEN` — Cloudflare tunnel token (production only)

---

## Deploying

One command on the server (with a real `.env`):

```bash
./scripts/deploy.sh
```

It pulls, rebuilds, starts the stack with the `tunnel` profile (cloudflared), and the backend applies migrations on startup. See `docs/operations/cloud-deploy.md`.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Port 80 already in use locally | Change `ports: "80:80"` on the `caddy` service in `docker-compose.yml` to e.g. `"8080:80"` and open `http://localhost:8080` |
| `JWT_SECRET_KEY must be set` crash | Set `JWT_SECRET_KEY` in `.env` to a strong random value |
| Database port conflict | Change `"5431:5432"` on the `database` service |
| `bcrypt` import error in passlib | Pin `bcrypt==4.0.1` in requirements (5.x incompatible with passlib) |
| Frontend infinite redirect | Remove `i18n` from next.config.js — use middleware for locale |
| `exec format error` on Caddy | Use `caddy:latest` instead of `caddy:2.7-alpine` |
| npm cache full on C: drive | `npm install --cache E:\lms\.npm-cache` |
| Timezone-naive DB error | Strip tzinfo with `.replace(tzinfo=None)` before inserting |
