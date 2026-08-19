# Deploying to Vercel — Marketing, ERP, and Portal

**Updated for the `apps/` monorepo layout** (`apps/marketing`, `apps/erp/frontend`, `apps/portal/frontend`).

Three Next.js apps deploy to Vercel as three separate projects. The FastAPI backends stay on EC2; Vercel rewrites `/api/*` to the EC2 API bridge via Caddy.

> **Domains:** the custom `aldirasat.com` domains are **not yet purchased**. Until they are, the apps run on Vercel's default `*.vercel.app` domains: **`aldirasat.vercel.app`** (marketing) and **`aldirasat-portal.vercel.app`** (portal). The ERP uses its own project URL. See §3 for swapping to custom domains later.

## Architecture recap

| App | Directory | Vercel domain | Purpose |
|---|---|---|---|
| **marketing** | `apps/marketing` | `aldirasat.vercel.app` | Public landing, login (shared IdP), programs, book |
| **ERP** | `apps/erp/frontend` | `<erp-project>.vercel.app` | Internal staff dashboard |
| **portal** | `apps/portal/frontend` | `aldirasat-portal.vercel.app` | Student/parent portal |

> The project slug in the default URL is fixed at project creation (Vercel won't rename it later). Choose names now:
> - Marketing project slug → `aldirasat` (so the URL is `aldirasat.vercel.app`) — or accept whatever slug Vercel assigns.
> - Portal project slug → `aldirasat-portal` (so the URL is `aldirasat-portal.vercel.app`).

All three frontends proxy `/api/*` to `http://13.50.176.4` (the EC2 Caddy bridge) via `next.config.js` rewrites. **No backend runs on Vercel** — only static Next.js output + serverless rewrites.

---

## 1. One-time setup

### 1.1 Push the monorepo to GitHub

The repo is already on GitHub (`origin https://github.com/Mahbob25/ILMS-IERP.git`). Keep `main` in sync before each deploy:

```bash
git add -A && git commit -m "deploy: ..." && git push origin main
```

### 1.2 Create three Vercel projects

1. Go to [vercel.com/new](https://vercel.com/new) → import the `ILMS-IERP` GitHub repo.
2. Create **three** projects — one per app:

| Project slug | Root directory | Framework preset | Build command | Output |
|---|---|---|---|---|
| `aldirasat` | `apps/marketing` | Next.js | `npm run build` | `.next` (auto) |
| `aldirasat-erp` | `apps/erp/frontend` | Next.js | `npm run build` | `.next` (auto) |
| `aldirasat-portal` | `apps/portal/frontend` | Next.js | `npm run build` | `.next` (auto) |

> Vercel auto-detects Next.js and runs `npm install && npm run build` in the root directory. The existing `vercel.json` (`{ "framework": "nextjs" }`) in each app confirms the preset. No custom build commands needed.

3. Resulting default domains:
   - Marketing → `https://aldirasat.vercel.app`
   - ERP → `https://aldirasat-erp.vercel.app`
   - Portal → `https://aldirasat-portal.vercel.app`

---

## 2. Environment variables

Set these per-project in **Vercel Dashboard → Project → Settings → Environment Variables**. The build-time ones (`NEXT_PUBLIC_*`, `API_ORIGIN`) must exist for **Preview** and **Production** so `next build` picks them up.

### 2.1 Marketing (`apps/marketing`)

| Name | Value | When |
|---|---|---|
| `API_ORIGIN` | `http://13.50.176.4` | build + runtime |
| `NEXT_PUBLIC_ERP_URL` | `https://aldirasat-erp.vercel.app` | build |
| `NEXT_PUBLIC_PORTAL_URL` | `https://aldirasat-portal.vercel.app` | build |

`NEXT_PUBLIC_*` vars are inlined at build time — change a value and redeploy.

### 2.2 ERP (`apps/erp/frontend`)

| Name | Value | When |
|---|---|---|
| `API_ORIGIN` | `http://13.50.176.4` | build + runtime |
| `NEXT_PUBLIC_MARKETING_URL` | `https://aldirasat.vercel.app` | build |
| `SENTRY_DSN` | (optional) your Sentry DSN | build + runtime |

> `NEXT_PUBLIC_MARKETING_URL` is used by the ERP frontend's middleware/AuthContext to redirect unauthenticated users to the shared marketing login. If you don't set it, the code falls back to `https://aldirasat.com` — so **set it** while on `vercel.app` domains.

### 2.3 Portal (`apps/portal/frontend`)

| Name | Value | When |
|---|---|---|
| `API_ORIGIN` | `http://13.50.176.4` | build + runtime |
| `NEXT_PUBLIC_ERP_URL` | `https://aldirasat-erp.vercel.app` | build |

---

## 3. Custom domains (later)

Once `aldirasat.com` is purchased, attach domains in **Vercel → Project → Settings → Domains**:

| App | Domain |
|---|---|
| Marketing | `aldirasat.com`, `www.aldirasat.com` |
| ERP | `erp.aldirasat.com` |
| Portal | `portal.aldirasat.com` |

DNS records to add at your registrar:

- **Apex (`aldirasat.com`)**: `A` record → `76.76.21.21`
- **Subdomains** (`erp.`, `portal.`, `www`): `CNAME` → `cname.vercel-dns.com`

Then update the env vars (`NEXT_PUBLIC_*`) to the new domains and redeploy all three apps.

---

## 4. Deploying

### 4.1 Automatic (recommended)

With the GitHub integration, **every push to `main`** triggers a production deploy of all three projects. Add per-app triggers later with monorepo settings if you want to limit deploys.

### 4.2 Manual / CLI

Install the Vercel CLI once:

```bash
npm i -g vercel
```

Deploy each app (run from the app's directory):

```bash
# marketing
cd apps/marketing
vercel --prod

# ERP
cd ../erp/frontend
vercel --prod

# portal
cd ../portal/frontend
vercel --prod
```

First run links the directory to a project (`vercel link`); afterward it deploys straight to production. Use `vercel` (no `--prod`) for a preview deployment.

### 4.3 Preview deployments

Vercel gives every PR/push a preview URL (`project-xxx.vercel.app`). **Note:** preview URLs are a different origin, so cross-origin cookie flows (login → ERP/portal redirect) and CORS won't fully work on previews — test the full auth flow on the production domains.

---

## 5. Verify after deploy

| Check | Expected |
|---|---|
| `curl -I https://aldirasat.vercel.app/ar` | `200` (or `307` → `/ar`) |
| `curl -I https://aldirasat.vercel.app/ar/login` | `200`, full login form renders |
| `curl -I https://aldirasat-erp.vercel.app/ar/dashboard` | `307` → marketing login (unauthenticated) |
| `curl -I https://aldirasat-portal.vercel.app/ar` | `200` |
| Login as **staff** on `aldirasat.vercel.app/ar/login` | lands on `aldirasat-erp.vercel.app/ar/dashboard` |
| Login as **student** on `aldirasat.vercel.app/ar/login` | lands on `aldirasat-portal.vercel.app/ar/login?ticket=...` → portal dashboard |
| `curl -I https://aldirasat.vercel.app/api/v1/health` | `200` (rewritten to EC2) |

### Troubleshooting

- **`API_ORIGIN` not applied** → the rewrite uses the EC2 IP. Check the env var is set for **Production**, then redeploy.
- **Login redirect loops / wrong host** → confirm `NEXT_PUBLIC_ERP_URL` / `NEXT_PUBLIC_PORTAL_URL` / `NEXT_PUBLIC_MARKETING_URL` match the real domains (the `vercel.app` ones, not `aldirasat.com`) and were set at build time.
- **`Access-Control-Allow-Origin` missing on login POST** → the ERP backend `CORS_ORIGINS` must include every frontend origin (see below).
- **Cookies not sent cross-origin** → the ERP login sets `SameSite=Lax` cookies on the ERP host; the marketing app must redirect (not iframe/fetch) to the ERP host for the staff path. This is already how the code works.
- **Google Fonts build failures (`ECONNRESET`)** → `next/font` fetches fonts at build time; on flaky networks it retries. Retry `vercel --prod` or redeploy from the dashboard.

---

## 6. Related infra (not on Vercel)

The backends stay on EC2 (Caddy bridge):

- ERP backend: `apps/erp/backend` (FastAPI on `:8000`, mounted `/api/v1/*`, `/uploads/*`)
- Portal BFF: `apps/portal/backend` (FastAPI on `:8001`, mounted `/api/*`)
- Caddy on EC2 `:80` proxies: `/api/v1/*` → ERP backend, `/api/*` → portal BFF, `/uploads/*` → ERP backend

Vercel only serves the Next.js apps; the `/api` rewrites point at the EC2 host. The Caddyfile lives in `infrastructure/caddy/Caddyfile`.

---

See also: `docs/architecture/portal-architecture.md` (the decision record), `docs/operations/` for EC2/backup ops.
