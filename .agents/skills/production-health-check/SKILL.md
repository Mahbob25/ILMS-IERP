---
name: production-health-check
description: Run a full read-only production health check over SSH — host resources, every container, database and migration state, Redis, reverse proxy, logs, backups, and the public Vercel→origin path — then produce a detailed report of everything broken, degraded, or unverified. Use when the user asks for a production health check, a production status report, "is production ok", launch/go-live verification, post-deploy verification, a pre-demo sanity check, or when investigating an outage, downtime, or a 502 from Vercel.
argument-hint: "[--quick] [--host <ip>] [--skip-external]"
---

# Production Health Check

A repeatable end-to-end scan of the production deployment, ending in a report.
Designed to be run at launch, after deploys, and during incidents — **with live
data**. It exists because a single stale migration or a never-started container
can take the whole product down (see `references/failure-modes.md`).

## Safety contract — read this first

This skill is **READ-ONLY**. It diagnoses; it does not repair.

- Never restart, stop, recreate, or remove a container.
- Never write to the database. Never `UPDATE`/`DELETE`/`DROP` anything.
- Never run `FLUSHALL`/`FLUSHDB` against Redis, never `config set` on a live keyspace.
- Never write to `.env`, `git checkout`, `git pull`, or edit files on the server.
- Never print secret **values** — presence, length and placeholder status only.

If the scan finds a problem, **report it and propose the exact fix, then ask
before doing anything.** A health check that mutates production is not a health
check. The one exception is that the report itself may be written to a local file.

## Prerequisites

- SSH key: `lms-key.pem` at the repo root (gitignored). Override with `--key`.
- Production host: `ubuntu@13.50.176.4`, repo at `/home/ubuntu/ILMS-IERP`.
- Operator needs `ssh`, `scp`, and `curl`.

## Run it

Prefer the runner — it handles key permissions, uploads the collector, adds the
external checks, and writes raw evidence for you to read.

```bash
# from the repo root (Windows: invoke through WSL, using the /mnt/<drive>/ path)
bash .agents/skills/production-health-check/scripts/run.sh
```

Options: `-H <host>` · `-k <key>` · `-u <user>` · `-r <remote_repo>` ·
`-o <evidence_file>` · `--skip-external`.

**If bash is unavailable** (no WSL/Git-Bash), replicate the three steps directly.
From PowerShell this simple form works — but keep the commands free of nested
quotes, which PowerShell mangles:

```powershell
scp -i E:\lms\lms-key.pem -o StrictHostKeyChecking=no `
  .agents\skills\production-health-check\scripts\collect.sh ubuntu@13.50.176.4:/tmp/phc-collect.sh

ssh -i E:\lms\lms-key.pem -o StrictHostKeyChecking=no ubuntu@13.50.176.4 `
  "bash /tmp/phc-collect.sh /home/ubuntu/ILMS-IERP"
```
Then run the external probes with `curl.exe`. See
`references/failure-modes.md#10` for the quoting traps (no `<` redirection in
PowerShell; write SQL/scripts to a file and `scp` them up).

## Workflow

1. **Preflight.** Confirm the key exists, then verify SSH reachability. Test
   port 22 **and** port 80 before anything else — this alone distinguishes the
   three very different failure classes:
   - 22 open + 80 open → host and gateway up; continue the full scan.
   - 22 open + 80 **closed** → host alive, web stack down. Likely the crash-loop
     chain (failure-modes #1 → #2). Go straight to container + migration checks.
   - 22 closed → host/network/security-group problem; report and stop.

2. **Collect.** Run `collect.sh` on the server. It emits evidence sections plus
   `VERDICT|<id>|<status>|<detail>` lines. Give it time; it inspects every
   container, the database, Redis, and recent logs.

3. **Read the evidence.** Do not trust the summary counts alone — read the raw
   sections. `collect.sh` always exits 0, so a partial scan looks like a
   successful one; check for `(container X not running)` and section gaps.

4. **Verify externally.** `run.sh` probes the public path from the operator
   network (all three frontends, both API bridges, and the login route). This is
   the only way to prove the Vercel→origin rewrite works — no server-local check
   can. If it was skipped, say so explicitly in the report.

5. **Correlate.** One root cause usually explains many FAILs. Trace the chain
   before writing anything: e.g. *migration mismatch → backend crash-loops →
   Caddy never starts → port 80 closed → Vercel 502* is **one** incident with
   **one** fix, not five problems. State the chain once.

6. **Report** per `references/report-template.md`. Every claim must trace to a
   VERDICT line or quoted evidence; list what could not be verified.

7. **Propose, then ask.** Give the ordered fix list, flag anything destructive or
   requiring a judgement call (dropping an orphaned table, stamping a migration,
   rotating a secret), and wait for confirmation.

## Interpreting results

Read `references/checks-catalog.md` for every check id, its threshold, and what
each status means. The high-value checks, in priority order:

1. `migrations.sync` — a FAIL here is almost always the root cause of a total outage.
2. `caddy.port80` — nothing on 80 means every public request 502s.
3. `container.<core>` — running/healthy/OOM, and `Restarting (255)` specifically.
4. `erp.health` + `portal.redis` — the apps are actually serving.
5. `redis.auth` / `redis.maxmemory` / `redis.policy` — silent data-loss risks.
6. `external.*` — the path a real user takes.

### Known red herrings — do not cry wolf

- `litellm` `unhealthy` — pre-existing, not on the request path.
- Caddy ACME `NXDOMAIN` for `erp.aldirasat.edu` / `portal.aldirasat.edu` — those
  hostnames have no DNS records; cosmetic while Vercel→IP is the path.
- Empty Redis keyspace — often *no traffic yet*, not a fault. Report as INFO.
- `500` on `POST /auth/login` with a malformed/empty body — the handler raises a
  raw `ValidationError`. Judge login by gateway errors (502/503/504) instead.
- A container lacking `curl` always reads `unhealthy` because its healthcheck
  cannot run.

## Reporting rules

- Lead with a one-line overall verdict (**HEALTHY / DEGRADED / BROKEN**) and the
  single most important finding.
- Back every FAIL with the raw evidence you observed, quoted.
- Separate real risks from known noise (above).
- Be explicit about blind spots: this scan does **not** verify credentials
  actually authenticate, data correctness, security posture, or behaviour under
  load, and it cannot see past a container that is down.
- Never fabricate a check you did not run. "Not verified" is a valid, honest result.

Full format: `references/report-template.md`.

## Reference files

- `references/checks-catalog.md` — every check id, threshold, and interpretation.
- `references/failure-modes.md` — real incidents on this stack with literal error
  strings, confirmation steps, and fixes. Read this before diagnosing anything.
- `references/report-template.md` — the report contract.

Scripts: `scripts/run.sh` (operator-side orchestrator), `scripts/collect.sh`
(server-side read-only collector — the source of truth for what is checked).
