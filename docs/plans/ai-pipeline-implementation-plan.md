# AI Pipeline Implementation Plan — Extracted from Plan-v1.6 (Lean MVP)

**Source:** `docs/archive/plans/Plan-v1.6.md` §4.5, §4.6, §10.4, §11, §12, §13, §15, §17 — **v1.6 Lean MVP Edition** (4 containers, PostgreSQL+pgvector, FastAPI BackgroundTasks)  
**Target:** `docs/plans/ai-pipeline-implementation-plan.md` (this file) — English  
**Status:** Draft for review — no code changes in this PR  
**Date:** 2026-08-11  
**Author:** Extracted & assessed from v1.6 reference doc

---

## Table of Contents

1. Executive Summary
2. What Was Extracted (v1.6 Scope Boundary)
3. Architecture Snapshot (Lean MVP)
4. Pipeline A — Curriculum Ingestion (Processing)
5. Pipeline B — Question Generation (Generating)
6. Data Model (v1.6 → Implementation)
7. API Surface
8. Cross-Cutting Concerns (Offline, Notifications, Observability, Security)
9. Implementation Plan — Phased Breakdown
10. Risk Assessment
11. Scorecard
12. Improvement Suggestions (Prioritized)
13. Open Questions for Review
14. Appendix

---

## 1. Executive Summary

Plan-v1.6 defines **two AI pipelines** that sit on top of the SIS/LMS core:

- **Processing (Ingestion):** Upload PDF/DOCX → layout analysis → semantic chunking → deterministic `chunk_id` (MD5) → Gemini 1.5 Flash (multimodal) + Gemini Embedding API (1536-dim) → pedagogical tagging (Google ADK, Bloom) → **batch bulk upsert into `chunks.embedding VECTOR(1536)`** → DAG in `concepts` / `concept_dependencies` → RAGAS evaluation → hotfix. All **async via FastAPI `BackgroundTasks`** (no Celery/Redis), state in `ingestion_jobs.current_state JSONB`, recovery via **"Isolate & Resume"**.
- **Generating (Questions):** Teacher selects course/concept + type/count → Gemini Embedding for query vector → **single SQL `embedding <=> $1` (pgvector HNSW)** → Recursive CTE `depth <= 3` for DAG → Gemini structured-output question generation → draft save + cost logging → teacher review/approve. Same resume/circuit-breaker pattern.

The design is intentionally **lean**: one DB (PostgreSQL+pgvector), in-process `asyncio.Queue` SSE, 202-Accepted job model. That is its strength (ops simplicity) and its primary risk (single-process durability). This plan keeps the v1.6 contracts intact while calling out where to harden before scaling.

---

## 2. What Was Extracted (v1.6 Scope Boundary)

**In scope (MVP):**
- PDF/DOCX text+image curriculum ingestion, monthly / manual schedule (Run Now / Schedule for later)
- Deterministic chunking, dedup, embeddings (Gemini Embedding API, 1536), bulk upsert with `ON CONFLICT (chunk_id) DO UPDATE`
- `HNSW` cosine search (`<=>`) and Recursive CTE DAG with `depth <= 3`, no Redis cache
- RAG question generation (MCQ / True-False / Short Answer) with source `chunk_id`, draft → approved lifecycle
- Isolate & Resume on any Gemini failure (`FAILED` → read `current_state` → skip completed chunks)
- Cost/token tracking (`ingestion_jobs` + `questions` + `ai_usage_logs`), SSE notifications, health endpoint

**Explicitly out of scope in v1.6 (deferred to Phase 11+):**
- Qdrant, Redis, Celery/Flower, distributed queue, separate vector store
- DAG cache, `ingestion_batches` table, `asset_cache` table
- Multi-tenant, student/parent portal, payments, mobile push, personalized learning paths

**Current codebase gap (as of `docs/plans/current.md` v1.7):**
- AI modules do **not** exist yet (`backend/app/modules` has academic/backups/dashboard/identity/lms/notifications/reports/search/settings — no `ingestion` or `questions`)
- `pgvector` **ready**: `pgvector/pgvector:pg16` image and `CREATE EXTENSION vector` in `infrastructure/postgres/init.sql`
- `BackgroundTasks` **not yet used** for long jobs; `tenacity` + `pybreaker` + `psutil` already in `requirements.txt`
- Frontend has no `ingestion/` or `questions/` routes — to be added under `(dashboard)`

