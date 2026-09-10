# Checks catalog — coverage map and interpretation

`scripts/collect.sh` emits one `VERDICT|<id>|<status>|<detail>` line per check.
Use this table to confirm nothing was skipped and to interpret each result.
Statuses: **PASS** (verified good) · **WARN** (degraded/risky, not down) ·
**FAIL** (broken or will break) · **INFO** (observation, not a judgement).

## Host

| id | what it proves | thresholds |
|---|---|---|
| `host.disk` | root FS has room for images, logs, DB growth | FAIL ≥90%, WARN ≥80% |
| `host.memory` | headroom for containers | FAIL ≥90% used, WARN ≥80% |
| `host.load` | CPU not saturated | WARN when load1 > 2×vCPU |
| `host.overcommit` | Redis can fork for BGSAVE/AOF | FAIL unless `vm.overcommit_memory=1` **and** persisted |
| `host.ntp` | clock accurate → JWT `exp`/`iat` and scheduled jobs behave | WARN if NTP unsynchronised |
| `host.reboot` | no pending kernel/package update awaiting reboot | WARN if `/var/run/reboot-required` |

Also captured: inode usage, swap, uptime.

## Docker

| id | what it proves |
|---|---|
| `docker.daemon` | engine reachable |
| `docker.logsize` | no container log ≥500MB (silent disk filler) |

Also captured: `docker system df`, server version, storage driver.

## Containers

Per container: existence, state, health, `RestartCount`, `OOMKilled`.

- **Core (must run):** `lims_database`, `lims_redis`, `lims_backend`, `lims_caddy`, `portal_backend`
- **Aux (optional):** `ai_service`, `ai_worker`, `lims_cloudflared`

| id | FAIL when |
|---|---|
| `container.<name>` | not running, or `OOMKilled=true`, or `unhealthy` |
| `container.<name>` (WARN) | restarted >25× — running now but has a crash-loop history |

