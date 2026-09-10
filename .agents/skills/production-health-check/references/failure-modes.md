# Known production failure modes

Ordered by how likely each one is to be the cause of a "the app is down" report.
Each entry: **symptom → how to confirm → fix**. These are drawn from real
incidents on this specific stack; match the literal error strings where given.

---

## 1. Backend crash-loops on `alembic upgrade head` (cause of a real Vercel 502)

**Symptom**
- `docker ps` shows `lims_backend  Restarting (255)` — note the `(255)`, not `(1)`.
- Vercel surfaces `502 BAD_GATEWAY` / `Code: ROUTER_EXTERNAL_TARGET_CONNECTION_ERROR`.
- Backend log repeats:

```
==> Applying database migrations (alembic upgrade head)
ERROR [alembic.util.messaging] Can't locate revision identified by '202608310001'
FAILED: Can't locate revision identified by '202608310001'
```

**Why it happens**
The container entrypoint runs `alembic upgrade head` before starting uvicorn.
If the database's `alembic_version` points at a revision whose migration file is
**not in the image**, alembic aborts and the app never boots. This occurs when a
feature (and its migration file) is reverted out of `main` but the database had
already been migrated to it — leaving the DB *ahead* of the code.

**Confirm**
```bash
docker exec lims_database psql -U lims -d lims -tAc 'SELECT version_num FROM alembic_version;'
docker exec lims_backend alembic heads          # or inspect /app/alembic/versions/
```
If the DB revision has no matching file in the image → confirmed.

**Fix** (choose deliberately — this is a data decision)
- If the feature was **intentionally reverted** and the tables are orphaned:
  back up the orphaned data, drop the table, then
  `UPDATE alembic_version SET version_num = '<code head>';`
- If the feature should stay: restore the migration file and rebuild the image.
Never hand-edit `alembic_version` without first confirming which side is correct.

**Note:** the DB is stamped `202608170001` and the image head must match after any
LessonForge-era revert. Re-check both after every revert-style commit.

---

## 2. Caddy never started → port 80 closed → Vercel 502

**Symptom**
- `502: BAD_GATEWAY`, `ROUTER_EXTERNAL_TARGET_CONNECTION_ERROR` from Vercel.
- SSH works (port 22 open) but ports 80/443 refuse connections.

