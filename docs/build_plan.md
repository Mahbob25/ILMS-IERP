# LIMS (Learning Institution Management System) - Build Plan

This document breaks down the development of LIMS (based on Plan-v1.6.md) into highly granular, sequential phases. Each phase is designed to build upon the previous one, maintaining a solid foundation and ensuring that all architectural constraints are enforced.

> **Verification convention:** After each phase is built, create `docs/ver_<phase>.md` with detailed manual verification instructions — step-by-step commands, expected outputs, and a checklist. These serve as the formal sign-off before proceeding to the next phase.

---

## Phase 0: Foundational Infrastructure & Networking Setup

Establish the Docker multi-container environment, network isolation boundaries, and local HTTPS infrastructure.

### Tasks
1. **Repository Structure Setup**: Create the backend and frontend directory structures as described in the architecture document.
2. **PostgreSQL Container Setup**:
   - Write `docker-compose.yml` specifying the `database` service.
   - Use the `pgvector/pgvector:pg16` image.
   - Write an initialization SQL script (`init.sql`) to run `CREATE EXTENSION IF NOT EXISTS vector;`.
3. **Caddy Container Setup**:
   - Write `Caddyfile` configuring the Internal Certificate Authority (`tls internal`).
   - Route traffic for `lims.institute.local` to `frontend:3000` (for web content) and `/api/v1/*` to `backend:8000`.
   - Block LAN access to all ports except `80` and `443` by leaving only Caddy with host port mappings.
4. **Backend FastAPI Boilerplate**:
   - Set up standard modular directory layout inside `backend/app`.
   - Setup basic configuration using Pydantic Settings.
   - Implement root health check endpoint `/api/v1/health` (separate from admin system health).
5. **Frontend Next.js Standalone Boilerplate**:
   - Initialize Next.js project with TypeScript and Tailwind CSS.
   - Set up `next.config.js` with `output: 'standalone'`.
   - Configure basic internationalization (i18n) middleware for English and Arabic.
6. **Local Root CA Setup**:
   - Start containers, extract Root CA certificate (`root_ca.crt`) from the Caddy container.
   - Formulate a script or guide to install this certificate on client machine browsers/system stores to trust the local HTTPS domain `https://lims.institute.local`.

### Verification Checklist
- [ ] Run `docker compose up -d` and check that 4 containers (`caddy`, `frontend`, `backend`, `database`) start successfully.
- [ ] Verify that running `docker compose ps` shows no port mappings for `frontend`, `backend`, or `database` to host `0.0.0.0` or `127.0.0.1`.
- [ ] From a separate machine on the same LAN, run `nmap <server-ip> -p 1-10000` and verify that only ports `80` and `443` are open.
- [ ] Run `docker exec -it database psql -U lims -d lims -c "SELECT '[1,2,3]'::vector;"` and verify it returns a vector representation without errors.
- [ ] Trust the exported Caddy Root CA on your browser. Navigate to `https://lims.institute.local/api/v1/health` and verify the connection is marked secure (HTTPS) and returns the health status.

---

## Phase 1: Database Migrations & Authentication Engine

Setup database versioning, role schemas, and the HttpOnly secure cookie-based session management.

### Tasks
1. **Alembic Setup**: Configure Alembic for database migrations in the `backend/` directory.
2. **Alembic Identity Schema**: Create migrations for:
   - `roles` table. Seed it with `superadmin`, `admin`, and `teacher` roles.
   - `users` table including `is_superadmin` boolean flag, `role_id` foreign key, and password hash columns.
   - `refresh_tokens` table for session rotation and revocation.
   - `audit_logs` table for logging admin activities.
3. **Password Security**: Integrate `bcrypt` or `argon2id` for password hashing in the backend.
4. **JWT & Session Logic**:
   - Write JWT encoder/decoder. Access Token expires in 15 mins; Refresh Token expires in 7 days.
   - Create authentication helper endpoints:
     - `POST /api/v1/auth/login` (with local rate-limiting middleware).
     - `POST /api/v1/auth/refresh` (performs refresh token rotation and database revocation check).
     - `POST /api/v1/auth/logout`.
   - Tokens must be sent and received strictly via `HttpOnly`, `Secure`, `SameSite=Lax` cookies.