`Restarting (255)` is the classic alembic crash-loop signature (see failure-modes #1).

## Database

| id | what it proves |
|---|---|
| `database.up` | container running + healthy |
| `database.connections` | connections <80% of `max_connections` |
| `database.locks` | no ungranted locks (long transactions) |
| `database.idle_txn` | ≤5 sessions `idle in transaction` |

Captured: version, DB size, active vs total sessions, longest transaction age,
table count, top-5 largest tables.

## Migrations

| id | interpretation |
|---|---|
| `migrations.sync` PASS | DB stamp == code head |
| `migrations.sync` WARN | DB behind head — backend should apply it on boot |
| `migrations.sync` FAIL | **DB stamped at a revision absent from the image → crash-loop** |

This is the highest-value check on the board; see failure-modes #1.

## Redis

| id | interpretation |
|---|---|
| `redis.up` | container running + healthy |
| `redis.auth` | FAIL if no password set (open instance) |
| `redis.maxmemory` | FAIL if `0` while the container is memory-limited, or ≥ container limit |
| `redis.policy` | FAIL for `allkeys-*` (can evict job streams); PASS for `volatile-lru` |
| `redis.queue.<s>` | WARN if a stream holds >1000 entries (worker not draining) |
| `redis.queue.<s>.pel` | WARN if >100 unacked entries (stuck consumer) |
| `redis.dlq` | WARN if `ai:dlq` is non-empty |
| `redis.keyspace` | INFO when empty — expected if nothing is caching yet |

The collector deliberately **does not** write test keys or mutate Redis. To prove
the eviction policy protects job streams, do it during a *maintenance* window,
never on a live keyspace:

```bash
# safe only when the keyspace is empty / disposable
R() { docker exec lims_redis sh -c "redis-cli --no-auth-warning -a \"\$REDIS_PASSWORD\" $1"; }
R "xadd vuln:test '*' job_id t"            # no-TTL stream, mimics ai:student
R "config set maxmemory 6mb"
for i in $(seq 1 100); do R "set cache:t:$i $(head -c 100000 /dev/zero | tr '\0' x) ex 60"; done
R "exists vuln:test"    # expect 1 — stream protected
R "config set maxmemory 201326592"; R del vuln:test
```
Do **not** run `FLUSHALL` against a live production keyspace.

## ERP backend

| id | what it proves |
|---|---|
| `erp.health` | `/api/v1/health` == 200 **and** `database: connected` |
| `erp.startup_jobs` | daily section/notification jobs ran (FAIL if "Database unavailable during startup") |
| `erp.logs` | error/traceback volume sane |
| `erp.http5xx` | 5xx rate in the last 24h |

Captured: startup lines, 24h tracebacks, 5xx samples, daily-job evidence.
A `500` on `POST /auth/login` with an empty body is **expected** (the handler
raises a raw `ValidationError` on missing fields) — judge login by gateway
errors (502/503/504), not by a 4xx/5xx from a malformed payload.

## Portal backend

| id | what it proves |
|---|---|
| `portal.health` | `/api/health` status ok |
| `portal.redis` | `"redis":"connected"` — the BFF↔Redis link |

Also captured: `/api/health/cache` hit/miss counters, 24h errors.

## Gateway (Caddy)

| id | what it proves |
|---|---|
| `caddy.up` | container running (catches the `Created`-but-never-started case) |
| `caddy.port80` | **something is listening on :80** — without this Vercel 502s |
| `caddy.route.api/v1/health` | ERP route through Caddy == 200 |
| `caddy.route.api/health` | portal route through Caddy == 200 |
| `caddy.acme` | WARN only — NXDOMAIN cert failures are cosmetic here |

## Code state

| id | what it proves |
|---|---|
| `code.dirty` | no uncommitted tracked changes on the server |
| `code.image_stale` | INFO when the backend image predates HEAD (rebuild needed). Dates normalised to UTC — `--date=short` uses the commit's own offset and produces phantom off-by-one-day mismatches |
| `env.file` | `.env` exists with required keys |
| `env.<KEY>` | FAIL if a secret still holds a placeholder (`change_me*`, `lims_secure_pass`, …) |
| `env.PORTAL_SSO_SECRET` | FAIL if empty — ERP→portal SSO tickets signed with an empty key are forgeable and SSO login will not validate |
| `env.SENTRY_DSN` | INFO if empty — backend errors are not reported anywhere |

**Secrets are never printed** — only presence and length.

## Backups

| id | what it proves |
|---|---|
| `backup.recency` | newest `db-*.sql` <26h (WARN) / <48h (FAIL) |
| `backup.scheduled` | `backup.sh` present in crontab |

## Log hygiene

| id | what it proves |
|---|---|
| `logs.size` | no single file >200MB under `/var/log` |

## External (operator-side, `run.sh`)

Probes **follow redirects** and judge the *final* response. Judging only the first
response would call a bare domain healthy when it 307s to a locale root that then
404s — which is exactly what the ERP root does today.

| id | what it proves |
|---|---|
| `external.dns.<domain>` | WARN when a domain has no DNS record at all |
| `external.erp.frontend` | ERP app root settles on a real page |
| `external.erp.api_bridge` | Vercel→origin rewrite works (the real user path) |
| `external.portal.frontend` | portal app 200 |
| `external.portal.api_bridge` | portal bridge works |
| `external.marketing.frontend` | custom marketing domain reachable |
| `external.marketing.vercel` | the marketing app on its known-good Vercel host — lets you tell "app down" apart from "custom domain not configured" |
| `external.login` | the auth surface reaches origin (not a 502/503/504) |

**Why `external.login` probes `GET /api/v1/auth/csrf`, not `POST /auth/login`:**
a malformed login POST returns 500 *and writes an error + traceback into the
backend log*. Probing that way would make the health check itself pollute
production logs on every run. Never let a read-only check write.

These matter because they test the path a real browser takes, including the
Vercel rewrite layer — something no server-local check can prove.

**Caveat — `caddy.acme` is history-dependent.** It greps the container's current
log. A freshly recreated Caddy container has no ACME attempts yet, so the check
reads PASS until Caddy retries. Treat a WARN as informational either way.
