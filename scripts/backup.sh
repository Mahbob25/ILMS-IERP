#!/usr/bin/env bash
set -euo pipefail

# LIMS backup — dumps PostgreSQL and archives uploaded files.
# Schedule via cron, e.g. daily at 03:00 server time:
#   0 3 * * * /root/lms/scripts/backup.sh >> /var/log/lms/backup.log 2>&1
#
# Additionally: enable automated EBS disk snapshots from the cloud console
# (AWS EC2 or GCP Compute Engine) for off-host recovery.

BACKUP_DIR="${BACKUP_DIR:-/var/backups/lms}"
STAMP="$(date +%Y%m%d-%H%M%S)"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

mkdir -p "$BACKUP_DIR"

echo "==> [$(date)] Starting backup"

echo "==> Dumping database"
docker compose -f "$COMPOSE_FILE" exec -T database \
  pg_dump -U "${POSTGRES_USER:-lims}" -d "${POSTGRES_DB:-lims}" \
  > "$BACKUP_DIR/db-$STAMP.sql"

echo "==> Dumping portal database (portal.* schema shares the same PG host)"
# The portal BFF shares the PG host; its schema (portal.users, portal.refresh_tokens)
# is in the same database as erp.*. If the portal is ever moved to a 2nd PG host,
# add a dedicated pg_dump for it here.

echo "==> Snapshotting portal Redis (queue + cache)"
# Redis is portal-owned (docker-compose.portal.yml). RDB snapshot preserves the
# ai:student/ai:ingestion queues + read-through cache for replay after a restore.
PORTAL_REDIS="$(docker ps -q -f name=portal_redis 2>/dev/null || true)"
if [ -n "$PORTAL_REDIS" ]; then
  docker exec "$PORTAL_REDIS" redis-cli SAVE
  docker run --rm -v "redis_data:/data:ro" -v "$BACKUP_DIR:/backup" alpine \
    sh -c 'mkdir -p /tmp/rdb && cp /data/dump.rdb /tmp/rdb/ && tar czf /backup/redis-$STAMP.tar.gz -C /tmp/rdb .'
else
  echo "WARN: portal_redis not running — skipping redis snapshot (cache will cold-start)"
fi

echo "==> Archiving uploads"
UPLOAD_VOLUME="$(docker volume ls -q -f name=uploads_data || true)"
if [ -n "$UPLOAD_VOLUME" ]; then
  docker run --rm -v "${UPLOAD_VOLUME}:/data:ro" \
    -v "$BACKUP_DIR:/backup" alpine \
    tar czf "/backup/uploads-$STAMP.tar.gz" -C /data .
else
  echo "WARN: uploads_data volume not found — skipping uploads archive"
fi

echo "==> Pruning backups older than 14 days"
find "$BACKUP_DIR" -name '*.sql' -mtime +14 -delete
find "$BACKUP_DIR" -name '*.tar.gz' -mtime +14 -delete

echo "==> [$(date)] Backup complete: $BACKUP_DIR/db-$STAMP.sql"