5. **RBAC and SuperAdmin Security Gates**:
   - Create dependency injectors in FastAPI:
     - `get_current_user`: extracts access token from cookies, validates signature, returns user model.
     - `RoleChecker`: generic role boundary checker.
     - `superadmin_gate`: enforces `is_superadmin == True`.
6. **Frontend Authentication Flow**:
   - Setup Axios/Fetch interceptor in Next.js to pass cookies (`credentials: 'include'`).
   - Design basic Next.js login page and client-side session store.
   - Write Next.js middleware to intercept unauthenticated users and redirect them to `/login`.

### Verification Checklist
- [ ] Run `alembic upgrade head` and verify that all tables (`roles`, `users`, `refresh_tokens`, `audit_logs`) are created with correct constraints.
- [ ] Use a database client to verify that the `roles` table contains the seeded roles: `superadmin`, `admin`, `teacher`.
- [ ] Submit a POST request to `/api/v1/auth/login` with invalid credentials and verify it returns `401 Unauthorized`.
- [ ] Login with valid credentials and inspect the response headers. Verify that the `Set-Cookie` header is present for both `access_token` and `refresh_token`, and that the `HttpOnly`, `Secure`, and `SameSite=Lax` parameters are set.
- [ ] Attempt to access `/api/v1/users` (protected endpoint) without cookies. Verify it returns `401`. Then try with cookies and verify it succeeds.
- [ ] Request token rotation using `/api/v1/auth/refresh`. Verify a new access token cookie is returned, and the old refresh token is marked as revoked in the database.

---

## Phase 2: Academic Information System (SIS) Modules

Implement core school administrative data structures, registers, and management interfaces.

### Tasks
1. **Academic Alembic Schema**: Create migrations for:
   - `terms` (semesters/academic periods).
   - `courses` (course metadata).
   - `course_sections` (linking course, term, teacher, capacity).
   - `students` (student records).
   - `enrollments` (linking students to sections).
2. **Backend Academic CRUD**:
   - Implement Pydantic validation schemas.
   - Implement CRUD service layers and endpoints for Terms, Courses, Course Sections, Students, and Enrollments.
   - Add access control checks (e.g., Teachers can only list their own sections; Admins/SuperAdmins can manage all).
3. **Frontend Academic Interfaces**:
   - Build UI table views and creation forms for Terms, Courses, and Sections.
   - Build Student roster and Enrollment management interfaces.

### Verification Checklist
- [ ] Create an academic term (e.g., "Fall 2026") via `/api/v1/terms`. Verify DB entry.
- [ ] Create a course (e.g., "Math 101") and assign a teacher user to a course section.
- [ ] Enroll a student in that section. Attempt to enroll the student in a full section and verify it rejects with a validation error.
- [ ] Login as the teacher. Request `/api/v1/course-sections` and verify only the section assigned to this teacher is returned.

---

## Phase 3: Attendance, Assignments & Classroom Modules (LMS)

Build classrooms functionalities, daily management tools, and file upload services.

### Tasks
1. **LMS Alembic Schema**: Create migrations for:
   - `attendance_sessions` (date, section link).
   - `attendance_records` (student, session link, status: present/absent/late/excused).
   - `assignments` (title, due date, max score, link to section).
   - `submissions` (student link, submission date, status).
   - `grades` (submission link, score, feedback).
2. **Storage Service Setup**:
   - Implement local filesystem-based `StorageService` for file uploads (assignment attachments and curriculum uploads).
   - Expose the uploaded files directory via Caddy static routing.
3. **Backend LMS APIs**:
   - Implement Attendance taking endpoints.
   - Implement Assignment publishing, Student submission marking, and grading.
4. **Frontend LMS UI**:
   - Build daily attendance sheets for teachers.
   - Build Gradebook interface for teachers to publish assignments and input scores.