---

## 3. Architecture Snapshot (Lean MVP)

```
Browser (LAN) → Caddy (Internal CA, :80/:443 only gateway) → frontend (Next.js standalone :3000)
                                                     → backend (FastAPI :8000, BackgroundTasks)
                                                     → database (PostgreSQL+pgvector :5432, HNSW)

Backend → (egress via Cloudflare Tunnel) → Gemini API (Text 1.5 Flash + Embedding API)
Backend → in-process asyncio.Queue → SSE /api/v1/notifications/stream → frontend EventSource

4 containers only: caddy, frontend, backend, database (lims-internal bridge, no host-exposed DB/API ports)
```

**Key v1.6 decisions preserved:**
- `chunks.embedding VECTOR(1536)` + `USING hnsw (embedding vector_cosine_ops)` — no Qdrant
- `ingestion_jobs.current_state JSONB {last_page, last_successful_chunk_id, processed_count, checkpoint_at}` — no `ingestion_batches`
- `chunk_id = MD5(content + asset_id)` deterministic PK — no `asset_cache`
- `asyncio.Queue` per user for SSE — no Redis Pub/Sub (single uvicorn worker in MVP)

---

## 4. Pipeline A — Curriculum Ingestion (Processing)

### 4.1 Flow (verbatim from §11, translated & annotated)

```
POST /api/v1/curriculum/documents (multipart) → 202 Accepted {job_id}
  → save file via StorageService → BackgroundTasks.add(process_ingestion(job_id))
  → read current_state → Isolate & Resume? → resume from last_page+1 else page 1
  → [BackgroundTask loop, inside uvicorn event loop]
      Layout Analysis (page-by-page) → Semantic Chunking → MD5 chunk_id
      → Gemini Embedding API (batched) → Google ADK extraction & pedagogical tagging
      → Batch Bulk Upsert (50 chunks / batch): INSERT ... ON CONFLICT (chunk_id) DO UPDATE
      → update current_state JSONB every N pages
  → Build DAG (concepts + concept_dependencies)
  → Recursive CTE depth<=3 (direct SQL, no cache)
  → RAGAS evaluation → status COMPLETED → SSE notify → Hotfix tool (single-chunk re-embed)
  ── on Gemini Timeout/ConnectionError/CircuitOpen → status FAILED → SSE + Isolate & Resume button
```

### 4.2 Per-Step Implementation Notes

| Step | v1.6 Spec | Implementation Detail |
|---|---|---|
| **Upload & schedule** | 202 + job_id, StorageService | Validate MIME (pdf, docx), max-size guard, virus-scan hook, store under `/app/uploads/curriculum/{job_id}/`, human-driven scheduling (Run Now / Schedule for later via `ingestion_jobs.scheduled_at`) |
| **Checkpointing** | `current_state JSONB` | Write every 3–5 pages or 1 batch; include `last_page`, `last_successful_chunk_id`, `processed_count`, `checkpoint_at`, `phase` (layout/chunking/embedding/tagging/upsert/dag/eval) |
| **Layout analysis** | page-by-page | Use `pypdf`/`python-docx` + optional `pdf2image` for image pages; record `page_number` per chunk; tolerate scanned PDFs via Gemini vision fallback |
| **Semantic chunking** | paragraph/section boundaries | 400–800 tokens, 10–15% overlap, preserve headings as `topic`; store `course_id`, `chapter_id`, `difficulty_level`, `topic` |
| **Dedup** | MD5(content+asset_id) | `SELECT ... WHERE chunk_id = :id` skip; bulk path uses `ON CONFLICT DO NOTHING` then resume |
| **Multimodal** | Gemini 1.5 Flash + tenacity + pybreaker | `tenacity.retry(stop=stop_after_attempt(3), wait=exponential)` + `pybreaker.CircuitBreaker(fail_max=5, reset_timeout=60)` per API type |
| **Extraction/tagging** | ADK, Bloom, prereqs, reading time | Batch 5–10 chunks/call; strict Pydantic output schema; fallback to rule-based tagger if Gemini down |
| **Embeddings** | Gemini Embedding API, 1536-dim | Batch inputs (up to 50/request), retry with backoff, store directly in `embedding` column in same upsert |
| **Bulk upsert** | Single INSERT VALUES ... ON CONFLICT DO UPDATE | Use `psycopg` `executemany` or `COPY` staging; update `current_state` in same transaction boundary |
| **DAG** | concepts + concept_dependencies | Extract prerequisites as edges; enforce acyclic check; query via `WITH RECURSIVE ... WHERE depth <= 3` |
| **Evaluation** | RAGAS synthetic QA | 10–20 probes per document; metrics: faithfulness, context recall; gate COMPLETED only if thresholds pass (or warn) |
| **Hotfix** | single chunk re-embed | `POST /api/v1/curriculum/chunks/{chunk_id}/hotfix` — update content → re-embed → `UPDATE chunks SET embedding = $1 WHERE chunk_id = $2` |

