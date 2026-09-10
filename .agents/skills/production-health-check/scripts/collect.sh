#!/usr/bin/env bash
# ============================================================================
# production-health-check — server-side collector (READ-ONLY)
#
# Runs ON the production host. Touches nothing: no writes, no restarts, no
# config changes. Safe to run with live data.
#
# Usage:  bash collect.sh [repo_path]
# Output: human-readable evidence sections + a machine-readable VERDICT block
#         (VERDICT|<id>|<status>|detail) where status is PASS|WARN|FAIL|INFO.
#
# Exit code: 0 always (a health check must not abort on a broken system).
# ============================================================================
set -uo pipefail

REPO="${1:-/home/ubuntu/ILMS-IERP}"
ERP_COMPOSE="docker-compose.yml"
PORTAL_COMPOSE="docker-compose.portal.yml"

# Core containers that MUST be running for the product to work.
CORE_CONTAINERS=(lims_database lims_redis lims_backend lims_caddy portal_backend)
# Expected but non-fatal if absent/stopped.
AUX_CONTAINERS=(ai_service ai_worker lims_cloudflared)

VERDICT_FILE="$(mktemp)"
trap 'rm -f "$VERDICT_FILE"' EXIT

verdict() { printf 'VERDICT|%s|%s|%s\n' "$1" "$2" "$3" >> "$VERDICT_FILE"; }
section()  { printf '\n===== EVIDENCE: %s =====\n' "$1"; }

