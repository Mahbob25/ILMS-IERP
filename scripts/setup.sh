#!/usr/bin/env bash
set -uo pipefail

BOLD='\033[1m'
BLUE='\033[1;34m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
CYAN='\033[1;36m'
RESET='\033[0m'

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
ENV_FILE=".env"
FRESH=0
NO_TUNNEL=0
SKIP_PULL=0
QUIET=0
CHECK_ONLY=0
MODE="local"
FIRST_RUN=0

log()  { [ "$QUIET" = "1" ] || printf "${BLUE}[LIMS]${RESET} %s\n" "$*"; }
ok()   { [ "$QUIET" = "1" ] || printf "${GREEN}[ OK ]${RESET} %s\n" "$*"; }
info() { [ "$QUIET" = "1" ] || printf "${CYAN}[INFO]${RESET} %s\n" "$*"; }
warn() { printf "${YELLOW}[WARN]${RESET} %s\n" "$*"; }
fail() { printf "${RED}[FAIL]${RESET} %s\n" "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
LIMS setup — one command for first-time install AND updates, on any machine
(cloud VM, WSL, Docker Desktop, Git Bash). Detects problems and tells you
exactly how to fix them.

Usage:
  bash scripts/setup.sh [options]

Options:
  --check-only   Run all checks and print a report, then exit (no changes)
  --fresh        Reset everything first (deletes ALL data/volumes!)
  --no-tunnel    Force local mode even if a TUNNEL_TOKEN is set
  --skip-pull    Don't run git pull (use local code as-is)
  --quiet        Reduce output
  -h, --help     Show this help

First-time install:  clone the repo, then run this script.
Update (production): git pull && bash scripts/setup.sh
EOF
  exit 0
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --check-only) CHECK_ONLY=1 ;;
      --fresh) FRESH=1 ;;
      --no-tunnel) NO_TUNNEL=1 ;;
      --skip-pull) SKIP_PULL=1 ;;
      --quiet) QUIET=1 ;;
      -h|--help) usage ;;
      *) fail "Unknown option: $1  (see --help)" ;;
    esac
    shift
  done
}

self_crlf_fix() {
  if grep -q $'\r' "$0" 2>/dev/null; then
    echo "setup.sh has Windows (CRLF) line endings — stripping them and re-running..."
    sed -i 's/\r$//' "$0"
    exec bash "$0" "$@"
  fi
}

cd_repo_root() {
  local dir
  dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
  cd "$dir/.." || fail "Cannot find the repository root."
}

detect_os() {
  OS="unknown"
  if [ -n "${MSYSTEM:-}" ]; then
    OS="git-bash"
  elif grep -qi microsoft /proc/version 2>/dev/null; then
    OS="wsl"
  elif [ -f /etc/os-release ]; then
    . /etc/os-release
    case "$ID" in
      ubuntu|debian) OS="debian" ;;
      fedora|centos|rhel|rocky|almalinux) OS="rhel" ;;
      arch|manjaro) OS="arch" ;;
      alpine) OS="alpine" ;;
      *) OS="$ID" ;;
    esac
  fi
  log "Detected environment: $OS"
}

docker_install_hint() {
  case "$OS" in
    debian)
      echo "    sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2"
      echo "    sudo systemctl enable --now docker"
      echo "    sudo usermod -aG docker \$USER     # then log out and back in" ;;
    rhel)
      echo "    Fedora: sudo dnf install -y moby-engine docker-compose-plugin"
      echo "            sudo systemctl enable --now docker"
      echo "    RHEL/CentOS: follow https://docs.docker.com/engine/install/" ;;
    arch)
      echo "    sudo pacman -S docker docker-compose"
      echo "    sudo systemctl enable --now docker" ;;
    alpine)
      echo "    apk add docker docker-cli-compose"
      echo "    rc-update add docker && rc-service docker start" ;;
    wsl)
      echo "    Install Docker Desktop on Windows: https://www.docker.com/products/docker-desktop/"
      echo "    Then: Settings -> Resources -> WSL Integration -> enable this distro." ;;
    git-bash)
      echo "    Install and start Docker Desktop on Windows: https://www.docker.com/products/docker-desktop/" ;;
    *)
      echo "    See https://docs.docker.com/engine/install/ for your OS." ;;
  esac
}

