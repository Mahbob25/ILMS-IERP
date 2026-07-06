# Development Guide

## Prerequisites

- Python 3.12+
- Node.js 20+
- Docker Desktop (for database container)
- PostgreSQL 16 + pgvector (via Docker)

---

## Quick Start

### 1. Start database

```bash
docker compose up database -d
```

Runs PostgreSQL 16 + pgvector on port `5440`.

### 2. Backend setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate     # Windows
pip install -r requirements.txt
```

Create `backend/.env`:

```
DATABASE_URL=postgresql+asyncpg://lims:lims_secure_pass@localhost:5440/lims
JWT_SECRET_KEY=<generate-a-strong-random-key>
```

Run migrations:

```bash
alembic upgrade head
```

Start server:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:3000`.

---

## Docker vs Local Development

Backend and frontend containers are **disabled** in `docker-compose.yml` by default. Run them from the terminal for hot reload.

### Caddyfile proxying

When running locally, edit `infrastructure/caddy/Caddyfile` to proxy to host:

```
reverse_proxy /api/v1/* host.docker.internal:8000
reverse_proxy * host.docker.internal:3000
```

Revert to service names before building Docker images:

```
reverse_proxy /api/v1/* backend:8000
reverse_proxy * frontend:3000
```

---

## Common Commands

| Task | Command |
|------|---------|
| Create migration | `alembic revision --autogenerate -m "description"` |
| Apply migrations | `alembic upgrade head` |
| Rollback one step | `alembic downgrade -1` |
| Run backend tests | `python -m pytest backend/tests/ -v` |
| Run E2E tests | `npx playwright test` |
| TypeScript check | `npx tsc --noEmit` |
| Frontend build | `npm run build` |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `bcrypt` import error in passlib | Pin `bcrypt==4.0.1` in requirements (5.x incompatible with passlib) |
| Frontend infinite redirect | Remove `i18n` from next.config.js — use middleware for locale |
| `exec format error` on Caddy | Use `caddy:latest` instead of `caddy:2.7-alpine` |
| npm cache full on C: drive | `npm install --cache E:\lms\.npm-cache` |
| Timezone-naive DB error | Strip tzinfo with `.replace(tzinfo=None)` before inserting |
