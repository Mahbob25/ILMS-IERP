# LIMS Architectural Memory

This document stores the immutable architectural constraints, technical rules, and decisions for the LIMS project. All developers (and AI assistants) must strictly adhere to these rules. No deviations are allowed unless authorized in a revised master plan.

---

## 1. Container Infrastructure Limitation
- **Strictly 4 Containers**: The deployment is limited to exactly four containers in `docker-compose.yml`:
  1. `caddy` (Reverse Proxy & Local CA)
  2. `frontend` (Next.js Standalone Node.js container)
  3. `backend` (FastAPI + BackgroundTasks)
  4. `database` (PostgreSQL + pgvector)
- **Forbidden Services**: Do NOT introduce Redis, RabbitMQ, Celery, Qdrant, Flower, or any other infrastructure container. The system is designed as a Lean MVP.

## 2. Network Isolation (LAN Bypass Prevention)
- **Caddy is the Sole Gate**: Caddy is the only container allowed to expose host ports (`80` and `443` on the host).
- **Internal Docker Network**: `frontend`, `backend`, and `database` must communicate exclusively through the internal, private bridge network `lims-internal`.
- **No Direct Exposure**: Never add `ports` mapping (e.g. `5432:5432` or `8000:8000`) for the database or backend in production `docker-compose.yml`. LAN scanning must find all ports blocked except Caddy's 80 and 443.

## 3. Database & Vector Storage
- **Single Source of Truth**: PostgreSQL is the sole database for both relational academic tables and vector embeddings.
- **pgvector Integration**: Use `pgvector` (`VECTOR(1536)`) directly inside the PostgreSQL instance. Do NOT use Qdrant, Milvus, Chroma, or any other external vector database.
- **Indexing**: Vector columns must be indexed using `HNSW` (`USING hnsw (embedding vector_cosine_ops)`) to ensure sub-50ms search times.
- **RAG Queries**: Semantic search must be executed via direct SQL queries using the cosine distance operator (`<=>`).

## 4. Asynchronous Task Execution
- **FastAPI BackgroundTasks**: All asynchronous processes (such as processing curriculum documents and generating embeddings) must be executed in-process using FastAPI's built-in `BackgroundTasks` library.
- **No Celery Workers**: Do not use Celery or separate background workers. The tasks are processed sequentially in the uvicorn event loop.

## 5. Resumability & Deduplication ("Isolate & Resume")
- **State Checkpointing**: The background ingestion pipeline must track progress by writing a JSON checkpoint directly to the `ingestion_jobs.current_state` (JSONB) column.
- **Deterministic Chunks**: Chunk IDs (`chunk_id`) must be deterministic, generated using the MD5 hash of the chunk text + document ID.
- **PostgreSQL Upsert**: Rely on `ON CONFLICT (chunk_id) DO UPDATE` or `ON CONFLICT (chunk_id) DO NOTHING` in PostgreSQL to handle deduplication during resumes. Do not maintain external asset lists or caches.

## 6. Authentication & Session Management
- **Single Auth Mode**: Session state must be stored exclusively using JWTs placed inside `HttpOnly Secure Cookies` with the `Secure`, `SameSite=Lax`, and `Path=/` flags.
- **No LocalStorage**: Never store access or refresh tokens in localStorage, sessionStorage, or custom JS memory pools.
- **Token Rotation**: Implement active refresh token rotation (re-issuing a new refresh token and marking the old one as revoked in the database upon usage).

## 7. LAN HTTPS & Certificates
- **Internal CA**: Caddy must be configured as a Local PKI Certificate Authority (`tls internal` directive).
- **Certificate Distribution**: Client machines must manually download and trust the local root certificate `root_ca.crt` (typically served via a secure route `lims-admin.local/setup-ca`).
- **Required for Cookies**: This local SSL configuration is mandatory because the `Secure` flag on cookies is rejected by modern browsers over unencrypted HTTP or untrusted HTTPS configurations on local IP/LAN domains.