compose_install_hint() {
  case "$OS" in
    debian) echo "    sudo apt-get install -y docker-compose-v2" ;;
    rhel) echo "    sudo dnf install -y docker-compose-plugin" ;;
    arch) echo "    sudo pacman -S docker-compose" ;;
    alpine) echo "    apk add docker-cli-compose" ;;
    *) echo "    Install the docker compose v2 plugin: https://docs.docker.com/compose/install/" ;;
  esac
}

check_script_hygiene() {
  local crlf tmp f
  tmp=$(mktemp)
  crlf=""
  git ls-files '*.sh' 2>/dev/null > "$tmp"
  while read -r f; do
    [ -n "$f" ] || continue
    if grep -q $'\r' "$f" 2>/dev/null; then
      crlf="${crlf} ${f}"
    fi
  done < "$tmp"
  rm -f "$tmp"
  crlf="${crlf# }"
  if [ -n "$crlf" ]; then
    warn "Shell scripts with Windows (CRLF) line endings found — fixing:"
    for f in $crlf; do
      printf '    %s\n' "$f"
      sed -i 's/\r$//' "$f"
    done
    warn "Fixed in place. Re-run the script to continue."
    exit 1
  fi
  ok "Script line endings are clean (LF)"
}

check_git() {
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    fail "Not a git repository. Clone the repo first:  git clone https://github.com/Mahbob25/ILMS-IERP.git"
  fi
  local branch
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  if [ "$branch" != "main" ]; then
    warn "On branch '$branch' (expected 'main'). Deploying from main is assumed."
  fi
  if [ "$SKIP_PULL" = "0" ] && ! git diff --quiet; then
    warn "Working tree has uncommitted changes; 'git pull' would fail."
    warn "Fix:  git stash      (or: git add -A && git commit -m wip)"
    fail "Re-run after committing or stashing. Or use --skip-pull."
  fi
  ok "Git repository clean (branch: $branch)"
}

check_curl() {
  if ! command -v curl >/dev/null 2>&1; then
    case "$OS" in
      debian) echo "Fix: sudo apt-get install -y curl" ;;
      rhel) echo "Fix: sudo dnf install -y curl" ;;
      arch) echo "Fix: sudo pacman -S curl" ;;
      alpine) echo "Fix: apk add curl" ;;
      *) echo "Fix: install curl for your OS" ;;
    esac | { printf '    %s\n' "$(cat)"; }
    fail "curl is required for health verification."
  fi
  ok "curl available"
}

check_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is not installed. Install it, then re-run:"
    docker_install_hint
    fail "Docker CLI not found."
  fi
  ok "docker CLI found"

  if ! docker info >/dev/null 2>&1; then
    if [ -e /var/run/docker.sock ]; then
      echo "The Docker daemon is running but your user cannot access it:"
      echo "    sudo usermod -aG docker \$USER"
      echo "    # log out and back in (or restart WSL), then re-run"
    elif [ "$OS" = "wsl" ]; then
      echo "Docker is not reachable from WSL:"
      echo "    Start Docker Desktop on Windows, then enable"
      echo "    Settings -> Resources -> WSL Integration -> this distro."
    elif [ "$OS" = "git-bash" ]; then
      echo "Docker is not reachable. Start Docker Desktop on Windows and retry."
    else
      echo "The Docker daemon is not running:"
      echo "    sudo systemctl start docker && sudo systemctl enable docker"
      case "$OS" in alpine) echo "    (Alpine: rc-update add docker && rc-service docker start)" ;; esac
    fi
    fail "Cannot talk to the Docker engine."
  fi
  ok "Docker engine reachable"

  if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1 && docker-compose --version >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
  else
    echo "docker compose plugin is missing:"
    compose_install_hint
    fail "docker compose (v2 plugin) required."
  fi
  ok "docker compose available ($("${COMPOSE[@]}" version --short 2>/dev/null || "${COMPOSE[@]}" --version))"
}

check_port_80() {
  local inuse=""
  if command -v ss >/dev/null 2>&1; then
    inuse=$(ss -tln 2>/dev/null | grep -E ':80[[:space:]]' | awk '{print $4}' | head -1)
  elif command -v netstat >/dev/null 2>&1; then
    inuse=$(netstat -an 2>/dev/null | grep -E 'LISTENING|LISTEN' | awk '{print $4}' | grep ':80$' | head -1)
  fi
  if [ -n "$inuse" ]; then
    warn "Port 80 is already in use ($inuse) — Caddy will fail to bind."
    warn "Fix: stop the conflicting service, or change the caddy ports in $COMPOSE_FILE"
    warn "     (e.g. '8080:80') and open http://localhost:8080"
  else
    ok "Port 80 is free"
  fi
}

