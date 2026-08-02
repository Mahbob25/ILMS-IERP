# Production Launch Checklist

**Status:** code complete (v1.7, 221/221 tests) — pending cloud deployment
**Full detail:** `operations/cloud-deploy.md` · Full historical guide: `archive/launch-guide-v2.md`

## 1. Pre-flight (codebase)

- [ ] All tests pass: backend 221/221, frontend `npm run build` clean
- [ ] `.env` created from `.env.example` with real secrets (`POSTGRES_PASSWORD`, `JWT_SECRET_KEY`, `TUNNEL_TOKEN`)
- [ ] Dockerfile healthchecks and `depends_on: service_healthy` in `docker-compose.prod.yml`

## 2. Deploy

```bash
git pull --ff-only
./scripts/deploy.sh        # build → alembic upgrade head → up -d → healthcheck wait
```

Deploy steps in order: Cloudflare tunnel token in `.env` → Public Hostname `aldrasat.edu` → `HTTP` → `caddy:80`.

## 3. Verify

- [ ] `https://aldrasat.edu/ar/login` loads (frontend)
- [ ] `curl -fsS https://aldrasat.edu/api/v1/health` returns OK (backend)
- [ ] `docker compose -f docker-compose.prod.yml ps` — all 5 services healthy
- [ ] Login smoke test with seeded accounts; process a test payment → receipt prints

## 4. Post-launch hardening

- [ ] Backup cron daily (03:00): `scripts/backup.sh` + EBS snapshots
- [ ] Firewall: SSH only; ports 80/443 closed (Cloudflare Tunnel is the sole ingress)
- [ ] Sentry alerts enabled (`SENTRY_DSN`), log rotation in place
- [ ] Supervisor/on-call: who reacts to Sentry + healthcheck failures
