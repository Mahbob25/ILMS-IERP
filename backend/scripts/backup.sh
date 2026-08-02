#!/bin/bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/backups}"
DB_HOST="${DB_HOST:-localhost}"
DB_USER="${DB_USER:-lims}"
DB_NAME="${DB_NAME:-lims}"
S3_BUCKET="${S3_BUCKET:-s3://lms-backups}"
RETENTION_DAYS_LOCAL="${RETENTION_DAYS_LOCAL:-30}"
RETENTION_DAYS_REMOTE="${RETENTION_DAYS_REMOTE:-90}"

mkdir -p "$BACKUP_DIR"

pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -F c -f "$BACKUP_DIR/lms_$TIMESTAMP.dump"

aws s3 cp "$BACKUP_DIR/lms_$TIMESTAMP.dump" "$S3_BUCKET/"

find "$BACKUP_DIR" -name "lms_*.dump" -mtime +$RETENTION_DAYS_LOCAL -delete

echo "Backup complete: lms_$TIMESTAMP.dump"
