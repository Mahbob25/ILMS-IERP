# Student & Parent Portal — Architecture Decision

**Status:** Decision — Recommended  
**Date:** 2026-08-13  
**Updated:** 2026-08-13 — Supervisor review incorporated (see §11)  
**Context:** External high-traffic portal (students/parents) + future AI features, must not destabilize the internal ERP (`lims`).  
**Decision:** Separate deployables, API-integrated — portal owns its web + BFF API, AI is a unified but isolated service plane (internal + student-facing), ERP remains the System of Record.

> **Scope of AI in this doc:** Both the existing internal pipeline (curriculum ingestion → embeddings → RAG question generation, see `docs/plans/ai-pipeline-implementation-plan.md`) **and** all future student-facing AI (pronunciation coach, code reviewer, revision plan, Arabic tutor teased on the landing). They share one `ai-service` but run on separate queues/workers so they never contend (see §4.4).

---

## 1. Current State (ERP = `lims`)

Single Docker Compose, single Postgres, single internal network. Caddy is the sole ingress.

```mermaid
flowchart TB
    U1[Staff / Internal Users]
    CF[Cloudflare Tunnel]
    CADDY[Caddy :80/:443\nReverse Proxy]

    FE[lims_frontend\nNext.js 14 standalone\n:3000]
    BE[lims_backend\nFastAPI + BackgroundTasks\n:8000]
    DB[(PostgreSQL 16 + pgvector\npgdata)]
    VOL1[(uploads_data)]
    VOL2[(backups)]

    U1 --> CF --> CADDY
    CADDY -- "/api/v1/* /uploads/*" --> BE
    CADDY -- "/*" --> FE
    BE <--> DB
    BE --> VOL1
    BE --> VOL2
    FE -. "SSR fetch\nhttp://backend:8000" .-> BE

    classDef infra fill:#0A0A0A,stroke:#333,color:#fff
    classDef app fill:#fff,stroke:#0A0A0A,color:#0A0A0A
    classDef db fill:#FFD60A,stroke:#0A0A0A,color:#0A0A0A
    class CADDY,CF infra
    class FE,BE app
    class DB,VOL1,VOL2 db
```

**Limits today:** `backend 2CPU/2GB`, `frontend 1CPU/1GB`, `database 2CPU/2GB` on `lims-internal` bridge. No Redis/Celery by design (Lean MVP, see `memory.md`).

---

## 2. Why Not Extend the ERP

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| **A. Monolith add-on** — add `/portal/*` routes to `lims_backend` + pages to `lims_frontend` | Fastest, single deploy | Couples deploys; 10k parents DDoS internal ERP; AI eats the 2GB backend limit; auth mixing risk | **Reject** |
| **B. Shared DB, separate apps** — portal apps read/write ERP tables directly | Simple reads | Schema coupling; portal bug corrupts ERP financial data; migrations block each other | **Reject** |
| **C. Fully separate DB + CDC sync** | Perfect isolation | Overkill for this stage; eventual-consistency, dual-write, lag, ops cost | **Defer** — only if you split to 2 DB hosts later |
| **D. Separate deployables, API-integrated (BFF)** | Isolation + single source of truth; independent scale/deploy; AI isolated | One internal API contract to maintain | **Recommended** |

---

## 3. Recommended Architecture

### 3.1 Container Topology

Two compose files share one Docker network. ERP stays 4 containers. Portal is its own stack. AI is a unified stateless plane.