---

## 5. Pipeline B — Question Generation (Generating)

### 5.1 Flow (from §12)

```
Teacher → F: select course/concept + type + count
F → B: POST /api/v1/questions/generate
B → CB: breaker check
  if open → log FAILED + SSE + Isolate & Resume
  else → Gemini Embedding (query vector) → PG: SELECT ... ORDER BY embedding <=> $1 LIMIT 10
       → PG Recursive CTE DAG → Gemini structured-output (questions+answers+explanation)
       → save drafts + ai_usage_logs → return drafts
Teacher → F: review/edit/approve → PUT /api/v1/questions/{id} {status: approved}
```

### 5.2 Details

- **Types:** `multiple_choice`, `true_false`, `short_answer` — each with JSON `options`, `correct_answer`, `explanation`, `chunk_id` provenance.
- **RAG query:** `SELECT chunk_id, content, embedding <=> $1 AS distance FROM chunks WHERE document_id IN (SELECT id FROM curriculum_documents WHERE status='COMPLETED') AND course_id=$2 ORDER BY distance LIMIT 10` — HNSW guarantees <50ms on 10k–100k vectors; add `IVFFLAT` fallback if HNSW build is slow.
- **Metadata filtering:** `WHERE` on `course_id`, `chapter_id`, `difficulty_level`, `topic` — all plain SQL, no Qdrant payload filters.
- **Structured output:** Enforce Pydantic schema via Gemini `response_mime_type: application/json` + `response_schema`; validate Zod on frontend.
- **Teacher approval:** `draft` → `approved` → `rejected`; approved questions become usable in assignments.
- **Resume:** Same `current_state`-style? For questions, simpler: failed job row with `FAILED` + retry button re-runs embedding→search→generation (idempotent via `request_id`).

---

## 6. Data Model (v1.6 → Implementation)

**Already in v1.6 ERD (§10.4); implement as Alembic migrations on top of current schema:**