## 8. Concept Graph (DAG) Querying
- **Recursive CTEs**: Query the knowledge map/prerequisites dynamically using SQL Recursive CTEs with a recursion limit of 3 (`depth <= 3`).
- **No Cache Layer**: Do not cache the graph in Redis. Keep database queries lean with appropriate indexes.

## 9. Real-Time Communication
- **Server-Sent Events (SSE)**: Use SSE for real-time notifications (e.g. system health warnings, ingestion completion).
- **In-Process Queues**: Maintain a global registry of `asyncio.Queue` objects associated with active user connections in-memory within the FastAPI process. Do not write Redis Pub/Sub channels.

## 10. Disaster Recovery (Micro-Backup)
- **High-Frequency Backups**: A cron job runs `micro-backup.sh` every 2 hours during active working hours (8:00 AM - 8:00 PM).
- **Single SQL Dump**: The backup must dump the database relational tables and pgvector embedding columns into a single `.sql.gz` archive.
- **Encryption & Offsite Upload**: The archive must be encrypted using public-key GPG encryption and uploaded to S3 or GCS using `rclone`.
- **Database Logs**: Every backup execution (and its size/status) must log results to the `BACKUP_LOGS` table, raising system health alarms if RPO (Recovery Point Objective) exceeds 2 hours.

## 11. Offline Resilience Requirements
- **Local Autonomy**: 100% of core SIS/LMS functionality (auth, attendance, grades, scheduling) must work without internet.
- **Graceful Failure**: If internet connection is down, background ingestion tasks must fail cleanly (transitioning `ingestion_jobs.status` to `FAILED` with a detailed log), and vector queries must return empty results with a clear UI message ("Semantic search offline") rather than crashing the request or system.

## 12. Troubleshooting: Disk Space Exhaustion on Host OS
- **Issue**: On Windows host systems where drive `C:` is full (0.00 GB free), typical developer operations fail:
  - `npm install` fails with `ENOSPC: no space left on device` because the global npm cache defaults to the user's AppData directory on `C:`.
  - Docker Desktop and WSL2 fail to compile or build container images with errors like `panic detected in stargz-snapshotter` due to the WSL2 virtual disk (`ext4.vhdx`) being unable to expand on a full `C:` drive.
- **Solutions**:
  - **NPM Cache Redirection**: Bypass the `C:` drive cache restriction by explicitly redirecting the cache directory to a drive with free space (e.g. drive `E:`):
    `npm install --cache E:\lms\.npm-cache`
  - **Docker/WSL Disk Space Reclaim**: Clean up files on `C:` or re-locate the WSL2 virtual machine disk image (`ext4.vhdx`) to a storage drive with available space.

## 13. Development Session: Resolved Issues (June 2026)

- **Caddy image exec format error**: `caddy:2.7-alpine` produced "exec format error" on amd64. Fixed by using `caddy:latest` (v2.11.4).
- **Hosts file**: Added `127.0.0.1 aldrasat.edu` to Windows hosts file for local access.
- **Frontend infinite redirect loop**: Removed `i18n` config block from `next.config.js` — it conflicted with App Router middleware-based locale detection.
- **Frontend 401 redirect loop**: In `lib/api.ts`, 401 interceptor redirected to `/login` (no locale prefix), causing middleware to re-add locale and loop. Fixed with locale-aware redirect and login-page guard.
- **Backend circular import**: Model imports in `app/db/base.py` caused circular imports. Moved to `alembic/env.py` instead.
- **bcrypt/passlib incompatibility**: `bcrypt==5.0.0` is incompatible with `passlib==1.7.4`. Pinned `bcrypt==4.0.1` in `requirements.txt`.
- **Timezone-naive DB columns**: `audit_logs.timestamp` and `refresh_tokens.expires_at` are `TIMESTAMP WITHOUT TIME ZONE` but Python code passed timezone-aware datetimes (`datetime.now(timezone.utc)`). Fixed by stripping tzinfo with `.replace(tzinfo=None)` at insertion points.