```mermaid
flowchart TB
    Internet([Internet])

    CF[Cloudflare WAF + Tunnel]

    subgraph Edge[Caddy — single ingress]
        CADDY[Caddy :80/:443]
    end

    subgraph ERP[ERP — System of Record\n docker-compose.yml]
        FE[lims_frontend\n:3000]
        BE[lims_backend\n:8000\nSystem of Record]
        DB[(PostgreSQL 16\nschemas: erp.*)]
    end

    subgraph Portal[Portal — External\n docker-compose.portal.yml]
        PFE[portal_frontend\nNext.js :3001]
        PBE[portal_backend\nFastAPI BFF :8001]
        REDIS[(Redis 7\ncache + queue)]
    end

    subgraph AISvc[AI Plane — Unified but Queues Isolated]
        AI[ai-service\nFastAPI :8002\nstateless, GPU-ready]
        Q1[(queue: ai:student\nHIGH prio, streaming)]
        Q2[(queue: ai:ingestion\nLOW prio, batch)]
        VEC[(pgvector lookup\nvia BE or direct RO)]
    end

    Internet --> CF --> CADDY

    CADDY -- "erp.aldrasat.edu /*" --> FE
    CADDY -- "erp.aldrasat.edu /api/v1/*" --> BE
    CADDY -- "portal.aldrasat.edu /*" --> PFE
    CADDY -- "portal.aldrasat.edu /api/*" --> PBE

    PBE -- "private: http://backend:8000/api/v1/internal/*\nservice JWT (mTLS/ServiceKey)" --> BE
    PBE <--> REDIS
    PBE -- "enqueue" --> REDIS
    REDIS -- "dequeue" --> AI
    BE -- "enqueue ingestion" --> REDIS
    AI -. "read-only RAG" .-> BE
    AI -. "read-only RAG" .-> VEC

    BE <--> DB
    PBE -. "NO direct DB write to erp.*" .-> DB

    classDef edge fill:#0A0A0A,stroke:#000,color:#fff
    classDef erp fill:#fff,stroke:#0A0A0A,color:#0A0A0A
    classDef portal fill:#EFF6FF,stroke:#0EA5E9,color:#0A0A0A
    classDef ai fill:#F5F0FF,stroke:#7C3AED,color:#0A0A0A
    classDef store fill:#FFD60A,stroke:#0A0A0A,color:#0A0A0A
    class CF,CADDY edge
    class FE,BE erp
    class PFE,PBE portal
    class AI ai
    class DB,REDIS,VEC,Q1,Q2 store
```

**Key rules:**
- Portal **never** writes ERP tables directly. All writes go through `lims_backend` internal API.
- Portal owns `portal.*` schema (portal_users, sessions, preferences) OR its own logical DB — your call. Start with same Postgres host, separate schema, zero code change to split later.
- `ai-service` is **stateless** but runs **two logical queues** so student-facing streaming never starves behind a batch ingestion job (see §4.4). Scale/kill/move to GPU node without touching ERP or Portal.

### 3.2 Network & Compose

**Keep `memory.md` intact:** the 4-container limit applies to `docker-compose.yml` (ERP). Portal is a *different* compose that *joins* the existing network.

