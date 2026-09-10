#!/usr/bin/env bash
# ============================================================================
# production-health-check — operator-side runner
#
# Runs on YOUR machine. Uploads the read-only collector to the production
# host, runs it, then performs the EXTERNAL checks the server cannot do for
# itself (public domain + Vercel→server API bridge).
#
# This script only READS. It never restarts, deploys, or modifies anything.
#
# Usage:
#   bash run.sh [-H host] [-k key] [-r repo] [-o outfile] [--skip-external]
#
# Defaults match this project's production host.
# ============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

HOST="${HOST:-13.50.176.4}"
SSH_USER="${SSH_USER:-ubuntu}"
KEY="${KEY:-$REPO_ROOT/lms-key.pem}"
REMOTE_REPO="${REMOTE_REPO:-/home/ubuntu/ILMS-IERP}"
OUT="${OUT:-$REPO_ROOT/production-health-latest.txt}"
SKIP_EXTERNAL=0

ERP_URL="${ERP_URL:-https://aldirasat-erp.vercel.app}"
PORTAL_URL="${PORTAL_URL:-https://aldirasat-portal.vercel.app}"
MARKETING_URL="${MARKETING_URL:-https://aldirasat.com}"
# The marketing app's known-good host, so a dead custom domain can be told
# apart from a dead application.
MARKETING_VERCEL_URL="${MARKETING_VERCEL_URL:-https://aldirasat.vercel.app}"

usage() { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

while [ $# -gt 0 ]; do
  case "$1" in
    -H|--host) HOST="$2"; shift 2 ;;
    -k|--key) KEY="$2"; shift 2 ;;
    -r|--repo) REMOTE_REPO="$2"; shift 2 ;;
    -o|--out) OUT="$2"; shift 2 ;;
    -u|--user) SSH_USER="$2"; shift 2 ;;
    --skip-external) SKIP_EXTERNAL=1; shift ;;
    -h|--help) usage ;;
    *) echo "unknown option: $1" >&2; usage ;;
  esac
done

# ── ssh needs a key that is not group/world readable. On Windows mounts
#    (WSL DrvFs) chmod is a no-op, so copy it somewhere private first.
KEY_USE="$KEY"
if [ -f "$KEY" ]; then
  TMPKEY="$(mktemp)"; cp "$KEY" "$TMPKEY"; chmod 600 "$TMPKEY" 2>/dev/null || true
  KEY_USE="$TMPKEY"
  trap 'rm -f "$TMPKEY"' EXIT
fi

SSH_OPTS=(-i "$KEY_USE" -o StrictHostKeyChecking=no -o ConnectTimeout=15
          -o ServerAliveInterval=15 -o BatchMode=yes -o LogLevel=ERROR)

fail() { echo "FATAL: $*" >&2; exit 2; }

# ════════════════════════════════════════════════════════════════════════════
echo "### PREFLIGHT (operator → production)"
[ -f "$KEY" ] || fail "SSH key not found at '$KEY' (pass -k /path/to/key.pem)"
echo "  key      : $KEY"
echo "  target   : $SSH_USER@$HOST"
echo "  repo     : $REMOTE_REPO"

# TCP reachability first — distinguishes "box down" from "ssh auth broken".
if command -v nc >/dev/null 2>&1; then
  nc -z -w5 "$HOST" 22 >/dev/null 2>&1 && echo "  port 22  : open" || echo "  port 22  : CLOSED/unreachable"
elif command -v timeout >/dev/null 2>&1; then
  timeout 5 bash -c "</dev/tcp/$HOST/22" 2>/dev/null && echo "  port 22  : open" || echo "  port 22  : CLOSED/unreachable"
fi
if command -v nc >/dev/null 2>&1; then
  nc -z -w5 "$HOST" 80 >/dev/null 2>&1 && echo "  port 80  : open" || echo "  port 80  : CLOSED (Vercel API bridge will 502)"
fi

if ! ssh "${SSH_OPTS[@]}" "$SSH_USER@$HOST" 'echo ok' >/dev/null 2>&1; then
  fail "cannot SSH to $SSH_USER@$HOST — check the key, security group, and that your IP is allowed"
fi
echo "  ssh      : OK"

# ════════════════════════════════════════════════════════════════════════════
echo ""
echo "### UPLOADING COLLECTOR"
scp -i "$KEY_USE" -o StrictHostKeyChecking=no -o LogLevel=ERROR \
    "$SCRIPT_DIR/collect.sh" "$SSH_USER@$HOST:/tmp/phc-collect.sh" >/dev/null 2>&1 \
    || fail "scp failed"
echo "  uploaded collect.sh"

# ════════════════════════════════════════════════════════════════════════════
echo ""
echo "### RUNNING SERVER-SIDE COLLECTION (read-only)"
SERVER_OUT="$(mktemp)"
ssh "${SSH_OPTS[@]}" "$SSH_USER@$HOST" "bash /tmp/phc-collect.sh '$REMOTE_REPO'" >"$SERVER_OUT" 2>&1
SRV_RC=$?
cat "$SERVER_OUT"
[ "$SRV_RC" -ne 0 ] && echo "(collector exited $SRV_RC — output above may be partial)"

