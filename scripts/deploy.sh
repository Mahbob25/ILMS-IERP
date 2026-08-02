#!/usr/bin/env bash
set -euo pipefail

# LIMS production deploy — run from the repo root on the server.
# One compose file for local dev and prod; the tunnel profile adds cloudflared.
#   Fresh server + updates:  ./scripts/deploy.sh
#   Local dev:                docker compose up -d
#
# Backend applies pending DB migrations automatically on startup, so a new
# feature's migration takes effect on the next deploy — no manual steps.

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
COMPOSE_PROFILE="${COMPOSE_PROFILE:-tunnel}"

echo "==> Pulling latest code"
git pull --ff-only

# Refuse to deploy with the insecure local-default secrets.
if ! grep -q '^JWT_SECRET_KEY=' .env || grep -Eq '^JWT_SECRET_KEY=(local_dev_only_insecure_change_me|super_secret_key_lims_institute_2026_change_in_production)$' .env; then
  echo "ERROR: JWT_SECRET_KEY must be set to a secure value in .env (see .env.example)" >&2
  exit 1
fi
if ! grep -q '^TUNNEL_TOKEN=' .env || grep -q '^TUNNEL_TOKEN=your_cloudflare_tunnel_token_here' .env; then
  echo "ERROR: TUNNEL_TOKEN must be set in .env (see .env.example)" >&2
  exit 1
fi

echo "==> Building images"
docker compose -f "$COMPOSE_FILE" build

echo "==> Starting services (backend migrates on startup)"
docker compose -f "$COMPOSE_FILE" --profile "$COMPOSE_PROFILE" up -d

echo "==> Waiting for healthchecks"
sleep 20
docker compose -f "$COMPOSE_FILE" ps

echo "==> Done. Verify: https://aldrasat.edu/ar/login"
