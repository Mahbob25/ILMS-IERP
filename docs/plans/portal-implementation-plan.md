# Student & Parent Portal — Implementation Plan

**Status:** Draft — ready for review  
**Date:** 2026-08-13  
**Decision record:** `docs/architecture/portal-architecture.md` (Recommended)  
**Related:** `docs/plans/ai-pipeline-implementation-plan.md` §4–§6, `docs/architecture/memory.md`, `docs/architecture/overview.md`, `docs/architecture/database-schema.md`  
**Stack:** FastAPI + Next.js 14 + PostgreSQL 16 + pgvector + Redis 7 (portal-only)  

---

## Table of Contents

1. Executive Summary
2. Scope & Non-Scope
3. Dependencies & Preconditions
4. Repo & Compose Layout
5. Data Model
6. ERP Changes (Phase 0 — prerequisite)
7. Portal BFF (`portal/backend`)
8. Portal Web (`portal/frontend`)
9. AI Service (`ai-service`) — Unified Plane, Isolated Queues
10. Infra, Networking & Deploy
11. API Surface (canonical)
12. Frontend Routes & UX
13. Security, Caching & Observability
14. Phased Delivery (tasks + acceptance gates)
15. Testing & QA
16. File Map (what changes, where)
17. Risks & Mitigations
18. Updates to `ai-pipeline-implementation-plan.md` (applied)
19. Open Questions

---

## 1. Executive Summary

Ship an **external high-traffic portal** for students/parents without destabilizing the internal ERP (`lims`). The ERP stays the **System of Record** (sole writer to `erp.*`). The portal is **two new deployables** (`portal_frontend` + `portal_backend` BFF) plus a **unified stateless `ai-service`** that serves both the internal curriculum ingestion and future student-facing AI (pronunciation coach, code reviewer, revision plan, Arabic tutor). They share one `ai-service` image but run on **separate Redis queues** (`ai:student` HIGH / `ai:ingestion` LOW) so batch ingestion never starves streaming answers.

All three stacks share **one Docker network** (`lims-internal`) and **one Caddy** ingress with **subdomain isolation** (`erp.aldrasat.edu` vs `portal.aldrasat.edu`). Two compose files keep the `memory.md` 4-container ERP limit intact.

---

## 2. Scope & Non-Scope

**In scope (portal v1):**

- Separate schemas on the **same PG host** (`erp.*` + `portal.*`), zero extra infra cost. Split to a 2nd PG host later with a single connection-string change.
- Portal auth **isolated** from ERP: `portal_users` + `parent_links` + `PORTAL_JWT_SECRET`, OTP/phone, subdomain-scoped cookies. Never reuse `users` / `JWT_SECRET_KEY`.
- BFF proxy to ERP via **thin internal API** (`GET /api/v1/internal/portal/*`, `X-Service-Key` + `X-Actor-Id`), with **read-through Redis cache** (TTL 60s, 90%+ hit), `X-Cache`/`X-Data-As-Of` headers.
- Write proxy (rare, e.g. parent contact update) — validated + audited in ERP, portal invalidates its own cache.
- Unified `ai-service` (FastAPI :8002, stateless, GPU-ready) with reliable queue (MVP: `BRPOPLPUSH` + processing list + 30s visibility timeout; upgrade path to Redis Streams `XADD/XREADGROUP/XACK` + DLQ behind a `Queue` interface).
- Subdomain routing in Caddy, `docker-compose.portal.yml` joining `lims-internal`, `ERP_SERVICE_KEY` rotation via `.env`.

**Out of scope / deferred:**

- Fully separate PG host + CDC sync (defer until you actually need two DB hosts — §2 approach C).
- Vercel-hosted `portal_frontend` (keep on VM for v1; move later with no ERP rewrite).
- Full student AI feature set (teased on landing only — ingestion ingestion pipeline ships first; student features are HIGH-queue consumers built after).
- Dark mode (per `frontend-design-rules.md`), new infra beyond Redis in portal compose.

---

## 3. Dependencies & Preconditions

| Dependency | Status | Notes |
|---|---|---|
| ERP 4-container stack (`docker-compose.yml`) | Done | `caddy` :80, `frontend` :3000, `backend` :8000, `database` pg16+pgvector. `lims-internal` bridge. |
| `pgvector` extension + HNSW | Done | `infrastructure/postgres/init.sql` already `CREATE EXTENSION vector`. |
| Cloudflare Tunnel (`cloudflared` profile) | Done / extend | Add portal public hostname `portal.aldrasat.edu → caddy:80` (see §10). |
| `docs/plans/ai-pipeline-implementation-plan.md` tables (§6) | Plan only | `curriculum_documents`, `ingestion_jobs`, `chunks VECTOR(1536) HNSW`, `concepts`, `concept_dependencies`, `questions`, `ai_usage_logs` — migration lands before portal reads RAG. |
| Design system (`frontend-design-rules.md`) | Done | Professional Minimalist, `slate-50` bg, `brand-500 #1E3A8A`, `ai-500 #0D9488`, `lucide-react`, `.card` primitives. Reuse for portal web. |

---

## 4. Repo & Compose Layout

```
lms/
├── docker-compose.yml              # ERP — 4 containers, untouched
├── docker-compose.portal.yml       # NEW — portal + ai-service + redis, joins lims-internal
├── infrastructure/caddy/Caddyfile  # extend with two subdomain blocks
├── backend/                        # ERP — System of Record
│   └── app/modules/portal_internal/  # NEW — thin internal router (Phase 0)
├── portal/                         # NEW — external portal
│   ├── backend/                    # FastAPI BFF :8001
│   └── frontend/                   # Next.js 14 :3001
├── ai-service/                     # NEW — unified, stateless :8002
│   ├── app/queue/                  # Queue interface + BRPOPLPUSH + Streams impls
│   ├── app/llm/                    # Gemini/OpenAI gateway
│   └── app/rag/                    # pgvector lookup (RO via ERP internal API)
└── docs/plans/portal-implementation-plan.md  # this file
```

