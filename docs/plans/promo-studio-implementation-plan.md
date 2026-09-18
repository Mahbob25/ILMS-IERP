# Promo Studio — Implementation Plan (v1)

**Status:** proposed · **Owner:** marketing_manager role · **First template:** course ad
**Brand anchor:** Royal Blue `#2563EB` · **Locales:** AR + EN · **Format v1:** landscape 1920×1080

Self-serve video ads for marketing: course / activity / general. This doc is the build contract.
Prototype evidence: `brag-output/` (EN default cut) and `brag-output-2026-09-18-155444/` (AR cinematic cut).

---

## 1. Goals & non-goals

**Goals**
- Marketing manager creates an on-brand course ad in < 10 minutes, no dev involved, no prompt engineering.
- Every on-screen claim is CMS-bound (no invented stats). Branding is template-locked (no color/font controls in UI).
- Render pipeline reuses existing platform patterns: Redis Streams queue, SSE progress, uploads volume, idempotency, audit log, RBAC.

**Non-goals (v1)**
- Vertical/square formats (v1.1 — same content, re-laid-out template variant).
- Activity & general ad templates (v1 ships course; others follow the same pattern).
- Freeform text-to-video or AI-generated imagery. All visuals are deterministic template motion.
- Public/anonymous rendering. Authenticated staff only.

---

## 2. Brand kit — the blue lock (single source of truth)

File: `apps/erp/backend/app/modules/promo/brand_kit.json` (versioned, `brand_kit_version: 1` recorded on every render).

| Token | Value | Use |
|---|---|---|
| `primary` | `#2563EB` Royal Blue | CTA pills, headers, hero accents, schedule time badges |
| `deep` | `#1E3A8A` Sapphire | Outro/hook backgrounds, depth layers, footer bands |
| `sky` | `#0EA5E9` | Glows, ambience blobs, secondary accents on dark |
| `paper` | `#FFFFFF` | Light scene background |
| `tint` | `#EFF4FE` | Light cards, input fills inside video |
| `ink` | `#0F172A` | Primary text on light |
| `muted` | `#475569` | Secondary text on light (contrast-checked) |
| `gold` | `#F59E0B` | Highlight-swipe moment ONLY (the signature trick, on-brand) |
| `success` | `#10B981` | QR CERT dot, seats/urgency positive |
| `danger` | `#EF4444` | LIVE dot, urgency pills |
| `display_ar` | bundled Arabic woff2 (licensed — see §11 risks) | Arabic headlines |
| `body_latin` | Inter (already auto-resolved) | Latin text |
| `mono` | ui-monospace stack | Kickers, labels |
| `logo` | `assets/brand/logo.*` + AR lockup | Outro lockup, fixed position/size, every ad |

**Rule:** the wizard exposes no color, font, or layout controls. Tones vary pacing/music/transitions/wording — never identity. Rebrand = edit this file.

---

## 3. Template system (course ad v1)

Location: `infrastructure/promo-templates/course-ad-v1/` (versioned; baked into worker image).

- One `index.html` composition (root `data-duration="21"`, 5 clips) + `assets/` (music ×2, SFX, fonts, logo).
- **Locale** via variables: all copy through `data-var-text` bindings + a `dir` variable applied to scene roots (`rtl`/`ltr`). Verified pattern in AR prototype cut.
- **Tone** via init-script switch: `getVariables().tone` selects between two prebuilt GSAP timelines (`cinematic`: scale reveals, slow crossfades, sparse bell hits; `clean`: wipes, catalogue pops, moderate accents). Both registered deterministically; exactly one assigned to `window.__timelines["main"]`.
- **Music** via `data-var-src` on the `<audio>` element (fallback = tone default).

### 3.1 Variables schema (excerpt)

```json
[
  {"id":"locale","type":"enum","options":["ar","en"]},
  {"id":"tone","type":"enum","options":["cinematic","clean"]},
  {"id":"heroL1","type":"string","maxLength":24},
  {"id":"heroL2","type":"string","maxLength":32},
  {"id":"heroL3","type":"string","maxLength":28},
  {"id":"cta","type":"string","maxLength":26},
  {"id":"rows","type":"json"},
  {"id":"cards","type":"json"},
  {"id":"stats","type":"json"}
]
```

### 3.2 Reading-time enforcement (backend validation, pydantic)

Fixed template timing + variable-length text = overflow risk. Solved by max lengths derived from the skill's reading floor (short label 0.8s settled; sentence 0.3s/word):

| Field | Max | Rationale |
|---|---|---|
| Hero lines | 24–32 chars | 132px display, single line, 2s+ hold |
| CTA pill | 26 chars | pill geometry at 34px |
| Schedule row title | 34 chars | card row width |
| Program card name | 20 chars | 48px display in 4-col grid |
| Program desc | 60 chars | 2-line clamp at 25px |

Over-limit input is rejected with a field error (never auto-shrunk — shrinking breaks the timing contract).

---