# ── helpers ─────────────────────────────────────────────────────────────────
is_running() { [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" = "true" ]; }
health_of()  { docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$1" 2>/dev/null; }
restarts_of(){ docker inspect -f '{{.RestartCount}}' "$1" 2>/dev/null; }
oom_of()     { docker inspect -f '{{.State.OOMKilled}}' "$1" 2>/dev/null; }
# Run a command in a container only if it is running (avoids noisy failures).
cexec() {
  local c="$1"; shift
  if is_running "$c"; then docker exec "$c" "$@" 2>&1; else echo "(container $c not running)"; fi
}
# Redact credentials inside any URL-ish string.
redact() { sed -E 's#(//[^:/@]*):[^@]+@#\1:***@#g; s#((PASSWORD|SECRET|KEY|TOKEN|DSN)=)[^ ]+#\1***#g'; }

echo "################ production-health-check ################"
echo "host      : $(hostname) ($(hostname -I 2>/dev/null | awk '{print $1}'))"
echo "collected : $(date -Is)"
echo "repo      : $REPO"
echo "kernel    : $(uname -sr)"

# ════════════════════════════════════════════════════════════════════════════
section "HOST — resources, time, kernel tunables"
# ── disk ──
DISK_LINE=$(df -P / | awk 'NR==2')
DISK_PCT=$(echo "$DISK_LINE" | awk '{gsub(/%/,"",$5); print $5}')
DISK_FREE=$(echo "$DISK_LINE" | awk '{print $4}')
df -h / /var/lib/docker 2>/dev/null | sed 's/^/  /'
echo "  -- inodes --"; df -i / | awk 'NR==2{print "  inodes used: "$5" ("$4" free)"}'
if   [ "${DISK_PCT:-0}" -ge 90 ]; then verdict host.disk FAIL "root filesystem ${DISK_PCT}% full (${DISK_FREE}KB free)"
elif [ "${DISK_PCT:-0}" -ge 80 ]; then verdict host.disk WARN "root filesystem ${DISK_PCT}% full (${DISK_FREE}KB free)"
else verdict host.disk PASS "root filesystem ${DISK_PCT}% used"; fi

# ── memory / swap ──
MEM_TOTAL=$(awk '/MemTotal/{print $2}' /proc/meminfo)
MEM_AVAIL=$(awk '/MemAvailable/{print $2}' /proc/meminfo)
SWAP_TOTAL=$(awk '/SwapTotal/{print $2}' /proc/meminfo)
SWAP_FREE=$(awk '/SwapFree/{print $2}' /proc/meminfo)
MEM_USED_PCT=$(( (MEM_TOTAL - MEM_AVAIL) * 100 / MEM_TOTAL ))
echo "  MemTotal=${MEM_TOTAL}kB MemAvailable=${MEM_AVAIL}kB (${MEM_USED_PCT}% used)"
echo "  SwapTotal=${SWAP_TOTAL}kB SwapFree=${SWAP_FREE}kB"
echo "  load: $(cat /proc/loadavg)"
if   [ "$MEM_USED_PCT" -ge 90 ]; then verdict host.memory FAIL "memory ${MEM_USED_PCT}% used, ${MEM_AVAIL}kB available"
elif [ "$MEM_USED_PCT" -ge 80 ]; then verdict host.memory WARN "memory ${MEM_USED_PCT}% used"
else verdict host.memory PASS "memory ${MEM_USED_PCT}% used"; fi

# ── load vs cpu ──
CPUS=$(nproc)
LOAD1=$(awk '{print int($1)}' /proc/loadavg)
if [ "$CPUS" -gt 0 ] && [ "$LOAD1" -gt $((CPUS * 2)) ]; then
  verdict host.load WARN "load1=${LOAD1} on ${CPUS} vCPU"
else verdict host.load PASS "load1=${LOAD1} on ${CPUS} vCPU"; fi

# ── overcommit (Redis BGSAVE/AOF fork requirement) ──
OVERCOMMIT=$(cat /proc/sys/vm/overcommit_memory 2>/dev/null || echo "?")
OVERCOMMIT_PERSISTED=$(grep -rhs 'vm.overcommit_memory' /etc/sysctl.conf /etc/sysctl.d/ 2>/dev/null | tr -d ' ')
echo "  vm.overcommit_memory=$OVERCOMMIT persisted='${OVERCOMMIT_PERSISTED:-none}'"
if [ "$OVERCOMMIT" = "1" ]; then
  [ -n "$OVERCOMMIT_PERSISTED" ] && verdict host.overcommit PASS "vm.overcommit_memory=1 (persisted)" \
                                || verdict host.overcommit WARN "vm.overcommit_memory=1 but NOT persisted — lost on reboot"
else
  verdict host.overcommit FAIL "vm.overcommit_memory=$OVERCOMMIT (need 1) — Redis background saves can fail"
fi

# ── time sync (JWT expiry depends on accurate clocks) ──
echo "  date: $(date -Is)  tz=$(timedatectl show -p Timezone --value 2>/dev/null || echo '?')"
NTP=$(timedatectl show -p NTPSynchronized --value 2>/dev/null || echo "?")
echo "  NTPSynchronized=$NTP"
if [ "$NTP" = "yes" ]; then verdict host.ntp PASS "clock synchronised"
elif [ "$NTP" = "no" ]; then verdict host.ntp WARN "clock NOT synchronised — token expiry/scheduling can drift"
else verdict host.ntp INFO "cannot determine NTP sync state"; fi

# ── uptime / reboot pending ──
echo "  uptime: $(uptime -p 2>/dev/null || uptime)"
if [ -f /var/run/reboot-required ]; then verdict host.reboot WARN "reboot required (see /var/run/reboot-required)"
else verdict host.reboot PASS "no reboot pending"; fi

# ════════════════════════════════════════════════════════════════════════════
section "DOCKER — daemon and disk usage"
if docker info >/dev/null 2>&1; then
  verdict docker.daemon PASS "docker daemon reachable"
  docker info 2>/dev/null | grep -E 'Server Version|Storage Driver|Live Restore' | sed 's/^/  /'
  echo "  -- docker system df --"; docker system df 2>/dev/null | sed 's/^/  /'
else
  verdict docker.daemon FAIL "docker daemon NOT reachable"
fi

# ════════════════════════════════════════════════════════════════════════════
section "CONTAINERS — status, health, restarts, OOM"
printf '  %-22s %-14s %-10s %-8s %-6s\n' NAME STATE HEALTH RESTARTS OOM
for c in "${CORE_CONTAINERS[@]}" "${AUX_CONTAINERS[@]}"; do
  if docker inspect "$c" >/dev/null 2>&1; then
    st=$(docker inspect -f '{{.State.Status}}' "$c")
    printf '  %-22s %-14s %-10s %-8s %-6s\n' "$c" "$st" "$(health_of "$c")" "$(restarts_of "$c")" "$(oom_of "$c")"
  else
    printf '  %-22s %-14s\n' "$c" "MISSING"
  fi
done
echo "  -- all containers on host --"; docker ps -a --format '  {{.Names}}\t{{.Status}}' 2>/dev/null

for c in "${CORE_CONTAINERS[@]}"; do
  if ! docker inspect "$c" >/dev/null 2>&1; then
    verdict "container.$c" FAIL "$c does not exist"
    continue
  fi
  st=$(docker inspect -f '{{.State.Status}}' "$c")
  r=$(restarts_of "$c"); h=$(health_of "$c"); o=$(oom_of "$c")
  if [ "$st" != "running" ]; then
    verdict "container.$c" FAIL "$c is '$st' (restarts=$r)"
  elif [ "$o" = "true" ]; then
    verdict "container.$c" FAIL "$c OOM-killed — memory limit too low"
  elif [ "$h" = "unhealthy" ]; then
    verdict "container.$c" FAIL "$c running but UNHEALTHY"
  elif [ "${r:-0}" -gt 25 ]; then
    verdict "container.$c" WARN "$c running but restarted ${r}x (crash-loop history)"
  else
    verdict "container.$c" PASS "$c running (health=$h, restarts=$r)"
  fi
done
for c in "${AUX_CONTAINERS[@]}"; do
  docker inspect "$c" >/dev/null 2>&1 || { verdict "container.$c" INFO "$c not present (optional)"; continue; }
  st=$(docker inspect -f '{{.State.Status}}' "$c"); h=$(health_of "$c")
  [ "$st" = "running" ] && verdict "container.$c" PASS "$c running (health=$h)" \
                        || verdict "container.$c" WARN "$c is '$st' (optional service)"
done

# ── docker log sizes (a chatty container can fill the disk) ──
echo "  -- container log sizes --"
for f in /var/lib/docker/containers/*/*-json.log; do
  [ -f "$f" ] || continue
  sz=$(du -m "$f" 2>/dev/null | awk '{print $1}')
  [ "${sz:-0}" -ge 100 ] && echo "  ${sz}MB  $(basename "$(dirname "$f")" | cut -c1-12)"
done
BIGLOG=$(for f in /var/lib/docker/containers/*/*-json.log; do [ -f "$f" ] && du -m "$f" 2>/dev/null; done | awk '$1>=500{print $1"MB "$2}' | head -1)
[ -n "$BIGLOG" ] && verdict docker.logsize WARN "container log >=500MB: $BIGLOG"

# ════════════════════════════════════════════════════════════════════════════
section "DATABASE — connectivity, size, connections, locks"
DB_USER="${POSTGRES_USER:-lims}"; DB_NAME="${POSTGRES_DB:-lims}"
if is_running lims_database; then
  P() { docker exec lims_database psql -U "$DB_USER" -d "$DB_NAME" -tAc "$1" 2>&1; }
  verdict database.up PASS "lims_database running ($(health_of lims_database))"
  echo "  version     : $(P 'SELECT version();' | head -1 | cut -c1-60)"
  echo "  db size     : $(P "SELECT pg_size_pretty(pg_database_size('$DB_NAME'));")"
  echo "  connections : $(P 'SELECT count(*) FROM pg_stat_activity;')"
  echo "  max_conns   : $(P 'SHOW max_connections;')"
  echo "  active      : $(P "SELECT count(*) FROM pg_stat_activity WHERE state='active' AND pid<>pg_backend_pid();")"
  echo "  longest txn : $(P 'SELECT COALESCE(max(EXTRACT(EPOCH FROM (now()-xact_start)))::int,0) FROM pg_stat_activity WHERE xact_start IS NOT NULL;')s"
  echo "  blocked     : $(P 'SELECT count(*) FROM pg_locks WHERE NOT granted;')"
  echo "  tables      : $(P "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")"
  echo "  biggest     :"; P "SELECT '    '||relname||' '||pg_size_pretty(pg_total_relation_size(relid)) FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 5;"
  CONNS=$(P 'SELECT count(*) FROM pg_stat_activity;'); MAXC=$(P 'SHOW max_connections;')
  if [ "${CONNS:-0}" -gt $(( ${MAXC:-100} * 80 / 100 )) ]; then
    verdict database.connections WARN "connections ${CONNS}/${MAXC} (>=80%)"
  else verdict database.connections PASS "connections ${CONNS}/${MAXC}"; fi
  LOCKED=$(P 'SELECT count(*) FROM pg_locks WHERE NOT granted;')
  [ "${LOCKED:-0}" -gt 0 ] && verdict database.locks WARN "${LOCKED} ungranted locks" \
                           || verdict database.locks PASS "no blocking locks"
  # stale/idle-in-transaction sessions leak the daily-closure lock semantics
  IDLE=$(P "SELECT count(*) FROM pg_stat_activity WHERE state='idle in transaction';")
  [ "${IDLE:-0}" -gt 5 ] && verdict database.idle_txn WARN "${IDLE} sessions idle in transaction"
else
  verdict database.up FAIL "lims_database not running"
fi

# ════════════════════════════════════════════════════════════════════════════
section "MIGRATIONS — alembic head vs DB stamp (classic crash-loop cause)"
if is_running lims_database; then
  DB_REV=$(docker exec lims_database psql -U "$DB_USER" -d "$DB_NAME" -tAc \
           'SELECT version_num FROM alembic_version;' 2>/dev/null | tr -d '[:space:]')
  echo "  DB stamped at : ${DB_REV:-<none>}"
  if is_running lims_backend; then
    CODE_HEAD=$(docker exec lims_backend alembic heads 2>/dev/null | head -1 | awk '{print $1}')
  else
    IMG=$(docker inspect -f '{{.Config.Image}}' lims_backend 2>/dev/null)
    CODE_HEAD=$(docker run --rm --entrypoint sh "$IMG" -c 'cd /app && alembic heads' 2>/dev/null | head -1 | awk '{print $1}')
  fi
  echo "  code head     : ${CODE_HEAD:-<unknown>}"
  echo "  -- last 5 migrations in image --"
  ( is_running lims_backend && docker exec lims_backend sh -c 'ls -1 /app/alembic/versions/*.py | tail -5' ) 2>/dev/null | sed 's/^/  /'
  if [ -z "$DB_REV" ] || [ -z "$CODE_HEAD" ]; then
    verdict migrations.sync INFO "could not determine both revisions (db=${DB_REV:-?} head=${CODE_HEAD:-?})"
  elif [ "$DB_REV" = "$CODE_HEAD" ]; then
    verdict migrations.sync PASS "DB stamped at code head ($DB_REV)"
  elif docker exec lims_backend sh -c "ls /app/alembic/versions/ 2>/dev/null" | grep -q "$DB_REV"; then
    verdict migrations.sync WARN "DB at $DB_REV, code head $CODE_HEAD — pending migration (backend should upgrade on boot)"
  else
    verdict migrations.sync FAIL "DB stamped $DB_REV but NO migration file in image — 'alembic upgrade head' will crash-loop the backend"
  fi
fi
# Was the migration even reached at startup?
if docker inspect lims_backend >/dev/null 2>&1; then
  echo "  -- backend entrypoint migration log --"
  docker logs lims_backend 2>&1 | grep -iE 'alembic|migration|Can.t locate|FAILED' | tail -8 | sed 's/^/  /'
fi

# ════════════════════════════════════════════════════════════════════════════
section "REDIS — auth, memory cap, persistence, streams"
if is_running lims_redis; then
  R() { docker exec lims_redis sh -c "redis-cli --no-auth-warning -a \"\$REDIS_PASSWORD\" $1" 2>/dev/null; }
  verdict redis.up PASS "lims_redis running ($(health_of lims_redis))"
  # auth must actually be enforced
  NOAUTH=$(docker exec lims_redis redis-cli ping 2>&1)
  if echo "$NOAUTH" | grep -qi 'NOAUTH'; then verdict redis.auth PASS "password auth enforced"
  elif echo "$NOAUTH" | grep -qi 'PONG'; then verdict redis.auth FAIL "NO password set — Redis is open (container network only, but still)"
  else verdict redis.auth INFO "auth state unclear: $NOAUTH"; fi
  echo "  $NOAUTH" | sed 's/^/  noauth-ping: /'
  MEM=$(R 'info memory'); KEYS=$(R dbsize)
  echo "  used_memory   : $(echo "$MEM" | grep -m1 used_memory_human | cut -d: -f2 | tr -d '\r')"
  echo "  maxmemory     : $(echo "$MEM" | grep -m1 maxmemory_human | cut -d: -f2 | tr -d '\r')"
  echo "  policy        : $(echo "$MEM" | grep -m1 maxmemory_policy | cut -d: -f2 | tr -d '\r')"
  echo "  keys          : $KEYS"
  echo "  evicted_keys  : $(R 'info stats' | grep -m1 evicted_keys | cut -d: -f2 | tr -d '\r')"
  echo "  appendonly    : $(R 'config get appendonly' | tail -1)"
  echo "  aof_last_write: $(R 'info persistence' | grep -m1 aof_last_write_status | cut -d: -f2 | tr -d '\r')"
  echo "  rdb_last_save : $(R 'info persistence' | grep -m1 rdb_last_bgsave_status | cut -d: -f2 | tr -d '\r')"
  # maxmemory must be >0 and below the container limit (else OOM-kill risk)
  MAXM=$(R 'config get maxmemory' | tail -1); CLIM=$(docker inspect -f '{{.HostConfig.Memory}}' lims_redis)
  if [ "${MAXM:-0}" = "0" ]; then
    verdict redis.maxmemory FAIL "maxmemory=0 in a memory-limited container — Redis can grow until the kernel OOM-kills it"
  elif [ -n "$CLIM" ] && [ "$CLIM" -gt 0 ] && [ "$MAXM" -ge "$CLIM" ]; then
    verdict redis.maxmemory FAIL "maxmemory (${MAXM}B) >= container limit (${CLIM}B) — no headroom for fork/buffers"
  else
    verdict redis.maxmemory PASS "maxmemory=${MAXM}B under container limit=${CLIM}B"
  fi
  POLICY=$(R 'config get maxmemory-policy' | tail -1)
  case "$POLICY" in
    noeviction) verdict redis.policy WARN "policy=noeviction — writes fail once full (fine only if nothing is disposable)";;
    allkeys-lru|allkeys-random|allkeys-lfu)
      verdict redis.policy FAIL "policy=$POLICY can silently evict the no-TTL ai:* job streams — use volatile-lru";;
    *) verdict redis.policy PASS "policy=$POLICY (TTL'd keys only — job streams protected)";;
  esac
  echo "  -- streams / queues --"
  for s in ai:student ai:ingestion ai:dlq; do
    T=$(R "type $s"); L=$(R "xlen $s")
    echo "  $s: type=${T:-none} len=${L:-0}"
  done
  for s in ai:student ai:ingestion; do
    # Coerce to digits: a missing stream/group makes redis-cli print
    # "NOGROUP ..." which would blow up a numeric comparison.
    L=$(R "xlen $s" 2>/dev/null | tr -dc '0-9'); L=${L:-0}
    PEND=$(R "xpending $s ai-workers" 2>/dev/null | head -1 | tr -dc '0-9'); PEND=${PEND:-0}
    if [ "$L" -gt 1000 ]; then
      verdict "redis.queue.$s" WARN "$s holds $L entries — worker not draining?"
    fi
    if [ "$PEND" -gt 100 ]; then
      verdict "redis.queue.$s.pel" WARN "$s has $PEND unacked entries — possible stuck consumer"
    fi
  done
  DLQ=$(R 'xlen ai:dlq' 2>/dev/null | tr -dc '0-9'); DLQ=${DLQ:-0}
  [ "$DLQ" -gt 0 ] && verdict redis.dlq WARN "ai:dlq holds ${DLQ} dead-lettered jobs"
  echo "  connected_clients: $(R 'info clients' | grep -m1 connected_clients | cut -d: -f2 | tr -d '\r')"
  if [ "${KEYS:-0}" = "0" ]; then
    verdict redis.keyspace INFO "keyspace empty — either no traffic yet, or the cache is not being exercised"
  fi