```yaml
# docker-compose.portal.yml (new, alongside docker-compose.yml)
networks:
  lims-internal:
    external: true

services:
  portal-backend:
    build: ./apps/portal/backend
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
    build: ./apps/portal/frontend
    container_name: portal_frontend
    networks: [lims-internal]
    depends_on: [portal-backend]
    deploy: { resources: { limits: { cpus: '1.0', memory: 1G } } }

  ai-service:
    build: ./apps/ai-service
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

```caddy
# infrastructure/caddy/Caddyfile — add subdomains
erp.aldrasat.edu {
    reverse_proxy /api/v1/* {env.BACKEND_URL}      # backend:8000
    reverse_proxy /uploads/* {env.BACKEND_URL}
    reverse_proxy * {env.FRONTEND_URL}              # frontend:3000
}
portal.aldrasat.edu {
    reverse_proxy /api/* portal-backend:8001
    reverse_proxy * portal-frontend:3001
}
```

> Cookies/JWTs are subdomain-isolated (`Domain=erp.` vs `Domain=portal.`). No cross-leak.

---

## 4. Request Flows

### 4.1 Portal Read (grades, attendance, fees) — cached, never hits ERP hot path

```mermaid
sequenceDiagram
    participant S as Student Browser
    participant PF as portal_frontend
    participant PB as portal_backend (BFF)
    participant R as Redis Cache
    participant EB as lims_backend (ERP)
    participant DB as Postgres (erp schema)

    S->>PF: GET portal.aldrasat.edu/dashboard
    PF->>PB: GET /api/me/grades (portal JWT cookie)
    PB->>R: GET cache:grades:{userId}
    alt cache hit (90%+ with TTL 60s)
        R-->>PB: cached JSON
        PB-->>PF: 200 + data
    else cache miss
        PB->>EB: GET /api/v1/internal/portal/grades?student_id=... (Service JWT)
        Note over EB,DB: Thin handler: asyncpg direct<br/>+ lite DTO, indexed query<br/>p50 <20ms internal
        EB->>DB: SELECT final_grades, attendance...
        DB-->>EB: rows
        EB-->>PB: 200 + canonical data
        PB->>R: SET cache:grades:{userId} EX 60
        PB-->>PF: 200 + data
    end
    PF-->>S: render
```

**Hop-latency mitigation (addresses supervisor concern #1):**
- `GET /api/v1/internal/portal/*` handlers are **thin and read-optimized**: `asyncpg` direct query (bypass full SQLAlchemy ORM serialization) + minimal Pydantic DTOs, indexed on `student_id/section_id/enrollment_id`, `p50 <20ms` on `lims-internal` (no egress).
- **Read-through cache** `TTL 60s` (30–120s tunable) handles 90%+ of portal reads; cache key = `cache:{resource}:{student_id}:{hash(params)}`.
- **Monitoring:** track `cache_hit_rate` + `internal_p95`. If miss-rate grows, add a materialized view `portal_read_models` in `erp` schema — still behind the same internal API, no direct DB coupling.
- Portal invalidates its own keys on proxied writes (see §4.2).

### 4.2 Portal Write (rare — e.g., parent contact update) — proxied, ERP validates

```mermaid
sequenceDiagram
    participant P as Parent
    participant PB as portal_backend
    participant EB as lims_backend
    participant DB as Postgres

    P->>PB: POST /api/profile/contact {phone}
    PB->>PB: validate (Zod/Pydantic) + rate limit
    PB->>EB: POST /api/v1/internal/portal/profile (Service JWT + actor context)
    EB->>EB: RBAC check (portal actor -> student link) + daily_closure guard
    EB->>DB: UPDATE students SET phone=... (single writer)
    DB-->>EB: ok
    EB-->>PB: 200
    PB->>PB: invalidate cache
    PB-->>P: 200
```

### 4.3 AI Request — async, isolated, portal stays fast (reliable queue)

```mermaid
sequenceDiagram
    participant S as Student
    participant PB as portal_backend
    participant Q as Redis (Streams)
    participant AI as ai-service
    participant EB as lims_backend

    S->>PB: POST /api/ai/explain {section_id, question}
    PB->>Q: XADD ai:student * job_id prompt context
    PB-->>S: 202 {job_id, status: queued}
    Q->>AI: XREADGROUP GROUP ai-workers w1 COUNT 1 BLOCK 0 STREAMS ai:student >
    AI->>EB: GET /api/v1/internal/portal/context?section_id=... (RO)
    EB-->>AI: chunks (pgvector <=> search, HNSW)
    AI->>AI: LLM call (streaming)
    alt success
        AI->>Q: XACK ai:student ai-workers job_id
        AI->>Q: SET ai:result:{job_id} (TTL 1h)
    else timeout / LLM failure mid-stream
        Note over Q,AI: No XACK → PEL retains job<br/>Visibility timeout (30s) → re-delivered<br/>After 3 tries → XADD ai:dlq
        Q->>AI: re-deliver (retry 1..3)
    end
    S->>PB: GET /api/ai/jobs/{job_id} (poll / SSE)
    PB->>Q: GET ai:result:{job_id}
    Q-->>PB: result
    PB-->>S: 200 {answer} or 202 {retrying}
```

**Queue reliability (addresses supervisor concern #2):**
- **MVP ships with `BRPOPLPUSH` pattern** (LPUSH `ai:jobs` + BRPOPLPUSH to `ai:processing` + 30s visibility timeout) — if worker dies mid-generation, job returns to queue. No silent `BRPOP` drop.
- **Upgrade path without API change:** `ai-service` consumes via a `Queue` interface. When AI becomes mission-critical for students, swap to **Redis Streams** (`XADD`/`XREADGROUP`/`XACK`/`XPENDING`) with a **DLQ** (`ai:dlq`) and retry counter (max 3). Streams give at-least-once + observability (`XLEN`, `XPENDING`).
- **Idempotency:** every job has `job_id = ULID`; LLM calls are idempotent on `job_id` — duplicate delivery does not double-charge or double-stream.
- If `ai-service` crashes or scales to zero, ERP and portal Reads/Writes are unaffected.

### 4.4 AI Workloads — Unified Plane, Separated Queues

```mermaid
flowchart LR
    subgraph ERPWriter[ERP — Sole Writer]
        U[Teacher uploads<br/>curriculum PDF/DOCX<br/>in erp.aldrasat.edu]
        J[ingestion_jobs<br/>current_state JSONB]
    end
    subgraph AIPlane[ai-service — One Codebase, Two Queues]
        QI[ai:ingestion<br/>LOW prio, batch<br/>50 chunks/batch]
        QS[ai:student<br/>HIGH prio, streaming<br/>SSE/WebSocket]
        LLM[LLM Gateway<br/>Gemini / OpenAI<br/>+ pgvector HNSW]
    end
    subgraph PortalReads[Portal — Readers]
        S[Student: Pronunciation<br/>Code Review<br/>Revision Plan]
    end

    U --> J --> QI --> LLM
    S --> QS --> LLM
    LLM -. RO RAG .-> ERPWriter

    classDef low fill:#fff,stroke:#0A0A0A,color:#0A0A0A
    classDef high fill:#EFF6FF,stroke:#0EA5E9,color:#0A0A0A
    classDef gw fill:#F5F0FF,stroke:#7C3AED,color:#0A0A0A
    class QI low
    class QS high
    class LLM gw
```

| Workload | Queue | Trigger | SLA | Scaling |
|---|---|---|---|---|
| **Internal: curriculum ingestion** (existing plan `ai-pipeline-implementation-plan.md` §4 — layout → chunk MD5 → Gemini embed 1536-dim → `ON CONFLICT DO UPDATE` → DAG → RAGAS) | `ai:ingestion` — LOW priority, batch | Teacher action in ERP | Minutes, tolerant | 1 worker is fine; `BackgroundTasks` compat via adapter |
| **Internal: question generation** (existing plan §5 — teacher selects course/concept → query embed → `embedding <=> $1` → CTE depth≤3 → structured output → draft → approve) | `ai:ingestion` or `ai:student:internal` (same LOW pool) | Teacher action in ERP | Seconds | Bursty, scales with LOW pool |
| **Student-facing: pronunciation, code review, revision plan, Arabic tutor** (future, teased on landing) | `ai:student` — HIGH priority, streaming | Student/parent in portal | <2s first token, streaming | Horizontal, GPU node, per-student rate limit |

Both share the same `pgvector VECTOR(1536) HNSW` store and guardrails, but **HIGH never blocks behind LOW** because workers are partitioned (`ai:student` has dedicated consumers). If you need hard isolation later, run two `ai-service` deployments with the same image and different `QUEUE_NAME`.

---

## 5. Service Boundaries

| Concern | ERP (`lims_backend`) | Portal BFF (`portal_backend`) | AI Service (unified) |
|---|---|---|---|
| **Owns** | All academic/financial truth: `courses`, `course_sections`, `students`, `enrollments`, `payments`, `expenses`, `teacher_wallets`, `attendance`, `grades`, `certificates`, `daily_closures`, plus `curriculum_documents/ingestion_jobs/chunks/concepts/questions` | Portal sessions, preferences, device links, parent↔student links, cache, rate limits, portal JWTs | Prompt orchestration, embeddings (Gemini/OpenAI), RAG assembly, streaming responses; consumes both queues |
| **Writes to DB** | Yes — sole writer to `erp.*` (including vectors) | Only `portal.*` (portal_users, parent_links, etc.) | No direct DB writes except via ERP internal API or append-only `ai_logs`; vectors written only by ERP ingestion path |
| **Auth** | Staff JWT (`JWT_SECRET_KEY`) — HttpOnly, 15m/7d rotation | Portal JWT (`PORTAL_JWT_SECRET`) — short-lived, separate secret. Login via SSO ticket from the ERP (one-time, 60s, `PORTAL_SSO_SECRET`) or direct email+password | No user auth — trusts `ERP_SERVICE_KEY` / mTLS from callers |
| **Scale** | Vertical, 2CPU/2GB, stable | Horizontal — `docker compose up --scale portal-backend=3` | Horizontal/GPU — move to larger node or managed inference; HIGH and LOW pools scale independently |

### Internal API Contract (ERP exposes, Portal + AI consume)

```
GET  /api/v1/internal/portal/me
GET  /api/v1/internal/portal/grades?student_id=
GET  /api/v1/internal/portal/attendance?section_id=
GET  /api/v1/internal/portal/payments?student_id=
GET  /api/v1/internal/portal/sections?course_id=
POST /api/v1/internal/portal/profile          # validated + audited
GET  /api/v1/internal/portal/context?section_id=&query=  # for RAG (RO)
POST /api/v1/internal/ai/ingest               # ERP enqueues to ai:ingestion (internal)
```

All require `X-Service-Key: ${ERP_SERVICE_KEY}` (or mTLS) + `X-Actor-Id` (portal user → student mapping). ERP logs every call to `audit_logs`. Queue is behind `Queue` interface so Streams vs BRPOPLPUSH is invisible to callers.

---

## 6. Auth Isolation — Non-Negotiable

```mermaid
flowchart LR
    subgraph ERPAuth[ERP Auth]
        E1[users / employees\nrole: superadmin/manager/\nsecretary/teacher]
        E2[JWT HttpOnly\nSecure Lax 15m/7d\nJWT_SECRET_KEY]
    end
    subgraph PortalAuth[Portal Auth]
        P1[portal_users\nportal_student_links\nportal_guardians\nportal_parent_links]
        P2[Portal JWT HttpOnly\nSecure Lax 10m/30d\nPORTAL_JWT_SECRET]
        P3[SSO ticket JWT\n60s single-use\nPORTAL_SSO_SECRET]
    end
    E1 -. no sharing .-> P1
    E2 -. different secret .-> P2
    E2 -. different secret .-> P3
```

- **JWT separation is preserved:** staff sessions use `JWT_SECRET_KEY`, portal sessions use `PORTAL_JWT_SECRET`, and the one-time SSO ticket uses `PORTAL_SSO_SECRET` (a third secret shared between ERP and portal BFF). The SSO ticket grants portal access only for 60s — never staff access.
- Never reuse `users` table or `JWT_SECRET_KEY` for parents/students.
- **Login flow:** staff, students, and parents all sign in at `aldirasat.com/{ar|en}/login` (email + password). The ERP checks staff `users` first, then `portal.users` (by email, password = the student/parent's phone at creation, bcrypt-hashed, changeable from the portal Settings page). Staff proceed to the ERP dashboard; students/parents are redirected to `portal.aldirasat.com/{locale}/login?ticket=<one-time>` and the portal BFF validates the ticket (`portal.sso_tickets` single-use) then issues portal cookies. No phone/OTP.
- Portal accounts are auto-provisioned when a student is created in the ERP (username = email, password = phone); optional parent accounts (parent email/phone fields on the student form) are linked via `parent_links` with `verified_at` set.
- Portal login = email+password with separate lockout (5 attempts/15m), separate refresh rotation.
- Parent can only see linked students via `parent_links(student_id, guardian_id, verified_at)`; a student sees their own data via `student_links(user_id, student_id)`.

---

## 7. Data & Caching Strategy

- **Same Postgres host, separate schemas** to start: `erp.*` (ERP) + `portal.*` (portal). Zero extra infra cost. Split to 2nd PG host later with connection string change only.
- **Redis is portal-owned** — ERP never depends on it (preserves `memory.md: No Redis` for ERP). Portal uses it for:
  - Read-through cache (grades/attendance/payments) — TTL 30–120s
  - Rate limiting (slowapi-compatible or Redis sliding window)
  - AI job queues + result store (see §4.3–4.4)
  - Streams consumer-group state + DLQ
- **No cache invalidation complexity for financial writes** — portal invalidates its own cache keys after a proxied write succeeds. ERP never invalidates portal cache.
- **Stale-read guard for portal:** portal responses include `X-Cache: HIT/MISS` + `X-Data-As-Of` (DB timestamp) so UI can show "updated a minute ago" and force refresh.

---

## 8. Security Boundaries

- Subdomain isolation: `erp.aldrasat.edu` vs `portal.aldrasat.edu` — cookies scoped per host, CSP per app.
- Caddy is still the sole host-port exposure. Portal/AI/Redis have no `ports:` mapping.
- WAF (Cloudflare) on `portal.*` — stricter rate limits (parents are public, staff are allowlisted).
- Service-to-service auth: `ERP_SERVICE_KEY` rotated via `.env`, never exposed to browsers. Optionally mTLS between `portal-backend` ↔ `backend`.
- Portal is read-mostly — write endpoints are allowlisted explicitly in ERP internal router.
- AI egress (Gemini/OpenAI) is allowlisted at Cloudflare Tunnel egress; no inbound to AI except via `portal_backend`/`backend`.

---

## 9. Scaling & Cost

| Load | Action | Cost |
|---|---|---|
| 100 → 2k concurrent parents | `scale portal-backend` to 2–3, Caddy handles it | +1GB RAM |
| AI spikes (exam season) | Scale `ai-service` HIGH pool to 3, or move it to a GPU VM / Cloud Run, keep ERP on cheap VM | Isolated — ERP not resized |
| Ingestion backlog (bulk curriculum upload) | LOW pool autoscales to 1–2 workers; HIGH pool unaffected | No student impact |
| Need HA | Put DB on managed PG (RDS/Cloud SQL), keep apps on VM | Pay only for DB HA |
| Want Vercel for portal web | Move `portal_frontend` to Vercel, keep `portal_backend` + ERP private behind Tunnel | No ERP rewrite |

---

## 10. Implementation Roadmap

**Phase 0 — Prepare ERP (1–2 days)**
- Add `portal` schema + `portal_users` / `parent_links` tables (or keep in `erp` with prefix — prefer schema).
- Add internal router `app/modules/portal_internal/router.py` gated by `X-Service-Key` (thin asyncpg handlers, see §4.1).
- Introduce `Queue` interface in `ai-service` (BRPOPLPUSH impl now, Streams impl behind flag).
- Add `PORTAL_JWT_SECRET` / `ERP_SERVICE_KEY` to `.env.example`.

**Phase 1 — Portal BFF + Web (skeleton, 1–2 weeks)**
- Scaffold `apps/portal/backend` (FastAPI, same patterns as ERP) + `apps/portal/frontend` (Next.js, copy auth/locale middleware).
- Implement portal auth (OTP) + `GET /api/me` proxied to ERP.
- Wire `Caddyfile` subdomains + `docker-compose.portal.yml` joining `lims-internal`.

**Phase 2 — Read paths + cache**
- Proxy grades/attendance/payments/sections with Redis read-through (§4.1) + `X-Cache` headers.
- Add invalidation on writes + `X-Data-As-Of`.

**Phase 3 — AI isolation (unified plane)**
- Extract AI to `ai-service` with two queues (`ai:student` HIGH, `ai:ingestion` LOW), streaming endpoint, RO RAG contract.
- ERP ingestion path enqueues to LOW; portal student features enqueue to HIGH.

**Phase 4 — Harden**
- WAF/rate limits, Streams+DLQ promotion, audit log review, load test portal in isolation, backup/DR drill for portal schema.
- Chaos test: kill `ai-service` mid-stream → verify re-delivery + no ERP impact.

---

## 11. Supervisor Review — Friction Points & Resolutions

| # | Concern | Resolution in this doc |
|---|---|---|
| 1 | **Read-through hop latency** — portal BFF → ERP → PG on every cache miss | Thin `asyncpg` handlers + lite DTOs (§4.1), `p50 <20ms` internal, Redis `TTL 60s` (90%+ hit), `X-Cache`/`X-Data-As-Of` headers, optional `portal_read_models` materialized view behind same API |
| 2 | **Redis queue reliability** — `LPUSH/BRPOP` drops jobs on mid-generation failure | Ship `BRPOPLPUSH` + processing list + 30s visibility timeout; `Queue` interface allows zero-API-change upgrade to **Redis Streams** (`XADD/XREADGROUP/XACK`) with **DLQ** + retry (max 3) + `XPENDING` observability (§4.3) |
| 3 | **Vector syncing** — stale context if teacher updates materials | Deterministic sync pipeline with dedup + orphan delete + hotfix (§12); teacher action in ERP is sole enqueuer; portal never writes vectors |

---

## 12. Curriculum Vectorization on Update (Teacher Uploads/Modifies in ERP)

> **Direct answer to supervisor's question:** *"How do you handle the vectorization pipeline when a teacher uploads or modifies new curriculum materials in the core ERP?"*

**Teacher is the only actor that can mutate curriculum. Portal and students are read-only. Every mutation flows through one pipeline so AI never hallucinates on stale context.**

```mermaid
flowchart TB
    T[Teacher in erp.aldrasat.edu\nUpload PDF/DOCX or Edit]
    API[POST /api/v1/curriculum/documents\nmultipart → 202 {job_id}]
    JOB[(ingestion_jobs\ncurrent_state JSONB\n{last_page, last_chunk_id, phase})]
    REDIS[(Redis\nai:ingestion queue)]
    AI[ai-service LOW worker\nor ERP BackgroundTasks\nadapter]
    CHUNKS[(chunks\nchunk_id = MD5(normalized_text + document_id)\nembedding VECTOR(1536) HNSW)]
    DAG[(concepts + concept_dependencies)]
    PORTAL[portal_backend / ai-service\nGET /internal/portal/context → embedding <=> search]

    T --> API --> JOB
    JOB --> REDIS --> AI
    AI -- "layout → chunk → MD5 → batch embed Gemini → bulk upsert" --> CHUNKS
    CHUNKS --> DAG --> PORTAL

    T -. "Edit single chunk hotfix" .-> HOTFIX[POST /chunks/{id}/hotfix\nre-embed one vector atomically]

    classDef erp fill:#fff,stroke:#0A0A0A,color:#0A0A0A
    classDef queue fill:#FFD60A,stroke:#0A0A0A,color:#0A0A0A
    classDef vec fill:#F5F0FF,stroke:#7C3AED,color:#0A0A0A
    class T,API,JOB erp
    class REDIS queue
    class CHUNKS,DAG vec
```

**Full document upload (new):**
1. `POST /api/v1/curriculum/documents` (ERP) → `202 {job_id}` → row in `ingestion_jobs` with `current_state = {last_page:0, phase:"layout"}` → enqueue to `ai:ingestion` (or `BackgroundTasks` via adapter — same interface).
2. Worker checkpoints every 3 pages: `UPDATE ingestion_jobs SET current_state = {...} WHERE id=:id`.
3. Chunks get deterministic `chunk_id = MD5(normalized_text + document_id)` (normalize: trim, NFC, collapse whitespace). Embed via `Gemini text-embedding-004, 1536-dim` in batches of 50 → `INSERT ... ON CONFLICT (chunk_id) DO UPDATE SET embedding, content` (dedup, no double-cost).
4. Build `concepts` + `concept_dependencies` DAG, then SSE `COMPLETED` to teacher.

**Modify whole document (re-upload / replace):**
- Same job, same `document_id`. Unchanged chunks are `DO NOTHING` (no embedding cost). Changed chunks are `DO UPDATE` (re-embedded). After bulk upsert: `DELETE FROM chunks WHERE document_id=:id AND chunk_id NOT IN (:new_ids)` — orphans removed so `embedding <=> $1` never returns deleted context. Portal's next RAG read is fresh immediately (portal cache for context is `TTL 30s` or bypassed for RAG).

**Hotfix single chunk (teacher corrects a paragraph):**
- `POST /api/v1/curriculum/chunks/{chunk_id}/hotfix` → `UPDATE chunks SET content=:c, embedding=:vec WHERE chunk_id=:id` atomically. No re-ingestion. RAG ranking updates on next query (<50ms HNSW).

**Failure / offline:**
- Gemini timeout / egress drop → job `FAILED` + `error_message` → teacher hits `POST /jobs/{id}/resume` → resumes from `current_state.last_page+1` (Isolate & Resume). Portal AI degrades gracefully: `GET /context` returns `503 + "Curriculum indexing in progress — retry in a minute"` instead of stale answer.
- Queue failure mid-stream → Streams `PEL` re-delivery or BRPOPLPUSH timeout → retry up to 3 → DLQ `ai:dlq` for manual replay. No silent drop.

**Trigger ownership:**
- Only ERP enqueues ingestion jobs. Portal BFF never enqueues ingestion and never writes `chunks`/`concepts`. `ai-service` only reads `GET /internal/portal/context` (RO). This guarantees single-writer consistency.

See `docs/plans/ai-pipeline-implementation-plan.md` §4–§6 for the underlying table specs (`curriculum_documents`, `ingestion_jobs`, `chunks VECTOR(1536) HNSW`, `questions`) and RAG SQL.

---

## 13. What Not To Do

- Do not add `portal` tables to `lims_backend` models and call it done — you re-couple deploys and risk.
- Do not give `portal_backend` a direct asyncpg writer to `erp.*` tables.
- Do not add Redis to `docker-compose.yml` for ERP — keep `memory.md` constraints; Redis lives in `docker-compose.portal.yml`.
- Do not use bare `BRPOP` without a processing list/Streams — you will lose AI jobs on failure.
- Do not let portal or `ai-service` write `chunks.embedding` — only ERP's ingestion path writes vectors.

---

## 14. References

- `architecture/overview.md` — current ERP containers, modules, auth, RBAC
- `architecture/database-schema.md` — 22 tables, single PG with soft deletes
- `architecture/memory.md` — 4-container + no-Redis Lean MVP constraint (applies to ERP, not portal)
- `docs/plans/current.md` — roadmap (deploy → AI pipeline)
- `docs/plans/ai-pipeline-implementation-plan.md` — internal ingestion + question generation pipeline (source for §12)
- `docs/guides/user-testing-guide.md` — portal-adjacent flows (future: add portal smoke tests here)

> This doc is the decision record. Implementation PRs should link here and keep ERP and Portal compose files separate.