## 4. Backend — `apps/erp/backend/app/modules/promo/`

Follows existing module layout (`models.py`, `schemas.py`, `service.py`, `router.py`, `worker.py`).

### 4.1 Models (Alembic migration)

- `promo_projects`: `id UUID pk`, `type ENUM(course|activity|general)` (v1: course only enforced), `locale`, `tone`, `payload JSONB` (validated content), `status (draft|queued|rendering|done|failed)`, `created_by FK users`, `created_at/updated_at`.
- `promo_renders`: `id UUID pk`, `project_id FK`, `quality ENUM(draft|high)`, `template_version`, `brand_kit_version`, `mp4_path`, `poster_path`, `share_copy TEXT`, `duration_s`, `render_ms`, `status`, `error TEXT`, `created_at`.
- Quota counter: Redis `promo:quota:{YYYY-MM}` (config `PROMO_MONTHLY_QUOTA`, default 20) — no new table.

### 4.2 Endpoints (prefix `/promo`, ERP backend)

| Method & path | Role | Behavior |
|---|---|---|
| `POST /promo/projects` | marketing_manager, superadmin | Validate payload (pydantic + max lengths) → `draft`. Idempotent via `Idempotency-Key` (existing middleware). |
| `PUT /promo/projects/{id}` | same | Edit draft. Audit `PROMO_PROJECT_UPDATED`. |
| `GET /promo/projects?mine=1` | same | History list for dashboard. |
| `POST /promo/projects/{id}/render?quality=draft\|high` | same | Quota check (429 + `Retry-After` when exhausted) → status `queued` → `XADD promo:render` → `202 {render_id}`. Audit `PROMO_RENDER_REQUESTED`. |
| `GET /promo/renders/{id}` | same | Status + progress + file URLs + share copy. |
| `GET /promo/quota` | same | `{used, limit, reset_at}` for the quota meter. |

Files served from the existing uploads volume (`uploads/promos/<render_id>/ad.mp4|poster.jpg`) via the existing Caddy `/uploads/*` route. No new ingress.

### 4.3 Share copy

ERP calls AI service task `promo_caption` with `{type, locale, tone, payload}`; on failure/timeout falls back to a template string (never blocks delivery). Caption stored on the render row.

---

## 5. Render worker — `promo-worker` container

Mirrors `queue.py` (`RedisStreamsQueue`, consumer group, `MAX_ATTEMPTS=3`, DLQ `promo:dlq`) and the SSE event bus (`events/` module, channel `promo:{render_id}`).

**Job lifecycle (per render):**
1. `XREADGROUP` from `promo:render` → set project `rendering`, emit SSE `started`.
2. Resolve `brand_kit.json` + template version + variables from project payload.
3. **Gate:** `hyperframes check` — non-zero errors → `failed`, SSE `failed`, DLQ after 3 attempts. (This gate caught real defects in both prototypes.)
4. Render: `hyperframes render --low-memory-mode --quality <q>` (streaming mode mandatory — full-disk capture needs ~5GB; proven in prototypes).
5. Poster: `ffmpeg -ss <storyboard.poster_at>` → `poster.jpg` → bake as frame 0 (overlay `enable='eq(n,0)'`, same recipe as prototypes).
6. Persist paths + timings, status `done`, SSE `done {mp4_url, poster_url, share_copy}`. Audit `PROMO_RENDER_COMPLETED`.
7. Always clean temp frames (disk guard: refuse job if < 4GB free, requeue with delay).

**Image:** `node:22-slim` + Chrome + ffmpeg, templates baked in (deterministic re-renders), **no host ports**, joins `lims-internal`, `depends_on: redis healthy`. CPU/memory limits set (renders measured ~60s wall, 1 worker = concurrency 1).

---

## 6. Frontend — Promo Studio wizard (ERP dashboard, marketing role)

New route `dashboard/promo-studio` (+ `dashboard/promo-studio/[id]` resume). Reuse: `WizardStepper`, `WizardNavigationBar`, `WizardDirtyGuard`, `.card`, Lucide icons, `apiClient` (idempotency header already attached).

- **Step 1 Type:** course card enabled; activity/general cards visible but disabled with "soon" badge.
- **Step 2 Content:** program picker (options from `GET /content/landing` programs) → fields prefill → editable within max lengths (live char counters). Custom-course toggle for off-CMS courses.
- **Step 3 Style:** tone cards (Cinematic / Clean) with poster thumbnails from prototypes; locale toggle AR/EN; format fixed landscape with vertical greyed "v1.1".
- **Step 4 Preview:** "Render draft" → SSE progress bar → `<video>` player with poster. Re-edit loop allowed.
- **Step 5 Deliver:** "Render final" → download mp4 + poster buttons, share-copy box with copy button, quota meter, render history table (status, quality, duration, created_at, re-download).

---

## 7. Security checklist (pre-merge, mirrors security skill)