### Verification Checklist
- [ ] As a teacher, create an attendance session and submit records for a section. Verify records exist in `attendance_records` table.
- [ ] Create a new assignment for a section. Verify it is visible to the assigned teacher.
- [ ] Submit a mock submission for a student and record a score. Verify that the system validates that the score does not exceed the assignment's `max_score`.
- [ ] Upload an attachment for an assignment and verify it is saved on the server's disk under the designated uploads directory.

---

## Phase 4: Ingestion Pipeline - Schema, Upload, and Local Engine

Set up the database vector representation, async tasks boilerplate, and state tracker.

### Tasks
1. **Ingestion Alembic Schema**: Create migrations for:
   - `curriculum_documents` (metadata for files uploaded for AI digestion).
   - `ingestion_jobs` (tracks processing status, current phase, and execution state JSONB).
   - `chunks` (holds text content, page numbers, metadata, and the `embedding VECTOR(1536)` column).
2. **Vector Index Setup**: Include the HNSW cosine similarity index configuration in the migration:
   - `CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops);`
3. **FastAPI BackgroundTasks Integration**:
   - Create the Ingestion Service to run in the background.
   - Map `POST /api/v1/curriculum/documents` to receive files, store them locally, insert a `PENDING` job entry, and trigger a `BackgroundTask` invoking the parser.
4. **Resumable State Tracker ("Isolate & Resume")**:
   - Design the `current_state` JSONB schema to log progress (e.g. `last_page`, `last_successful_chunk_id`).
   - Implement state updates in PostgreSQL at regular checkpoints during background execution.

### Verification Checklist
- [ ] Upload a test PDF file to `/api/v1/curriculum/documents` and verify the endpoint immediately returns status `202 Accepted` with a `job_id`.
- [ ] Verify that a corresponding record is created in `curriculum_documents` and `ingestion_jobs` tables with status set to `PROCESSING` or `PENDING`.
- [ ] Check backend server logs to verify that the uvicorn process logs the start of the async parsing task without blocking the API response.
- [ ] Verify that the HNSW index on the `chunks` table is active using a database query against `pg_indexes`.

---

## Phase 5: Ingestion Pipeline - AI Parsing, Embeddings, & Resumability

Incorporate external APIs, layout parsing, chunking, tenacity retry policies, and checkpoint-based execution resuming.

### Tasks
1. **Layout & Text Extraction**:
   - Implement file reader to parse PDFs/DOCX page-by-page.
   - Implement semantic chunking logic.
2. **Gemini API Integration**:
   - Configure Gemini 1.5 Flash client with a Circuit Breaker wrapper (`pybreaker`).
   - Setup `tenacity` retry configuration (exponential backoff) to handle rate limit blocks.
3. **Deterministic Chunking & Deduplication**:
   - Calculate deterministic MD5 hash of chunk content + document ID to serve as `chunk_id`.
   - Write PostgreSQL bulk upsert commands using `INSERT ... ON CONFLICT (chunk_id) DO UPDATE` (or `DO NOTHING`) to write chunks and vector records safely.
4. **Embedding Generation**:
   - Setup API calls to Gemini Embedding API to generate 1536-dimensional vectors for text chunks in batches of 50.
5. **Checkpointing & "Isolate & Resume" Mechanics**:
   - Write update queries to record current progress to the `ingestion_jobs.current_state` column.
   - Modify the background parser to read the `current_state` at startup. If the job is in a `FAILED` state, skip all chunks that match `chunk_id <= last_successful_chunk_id` and resume layout processing from `last_page + 1`.

### Verification Checklist
- [ ] Execute an ingestion task with an active internet connection. Verify that the document transitions to `COMPLETED` and the `chunks` table is populated with content and embeddings.
- [ ] Simulate network failure during ingestion (e.g., block Gemini API domain or disconnect outbound network). Verify that after tenacity retries are exhausted, the job transitions to `FAILED` status.
- [ ] Inspect the `ingestion_jobs` table and verify that `current_state` contains the last successfully processed page and chunk MD5 hash.
- [ ] Re-enable network connectivity and invoke `POST /api/v1/curriculum/jobs/{id}/resume`. Verify that uvicorn logs show it skipping already completed chunks and resuming processing from the exact page recorded in the checkpoint.