```sql
-- Extension (already in init.sql)
CREATE EXTENSION IF NOT EXISTS vector;

-- Documents & jobs
CREATE TABLE curriculum_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING','PROCESSING','COMPLETED','FAILED')),
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES curriculum_documents(id) ON DELETE CASCADE,
  current_phase TEXT,
  status TEXT NOT NULL CHECK (status IN ('PENDING','PROCESSING','COMPLETED','FAILED')),
  current_state JSONB DEFAULT '{}'::jsonb, -- {last_page, last_successful_chunk_id, processed_count, checkpoint_at, phase}
  scheduled_at TIMESTAMPTZ,
  total_prompt_tokens INT DEFAULT 0,
  total_completion_tokens INT DEFAULT 0,
  estimated_cost NUMERIC(10,4) DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Chunks — the core table
CREATE TABLE chunks (
  chunk_id TEXT PRIMARY KEY, -- MD5(content+asset_id)
  document_id UUID REFERENCES curriculum_documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  page_number INT,
  course_id UUID REFERENCES courses(id),
  chapter_id UUID,
  topic TEXT,
  difficulty_level TEXT,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX chunks_embedding_hnsw ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX chunks_document_id_idx ON chunks(document_id);
CREATE INDEX chunks_course_id_idx ON chunks(course_id);

-- Concepts DAG
CREATE TABLE concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id TEXT REFERENCES chunks(chunk_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT
);
CREATE TABLE concept_dependencies (
  source_concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE,
  target_concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE,
  PRIMARY KEY (source_concept_id, target_concept_id)
);

-- Questions
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id TEXT REFERENCES chunks(chunk_id),
  question_text TEXT NOT NULL,
  question_type TEXT CHECK (question_type IN ('multiple_choice','true_false','short_answer')),
  options JSONB,
  correct_answer TEXT,
  explanation TEXT,
  status TEXT CHECK (status IN ('draft','approved','rejected','failed')) DEFAULT 'draft',
  prompt_tokens INT DEFAULT 0,
  completion_tokens INT DEFAULT 0,
  estimated_cost NUMERIC(10,4) DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Usage & health (already partially exists — extend)
CREATE TABLE ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  api_call_type TEXT, -- embedding | text_generation | vision
  prompt_tokens INT,
  completion_tokens INT,
  estimated_cost NUMERIC(10,4),
  timestamp TIMESTAMPTZ DEFAULT now(),
  status TEXT,
  error_message TEXT
);
```

**Dropped in v1.6 (do not create):** `ingestion_batches`, `asset_cache`, Qdrant collections, Redis keys, `dag_cache` table.

---

## 7. API Surface

| Group | Method & Path | Auth | Notes |
|---|---|---|---|
| **Ingestion** | `POST /api/v1/curriculum/documents` | teacher+ | multipart, returns 202 `{job_id, status}` |
| | `GET /api/v1/curriculum/jobs/{id}` | teacher+ | job + current_state + progress |
| | `POST /api/v1/curriculum/jobs/{id}/resume` | teacher+ | Isolate & Resume — resumes from current_state |
| | `POST /api/v1/curriculum/chunks/{chunk_id}/hotfix` | teacher+ | edit + re-embed single chunk |
| | `GET /api/v1/curriculum/documents` | teacher+ | list with status filters |
| **Questions** | `POST /api/v1/questions/generate` | teacher+ | `{course_id, concept_id?, type, count, difficulty?}` → drafts |
| | `POST /api/v1/questions/{id}/resume` | teacher+ | resume failed generation |
| | `GET /api/v1/questions/{id}` | teacher+ | fetch one |
| | `PUT /api/v1/questions/{id}` | teacher+ | `{status: approved|rejected, edits?}` |
| | `GET /api/v1/questions` | teacher+ | list drafts/approved with filters |
| **Admin/System** | `GET /api/v1/admin/system/health` | superadmin | disk, memory, pg+pgvector, last_backup, uptime (extend with `ai_pipeline` section) |
| **Notifications** | `GET /api/v1/notifications/stream` | any auth | SSE, in-process queue per user |

All under `/api/v1`, `HttpOnly Secure Cookie` via Caddy Internal CA, RBAC via existing `superadmin/admin/teacher` plus `is_superadmin` gate for `/admin/*`.

---

## 8. Cross-Cutting Concerns

- **Offline (Yemen constraint):** SIS/LMS remain 100% LAN-functional. Ingestion & RAG degrade gracefully: if Gemini unreachable → job `FAILED` + clear message, RAG search returns empty with explanatory UI (no crash). BackgroundTasks runs only when connectivity is available — user picks stable window.
- **Notifications:** Replace Redis Pub/Sub with `asyncio.Queue` per connected user; `notifications_service.push(user_id, event)` writes to queue. Limitation: single uvicorn worker in MVP — multi-worker would need Redis (deferred).
- **Observability:** Extend `/health` with `ai_pipeline: {last_job_status, circuit_breaker_state, embedding_latency_ms}`; log every Gemini call to `ai_usage_logs`; SSE for job completion/failure/disk>85%/backup status.
- **Security:** Same 3-tier RBAC, `Secure+HttpOnly+SameSite=Lax` cookies (Caddy CA enables `Secure` on LAN), Origin/Referer checks for mutating calls, Pydantic validation, rate-limit on `/curriculum/*` and `/questions/generate`.