check_disk() {
  local kb
  kb=$(df -P . 2>/dev/null | awk 'NR==2 {print $4}')
  if [ -n "$kb" ] && [ "$kb" -lt 5242880 ] 2>/dev/null; then
    warn "Low disk space (~$((kb / 1024)) MB free) — image builds may fail."
    warn "Fix: free up space, e.g.  docker system prune -a"
  else
    ok "Disk space OK"
  fi
}

get_env() {
  grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-
}

set_env() {
  sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"
}

generate_secret() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -c "import secrets; print(secrets.token_urlsafe(48))"
  elif command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    tr -dc 'A-Za-z0-9' </dev/urandom | head -c 48
  fi
}

ensure_env() {
  if [ ! -f "$ENV_FILE" ]; then
    if [ ! -f .env.example ]; then
      fail ".env.example is missing — the clone looks incomplete. Re-clone the repo."
    fi
    info "No .env found — creating from .env.example"
    cp .env.example "$ENV_FILE"
  fi
  if grep -q $'\r' "$ENV_FILE" 2>/dev/null; then
    sed -i 's/\r$//' "$ENV_FILE"
    info "Stripped CRLF line endings from $ENV_FILE"
  fi

  local jwt pg pgdata_exists new
  jwt=$(get_env JWT_SECRET_KEY)
  case "$jwt" in
    ""|"change_me_random_base64_key"|"local_dev_only_insecure_change_me"|"super_secret_key_lims_institute_2026_change_in_production")
      new=$(generate_secret)
      info "Generating a strong JWT_SECRET_KEY (old sessions will be invalidated)"
      set_env JWT_SECRET_KEY "$new"
      ;;
  esac

  pg=$(get_env POSTGRES_PASSWORD)
  pgdata_exists=$(docker volume ls -q -f name=pgdata 2>/dev/null | head -1)
  case "$pg" in
    ""|"change_me_strong_password"|"lims_secure_pass")
      if [ -z "$pgdata_exists" ] || [ "$FRESH" = "1" ]; then
        new=$(generate_secret)
        info "Generating a strong POSTGRES_PASSWORD (fresh database)"
        set_env POSTGRES_PASSWORD "$new"
      else
        warn "POSTGRES_PASSWORD uses a default value but a database volume already exists."
        warn "Leaving it unchanged to avoid breaking the existing database."
        warn "To rotate: edit .env, then  docker compose down -v && bash scripts/setup.sh"
      fi
      ;;
  esac
  ok ".env is ready (JWT_SECRET_KEY / POSTGRES_PASSWORD set)"
}

detect_mode() {
  if [ -z "${TUNNEL_TOKEN:-}" ]; then
    TUNNEL_TOKEN=$(get_env TUNNEL_TOKEN)
  fi
  if [ "$NO_TUNNEL" = "1" ]; then
    MODE="local"
    warn "Forcing local mode (--no-tunnel)"
  elif [ -z "$TUNNEL_TOKEN" ] || [ "$TUNNEL_TOKEN" = "your_cloudflare_tunnel_token_here" ]; then
    MODE="local"
    warn "TUNNEL_TOKEN not set — running without the Cloudflare tunnel (local mode)."
    info "To expose to the internet: create a tunnel in Cloudflare Zero Trust (Networks -> Tunnels),"
    info "put its token in .env (TUNNEL_TOKEN=...), then re-run this script."
  else
    MODE="prod"
  fi
  info "Mode: $MODE"
}

check_only_report() {
  local jwt pg
  jwt=$(get_env JWT_SECRET_KEY)
  pg=$(get_env POSTGRES_PASSWORD)
  printf '\n%s%sEnvironment check report%s\n' "$BOLD" "$BLUE" "$RESET"
  printf '  Environment : %s\n' "$OS"
  printf '  Mode        : %s\n' "$MODE"
  printf '  Docker      : reachable, %s\n' "$("${COMPOSE[@]}" version --short 2>/dev/null || "${COMPOSE[@]}" --version)"
  printf '  .env        : present%s%s\n' \
    "" "$( [ -n "$jwt" ] && [ "$jwt" != "change_me_random_base64_key" ] && echo ' (JWT_SECRET_KEY set)' || echo ' (JWT_SECRET_KEY pending — will be generated)' )"
  printf '  Postgres pwd: %s\n' "$( [ -n "$pg" ] && [ "$pg" != "change_me_strong_password" ] && [ "$pg" != "lims_secure_pass" ] && echo 'set' || echo 'default (will be generated on fresh install)' )"
  printf '\nEverything looks ready. Run without --check-only to deploy.\n'
}