**Why it happens**
`lims_caddy` is the only thing publishing port 80, and it declares
`depends_on: backend: condition: service_healthy`. If the backend never becomes
healthy (see #1), Caddy is created but stays in state `Created` and never binds
the port. `docker ps -a` then shows:

```
lims_caddy   Created        # not "Up"
```

**Confirm**
```bash
docker ps -a --filter name=lims_caddy      # look for "Created" or "Exited"
ss -tln | grep ':80'                        # expect a listener
```
**Distinguishing rule:** port 22 open + port 80 closed = host alive, web stack
down (not a network/security-group problem). If 22 were also closed, look at the
EC2 security group / instance state instead.

**Fix:** repair the root cause (#1), then `docker compose up -d` so Caddy starts.

---

## 3. Redis `vm.overcommit_memory=0`

**Symptom** — in `docker logs lims_redis`:
```
# WARNING Memory overcommit must be enabled! Without it, a background save or
# replication may fail under low memory condition.
```

**Why it matters** — Redis forks for `BGSAVE`/AOF rewrite. With the value `0` the
kernel heuristic can refuse the fork's allocation and the background save fails,
risking data loss on restart. Often *latent*: with a tiny dataset it never fires,
so `rdb_last_bgsave_status: ok` lulls you — it bites as the DB grows.

**Confirm / fix**
```bash
cat /proc/sys/vm/overcommit_memory                 # want 1
grep -rh overcommit /etc/sysctl.d/ /etc/sysctl.conf
echo 'vm.overcommit_memory = 1' | sudo tee /etc/sysctl.d/99-redis-overcommit.conf
sudo sysctl -p /etc/sysctl.d/99-redis-overcommit.conf
```
`scripts/setup.sh` does this idempotently in `prepare_host()`.

---

## 4. Redis `maxmemory=0` inside a memory-limited container

**Symptom** — `redis-cli config get maxmemory` → `0` while
`docker inspect lims_redis --format '{{.HostConfig.Memory}}'` → `268435456`.
With `maxmemory-policy: noeviction` this is the dangerous pair: Redis never
self-limits, so it grows until the kernel **OOM-kills** the container. The kernel
makes the decision, mid-write, with no graceful degradation.

**Fix** — cap it below the container limit, leaving headroom for client output
buffers, the AOF rewrite buffer and fork COW pages. Default in this repo:
`REDIS_MAXMEMORY=192mb` (container 256M), policy `volatile-lru`.

**Policy rule (important):** use `volatile-lru`, never `allkeys-*`.
`volatile-lru` evicts only keys **with a TTL** (the portal read-through cache,
set with `ex=60`) and can never touch the `ai:*` stream entries, which have no
TTL. `allkeys-lru` would silently discard queued jobs. Verified empirically:
under a 6MB cap with 100 TTL'd keys, 58 were evicted and the no-TTL stream
survived intact.

---

## 5. Empty Redis keyspace — usually NOT a fault

**Symptom** — `dbsize` → `0`, portal `/api/health/cache` → `{"hits":0,"misses":0}`.

**Interpretation** — this is *no traffic*, not a cold cache. Check whether the
consumers are even exercised: if the portal frontend is unused and
`/internal/portal/ai/ingest` is still a `501` stub, nothing will ever populate
Redis. Confirm the wiring works (rather than assuming):

```bash
docker exec lims_backend python -c "
from app.core.config import settings
from app.core.queue import get_queue
print(settings.REDIS_URL); print(type(get_queue()).__name__)"   # want RedisStreamsQueue, not NoopQueue
```
Report it as INFO, not FAIL.

---

## 6. Caddy ACME errors for non-resolving hostnames — cosmetic

**Symptom** — repetitive Caddy log noise:
```
challenge failed  identifier "erp.aldirasat.edu"
DNS problem: NXDOMAIN looking up A for erp.aldirasat.edu
```
**Interpretation** — the `erp.aldirasat.edu` / `portal.aldirasat.edu` blocks in
the Caddyfile have no DNS records pointing at this host. Harmless while the real
path is Vercel → `http://<ip>:80` (plain HTTP, path-based routing). Do **not**
report this as an outage; classify as WARN/informational. It only becomes real if
those hostnames are supposed to resolve publicly.

---

## 7. `litellm` shows `unhealthy` — known red herring

`litellm` runs `main-stable` and its own healthcheck has been failing
independently of the ERP. It is not on the Vercel→Caddy request path. Report it,
but never as the cause of an ERP outage. (Related: a container whose image lacks
`curl` will always read `unhealthy` because its healthcheck cannot run.)

---

## 8. Two Redis containers sharing one AOF volume

**Symptom / risk** — `portal_redis` (old, portal compose) and `lims_redis` (new,
ERP compose) both resolve the volume `redis_data` to the **same** project-prefixed
volume (`<project>_redis_data`) because both compose files share the project name.
Running both at once = two Redis processes on one AOF file → corruption risk.

**Rule** — never start the new Redis before stopping the old one. The correct
cutover order is: stop the old container **first**, then start the new one on the
preserved volume. Verify only one process holds 6379:
```bash
docker ps -a --format '{{.Names}}' | grep -i redis       # expect lims_redis only
```

---

## 9. `RedisStreamsQueue.enqueue` has no `MAXLEN`

**Symptom / risk** — `ai:student` / `ai:ingestion` grow unbounded. Now that
`volatile-lru` deliberately protects those (no-TTL) streams, a stuck or
unimplemented worker means the stream grows until `maxmemory`, then writes fail.

**Detect** — `xlens` climbing while `xpending <stream> ai-workers` also climbs
(worker not consuming / stuck PEL). Diagnose the consumer, not Redis. Add
`maxlen`/`approx` trimming when the worker is implemented.

---

## 10. Windows operator quirks (these WILL bite you mid-incident)

- **PowerShell has no `<` input redirection** — `ssh host cmd < file` fails with
  "The '<' operator is reserved for future use."
- **PowerShell mangles nested quotes** — inline SQL and `--format '{{...}}'`
  literals get shredded through the layers (you will see `Select-Object: command
  not found` executed *on the server*).
- **Established workaround:** write the script/SQL to a **local temp file**, `scp`
  it up, then run it (`bash /tmp/x.sh`, or
  `docker exec -i lims_database psql -U lims -d lims -f /dev/stdin < /tmp/x.sql`).
  Use a bash heredoc via a file for anything multi-line or quote-heavy.
- **WSL path form** — `bash "C:\..."` fails; use `/mnt/c/...`.
- **SSH key perms** — Linux `ssh` rejects a world-readable key; on WSL DrvFs
  mounts `chmod` is a no-op. Copy the key to a private temp file (`chmod 600`)
  before using it. `run.sh` already does this.

---

## 11. Docker volume names are project-prefixed

`docker volume ls` shows `ilms-ierp_pgdata`, `ilms-ierp_redis_data`, **not**
`pgdata` / `redis_data`. Any script that mounts `redis_data` without the prefix
silently creates a **fresh empty** volume — a backup script written this way
archives nothing while appearing to succeed. Always resolve the real name:
`docker volume ls -q -f name=redis_data | head -1`.