---

## 9. Implementation Plan — Phased Breakdown

> Estimates assume solo dev with AI assistance, part-time. Keep existing `main.py` lifespan and middleware untouched; add new routers modularly.

### Phase 5.0 — Foundations (1 week, prerequisite)

- **DB:** Alembic migration `add_ai_pipeline_tables` (tables above) + `CREATE EXTENSION vector` verification in CI; create `HNSW` index concurrently.
- **Backend scaffolding:** `backend/app/modules/ingestion/` and `backend/app/modules/questions/` with `router.py / schemas.py / models.py / service.py / dependencies.py` per project convention.
- **Config:** Add `GEMINI_API_KEY`, `GEMINI_EMBEDDING_MODEL=text-embedding-004`, `GEMINI_TEXT_MODEL=gemini-1.5-flash`, `AI_BATCH_SIZE=50`, `AI_CHECKPOINT_EVERY_N_PAGES=3`, `AI_MAX_FILE_MB=50` to `Pydantic Settings` + `.env.example`.
- **StorageService:** Abstract interface (`save`, `get_path`, `delete`) with local-disk impl under `/app/uploads/curriculum`; add MIME/size validation.
- **Tests:** Migration smoke test + vector round-trip (`INSERT ... '[1,2,3]'::vector` + `<=>` query <50ms).

**Acceptance:** `alembic upgrade head` clean, `SELECT '[1,2,3]'::vector` works, health check still green.

### Phase 5.1 — Ingestion Core (2 weeks)

- Implement `POST /documents` (202 + job row), `GET /jobs/{id}`, `POST /jobs/{id}/resume`, `POST /chunks/{chunk_id}/hotfix`.
- Implement `process_ingestion(job_id)` as `BackgroundTasks` callable: layout → chunking → MD5 → batched embedding → ADK tagging → bulk upsert → `current_state` checkpoint.
- Wire `tenacity` + `pybreaker` around Gemini calls; map exceptions to `FAILED` + `error_message`.
- DAG extraction + `WITH RECURSIVE depth<=3` query helper.
- Unit tests: chunking determinism, MD5 stability, bulk upsert ON CONFLICT, checkpoint resume (simulate failure at page N, resume from N+1).

**Acceptance:** Upload 10-page PDF → job completes → `chunks` populated with embeddings → `embedding <=> query` returns relevant rows → resume from mid-failure works.

### Phase 5.2 — Embeddings Hardening (3–4 days)

- Batch `embed_content` (50/batch) with parallel limit 5, input truncation >800 tokens, cost logging per batch.
- Add `psycopg` `COPY` path for large docs (>500 chunks) as optimization.
- Validate `HNSW` index build (handle long build via `maintenance_work_mem` bump).

**Acceptance:** 200-chunk doc embeds in <2 min on LAN egress, no duplicate `chunk_id`, cost logged.

### Phase 5.3 — Questions / RAG (1.5 weeks)

- Implement `POST /questions/generate` (breaker check → query embedding → `embedding <=> $1` search → DAG CTE → Gemini structured output → draft save).
- Implement review flow `PUT /questions/{id}` + list endpoints + `POST /{id}/resume`.
- Frontend: `app/[locale]/(dashboard)/questions/` (generate form, RAG preview, draft list, approve/reject), reuse `EventSource` for completion.

**Acceptance:** Teacher generates 5 MCQs for a course → 10 chunks retrieved → 5 drafts returned with `chunk_id` provenance → approve persists → appears in assignment picker.

### Phase 5.4 — Evaluation & Hotfix (4–5 days)

- RAGAS harness (faithfulness/context recall) + threshold warnings.
- Hotfix UI: edit chunk text → re-embed single vector → update `embedding` atomically.
- Wire notifications: job complete/failed, question batch ready.

**Acceptance:** RAGAS run on completed doc produces report; hotfix on one chunk updates search ranking.

### Phase 5.5 — Observability & Polish (3–4 days)

