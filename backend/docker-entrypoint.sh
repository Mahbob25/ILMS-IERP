#!/bin/sh
set -e

# Apply pending database migrations before serving traffic.
# Idempotent — safe to run on every container start, so new features
# (new migration files) take effect on the next deploy automatically.
echo "==> Applying database migrations (alembic upgrade head)"
alembic upgrade head

exec "$@"
