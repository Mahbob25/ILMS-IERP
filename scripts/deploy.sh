#!/usr/bin/env bash
set -euo pipefail

# LIMS production deploy — run on the server from the repo root.
# Usage: ./scripts/deploy.sh

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKEND_SERVICE="backend"

echo "==> Pulling latest code"
git pull --ff-only

echo "==> Building images"
docker compose -f "$COMPOSE_FILE" build

echo "==> Applying database migrations"
docker compose -f "$COMPOSE_FILE" run --rm "$BACKEND_SERVICE" alembic upgrade head

echo "==> Starting services"
docker compose -f "$COMPOSE_FILE" up -d

echo "==> Waiting for healthchecks"
sleep 20
docker compose -f "$COMPOSE_FILE" ps

echo "==> Done. Verify: https://aldrasat.edu/ar/login"