detect_first_run() {
  if "${COMPOSE[@]}" -f "$COMPOSE_FILE" ps --services 2>/dev/null | grep -qx backend; then
    FIRST_RUN=0
    info "Existing deployment detected — running update flow (pull -> build -> restart)."
  else
    FIRST_RUN=1
    info "No existing containers — running first-time setup."
    if [ "$FRESH" = "0" ] && [ -z "$(docker volume ls -q -f name=pgdata 2>/dev/null | head -1)" ]; then
      info "Database is new — seed users will be created:"
      info "  manager@institute.dev / secretary@institute.dev / teacher@institute.dev"
    fi
  fi
}

pull_code() {
  if [ "$SKIP_PULL" = "1" ]; then
    info "Skipping git pull (--skip-pull)"
    return
  fi
  info "Pulling latest code"
  if ! git pull --ff-only; then
    warn "git pull failed (network or local changes). Continuing with current code."
    warn "Fix: commit/stash changes, or use --skip-pull."
  fi
}

compose_up() {
  info "Building images (cached — fast on updates)"
  "${COMPOSE[@]}" -f "$COMPOSE_FILE" build || fail "Image build failed — see error above."

  local profile_args=()
  if [ "$MODE" = "prod" ]; then
    profile_args=(--profile tunnel)
    info "Starting services with the tunnel profile (cloudflared)"
  else
    info "Starting services (database, backend, frontend, caddy)"
  fi
  "${COMPOSE[@]}" -f "$COMPOSE_FILE" "${profile_args[@]}" up -d || fail "Failed to start services — see error above."
}

verify() {
  info "Waiting for the stack to become healthy (up to 90s)..."
  local i=0
  until [ "$i" -ge 90 ]; do
    if curl -fsS -m 5 http://localhost/api/v1/health >/dev/null 2>&1 \
       && curl -fsS -m 5 -o /dev/null http://localhost/ar/login; then
      ok "Frontend and API are reachable through Caddy (http://localhost)"
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  warn "Services did not become healthy in time. Status:"
  "${COMPOSE[@]}" -f "$COMPOSE_FILE" ps || true
  warn "backend logs (last 25):"
  "${COMPOSE[@]}" -f "$COMPOSE_FILE" logs --tail=25 backend 2>/dev/null || true
  warn "frontend logs (last 25):"
  "${COMPOSE[@]}" -f "$COMPOSE_FILE" logs --tail=25 frontend 2>/dev/null || true
  warn "Most likely causes: .env values, port 80 in use, or a failing migration above."
  return 1
}

print_summary() {
  printf '\n%s%sLIMS is up%s\n' "$BOLD" "$GREEN" "$RESET"
  printf '  App       : http://localhost%s\n' "$([ "$MODE" = "prod" ] && echo '  (via Cloudflare: https://aldrasat.edu)')"
  printf '  API health: http://localhost/api/v1/health\n'
  printf '  Database  : localhost:5431 (postgres)\n'
  printf '  Logs      : docker compose logs -f backend\n'
  if [ "$MODE" = "local" ]; then
    printf '\n  To go live: create a Cloudflare tunnel, put TUNNEL_TOKEN in .env, re-run this script.\n'
  fi
  printf '\n  Next update:  git pull && bash scripts/setup.sh\n'
  printf '  Backups (prod): add to cron: 0 3 * * * /root/lms/scripts/backup.sh >> /var/log/lms/backup.log 2>&1\n'
}

main() {
  parse_args "$@"
  self_crlf_fix "$@"
  cd_repo_root
  log "LIMS setup — $( [ "$CHECK_ONLY" = "1" ] && echo 'check only' || echo 'deploy' )"
  detect_os
  check_script_hygiene
  check_git
  check_curl
  check_docker
  check_disk
  ensure_env
  detect_mode
  detect_first_run
  if [ "$CHECK_ONLY" = "1" ]; then
    check_port_80
    check_only_report
    exit 0
  fi
  if [ "$FIRST_RUN" = "1" ]; then
    check_port_80
  fi
  if [ "$FRESH" = "1" ]; then
    warn "Wiping ALL containers and volumes (--fresh). Data will be lost."
    "${COMPOSE[@]}" -f "$COMPOSE_FILE" down -v || true
  fi
  pull_code
  compose_up
  verify || fail "Deployment failed — inspect the logs above."
  print_summary
}

main "$@"
