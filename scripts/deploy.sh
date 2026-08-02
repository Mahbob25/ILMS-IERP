#!/usr/bin/env bash
set -uo pipefail

# Thin wrapper for backward compatibility — all logic lives in setup.sh.
# Usage:  bash scripts/deploy.sh [options]   (same options as setup.sh)
exec "$(dirname "$0")/setup.sh" "$@"