**Principle:** ERP `docker-compose.yml` never gains a `redis` service (preserves `memory.md §1`). Redis lives only in `docker-compose.portal.yml`. ERP never depends on Redis at runtime.

`docker-compose.portal.yml` skeleton (from `portal-architecture.md §3.2`):

```yaml
networks:
  lims-internal:
    external: true

services:
  portal-backend:
    build: ./portal/backend
    container_name: portal_backend
    environment:
      DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@database:5432/${POSTGRES_DB}
      PORTAL_JWT_SECRET: ${PORTAL_JWT_SECRET}
      ERP_INTERNAL_URL: http://backend:8000
      ERP_SERVICE_KEY: ${ERP_SERVICE_KEY}
      REDIS_URL: redis://redis:6379/0
    networks: [lims-internal]
    depends_on: [redis]
    deploy: { resources: { limits: { cpus: '1.0', memory: 1G } } }

  portal-frontend:
    build: ./portal/frontend
    container_name: portal_frontend
    networks: [lims-internal]
    depends_on: [portal-backend]
    deploy: { resources: { limits: { cpus: '1.0', memory: 1G } } }

  ai-service:
    build: ./ai-service
    container_name: ai_service
    environment:
      REDIS_URL: redis://redis:6379/0
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      GEMINI_API_KEY: ${GEMINI_API_KEY}
    networks: [lims-internal]
    deploy: { resources: { limits: { cpus: '2.0', memory: 4G } } }

  redis:
    image: redis:7-alpine
    container_name: portal_redis
    networks: [lims-internal]
    volumes: [redis_data:/data]

volumes:
  redis_data:
```

Caddy subdomain blocks (extend `infrastructure/caddy/Caddyfile`):

```caddy
erp.aldrasat.edu {
    reverse_proxy /api/v1/* {env.BACKEND_URL}
    reverse_proxy /uploads/* {env.BACKEND_URL}
    reverse_proxy * {env.FRONTEND_URL}
}
portal.aldrasat.edu {
    reverse_proxy /api/* portal-backend:8001
    reverse_proxy * portal-frontend:3001
}
```

For local dev without DNS, `Caddyfile` keeps the existing `:80` block as fallback and the new blocks are additive. Prod hostnames are created in Cloudflare Zero Trust → Tunnel → Public Hostnames.

---

## 5. Data Model

### 5.1 Same PG host, separate schemas

Start with **same Postgres host**, separate schemas `erp.*` (existing 22 tables) + `portal.*` (new). Zero extra infra cost. Moving `portal.*` to a 2nd PG host later is a single `DATABASE_URL` change plus `search_path` config.