# ════════════════════════════════════════════════════════════════════════════
EXTERNAL_OUT=""
if [ "$SKIP_EXTERNAL" = "0" ]; then
  EXTERNAL_OUT="$(mktemp)"
  {
    echo ""
    echo "===== EVIDENCE: EXTERNAL — public edge (from operator network) ====="
    echo "  Run from: $(hostname) at $(date -Is)"
    echo ""
    v() { echo "VERDICT|external.$1|$2|$3"; }

    echo "  -- DNS resolution --"
    for d in aldirasat-erp.vercel.app aldirasat-portal.vercel.app aldirasat.vercel.app aldirasat.com; do
      if getent hosts "$d" >/dev/null 2>&1; then
        echo "  $d resolves"
      else
        echo "  $d DOES NOT RESOLVE"
        v "dns.$d" WARN "$d has no DNS record"
      fi
    done
    echo ""

    # Probe a public surface, FOLLOWING redirects. A bare domain that 307s to a
    # locale root which then 404s is a real defect — judging only the first
    # response would wrongly call it healthy.
    probe() {
      local label="$1" url="$2"
      local out code final t
      out=$(curl -s -o /dev/null -L -w '%{http_code} %{url_effective} %{time_total}' --max-time 25 "$url" 2>/dev/null)
      code=$(printf '%s' "$out" | awk '{print $1}')
      final=$(printf '%s' "$out" | awk '{print $2}')
      t=$(printf '%s' "$out" | awk '{print $3}')
      printf '  %-22s HTTP %-4s (%ss)  final=%s\n' "$label" "${code:-000}" "${t:-?}" "${final:-$url}"
      case "${code:-000}" in
        2*) v "$label" PASS "$url -> $code" ;;
        3*) v "$label" WARN "$url -> $code (redirect never settled on a page)" ;;
        4*) v "$label" FAIL "$url -> $code at $final" ;;
        5*) v "$label" FAIL "$url -> $code server error" ;;
        *)  v "$label" FAIL "$url unreachable (DNS/connection, code ${code:-000})" ;;
      esac
    }
    probe erp.frontend        "$ERP_URL/"
    probe erp.api_bridge      "$ERP_URL/api/v1/health"
    probe portal.frontend     "$PORTAL_URL/"
    probe portal.api_bridge   "$PORTAL_URL/api/health"
    probe marketing.frontend  "$MARKETING_URL/"
    probe marketing.vercel    "$MARKETING_VERCEL_URL/"
    echo ""
    echo "  -- API bridge payloads (proves Vercel→origin, not just TLS) --"
    echo "  ERP   : $(curl -s -L --max-time 25 "$ERP_URL/api/v1/health" 2>/dev/null | head -c 300)"
    echo "  Portal: $(curl -s -L --max-time 25 "$PORTAL_URL/api/health" 2>/dev/null | head -c 300)"
    echo ""
    echo "  -- auth surface reachable through Vercel→origin --"
    # Deliberately a GET on a real auth endpoint. A malformed POST /auth/login
    # returns 500 AND writes an error+traceback into the backend log, so probing
    # that way would have the health check itself polluting production logs.
    ac=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "$ERP_URL/api/v1/auth/csrf" 2>/dev/null)
    echo "  GET /api/v1/auth/csrf -> $ac"
    case "$ac" in
      502|503|504) v login FAIL "auth route gateway error $ac — origin unreachable" ;;
      000)         v login FAIL "auth route not reachable at all" ;;
      *)           v login PASS "auth route reaches origin (HTTP $ac — app response, not a gateway error)" ;;
    esac
  } >>"$EXTERNAL_OUT" 2>&1
  cat "$EXTERNAL_OUT"
fi

# ════════════════════════════════════════════════════════════════════════════
echo ""
echo "### CONSOLIDATED VERDICT SUMMARY"
ALL="$(mktemp)"
grep -h '^VERDICT|' "$SERVER_OUT" ${EXTERNAL_OUT:+"$EXTERNAL_OUT"} 2>/dev/null >"$ALL"
for s in FAIL WARN PASS INFO; do
  n=$(grep -c "|$s|" "$ALL" 2>/dev/null || true)
  printf '  %-5s %s\n' "$s" "${n:-0}"
done
echo ""
echo "  -- FAIL items --"
grep '|FAIL|' "$ALL" 2>/dev/null | sed 's/^VERDICT|/  /' || echo "  (none)"
echo ""
echo "  -- WARN items --"
grep '|WARN|' "$ALL" 2>/dev/null | sed 's/^VERDICT|/  /' || echo "  (none)"

# Persist raw evidence for the agent to read and to build the report from.
{
  echo "# Raw production-health-check evidence"
  echo "# generated: $(date -Is)"
  echo "# host: $SSH_USER@$HOST"
  echo ""
  cat "$SERVER_OUT"
  [ -n "$EXTERNAL_OUT" ] && cat "$EXTERNAL_OUT"
  echo ""
  echo "===== VERDICTS (consolidated) ====="
  cat "$ALL"
} >"$OUT" 2>/dev/null && echo "" && echo "Raw evidence written to: $OUT"

rm -f "$SERVER_OUT" "$ALL" ${EXTERNAL_OUT:+"$EXTERNAL_OUT"}
echo "RUN COMPLETE"