- Extend `/admin/system/health` with AI section + `SYSTEM_HEALTH_HISTORY` sampling (every 5 min feed for Recharts).
- Wire `ai_usage_logs` aggregation for Analytics dashboard (tokens, cost, failure rate).
- Rate-limit AI endpoints (`slowapi`), add `Idempotency-Key` support for generate/resume.

**Acceptance:** SuperAdmin dashboard shows AI jobs, cost, backup age, disk/memory; rate-limit returns 429 correctly.

### Phase 5.6 — QA & Deployment (1 week)

- Tests: `nmap` LAN bypass (only 80/tcp open), Secure cookie flag in DevTools, `pgvector <50ms` on 10k vectors, offline simulation (disconnect egress → FAILED → resume).
- Playwright E2E: upload → complete → search → generate → approve.
- Docker prod check: `docker compose config` (only caddy exposes 80/443), `docker ps` shows 4 containers, `micro-backup.sh` includes vectors (restore drill).

**Exit gate:** Same as Plan-v1.6 §18 Phase 10 acceptance checklist, plus AI-specific gates above.

---

## 10. Risk Assessment

| # | Risk | Likelihood | Impact | Severity | Mitigation (v1.6 + recommended) |
|---|---|---|---|---|---|
| **R1** | **BackgroundTasks durability** — task dies if uvicorn restarts; no persistence, no retry queue; SSE queue lost | High | High | **High** | MVP: single worker + `current_state` JSONB allows manual resume. **Harden:** Add `lifespan` startup scan for `PROCESSING` jobs → auto-resume; write PID + `started_at` to job; add `POST /jobs/{id}/resume` idempotency; document single-worker limit; plan Redis+CELERY behind feature flag if job frequency grows. |
| **R2** | **pgvector scale** — HNSW build time & RAM on large corpora | Medium | Medium | Medium | HNSW is fine to low-millions (institute scale is ~10k–100k chunks). Mitigate: `maintenance_work_mem` tuning, `CREATE INDEX CONCURRENTLY`, monitor `pg_stat_progress_create_index`; escape hatch: add Qdrant in Phase 11+ without rewrite (abstract `VectorStore` interface now). |
| **R3** | **Gemini egress dependency** — Yemen intermittent internet, rate limits, cost spikes | High | High | **High** | Circuit breaker + tenacity + `FAILED`+resume already in plan. Add: per-user rate limit on AI endpoints, monthly cost cap + warning at 80%, offline banner ("RAG requires internet"), batch embeddings to reduce calls, cache query embeddings for 5 min. |
| **R4** | **SSE single-process fan-out** — multi-worker breaks notifications | Medium | Medium | Medium | MVP single worker avoids it. Mitigate: document limit; implement `notifications_service` behind interface so Redis Pub/Sub can be swapped in Phase 2 without API change; add polling fallback (`GET /jobs/{id}` polling) if SSE drops. |
| **R5** | **File handling** — large/malicious PDFs, DOCX bombs, image exfiltration via Gemini | Medium | High | **High** | Validate MIME, magic bytes, max 50MB, page-count cap (e.g., 300), scan with `clamd` hook (deferred), strip EXIF, store outside web root, signed download URLs, never echo file content to Gemini without sanitization. |
| **R6** | **Cost & token blow-up** — no budget guard on embeddings+generation | Medium | High | High | Log every call to `ai_usage_logs` (already), add dashboard budget view, per-job `estimated_cost` rollup, soft cap env var `AI_MONTHLY_BUDGET_USD`, block new jobs when cap hit (admin override). |
| **R7** | **Data correctness** — chunking drift, `chunk_id` collisions, DAG cycles | Low | Medium | Medium | `chunk_id` is MD5 of normalized text (trim, NFC, collapse whitespace) + `document_id` to avoid cross-doc collisions; add DB `CHECK` on `chunk_id` uniqueness; DAG cycle detection (DFS before insert), reject cyclic edge. |
| **R8** | **Backup RPO** — vectors included in `pg_dump` but dump may be slow with large `VECTOR` columns | Low | Medium | Medium | `pg_dump --compress=9` already; test restore of 10k-vector DB (<5 min target); add `pg_basebackup` alternative for >1M vectors; verify GPG + rclone lifecycle (daily/weekly/monthly). |
| **R9** | **Security — LAN exposure** | Low | High | Medium | Keep `lims-internal` isolation, `nmap` CI gate, Caddy Internal CA for Secure cookies, RBAC on every AI route, audit log for superadmin AI actions. |
| **R10** | **Single developer bus factor** | Medium | Medium | Medium | This plan + `docs/archive/plans/Plan-v1.6.md` as living docs; add `docs/operations/ai-runbook.md` for resume/restore steps. |