else
  verdict redis.up FAIL "lims_redis not running"
fi

# ════════════════════════════════════════════════════════════════════════════
section "ERP BACKEND — health, startup, errors"
if is_running lims_backend; then
  # The backend port is NOT published to the host (only Caddy's :80 is), so a
  # host-side `curl localhost:8000` always fails. Probe inside the container.
  code=$(docker exec lims_backend curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://localhost:8000/api/v1/health 2>/dev/null)
  body=$(docker exec lims_backend curl -s --max-time 10 http://localhost:8000/api/v1/health 2>/dev/null)
  echo "  in-container :8000/api/v1/health -> $code  $body"
  echo "  (port 8000 is not host-published; through Caddy is checked separately)"
  if [ "$code" = "200" ]; then
    verdict erp.health PASS "backend health 200 ($body)"
  else
    verdict erp.health FAIL "backend health returned ${code:-no-response} (in-container probe)"
  fi
  echo "  -- startup lines --"
  docker logs lims_backend 2>&1 | grep -iE 'startup complete|Uvicorn running|Application startup|database unavailable|skipping daily' | tail -5 | sed 's/^/  /'
  # daily jobs must have run (they gate reminders / section checks)
  DJ=$(docker logs lims_backend 2>&1 | grep -icE 'already ran|daily' || true)
  echo "  daily-job log lines: $DJ"
  DJFAIL=$(docker logs lims_backend 2>&1 | grep -icE 'Database unavailable during startup' || true)
  [ "${DJFAIL:-0}" -gt 0 ] && verdict erp.startup_jobs FAIL "backend started with DB unavailable — daily jobs skipped" \
                           || verdict erp.startup_jobs PASS "startup daily jobs ran"
  # error/traceback scan
  ERRS=$(docker logs lims_backend 2>&1 | grep -cE 'Traceback|ERROR|CRITICAL' || true)
  echo "  error-ish log lines (all time): $ERRS"
  docker logs lims_backend --since 24h 2>&1 | grep -E 'Traceback|ERROR|CRITICAL' | tail -15 | sed 's/^/  | /'
  if [ "${ERRS:-0}" -gt 50 ]; then verdict erp.logs WARN "$ERRS error lines in backend log (inspect)"
  else verdict erp.logs PASS "backend error lines: $ERRS"; fi
  # 5xx response scan
  F5=$(docker logs lims_backend --since 24h 2>&1 | grep -cE '" 5[0-9][0-9] ' || true)
  echo "  5xx responses (24h): $F5"
  [ "${F5:-0}" -gt 20 ] && verdict erp.http5xx WARN "$F5 5xx responses in 24h"
  docker logs lims_backend --since 24h 2>&1 | grep -E '" 5[0-9][0-9] ' | tail -10 | sed 's/^/  | /'
else
  verdict erp.health FAIL "lims_backend not running — inspect: docker logs lims_backend --tail 80"
  echo "  -- last 40 log lines --"
  docker logs lims_backend --tail 40 2>&1 | sed 's/^/  | /'
fi

# ════════════════════════════════════════════════════════════════════════════
section "PORTAL BACKEND — health, redis linkage, errors"
if is_running portal_backend; then
  bod=$(cexec portal_backend curl -s --max-time 10 http://localhost:8001/api/health)
  echo "  portal /api/health -> $bod"
  echo "$bod" | grep -q '"redis":"connected"' && verdict portal.redis PASS "portal reports redis connected" \
                                                || verdict portal.redis FAIL "portal redis not connected: $bod"
  echo "$bod" | grep -q '"status":"ok"' && verdict portal.health PASS "portal health ok" \
                                        || verdict portal.health WARN "portal health not ok: $bod"
  echo "  cache: $(cexec portal_backend curl -s --max-time 10 http://localhost:8001/api/health/cache)"
  echo "  -- recent errors --"
  docker logs portal_backend --since 24h 2>&1 | grep -E 'Traceback|ERROR|CRITICAL' | tail -10 | sed 's/^/  | /'
else
  verdict portal.health FAIL "portal_backend not running"
fi

# ════════════════════════════════════════════════════════════════════════════
section "GATEWAY (Caddy) — listening, routing, ACME noise"
if is_running lims_caddy; then
  verdict caddy.up PASS "lims_caddy running"
  if ss -tln 2>/dev/null | grep -qE ':80\b'; then verdict caddy.port80 PASS "port 80 listening"
  else verdict caddy.port80 FAIL "nothing listening on port 80 — Vercel will 502"; fi
  for p in "api/v1/health" "api/health"; do
    c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://localhost/$p" 2>/dev/null)
    echo "  localhost/$p -> $c"
    [ "$c" = "200" ] && verdict "caddy.route.$p" PASS "$p -> 200" || verdict "caddy.route.$p" FAIL "$p -> $c"
  done
  # ACME failures for hostnames that do not resolve are cosmetic noise, not outages.
  if docker logs lims_caddy 2>&1 | grep -q 'NXDOMAIN'; then
    HOSTS=$(docker logs lims_caddy 2>&1 | grep -oE 'NXDOMAIN looking up A for [^ ]+' | awk '{print $NF}' | sort -u | tr '\n' ' ')
    verdict caddy.acme WARN "ACME failing for non-resolving hostnames: $HOSTS (cosmetic while Vercel→IP is the path)"
  else
    verdict caddy.acme PASS "no ACME DNS failures"
  fi
  docker logs lims_caddy --since 24h 2>&1 | grep -iE 'error' | grep -v NXDOMAIN | tail -8 | sed 's/^/  | /'
else
  verdict caddy.up FAIL "lims_caddy not running — port 80 down, Vercel will return 502"
fi

# ════════════════════════════════════════════════════════════════════════════
section "CODE STATE — git, env presence, image freshness"
if [ -d "$REPO/.git" ]; then
  cd "$REPO" || true
  echo "  branch : $(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
  echo "  commit : $(git rev-parse --short HEAD 2>/dev/null)  $(git log -1 --pretty=%s 2>/dev/null)"
  DIRTY=$(git status --porcelain 2>/dev/null | grep -v '^??' | wc -l)
  echo "  modified tracked files: $DIRTY"; git status --short 2>/dev/null | head -10 | sed 's/^/  /'
  [ "${DIRTY:-0}" -gt 0 ] && verdict code.dirty WARN "$DIRTY uncommitted tracked change(s) on the server" \
                          || verdict code.dirty PASS "server working tree clean (tracked files)"
  git fetch --dry-run >/dev/null 2>&1
  echo "  behind origin/main: $(git rev-list --count HEAD..origin/main 2>/dev/null || echo '?')"
  # image age vs commit date
  # Normalise both dates to UTC — the image timestamp is UTC while git would
  # otherwise print the operator's local date, producing phantom mismatches.
  IMGDATE=$(docker inspect -f '{{.Created}}' ilms-ierp-backend 2>/dev/null | cut -dT -f1)
  # format-local honours $TZ, so this is the commit date in UTC — matching the
  # image timestamp's timezone and avoiding a phantom off-by-one-day mismatch.
  COMDATE=$(TZ=UTC git log -1 --pretty=%cd --date=format-local:%Y-%m-%d 2>/dev/null)
  echo "  backend image built: ${IMGDATE:-?}   HEAD committed: ${COMDATE:-?}"
  [ -n "$IMGDATE" ] && [ "$IMGDATE" != "$COMDATE" ] && \
    verdict code.image_stale INFO "backend image ($IMGDATE) predates HEAD commit ($COMDATE) — rebuild if code changed"
fi
# env presence only — NEVER print secret values
echo "  -- .env keys present (values redacted) --"
if [ -f "$REPO/.env" ]; then
  for k in POSTGRES_PASSWORD JWT_SECRET_KEY ERP_SERVICE_KEY PORTAL_JWT_SECRET PORTAL_SSO_SECRET REDIS_PASSWORD REDIS_URL SENTRY_DSN CORS_ORIGINS; do
    v=$(grep -E "^$k=" "$REPO/.env" 2>/dev/null | head -1 | cut -d= -f2-)
    if [ -z "$v" ]; then printf '  %-20s MISSING/EMPTY\n' "$k"
    else printf '  %-20s set (len %s)\n' "$k" "${#v}"; fi
  done
  # Placeholder detection
  for k in JWT_SECRET_KEY POSTGRES_PASSWORD PORTAL_JWT_SECRET ERP_SERVICE_KEY REDIS_PASSWORD; do
    v=$(grep -E "^$k=" "$REPO/.env" 2>/dev/null | head -1 | cut -d= -f2-)
    case "$v" in
      change_me*|*change_me*|local_dev_only*|lims_secure_pass)
        verdict "env.$k" FAIL "$k still holds a placeholder/default value";;
    esac
  done
  # Secrets that are REQUIRED for a feature to be correct. An empty signing
  # secret is worse than a missing feature: tickets can be forged.
  for k in PORTAL_SSO_SECRET; do
    v=$(grep -E "^$k=" "$REPO/.env" 2>/dev/null | head -1 | cut -d= -f2-)
    if [ -z "$v" ]; then
      verdict "env.$k" FAIL "$k is empty — ERP→portal SSO tickets are signed with an empty key (forgeable) and SSO login will not validate"
    else
      verdict "env.$k" PASS "$k set (len ${#v})"
    fi
  done
  # Optional observability — informational only.
  for k in SENTRY_DSN; do
    v=$(grep -E "^$k=" "$REPO/.env" 2>/dev/null | head -1 | cut -d= -f2-)
    [ -z "$v" ] && verdict "env.$k" INFO "$k empty — backend errors are not reported anywhere"
  done
  verdict env.file PASS ".env present with required keys"
else
  verdict env.file FAIL "no .env at $REPO"
fi

# ════════════════════════════════════════════════════════════════════════════
section "BACKUPS — recency and restore readiness"
BD="${BACKUP_DIR:-/var/backups/lms}"
echo "  backup dir: $BD"
if [ -d "$BD" ]; then
  ls -lht "$BD" 2>/dev/null | head -8 | sed 's/^/  /'
  NEWEST=$(find "$BD" -name 'db-*.sql' -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1)
  if [ -n "$NEWEST" ]; then
    AGE_H=$(( ( $(date +%s) - ${NEWEST%%.*} ) / 3600 ))
    echo "  newest db dump age: ${AGE_H}h"
    if   [ "$AGE_H" -gt 48 ]; then verdict backup.recency FAIL "newest DB dump is ${AGE_H}h old — backups are not running"
    elif [ "$AGE_H" -gt 26 ]; then verdict backup.recency WARN "newest DB dump is ${AGE_H}h old (expected daily)"
    else verdict backup.recency PASS "newest DB dump ${AGE_H}h old"; fi
  else
    verdict backup.recency FAIL "no db-*.sql dump found in $BD"
  fi
  # is backup scheduled?
  if crontab -l 2>/dev/null | grep -q backup.sh; then verdict backup.scheduled PASS "backup.sh in crontab"
  else verdict backup.scheduled WARN "backup.sh not found in this user's crontab"; fi
else
  verdict backup.recency FAIL "backup dir $BD missing"
fi

# ════════════════════════════════════════════════════════════════════════════
section "LOG HYGIENE — disk-consuming logs"
ls -lh /var/log/lms 2>/dev/null | head -10 | sed 's/^/  /'
if [ -d infrastructure/logrotate ]; then
  echo "  logrotate config present: $(ls infrastructure/logrotate 2>/dev/null | tr '\n' ' ')"
fi
BIGVARLOG=$(find /var/log -type f -size +200M 2>/dev/null | head -5)
[ -n "$BIGVARLOG" ] && { echo "  large /var/log files:"; echo "$BIGVARLOG" | sed 's/^/  /'; \
  verdict logs.size WARN "log files >200MB in /var/log"; } || verdict logs.size PASS "no oversized log files"

# ════════════════════════════════════════════════════════════════════════════
echo ""
echo "################ VERDICTS (machine-readable) ################"
# Print the verdicts again in a clean block for parsing.
cat "$VERDICT_FILE"
echo ""
echo "################ SUMMARY ################"
for s in PASS WARN FAIL INFO; do
  # grep -c prints 0 AND exits 1 on no match; `|| true` keeps it to one line.
  n=$(grep -c "|$s|" "$VERDICT_FILE" 2>/dev/null || true)
  printf '%-5s %s\n' "$s:" "${n:-0}"
done
echo "COLLECTION COMPLETE"