```sql
CREATE SCHEMA IF NOT EXISTS portal;

-- Portal users (students/parents) — never reuse erp.users
CREATE TABLE portal.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(32) UNIQUE,                 -- primary login (E.164)
  email VARCHAR(255) UNIQUE,                -- optional
  password_hash VARCHAR(255),               -- if email+password path
  full_name VARCHAR(255) NOT NULL,
  locale_pref VARCHAR(10) NOT NULL DEFAULT 'ar',
  phone_verified_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  failed_login_attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX portal_users_phone_idx ON portal.users(phone);
CREATE INDEX portal_users_email_idx ON portal.users(email);

-- Guardians are portal users with a flag; alternatively keep separate table
CREATE TABLE portal.guardians (
  id UUID PRIMARY KEY REFERENCES portal.users(id) ON DELETE CASCADE,
  national_id VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Parent ↔ Student link (verified)
CREATE TABLE portal.parent_links (
  guardian_id UUID NOT NULL REFERENCES portal.users(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES erp.students(id) ON DELETE CASCADE,
  relationship VARCHAR(50),                 -- father/mother/guardian
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guardian_id, student_id)
);
CREATE INDEX parent_links_student_idx ON portal.parent_links(student_id);

-- Portal sessions are JWT-based (no table needed); optionally track refresh tokens
CREATE TABLE portal.refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES portal.users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX portal_refresh_user_idx ON portal.refresh_tokens(user_id);

-- Preferences (optional v1, else extend users row)
CREATE TABLE portal.preferences (
  user_id UUID PRIMARY KEY REFERENCES portal.users(id) ON DELETE CASCADE,
  notification_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**ERP side — new tables for AI (already in `ai-pipeline-implementation-plan.md` §6):** `curriculum_documents`, `ingestion_jobs` (`current_state JSONB`), `chunks VECTOR(1536) HNSW`, `concepts`, `concept_dependencies`, `questions`, `ai_usage_logs`. `portal-architecture.md §12` adds the **hotfix** path (`POST /chunks/{id}/hotfix`) and **orphan delete** on document replace.

**Dropped / not created:** `ingestion_batches`, `asset_cache`, Qdrant, `dag_cache`.

### 5.2 Migrations

- One Alembic migration for `portal` schema + tables above (reuse `backend/alembic/` — the migration runs against the same PG host regardless of which service triggers it).
- One migration for AI tables if `ai-pipeline-implementation-plan.md` §6 hasn't landed yet.
- Down: `DROP SCHEMA portal CASCADE` / drop AI tables. Seed data: optional demo guardian + parent_link for E2E.

---

## 6. ERP Changes (Phase 0 — Prerequisite, 1–2 days)

Everything portal needs to read/write does **one thing**: expose a **thin internal router** that the BFF (and `ai-service` for RAG) can call. No direct `erp.*` writes from portal.

**File:** `backend/app/modules/portal_internal/router.py`

```python
internal_router = APIRouter(prefix="/internal/portal", tags=["internal-portal"])
# Gate: X-Service-Key == ERP_SERVICE_KEY (or mTLS) + X-Actor-Id header
# Dependency: verify_service_key(request) -> 401 if mismatch, audit every call
```

| Endpoint | Method | Purpose | Notes |
|---|---|---|---|
| `/internal/portal/me` | GET | Actor → student mapping | Resolves guardian → linked `student_id`(s) |
| `/internal/portal/grades?student_id=` | GET | Final grades, course grades | Thin `asyncpg` handler, indexed `student_id`, lite DTO, `p50 <20ms` |
| `/internal/portal/attendance?section_id=&student_id=` | GET | Attendance sessions/records | Same |
| `/internal/portal/payments?student_id=` | GET | Payments/receipts | Same |
| `/internal/portal/sections?course_id=` | GET | Course sections, enrollment status | Same |
| `/internal/portal/profile` | POST | Validated profile write (e.g. phone) | RBAC: portal actor → student link + `daily_closure` guard; single writer; audit log |
| `/internal/portal/context?section_id=&query=` | GET | RAG context (RO) | `embedding <=> $1` via `chunks`, HNSW, 30s cache or bypass for RAG |
| `/internal/ai/ingest` | POST | Enqueue curriculum ingestion → `ai:ingestion` | ERP is sole enqueuer; body `{document_id, job_id}` |

All require `X-Service-Key: ${ERP_SERVICE_KEY}` + `X-Actor-Id` (portal user → student mapping). ERP logs every call to `audit_logs`.

**Latency mitigation (§4.1):** handlers use **`asyncpg` direct query** (bypass full SQLAlchemy ORM serialization) + minimal Pydantic DTOs, indexed on `student_id/section_id/enrollment_id`. **Monitoring:** `cache_hit_rate` + `internal_p95`; if miss-rate grows, add a materialized view `portal_read_models` behind the same API (no coupling change).

**Config:** add to `backend/app/core/config.py` + `.env.example`:

```
PORTAL_JWT_SECRET=           # distinct from JWT_SECRET_KEY
ERP_SERVICE_KEY=             # random, rotated via .env, never to browser
ERP_INTERNAL_URL=http://backend:8000  # for portal-backend
REDIS_URL=redis://redis:6379/0        # portal owns; ERP never imports redis
GEMINI_API_KEY= / OPENAI_API_KEY=     # for ai-service
```

**Queue interface (shared):** Introduce a tiny `Queue` abstraction in `ai-service` (and a shim in ERP for enqueue) so the transport is swappable without API changes:

```python
class Queue(Protocol):
    async def enqueue(self, queue: str, payload: dict) -> str: ...   # returns job_id
    async def dequeue(self, queue: str, timeout: int = 0) -> dict | None: ...
    async def ack(self, queue: str, job_id: str) -> None: ...