---

## Phase 6: Concept Map & Knowledge Representation (DAG)

Build the domain mapping capabilities, extracting topics, and structuring depth-limited graph relationships.

### Tasks
1. **Concept Mapping Alembic Schema**: Create migrations for:
   - `concepts` (concept name, description, chunk link).
   - `concept_dependencies` (adjacency matrix list for DAG representing source and target concepts).
2. **AI Concept Extraction**:
   - Integrate Google ADK structured prompts to ask Gemini 1.5 Flash to output list of concepts, descriptions, and prerequisites (dependencies) from parsed chunks.
3. **Database-Level DAG Querying**:
   - Write a raw SQL Recursive CTE query in the backend repo to construct a DAG map of concepts up to a depth limit of 3 (`depth <= 3`). Do not write caching middleware.
4. **Frontend Concept Map Interface**:
   - Build a visual layout map (using dynamic SVG or vis.js) to display concepts and prerequisite paths.

### Verification Checklist
- [ ] Ingest a syllabus document. Check the `concepts` and `concept_dependencies` tables to confirm concepts were successfully extracted and linked.
- [ ] Execute the recursive CTE query manually via database shell on test concepts. Confirm it stops recursion precisely at depth level 3.
- [ ] Load the frontend concept map visualization page and confirm it displays the DAG correctly with arrows representing prerequisites.

---

## Phase 7: Question Generation & RAG Querying

Develop the question generation engine using native vector operations and structured schema generation.

### Tasks
1. **Vector Querying (RAG)**:
   - Implement the cosine similarity query using pgvector's `<=>` operator directly in PostgreSQL. Make it filterable by `course_id` and `term_id`.
2. **Gemini Structured Question Generation**:
   - Formulate structured JSON outputs from Gemini 1.5 Flash using Pydantic models (Questions, Options, Correct Answer, Explanation).
   - Connect the chunks retrieved via pgvector search as context context to the generation prompt.
3. **Drafting and Approval Pipeline**:
   - Implement DB schema and API endpoints for storing generated questions in `DRAFT` status.
   - Implement approval endpoint `PUT /api/v1/questions/{id}` to transition questions to `APPROVED`.
4. **Offline Resilience Handling**:
   - Implement check for internet connectivity/timeout in vector search pre-processing. If offline, catch error, return clean message to the client, and display a helpful banner stating "Semantic search offline; displaying database contents only".

### Verification Checklist
- [ ] Execute a manual RAG search query. Verify that the query vector is generated and PostgreSQL return the 10 closest text chunks in less than 50ms.
- [ ] Request question generation from a teacher's UI dashboard. Check that the output is formatted as a structured JSON object containing multiple-choice, true/false, and short answer options.
- [ ] Disconnect internet access. Request question generation or semantic search. Verify the application does not crash, and the UI displays the designated offline notification alert.
- [ ] Verify that a teacher can edit a draft question and successfully mark it as approved, moving it to the school's question bank.

---

## Phase 8: SSE Real-Time Notifications & Admin Health Dashboard

Implement in-process notifications and core server statistics reporting.

### Tasks
1. **In-Process Notifications Engine**:
   - Implement a stream router using Server-Sent Events (`GET /api/v1/notifications/stream`).
   - Create a global registry storing `asyncio.Queue` per active authenticated user session.
   - Implement the notification dispatch logic so that backend tasks can push notifications directly into memory queues.
2. **Resource Metrics Collector**:
   - Integrate `psutil` package into backend.
   - Create the `GET /api/v1/admin/system/health` API endpoint restricted to `superadmin` users. Collect disk space usage, memory usage, and database connection pools.
   - Schedule a background thread or event loop scheduler to write health parameters to the `SYSTEM_HEALTH_HISTORY` table every 5 minutes.