- [ ] RBAC: write paths `RoleChecker(["superadmin","marketing_manager"])`; no public endpoints.
- [ ] Input validation: pydantic schemas + max lengths; `rows`/`cards` arrays length-capped (3 / 4).
- [ ] Template injection: variables inserted as **text only** (no `innerHTML` of user content in template); worker escapes on merge.
- [ ] Rate limit render endpoint (expensive op) + monthly quota; 429 semantics.
- [ ] No secrets in templates/worker beyond env (`REDIS_URL`, service key if worker calls ERP).
- [ ] Rendered files content-type validated (mp4/jpg only out); uploads dir not executable.
- [ ] Audit logs on project update + render request/complete.
- [ ] Music + font licenses cleared before any public post (see §11).

---

## 8. Testing (80%+ on new code, TDD)

- **Unit:** max-length validation matrix (AR + EN, boundary chars), quota allow/deny/reset, storyboard defaults, share-copy fallback.
- **Integration:** project CRUD auth matrix (marketing OK / teacher 403 / anon 401), render enqueue → stream entry, idempotent re-POST returns same render, quota exhaustion 429.
- **Worker:** fake-render harness (stub hyperframes binary) for success/fail/DLQ paths; one real template render in CI? No — real renders are heavy; gate CI on `hyperframes check` + snapshot diff of 2 frames.
- **E2E (Playwright):** wizard happy path with worker stubbed (draft → done → download links visible); quota meter shows.

---

## 9. Rollout & acceptance

1. **Pilot (no new infra):** generalize EN template to variables, render 1 real course ad manually, marketing approves look/feel/copy. *Exit: approved mp4 + poster.*
2. **Build:** backend module + worker + wizard behind existing auth, staging only.
3. **Stage verify:** full loop AR + EN, quota trip, worker kill mid-render (job requeues, no stuck `rendering`), disk-full refusal.
4. **Prod:** migrate, deploy worker, announce quota policy.

**Acceptance criteria:** marketer completes course ad unassisted < 10 min; `check` gate blocks a bad template in staging test; quota enforced; every shipped mp4 traceable to CMS content + template/brand versions.

---

## 10. Production operations — how it runs day to day

### Topology (one new box in the existing picture)

```
Browser (marketing) → Vercel ERP frontend → Caddy → ERP backend (/promo/*)
ERP backend → Redis XADD promo:render
promo-worker (new container, no host ports) → Redis XREADGROUP → Chrome+ffmpeg
promo-worker → uploads_data volume (mp4/poster) → Caddy /uploads/* → browser
promo-worker → Redis PUBLISH promo:{id} → ERP SSE → browser progress bar
```

### A render's life (example: Karam's Python course, AR, cinematic)

1. Marketer finishes wizard → `POST /promo/projects/{id}/render?quality=high` with `Idempotency-Key` → 202 `{render_id}`.
2. Worker claims job, marks `rendering`, SSE `started` (dashboard shows progress).
3. Variables merged from CMS program `computing` + overrides; `check` passes; render ~60s; poster at `poster_at` baked to frame 0.
4. Row `done` with `render_ms`; SSE `done`; marketer downloads mp4/poster/caption. Quota 7/20.
5. Nightly prune job keeps last 5 renders/project (storage ~15–25MB/project max); DB rows retained for audit.

### Monitoring & alerts

- Worker heartbeat + `promo:render` pending count + `promo:dlq` depth (alert on DLQ > 0).
- `render_ms` p95 trend (template regression signal); disk-free guard on worker volume.
- Health: worker `/health`, ERP probe extended (migration sync already exists).

### Failure modes

| Failure | Behavior | Recovery |
|---|---|---|
| Template `check` fails | render `failed`, SSE error, no quota consumed | Fix template, redeploy worker image |
| Worker OOM/killed mid-render | job stays pending → redelivered; project reset `queued` by watchdog | Automatic; watchdog sweeps stuck `rendering` > 15 min |
| Disk < 4GB free | job refused + requeued with backoff, alert fires | Prune job / extend volume |
| 3 attempts exhausted | moved to `promo:dlq`, alert | Inspect, fix, replay via admin endpoint |
| AI caption down | template fallback caption, render still `done` | Degraded, self-heals |

### Costs

~1–2 CPU-min + ~3–5MB storage per high render; quota 20/mo ≈ < 100MB/mo. Negligible next to existing VM — the constraint is concurrency (1), not cost.

---

## 11. Risks & open decisions

1. **Music license** — demo tracks' commercial terms unclear. Need 2 licensed tracks (AR-friendly) before public posts. Owner: marketing.
2. **Arabic display font license** — bundle one OFL/licensed woff2 (IBM Plex Sans Arabic OFL or Noto Kufi Arabic OFL both solve it cleanly).
3. **Vertical format** — required for WhatsApp/IG before real distribution; scoped as v1.1 template variant.
4. **Tone drift** — new tones must pass a brand review (fixed checklist: logo lockup, palette tokens, reading floors) before shipping.