**Top 3 to address before merge:** R1, R3, R5. R1 is the only architectural “must-fix” for production confidence; the others are hardening.

---

## 11. Scorecard

### Rubric (10 = exemplary, 5 = adequate, <5 = deficient)

| Dimension | Score | Justification |
|---|---|---|
| **Simplicity / Ops** | 9.0 | 4 containers, 1 DB, no distributed queue — solo-dev maintainable. Lean MVP delivers on its promise. |
| **Offline resilience** | 8.0 | SIS/LMS fully offline; AI fails gracefully with resume. Only deduction: RAG returns empty offline (inherent to Gemini embeddings). |
| **Cost efficiency** | 8.5 | Open-source stack, Cloudflare free tier, Gemini pay-per-use with tracking. No Vercel/Redis/Qdrant fees. |
| **Scalability headroom** | 6.5 | pgvector + BackgroundTasks comfortably cover institute scale (30 users, monthly ingestion) but will bottleneck beyond ~1M vectors or daily large jobs. Escape hatches are documented. |
| **Observability** | 6.0 | Single health endpoint + SSE is minimal but sufficient for MVP. Needs structured logs, RAGAS gate, and cost dashboards to reach 8+. |
| **Security** | 7.5 | Caddy Internal CA + network isolation + RBAC is solid. Deduct for missing file-validation hardening and rate-limit specifics (addressable in Phase 5.0). |
| **Maintainability** | 7.0 | Modular monolith + clear `current_state` contract is clean; BackgroundTasks is less explicit than a queue (harder to inspect/retry). |

**Overall: 7.5 / 10 — Recommended with hardening.**

- **Verdict:** Ship as designed for MVP; address R1 (auto-resume on restart), R3 (budget cap + offline UX), and R5 (file validation) before production. The plan is well-scoped and reversible — moving to Redis/Celery or Qdrant later does not require a rewrite if the `StorageService`/`VectorStore` interfaces are introduced now.

---

## 12. Improvement Suggestions (Prioritized)

### P0 — Do before first production ingestion

1. **Abstract `VectorStore` behind an interface** (`search(query_vector, filters)`, `upsert(chunks)`). Implement with `pgvector` now; keeps Qdrant migration zero-touch later. One file, ~80 LOC.
2. **Startup resume scan:** On `lifespan` startup, find `ingestion_jobs.status='PROCESSING'` → mark `FAILED` or auto-enqueue resume (configurable). Prevents silent loss on restart.
3. **File validation:** MIME + magic bytes + size + page-count guards; reject encrypted/empty PDFs with actionable error; add to `422` response contract.
4. **Idempotency for AI writes:** Require `Idempotency-Key` on `POST /documents` and `POST /questions/generate`; reuse existing `IdempotencyMiddleware`/`idempotency_keys` table (already in codebase).
5. **Cost cap & offline UX:** `AI_MONTHLY_BUDGET_USD` env + dashboard gauge; frontend banner when Gemini unreachable (“AI features need internet — SIS/LMS still work”).

### P1 — Do within same release if time allows

6. **Batch embedding retry isolation:** If one chunk in a batch fails embedding, retry only that chunk — don’t fail the whole batch. Log per-chunk `ai_usage_logs` entry.
7. **HNSW tuning:** Set `maintenance_work_mem = 256MB` for index builds; create index `CONCURRENTLY` in migration; add `EXPLAIN ANALYZE` check in CI for `<=>` <50ms on 10k rows.
8. **Polling fallback for SSE:** If `EventSource` errors, fall back to `GET /jobs/{id}` polling every 5s — avoids notification loss on network blip.
9. **Structured logs:** Emit `job_id, phase, page, chunk_id, tokens, cost` per step to `logs/ai-pipeline.log` for `opencode`/`Sentry` correlation.
10. **Teacher UX:** Show `chunk_id` provenance + distance score in question drafts; allow filtering by `topic`/`difficulty` before generation.