3. **SuperAdmin Health UI**:
   - Build a `/admin/system` page on the frontend (accessible only to SuperAdmins).
   - Render system metrics charts using Recharts.

### Verification Checklist
- [ ] Open two browser windows: one as SuperAdmin on `/admin/system` and one as Teacher running document ingestion.
- [ ] Complete or fail the ingestion job. Verify the Teacher immediately receives a live visual notification via SSE without page reloading.
- [ ] Simulate disk usage threshold trigger (>85% warning) in code. Verify that the SuperAdmin receives a warning alert banner in their dashboard via the SSE channel.
- [ ] Hit `/api/v1/admin/system/health` as a Teacher and verify it returns `403 Forbidden`. Hit it as SuperAdmin and verify it returns accurate CPU/Disk usage metrics.

---

## Phase 9: Micro-Backup & Disaster Recovery Service

Build the database preservation service, scheduling, and restore mechanism.

### Tasks
1. **Micro-Backup Scripting**:
   - Write the `micro-backup.sh` shell script.
   - Configure the script to execute `pg_dump` on the database container.
   - Package SQL file via `gzip`, and encrypt it using a public GPG key.
   - Configure `rclone` to copy the encrypted archive to an offsite S3/GCS bucket.
2. **Database Logging Integration**:
   - Add a webhook call inside the script to log execution statistics (timestamp, status, file size) to the `BACKUP_LOGS` table.
3. **Database Restore Flow**:
   - Implement `POST /api/v1/admin/backups/{id}/restore` restricted to SuperAdmin role.
   - Ensure the restore script performs database resets, decrypts the backup archive, runs gunzip, and pipes the output into `psql`. Make sure the action writes a detailed audit entry in `audit_logs`.
4. **Cron Job Configuration**:
   - Setup a cron job schedule on the host server to execute `micro-backup.sh` every 2 hours between 8:00 AM and 8:00 PM.

### Verification Checklist
- [ ] Execute `micro-backup.sh` manually from the host terminal. Verify that the script succeeds and logs a new database entry in `BACKUP_LOGS`.
- [ ] Verify that an encrypted `.sql.gz.gpg` file appears in the configured offsite storage bucket.
- [ ] Insert mock data, run a backup, delete the database records, and invoke the restore API. Verify that the database is rolled back to the backup snapshot and the audit log records the activity.
- [ ] Check the server's crontab (`crontab -l`) to verify the cron scheduling is set to run every 2 hours during working hours.

---

## Phase 10: Production Lockdown & Final Acceptance Tests

Finalize container configurations, secure host port exposure, and verify security protocols.

### Tasks
1. **Production Docker Compose**:
   - Write `docker-compose.prod.yml` configuring resource constraints (`cpus` limits and `memory` caps) for all 4 containers.
   - Remove any development environment overrides.
2. **Next.js Standalone Build**:
   - Perform the multi-stage Next.js standalone container build. Verify that the container runs with a minimal footprint.
3. **Cloudflare Zero Trust Gateway Configuration**:
   - Configure the `cloudflared` service profile.
   - Enforce Cloudflare Access rules (Email OTP + MFA) protecting `admin.lims.institute.local`.
4. **Security Audits and LAN Boundary Enforcement**:
   - Run local security checks to verify that cookies strictly have the `Secure` flag on.
   - Run network port scanning to guarantee LAN isolation.

### Verification Checklist
- [ ] Run `docker compose -f docker-compose.prod.yml up -d` and ensure all 4 containers run within their defined resource limits.
- [ ] Attempt to access the backend API or database ports directly from another machine on the LAN. Ensure the connection is rejected.
- [ ] Access the application on a client machine using `https://lims.institute.local`. Open the browser console, inspect the auth cookies, and verify that the `Secure` flag is active.
- [ ] Disconnect internet access. Ensure all SIS/LMS core workflows (taking attendance, submitting assignments, user logins) continue to function without errors.
- [ ] Access the admin portal URL from an external network. Verify that Cloudflare Zero Trust blocks access until email OTP and MFA verification are completed.