```

MVP impl: `BRPOPLPUSH` pattern (`LPUSH ai:jobs` + `BRPOPLPUSH ai:jobs → ai:processing` + 30s visibility timeout) — if worker dies mid-generation, job returns to queue. Upgrade impl: Redis Streams (`XADD/XREADGROUP/XACK/XPENDING` + DLQ `ai:dlq`, max 3 retries) behind the same interface.

**Lifespan / startup:** No ERP behavior change; Redis is portal-owned, so ERP lifespan does not connect to Redis.

---

## 7. Portal BFF (`portal/backend`)

Scaffold: `portal/backend` — **FastAPI (async)**, same patterns as ERP (`app/modules/*`, `app/core/config.py`, `app/db/session.py` if sharing PG, `app/middleware/*`). Keep each function < 50 lines per existing guide.

**Module layout:**

```
portal/backend/app/
├── core/config.py
├── db/session.py          # same PG host, search_path includes portal + erp (RO only for erp)
├── middleware/
│   ├── csrf.py            # reuse ERP CSRF pattern
│   └── real_ip.py
├── modules/
│   ├── auth/              # OTP/phone, JWT (PORTAL_JWT_SECRET), 10m/30d, lockout 5/15m
│   ├── portal/            # /api/me, /api/me/grades|attendance|payments → proxy to ERP internal API
│   ├── ai_proxy/          # /api/ai/* → enqueue to ai:student HIGH queue, poll/SSE results
│   └── health/            # GET /api/health
└── services/
    ├── erp_client.py      # typed client for GET /api/v1/internal/portal/* (service JWT)
    ├── cache.py           # Redis read-through helpers
    └── queue.py           # Queue interface (shared with ai-service)
```

**Auth — isolated, non-negotiable:**

- `portal.users` + `portal.refresh_tokens`, `PORTAL_JWT_SECRET` (distinct from `JWT_SECRET_KEY`), `HttpOnly Secure Lax 10m/30d`.
- Login = **phone/OTP** (primary) or email+password with lower friction, separate lockout (5 attempts/15m), separate rotation.
- Cookies **subdomain-scoped** (`Domain=portal.aldrasat.edu` vs `Domain=erp.aldrasat.edu`) — no cross-leak.
- `POST /api/auth/verify-otp` → sets portal cookies; `POST /api/auth/refresh` rotates; `POST /api/auth/logout` revokes.
- `parent_links` gate: guardian sees only linked `student_id`(s).

**Read path — cached, never hits ERP hot path:**

```
Browser → portal_frontend → portal_backend (portal JWT cookie)
  → Redis GET cache:grades:{userId}
    hit (90%+) → 200
    miss → GET http://backend:8000/api/v1/internal/portal/grades?student_id=... (Service JWT)
           → thin asyncpg query p50 <20ms → SET cache:{resource}:{studentId}:{hash(params)} EX 60 → 200
```

- Cache key: `cache:{resource}:{student_id}:{hash(params)}`, TTL 60s (30–120s tunable).
- Headers: `X-Cache: HIT/MISS` + `X-Data-As-Of` (DB timestamp) so UI can show "updated a minute ago" + force refresh.
- Portal invalidates its own keys on proxied writes; ERP never invalidates portal cache.

**Write path — proxied, ERP validates:**

- `POST /api/profile/contact {phone}` → validate (Zod/Pydantic) + rate limit → `POST /api/v1/internal/portal/profile` (Service JWT + actor context) → ERP RBAC (portal actor → student link) + `daily_closure` guard → `UPDATE students SET phone=...` (single writer) → invalidate `cache:profile:{userId}`.

**AI proxy — async, isolated, portal stays fast:**

- `POST /api/ai/explain {section_id, question}` → `XADD ai:student * job_id prompt context` (or `LPUSH`) → `202 {job_id, status: queued}`.
- `GET /api/ai/jobs/{job_id}` polls `GET ai:result:{job_id}` (TTL 1h) or SSE.
- Never writes `chunks`/`concepts`; enqueues only to `ai:student` HIGH queue.

**Rate limiting & WAF:** `slowapi` (or Redis sliding window) on all `/api/*`; stricter on `portal.*` than `erp.*` (public parents vs allowlisted staff). Cloudflare WAF on `portal.aldrasat.edu`.

---

## 8. Portal Web (`portal/frontend`)

Scaffold: `portal/frontend` — **Next.js 14 App Router (standalone) :3001**, copy ERP middleware/locale/auth patterns.

**Key reuse / divergence:**

- Copy `frontend/middleware.ts` (locale detection, auth redirects), `frontend/lib/api.ts` (axios, CSRF, idempotency, 401 refresh, retries, Sentry), `frontend/app/[locale]/layout.tsx` i18n.
- **Divergence:** `API_BASE_URL` → `/api` (portal BFF), auth cookies are **portal-scoped**, login is OTP flow not password-by-default, dashboard shows **student/parent views** (grades, attendance, fees, revision plan teaser).
- Design system: same `frontend-design-rules.md` — `slate-50` bg, `brand-500`, `ai-500` accent, `rounded-xl`, `shadow-sm`, `lucide-react` outline, skeleton + Sapphire→Teal glow for AI.

**Routes (App Router, `[locale]` prefix):**

```
/                     → landing (reuses ERP landing CMS data via portal BFF proxy) + portal CTA
/[locale]/login       → portal login (phone/OTP)
/[locale]/dashboard   → overview (linked students, upcoming fees, attendance summary)
/[locale]/dashboard/grades
/[locale]/dashboard/attendance
/[locale]/dashboard/fees            → payments + receipts (read-only)
/[locale]/dashboard/ai/explain      → enqueue → poll/stream (HIGH queue)
/[locale]/dashboard/ai/revision     → future: revision plan (same queue)
/[locale]/dashboard/settings         → portal preferences (locale, notifications)
```

i18n: `ar` default, RTL, `IBM Plex Sans Arabic` / `Cairo`, `leading-relaxed` for Arabic tables. SSR fetches via `http://portal-backend:8001` (compose network) with cookie forwarding.

---

## 9. AI Service (`ai-service`) — Unified Plane, Isolated Queues

**Image:** `ai-service` — FastAPI :8002, stateless, GPU-ready. One codebase, two logical queues, independently scalable workers. If hard isolation is needed later, run **two deployments of the same image** with different `QUEUE_NAME`.

```
ERP (sole writer)                AI Plane                      Portal (readers)
Teacher uploads PDF/DOCX ──→ ingestion_jobs ──→ ai:ingestion LOW ──┐
                                              (batch, 50/batch)    ├─→ LLM Gateway ──→ pgvector <=> search (HNSW) ──→ RO context
Student: Pronunciation/Code Review/Revision ──→ ai:student HIGH ──┘  (Gemini/OpenAI)      via ERP internal API
```

| Workload | Queue | Trigger | SLA | Scaling |
|---|---|---|---|---|
| Internal: curriculum ingestion (§12) — layout → chunk MD5 → Gemini embed 1536-dim → `ON CONFLICT DO UPDATE` → DAG → RAGAS | `ai:ingestion` — LOW, batch | Teacher in ERP | Minutes (tolerant) | 1 worker; `BackgroundTasks` compat via adapter |
| Internal: question generation — course/concept → query embed → `embedding <=> $1` → CTE depth≤3 → structured output → draft → approve | `ai:ingestion` or `ai:student:internal` (same LOW pool) | Teacher in ERP | Seconds | Bursty, LOW pool |
| Student-facing: pronunciation, code review, revision plan, Arabic tutor | `ai:student` — HIGH, streaming | Student/parent in portal | <2s first token (SSE/WebSocket) | Horizontal, GPU node, per-student rate limit |

**Queues (reliable):**

- **MVP ships with `BRPOPLPUSH`** — `LPUSH ai:jobs` + `BRPOPLPUSH ai:jobs → ai:processing` + 30s visibility timeout. No bare `BRPOP` (would drop jobs on mid-generation failure). PEL equivalent: orphan in `ai:processing` past timeout → `RPOPLPUSH` back to `ai:jobs`. Idempotency: `job_id = ULID`, duplicate delivery does not double-charge.
- **Upgrade path (no API change):** swap to **Redis Streams** (`XADD`/`XREADGROUP`/`XACK`/`XPENDING`) + **DLQ** (`ai:dlq`, max 3 tries) + `XLEN`/`XPENDING` observability. Both share the same `Queue` interface.
- If `ai-service` crashes or scales to zero, **ERP + portal reads/writes are unaffected**.

**Vector syncing on teacher update (portal-architecture.md §12):**

- **Full upload (new):** `POST /api/v1/curriculum/documents` → `202 {job_id}` → `ingestion_jobs.current_state = {last_page:0, phase:"layout"}` → enqueue `ai:ingestion` → worker checkpoints every 3 pages → `MD5(normalized_text + document_id)` → Gemini `text-embedding-004` 1536-dim, batch 50 → `INSERT ... ON CONFLICT (chunk_id) DO UPDATE` (unchanged chunks `DO NOTHING`, no cost) → build `concepts` + `concept_dependencies` DAG → SSE `COMPLETED`.
- **Modify whole document (re-upload/replace):** Same `document_id`, same flow. After upsert: `DELETE FROM chunks WHERE document_id=:id AND chunk_id NOT IN (:new_ids)` — orphans removed so `embedding <=> $1` never returns deleted context. Portal next RAG is fresh (portal context cache `TTL 30s` or bypassed).
- **Hotfix single chunk:** `POST /api/v1/curriculum/chunks/{chunk_id}/hotfix` → `UPDATE chunks SET content=:c, embedding=:vec WHERE chunk_id=:id` atomically. No re-ingestion. HNSW ranking updates <50ms.
- **Failure/offline:** Gemini timeout → `FAILED` + `error_message` → teacher `POST /jobs/{id}/resume` from `current_state.last_page+1`. Queue failure mid-stream → Streams `PEL` or BRPOPLPUSH timeout → retry up to 3 → `ai:dlq`. Portal degrades to `503 "Curriculum indexing in progress — retry in a minute"` instead of stale answer.

**Single-writer guarantee:** Only ERP enqueues `ai:ingestion`. Portal BFF never enqueues ingestion, never writes `chunks`/`concepts`. `ai-service` only reads `GET /internal/portal/context` (RO).

---

## 10. Infra, Networking & Deploy

| Concern | ERP | Portal + AI |
|---|---|---|
| Compose | `docker-compose.yml` (4 services, `lims-internal` bridge) | `docker-compose.portal.yml` (external `lims-internal`, 4 services: portal-backend, portal-frontend, ai-service, redis) |
| Caddy | Sole host-port `:80` (`:443` via Cloudflare) | Two subdomain blocks (see §4) — no `ports:` on portal/ai/redis |
| Hostnames | `erp.aldrasat.edu` → `frontend:3000` + `backend:8000` | `portal.aldrasat.edu` → `portal-frontend:3001` + `portal-backend:8001` |
| DB | `database:5432` — `erp.*` + `portal.*` schemas on same host initially | `redis:6379` portal-only; ERP never connects |
| Auth secrets | `JWT_SECRET_KEY` (`erp.*` users) | `PORTAL_JWT_SECRET` + `ERP_SERVICE_KEY` (service-to-service, rotated via `.env`) |
| AI egress | Cloudflare Tunnel egress allowlist for Gemini/OpenAI | No inbound to `ai-service` except via `portal_backend`/`backend` |
| Cookies/CSP | `Domain=erp.aldrasat.edu`, CSP per app | `Domain=portal.aldrasat.edu`, stricter WAF/rate limits |

**Local dev:** `docker compose up -d && docker compose -f docker-compose.portal.yml up -d` (auto-joins `lims-internal`). No DNS: `hosts` entry `127.0.0.1 erp.aldrasat.local portal.aldrasat.local` + Caddy `:80` fallback still serves both.

**Prod deploy — same VM, second compose:**

```bash
# .env — add
PORTAL_JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))")
ERP_SERVICE_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
GEMINI_API_KEY=...
OPENAI_API_KEY=...

# Cloudflare — Zero Trust → Tunnel → Public Hostnames
portal.aldrasat.edu → HTTP → caddy:80
erp.aldrasat.edu    → HTTP → caddy:80   # was aldrasat.edu, now subdomain

# Deploy (both composes)
docker compose up -d
docker compose -f docker-compose.portal.yml up -d
```

No `NEXT_PUBLIC_API_URL` is baked into either frontend image (same-origin `/api/v1` through Caddy; SSR falls back to `http://backend:8000` / `http://portal-backend:8001`). Backup (`scripts/backup.sh`) already dumps the whole PG (both schemas + `VECTOR` columns) + `uploads_data`; add `redis_data` snapshot only if you need queue replay (defer).

---

## 11. API Surface (Canonical)

### ERP internal (gated by `X-Service-Key`)

All under `/api/v1/internal/*`, `X-Service-Key` + `X-Actor-Id` + `audit_logs`. See §6 table.

### Portal BFF (`portal_backend` :8001, public via `portal.aldrasat.edu/api/*`)

| Group | Method & Path | Auth | Notes |
|---|---|---|---|
| **Auth** | `POST /api/auth/request-otp` | anon | `{phone}` → send OTP (SMS stub for MVP, log to console) |
| | `POST /api/auth/verify-otp` | anon (OTP) | `{phone, code}` → set portal `HttpOnly` cookies |
| | `POST /api/auth/refresh` | portal refresh cookie | rotation, lockout 5/15m |
| | `POST /api/auth/logout` | portal JWT | revoke refresh token |
| | `GET /api/auth/me` | portal JWT | own profile |
| **Me** | `GET /api/me` | portal JWT | porxy `GET /internal/portal/me` + linked students |
| | `GET /api/me/grades?student_id=` | portal JWT | cached, `X-Cache`/`X-Data-As-Of` |
| | `GET /api/me/attendance?section_id=&student_id=` | portal JWT | cached |
| | `GET /api/me/payments?student_id=` | portal JWT | cached |
| | `POST /api/me/profile` | portal JWT | validate + proxy `POST /internal/portal/profile` |
| **AI** | `POST /api/ai/explain` | portal JWT | `{section_id, question}` → `202 {job_id}` → `ai:student` HIGH |
| | `GET /api/ai/jobs/{job_id}` | portal JWT | poll `ai:result:{job_id}` or SSE |
| | `GET /api/ai/stream/{job_id}` | portal JWT | SSE/WebSocket streaming (HIGH pool) |
| **System** | `GET /api/health` | anon | portal health (db, redis, erp reachability) |

### AI Service (`ai-service` :8002, private only)

Consumes `ai:ingestion` (LOW) + `ai:student` (HIGH) via `Queue` interface. No public ingress. Endpoints (internal):

```
POST /internal/enqueue   # ERP calls to enqueue ingestion (alt: direct Redis)
GET  /internal/context   # RO RAG — proxies to ERP GET /internal/portal/context
GET  /health
```

Vectors are **never** written by `ai-service` directly except via ERP ingestion path; `ai-service` may write `ai_logs` + DLQ.

---

## 12. Frontend Routes & UX

Reuse `Professional Minimalist` (§3 `frontend-design-rules.md`): `slate-50` bg, white `.card`, `brand-500` primary, `ai-500` accent, `rounded-xl`, `lucide-react` outline, `recharts` where metrics exist, `IBM Plex Sans Arabic` + `leading-relaxed` for Arabic tables.

| Route (under `[locale]`) | Purpose | State |
|---|---|---|
| `/portal` (landing) | Reuse ERP landing CMS via portal BFF proxy; CTA → portal login | Public |
| `/login` | Phone/OTP (primary), email+password fallback | Public |
| `/dashboard` | Linked students, attendance sparkline, next fee due, AI teaser cards | portal JWT |
| `/dashboard/grades` | Per-student grades, `X-Data-As-Of` + "updated a minute ago" | portal JWT + cache headers |
| `/dashboard/attendance` | Sessions + records per section | portal JWT |
| `/dashboard/fees` | Payments + receipts (read-only) | portal JWT |
| `/dashboard/ai/explain` | Question → streamed answer → sources (`chunk_id`) | portal JWT → HIGH queue |
| `/dashboard/ai/revision` | Future — revision plan (same pattern) | Deferred |
| `/dashboard/settings` | Portal locale + notification prefs | portal JWT |

Bilingual: `ar` default, RTL, header `Globe` toggle persists via `PATCH /api/me`. Middleware: same `middleware.ts` logic but portal cookie names (`portal_access_token` / `portal_refresh_token`) to avoid collision. Error states: empty linked students, cache miss spinner, `BRPOPLPUSH` retry toast, offline banner.

---

## 13. Security, Caching & Observability

**Security (non-negotiable):**

- Subdomain isolation: cookies `Domain=erp.` vs `Domain=portal.`, CSP per app, Caddy sole `ports:` exposure.
- Service-to-service: `ERP_SERVICE_KEY` (rotate via `.env`, never to browser); optionally mTLS `portal-backend ↔ backend`.
- WAF (Cloudflare) on `portal.*` with stricter rate limits (public parents).
- Portal is **read-mostly** — write endpoints are explicitly allowlisted in ERP internal router; no direct `asyncpg` writer to `erp.*` from portal.
- AI egress allowlisted at Cloudflare Tunnel; no inbound to AI except via `portal_backend`/`backend`.

**Caching:**

- Redis read-through per §7 (TTL 30–120s, default 60s); key = `cache:{resource}:{student_id}:{hash(params)}`.
- `X-Cache: HIT/MISS` + `X-Data-As-Of` on every portal read; UI shows staleness.
- Invalidation: portal invalidates its own keys after proxied write succeeds; ERP never invalidates portal cache.
- If `cache_hit_rate` drops, add **materialized view** `portal_read_models` behind the same internal API (no coupling).

**Observability:**

- Extend ERP `GET /api/v1/health` and portal `GET /api/health` with `{ cache_hit_rate, internal_p95, redis_status, queue_depths: { ai_student, ai_ingestion, dlq } }`.
- `ai-service` exposes `XLEN`/`XPENDING` (Streams) or `LLEN ai:jobs` / `ai:processing` (BRPOPLPUSH) + `ai_usage_logs` aggregation (tokens, cost).
- Chaos test: kill `ai-service` mid-stream → verify re-delivery + no ERP impact.
- Backup: `pg_dump` includes `portal.*` + `VECTOR` columns; add restore drill for portal schema. Log to `backup_logs`, alarm if RPO >2h (`memory.md §10`).
- Sentry on all three services; real IP via `X-Forwarded-For` / `CF-Connecting-IP` through Caddy.

---

## 14. Phased Delivery (Tasks + Acceptance Gates)

### Phase 0 — Prepare ERP (1–2 days)

- [ ] Alembic migration: `portal` schema + tables (§5.1).
- [ ] `backend/app/modules/portal_internal/` router with `X-Service-Key` gate, thin `asyncpg` handlers (§6 table), `p50 <20ms` target.
- [ ] `Queue` interface + enqueue shim (BRPOPLPUSH impl now, Streams impl behind flag).
- [ ] `.env.example` + `backend/app/core/config.py`: `PORTAL_JWT_SECRET`, `ERP_SERVICE_KEY`, `REDIS_URL` (ERP never connects — config only for docs).
- [ ] `infrastructure/caddy/Caddyfile` subdomain blocks (no-op for local until hostnames exist).

**Gate:** `GET /api/v1/internal/portal/me` with valid `X-Service-Key` returns linked students; without key → 401; `EXPLAIN ANALYZE` on internal reads shows indexed seek.

### Phase 1 — Portal BFF + Web (Skeleton, 1–2 weeks)

- [ ] Scaffold `portal/backend` (FastAPI, `app/modules/*`, `app/core/config.py`, `app/db/session.py` — same PG host).
- [ ] Scaffold `portal/frontend` (Next.js 14 standalone, copy `middleware.ts`/`lib/api.ts`/`layout.tsx` i18n).
- [ ] Portal auth: OTP stub (console log for MVP) + `POST /api/auth/verify-otp` → `HttpOnly Secure Lax 10m/30d` cookies, lockout 5/15m.
- [ ] `GET /api/me` proxied to ERP `GET /internal/portal/me`.
- [ ] Wire `Caddyfile` subdomains + `docker-compose.portal.yml` (joins `lims-internal`).

**Gate:** `portal.aldrasat.edu` serves portal landing; portal OTP login → dashboard; `erp.aldrasat.edu` still serves ERP; cookies are subdomain-isolated in DevTools.

### Phase 2 — Read Paths + Cache

- [ ] Proxy `grades/attendance/payments/sections` with Redis read-through (§7) + `X-Cache`/`X-Data-As-Of`.
- [ ] Invalidation on `POST /api/me/profile` + `X-Data-As-Of` propagation.
- [ ] Portal frontend pages: grades / attendance / fees (read-only, `Professional Minimalist`, bilingual RTL).

**Gate:** 90%+ `cache_hit_rate` at 60s TTL in smoke test; `X-Cache: HIT` on second fetch; force refresh bypasses cache; no direct `erp.*` write from portal.

### Phase 3 — AI Isolation (Unified Plane)

- [ ] Extract AI to `ai-service` with two queues (`ai:student` HIGH, `ai:ingestion` LOW), streaming endpoint, RO RAG contract.
- [ ] ERP ingestion path enqueues to LOW; portal student features enqueue to HIGH. Both share `VECTOR(1536) HNSW` + guardrails, HIGH never blocks behind LOW (partitioned workers).
- [ ] Curriculum vectorization lifecycle (§9): deterministic `chunk_id MD5`, hotfix, orphan delete, resume from `current_state`.
- [ ] Teacher flow: `POST /curriculum/documents` → `202 {job_id}` → LOW queue → bulk upsert → DAG → RAGAS → SSE `COMPLETED`.

**Gate:** Bulk upload 50-page PDF → LOW queue processes in background → HIGH queue `POST /api/ai/explain` still <2s first token during ingestion; kill `ai-service` mid-stream → job re-delivered (BRPOPLPUSH timeout or Streams PEL) → no ERP impact.

### Phase 4 — Harden

- [ ] WAF + rate limits (portal stricter than ERP), Streams+DLQ promotion (`Queue` interface swap), `audit_logs` review.
- [ ] Load test portal in isolation (`portal-backend` scaled to 2–3, Caddy handles it, ERP `2CPU/2GB` untouched).
- [ ] Backup/DR drill for `portal` schema + vectors; `micro-backup.sh` includes vectors.
- [ ] E2E Playwright: portal OTP → grades → attendance → fees → AI explain → SSE; `nmap` LAN bypass (only 80/tcp open), `Secure` cookie flag, `pgvector <50ms` on 10k vectors, offline simulation (egress disconnect → `FAILED` → resume).

**Gate:** `docs/plans/current.md` updated, this plan archived to `docs/archive/plans/`, all tests green, review sign-off.

---

## 15. Testing & QA

| Layer | What | How |
|---|---|---|
| Unit | Cache key hashing, `MD5` determinism, `ON CONFLICT` bulk upsert, `Queue` interface (BRPOPLPUSH vs Streams), portal JWT sign/verify | `pytest` in `portal/backend`, `ai-service` |
| Integration | `portal_backend → backend internal API` with service key, cache hit/miss, invalidation, DLQ re-delivery | `pytest` with test PG + `fakeredis` |
| E2E (browser) | OTP → dashboard → grades/attendance/fees → AI explain stream | Playwright against `docker compose -f docker-compose.portal.yml` + seeded `portal.users` + `parent_links` |
| Load | 100→2k concurrent parents, `scale portal-backend=3`, `p95 internal <20ms`, `cache_hit_rate` | `k6` or `locust` against portal host only |
| Chaos | Kill `ai-service` mid-stream, Redis flush, egress disconnect | Verify re-delivery, `FAILED`+resume, graceful `503` |
| Security | Subdomain cookie leak, `X-Service-Key` bypass, WAF rate limit, `nmap` | Manual + CI gate |

Coverage: portal backend ≥80%, no regression on ERP 221/221 tests.

---

## 16. File Map (What Changes, Where)

| File / Dir | Action | Phase | Notes |
|---|---|---|---|
| `docker-compose.portal.yml` | **Create** | 0 | 4 services, `external: true` `lims-internal` |
| `infrastructure/caddy/Caddyfile` | **Edit** | 0 | Add `erp.` + `portal.` subdomain blocks |
| `.env.example` | **Edit** | 0 | `PORTAL_JWT_SECRET`, `ERP_SERVICE_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `REDIS_URL` |
| `backend/app/core/config.py` | **Edit** | 0 | Add settings + validators |
| `backend/app/modules/portal_internal/*` | **Create** | 0 | `router.py`, `schemas.py`, `service.py` (thin `asyncpg`), `dependencies.py` (service key) |
| `backend/alembic/versions/*_add_portal_schema.py` | **Create** | 0 | `portal` schema + tables (§5.1) |
| `backend/alembic/versions/*_add_ai_pipeline_tables.py` | **Create** | 0 | If not yet landed (§5 AI tables) |
| `portal/backend/*` | **Create** | 1 | FastAPI BFF — scaffold + modules (§7) |
| `portal/frontend/*` | **Create** | 1 | Next.js 14 — scaffold + routes (§8, §12) |
| `ai-service/*` | **Create** | 3 | FastAPI stateless — queues, LLM gateway, RAG RO |
| `docs/plans/ai-pipeline-implementation-plan.md` | **Edit** | 0 | Cross-ref portal architecture, LOW/HIGH queue split, HOTFIX (§18) |
| `docs/plans/current.md` | **Edit** | 4 | Advance roadmap after portal v1 |
| `docs/README.md` | **Edit** | 4 | List this plan |

---

## 17. Risks & Mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Read-through hop latency** (portal BFF → ERP → PG on every cache miss) | Thin `asyncpg` handlers + lite DTOs, `p50 <20ms` internal, `TTL 60s` 90%+ hit, `X-Cache`/`X-Data-As-Of`, optional `portal_read_models` matview behind same API |
| R2 | **Queue reliability** (`BRPOP` drop on mid-generation failure) | Ship `BRPOPLPUSH` + `ai:processing` + 30s visibility timeout; `Queue` interface → upgrade to Streams `XADD/XREADGROUP/XACK` + DLQ `ai:dlq` + `XPENDING` |
| R3 | **Vector staleness** (teacher edits → stale RAG) | Deterministic `MD5` + `ON CONFLICT` + orphan delete + single-chunk hotfix (§9); portal never writes vectors |
| R4 | **Auth coupling** (portal bug leaks ERP session) | Separate secrets, subdomain cookies, no shared `users` table; portal JWT never accepted by ERP |
| R5 | **Redis as SPOF for portal** (cache loss / queue loss) | Graceful degrade: cache miss = proxied read; queue down = `503` with retry; portal `GET` still works if Redis down (falls through to ERP) |
| R6 | **Scaling surprise** (exam-season AI spikes) | `ai-service` HIGH pool scales independently (GPU node / Cloud Run), ERP stays on cheap VM |
| R7 | **Backup RPO** (vectors in `pg_dump` slow) | `pg_dump --compress=9` + restore drill; `portal.*` is part of same dump |

---

## 18. Updates to `ai-pipeline-implementation-plan.md` (Applied in This PR)

The AI pipeline plan (§4–§6, §9) was written for **Lean MVP** (4 containers, `BackgroundTasks` in-process, no Redis). The portal decision extends it without contradiction — the MVP path stays as **adapter**, the portal path promotes to **external `ai-service`** when `docker-compose.portal.yml` is up.

Edits made:

- **§3 Architecture Snapshot** — Added note: when portal compose is active, `BackgroundTasks` calls are adapters that `enqueue("ai:ingestion")` to `ai-service` LOW queue; when portal is not deployed, the original in-process `BackgroundTasks` path runs unchanged (zero code fork — `Queue` interface selects impl via `REDIS_URL` presence).
- **§4.1 Flow** — Branched: `POST /curriculum/documents → 202 → enqueue ai:ingestion` works in both modes; worker is either ERP `BackgroundTasks` loop (Lean) or `ai-service` LOW worker (portal). Checkpointing via `ingestion_jobs.current_state JSONB` is identical.
- **§4.2 / §5.1 / §6** — Noted: `chunks.embedding VECTOR(1536) HNSW` and `ON CONFLICT (chunk_id)` + orphan delete + hotfix are the single-writer contract; only ERP enqueues ingestion, portal never writes vectors. (§9 already covers HOTFIX.)
- **§9 Phases 5.0–5.6** — Added portal mapping: Phase 3 of this plan (AI isolation) satisfies `ai-pipeline` Phases 5.1–5.4 (ingestion core + hardening + RAG + eval) with the two-queue split; no duplicate migration needed.
- **§10 R1 (BackgroundTasks durability)** — Updated mitigation: the `Queue` interface + BRPOPLPUSH/Streams promotion resolves durability without changing the ERP `BackgroundTasks` call sites.
- **Cross-refs** — Added pointer to `portal-architecture.md §4.4, §12` for queue separation and curriculum vectorization on update.

No schema change in that file — the SQL (§6) is canonical; this plan only adds the **transport** clarification.

---

## 19. Open Questions

| # | Question | Default |
|---|---|---|
| 1 | OTP provider | **MVP: console-log OTP** (copy to parent for E2E); swap to SMS gateway (e.g. local SMS provider) in Phase 4 if needed |
| 2 | `parent_links` verification | **MVP: manual secretary verification** in ERP (`dashboard/users` → link student); later add self-serve invite |
| 3 | `ai:student` rate limit | **Per-student 10 req/min**, global 100 req/s on `portal.aldrasat.edu` (Cloudflare + Redis sliding window) |
| 4 | `ai-service` deployment target for v1 | **Same VM, same `lims-internal`** (simple); move HIGH pool to GPU VM / Cloud Run only if latency >2s under load |
| 5 | Portal subdomains in prod | `erp.aldrasat.edu` + `portal.aldrasat.edu` (requires Cloudflare public hostnames — see §10); keep `aldrasat.edu` as redirect to portal landing if desired |

---

**Next step:** Review this plan. If approved, start with **Phase 0** (`portal` schema + `portal_internal` router + `Queue` interface + Caddy blocks) — the portal BFF cannot be scaffolded before the internal API exists. Then proceed to Phase 1 skeleton. No ERP `docker-compose.yml` change beyond Caddy blocks.