### P2 — Defer to Phase 11+ (do not block MVP)

11. Redis + Celery behind feature flag when ingestion becomes daily or multi-worker is needed.
12. Qdrant when vectors exceed ~2M or HNSW RAM becomes a concern.
13. Advanced RAG: hybrid search (BM25 + vector), reranker, and evaluation dataset versioning.
14. PWA + push notifications for mobile.

---

## 13. Open Questions for Review

1. **Gemini model pin:** Confirm `gemini-1.5-flash` vs `gemini-1.5-pro` for tagging, and `text-embedding-004` (768 vs 1536 dims — v1.6 says 1536, but 004 defaults to 768; need `output_dimensionality=1536` or switch to `3072`?). Lock before migration.
2. **File size & page cap:** Is 50MB / 300 pages the right MVP limit for scanned curricula? Adjust `AI_MAX_FILE_MB` threshold.
3. **Worker count:** Do we guarantee single uvicorn worker in prod (`--workers 1`) and document it, or add gunicorn+uvicorn workers and accept SSE limitation?
4. **Budget:** What is the monthly Gemini budget cap for the institute? Needed to set `AI_MONTHLY_BUDGET_USD`.
5. **Hotfix permissions:** Should hotfix be `admin` only or any `teacher` who owns the document? Current plan allows any teacher — confirm RBAC.
6. **Chapter model:** `chunks.chapter_id` references no table yet — create `chapters` or keep as free-text `topic` for MVP?

---

## 14. Appendix

### A. Key v1.6 SQL — RAG Search (single query, no Qdrant client)

```sql
SELECT chunk_id, content, embedding <=> $1 AS distance
FROM chunks
WHERE document_id IN (SELECT id FROM curriculum_documents WHERE status = 'COMPLETED')
  AND course_id = $2
ORDER BY embedding <=> $1
LIMIT 10;
-- $1 = query embedding VECTOR(1536), $2 = course_id filter
-- Requires: CREATE INDEX chunks_embedding_hnsw ON chunks USING hnsw (embedding vector_cosine_ops);
```

### B. Checkpoint JSON Example (`ingestion_jobs.current_state`)

```json
{
  "last_page": 12,
  "last_successful_chunk_id": "a1b2c3d4e5f6...",
  "processed_count": 87,
  "checkpoint_at": "2026-06-18T22:15:00Z",
  "phase": "embedding"
}
```

### C. Health Extension (proposed addition to `GET /api/v1/admin/system/health`)

```json
{
  "disk": {"usage_percent": 62.4},
  "memory": {"usage_percent": 51.3},
  "postgres": {"status": "up", "pgvector_version": "0.7.0"},
  "ai_pipeline": {
    "circuit_breaker": "closed",
    "last_job": {"id": "uuid", "status": "COMPLETED", "phase": "evaluation"},
    "monthly_cost_usd": 4.2,
    "embedding_p50_ms": 320
  }
}
```

### D. References

- Source doc: `docs/archive/plans/Plan-v1.6.md` (1328 lines, v1.6 Lean MVP — changelog, §3 stack, §6 architecture, §11/12 pipelines, §17 infra, §18 phases, §19 risks)
- Current roadmap: `docs/plans/current.md` (AI pipeline paused since v1.7, resume after deploy)
- Existing infra: `docker-compose.yml` (4 services, pgvector/pg16, lims-internal), `infrastructure/postgres/init.sql`, `backend/requirements.txt` (tenacity, pybreaker, psutil already present)

---

**Next step:** Review this plan. If approved, I will scaffold `backend/app/modules/ingestion` and `backend/app/modules/questions` per §9 Phase 5.0 and open a follow-up plan for frontend routes. No code is changed by this document.
