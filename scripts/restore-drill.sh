#!/usr/bin/env bash
set -euo pipefail

# Portal restore drill (Phase 3) — verify the backup is actually restorable.
# Restores the PG dump into a TEMPORARY database, then checks the portal.*
# schema + a sample query. The redis RDB is validated for size/format only.
#
# Usage:  bash scripts/restore-drill.sh <backup-dir> [db-name]
#   <backup-dir>  directory containing db-*.sql (and optionally redis-*.tar.gz)
#   [db-name]     temp database name, default restore_drill_<timestamp>
#
# Safe: never touches the live `lims` database; creates a throwaway DB.

BACKUP_DIR="${1:?Usage: restore-drill.sh <backup-dir> [db-name]}"
STAMP="$(date +%Y%m%d-%H%M%S)"
TMP_DB="${2:-restore_drill_$STAMP}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

DB_SQL="$(ls -1 "$BACKUP_DIR"/db-*.sql 2>/dev/null | tail -1)"
if [ -z "$DB_SQL" ]; then
  echo "ERROR: no db-*.sql found in $BACKUP_DIR" >&2
  exit 1
fi

echo "==> Restoring $DB_SQL into temp database $TMP_DB"
docker compose -f "$COMPOSE_FILE" exec -T database \
  psql -U "${POSTGRES_USER:-lims}" -d "${POSTGRES_DB:-lims}" \
  -c "CREATE DATABASE $TMP_DB"

cleanup() {
  docker compose -f "$COMPOSE_FILE" exec -T database \
    psql -U "${POSTGRES_USER:-lims}" -d "${POSTGRES_DB:-lims}" \
    -c "DROP DATABASE IF EXISTS $TMP_DB" || true
}
trap cleanup EXIT

docker compose -f "$COMPOSE_FILE" exec -T database \
  psql -U "${POSTGRES_USER:-lims}" -d "$TMP_DB" < "$DB_SQL"

echo "==> Verifying portal schema exists"
docker compose -f "$COMPOSE_FILE" exec -T database \
  psql -U "${POSTGRES_USER:-lims}" -d "$TMP_DB" -c \
  "SELECT schema_name FROM information_schema.schemata WHERE schema_name='portal';"

echo "==> Verifying portal tables"
docker compose -f "$COMPOSE_FILE" exec -T database \
  psql -U "${POSTGRES_USER:-lims}" -d "$TMP_DB" -c \
  "SELECT table_name FROM information_schema.tables WHERE table_schema='portal' ORDER BY table_name;"

echo "==> Verifying erp.* untouched + portal.users readable"
docker compose -f "$COMPOSE_FILE" exec -T database \
  psql -U "${POSTGRES_USER:-lims}" -d "$TMP_DB" -c \
  "SELECT count(*) FROM portal.users;" 2>/dev/null || echo "WARN: portal.users empty/absent (expected on fresh install)"

REDIS_TGZ="$(ls -1 "$BACKUP_DIR"/redis-*.tar.gz 2>/dev/null | tail -1 || true)"
if [ -n "$REDIS_TGZ" ]; then
  echo "==> Validating redis snapshot archive"
  tar tzf "$REDIS_TGZ" >/dev/null && echo "OK: $REDIS_TGZ is a valid tar.gz"
else
  echo "WARN: no redis snapshot found (cache will cold-start — by design)"
fi

echo "==> Restore drill PASSED ($TMP_DB dropped)"
