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
PORTAL_COMPOSE_FILE="docker-compose.portal.yml"
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
      echo "    # 1. Set up Docker's official repository:"
      echo "    sudo apt-get update"
      echo "    sudo apt-get install -y ca-certificates curl"
      echo "    sudo install -m 0755 -d /etc/apt/keyrings"
      echo "    sudo curl -fsSL https://download.docker.com/linux/$ID/gpg -o /etc/apt/keyrings/docker.asc"
      echo "    sudo chmod a+r /etc/apt/keyrings/docker.asc"
      echo "    echo \"deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID \\"
      echo "      \$(. /etc/os-release && echo \"\$VERSION_CODENAME\") stable\" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null"
      echo "    sudo apt-get update"
      echo "    # 2. Install the latest Docker packages:"
      echo "    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin"
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
    debian) echo "    sudo apt-get install -y docker-compose-plugin"
            echo "    (requires Docker's official repo — see the docker install steps above)" ;;
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

# Redis forks for BGSAVE / AOF rewrite; with vm.overcommit_memory=0 the
# kernel's heuristic can refuse those allocations and the background save
# fails. Persist the documented value so it survives a reboot. Idempotent,
# and never fatal — the stack still runs (just with an unhardened Redis).
prepare_host() {
  local cur dropin=/etc/sysctl.d/99-redis-overcommit.conf
  cur=$(cat /proc/sys/vm/overcommit_memory 2>/dev/null || echo "")
  if [ "$cur" = "1" ]; then
    ok "vm.overcommit_memory already 1"
    return 0
  fi
  if ! sudo -n true 2>/dev/null; then
    warn "vm.overcommit_memory is ${cur:-unknown} (Redis wants 1) and sudo is not passwordless."
    warn "Redis still runs, but a background AOF/RDB save may fail under memory pressure."
    warn "Fix as root:  echo 'vm.overcommit_memory = 1' > $dropin && sysctl -p $dropin"
    return 0
  fi
  info "Setting vm.overcommit_memory=1 (required by Redis background saves)"
  if echo 'vm.overcommit_memory = 1' | sudo tee "$dropin" >/dev/null \
     && sudo sysctl -p "$dropin" >/dev/null 2>&1; then
    ok "vm.overcommit_memory=1 (persisted in $dropin)"
  else
    warn "Could not set vm.overcommit_memory — continuing; Redis logs a warning."
  fi
}

get_env() {
  grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-
}

set_env() {
  if grep -qE "^$1=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"
  else
    printf '\n%s=%s\n' "$1" "$2" >> "$ENV_FILE"
  fi
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

  # ── Portal (docker-compose.portal.yml) ──────────────────────────────
  # The portal BFF requires a distinct PORTAL_JWT_SECRET (never reuse
  # JWT_SECRET_KEY) and an ERP_SERVICE_KEY to authenticate to the ERP
  # internal API. Generate the portal secret if missing/placeholder.
  local pjs
  pjs=$(get_env PORTAL_JWT_SECRET)
  case "$pjs" in
    ""|"change_me_portal_jwt_secret_48_chars")
      new=$(generate_secret)
      info "Generating a strong PORTAL_JWT_SECRET (distinct from JWT_SECRET_KEY)"
      set_env PORTAL_JWT_SECRET "$new"
      ;;
  esac

  local esk
  esk=$(get_env ERP_SERVICE_KEY)
  case "$esk" in
    ""|"change_me_service_key_32_chars")
      new=$(generate_secret)
      info "Generating a strong ERP_SERVICE_KEY (portal → ERP internal API)"
      set_env ERP_SERVICE_KEY "$new"
      ;;
  esac

  # ── Shared Redis (docker-compose.yml owns the `redis` service) ──────
  # One Redis serves the ERP (realtime bus + queue), the portal BFF
  # (cache + ai:* queues) and ai-service. A password is required, and the
  # client URL must embed it — keep the two in sync here so no caller has
  # to remember. A custom (e.g. cloud-managed) REDIS_URL is left untouched.
  local rp ru
  rp=$(get_env REDIS_PASSWORD)
  case "$rp" in
    ""|"change_me_redis_password")
      rp=$(generate_secret)
      info "Generating a strong REDIS_PASSWORD (shared Redis: ERP + portal + ai)"
      set_env REDIS_PASSWORD "$rp"
      ;;
  esac
  ru=$(get_env REDIS_URL)
  case "$ru" in
    ""|"redis://redis:6379/0"|"redis://:change_me_redis_password@redis:6379/0")
      set_env REDIS_URL "redis://:${rp}@redis:6379/0"
      ;;
  esac

  ok ".env is ready (JWT_SECRET_KEY / POSTGRES_PASSWORD / PORTAL_JWT_SECRET / ERP_SERVICE_KEY / REDIS_PASSWORD set)"
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

# ── Recreate policy ──────────────────────────────────────────────────────────
# `up -d` WITHOUT --force-recreate recreates only the services whose image or
# configuration actually changed, which is why a code-only deploy no longer
# bounces Postgres and Redis. That mattered: force-recreating everything took
# the whole API down for ~15-20s on every push (Caddy stops listening), and
# users saw it as Vercel's ROUTER_EXTERNAL_TARGET_CONNECTION_ERROR for every
# request until the stack came back.
#
# Two things `up -d` cannot detect, so they are handled explicitly below:
#   * the Caddyfile is a BIND MOUNT — its content is not part of Compose's
#     config hash, and Caddy reads the file only at startup;
#   * a rebuilt image must actually be picked up by the running container.

# True when the Caddyfile on disk is newer than the running Caddy process, i.e.
# the process is serving a config that has since changed. Self-contained: no
# state is kept between runs, and a manual Caddyfile edit is caught too.
caddy_config_stale() {
  local started started_epoch file_epoch
  started=$(docker inspect -f '{{.State.StartedAt}}' lims_caddy 2>/dev/null) || return 1
  [ -n "$started" ] || return 1
  # Docker reports RFC3339 with nanoseconds ("...T22:22:11.618678509Z");
  # strip the fraction so GNU date parses it.
  started_epoch=$(date -u -d "${started%%.*}Z" +%s 2>/dev/null) || return 1
  file_epoch=$(stat -c %Y infrastructure/caddy/Caddyfile 2>/dev/null) || return 1
  [ "$file_epoch" -gt "$started_epoch" ]
}

# True when the running backend container is not on the image we just built.
# A cheap guard against silently shipping stale code if Compose ever misses the
# image swap.
backend_image_stale() {
  local running built
  running=$(docker inspect -f '{{.Image}}' lims_backend 2>/dev/null) || return 1
  [ -n "$running" ] || return 1
  built=$("${COMPOSE[@]}" -f "$COMPOSE_FILE" images -q backend 2>/dev/null | head -1)
  [ -n "$built" ] || return 1
  # `docker inspect` reports "sha256:<hex>" whereas `compose images -q` reports
  # the bare "<hex>", so the prefix must be stripped — otherwise the values
  # never match and the backend is recreated on every deploy.
  [ "${running#sha256:}" != "${built#sha256:}" ]
}

# Containers running but NOT attached to the shared network, given as container
# names. A renamed network once left the stack in exactly this state: containers
# kept running but could not be reached by service name, and a plain `up -d` did
# not reconcile it (it needed a manual `docker compose down`). Detecting it keeps
# that recovery automatic without force-recreating everything on every deploy.
containers_off_network() {
  local c nets out=""
  for c in "$@"; do
    docker inspect "$c" >/dev/null 2>&1 || continue
    nets=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$c" 2>/dev/null)
    case " $nets " in
      *" lims-internal "*) ;;
      *) out="${out}${c} " ;;
    esac
  done
  printf '%s' "$out"
}

compose_up() {
  info "Building images (cached — fast on updates)"
  "${COMPOSE[@]}" -f "$COMPOSE_FILE" build || fail "Image build failed — see error above."

  local profile_args=()
  if [ "$MODE" = "prod" ]; then
    profile_args=(--profile tunnel)
    info "Starting services with the tunnel profile (cloudflared)"
  else
    info "Starting services (database, redis, backend, caddy)"
  fi

  # No --force-recreate: services whose image and config are unchanged (notably
  # database and redis) are left running. Recreating them on every deploy is
  # what caused a full-stack outage per push.
  "${COMPOSE[@]}" -f "$COMPOSE_FILE" "${profile_args[@]}" up -d || fail "Failed to start services — see error above."

  # Recovery path for the network-rename case, which `up -d` does not fix: if
  # anything is off the shared network, rebuild the stack so it rejoins. Rare,
  # and only when genuinely broken — the normal deploy never takes this branch.
  local off
  off=$(containers_off_network lims_database lims_redis lims_backend lims_caddy)
  if [ -n "$off" ]; then
    warn "not attached to lims-internal: ${off% } — recreating the stack to rejoin it"
    "${COMPOSE[@]}" -f "$COMPOSE_FILE" "${profile_args[@]}" up -d --force-recreate \
      || fail "Failed to recreate services — see error above."
  fi

  # Safety net — make sure the freshly built backend is really the one running.
  if backend_image_stale; then
    warn "backend is still running an older image — recreating it"
    "${COMPOSE[@]}" -f "$COMPOSE_FILE" up -d --force-recreate --no-deps backend \
      || fail "Failed to recreate backend — see error above."
  fi

  # Bind-mounted Caddyfile: invisible to Compose's config hash and read only at
  # startup, so a config change needs an explicit recreate.
  if caddy_config_stale; then
    info "Caddyfile changed — recreating caddy to load it"
    "${COMPOSE[@]}" -f "$COMPOSE_FILE" up -d --force-recreate --no-deps caddy \
      || fail "Failed to recreate caddy — see error above."
  fi

  # Portal + AI stack (docker-compose.portal.yml) — separate compose file on
  # the same lims-internal network. The ERP must be up first (it owns the
  # database, Caddy and the shared Redis); the portal joins after.
  if [ -f "$PORTAL_COMPOSE_FILE" ]; then
    info "Starting portal stack ($PORTAL_COMPOSE_FILE: portal-backend, ai-service — shared redis comes from the ERP stack)"
    "${COMPOSE[@]}" -f "$PORTAL_COMPOSE_FILE" build || fail "Portal image build failed — see error above."
    "${COMPOSE[@]}" -f "$PORTAL_COMPOSE_FILE" up -d || fail "Failed to start portal services — see error above."

    # Same network-rename recovery for the portal services.
    local port_off
    port_off=$(containers_off_network portal_backend ai_service)
    if [ -n "$port_off" ]; then
      warn "not attached to lims-internal: ${port_off% } — recreating the portal stack"
      "${COMPOSE[@]}" -f "$PORTAL_COMPOSE_FILE" up -d --force-recreate \
        || fail "Failed to recreate portal services — see error above."
    fi
  else
    warn "$PORTAL_COMPOSE_FILE not found — skipping portal stack."
  fi
}

verify() {
  info "Waiting for the stack to become healthy (up to 90s)..."
  local i=0
  until [ "$i" -ge 90 ]; do
    if curl -fsS -m 5 http://localhost/api/v1/health >/dev/null 2>&1; then
      ok "Backend API is reachable through Caddy (http://localhost/api/v1/health)"
      break
    fi
    i=$((i + 1))
    sleep 1
  done
  if [ "$i" -ge 90 ]; then
    warn "Services did not become healthy in time. Status:"
    "${COMPOSE[@]}" -f "$COMPOSE_FILE" ps || true
    warn "backend logs (last 25):"
    "${COMPOSE[@]}" -f "$COMPOSE_FILE" logs --tail=25 backend 2>/dev/null || true
    warn "Most likely causes: .env values, port 80 in use, or a failing migration above."
    return 1
  fi

  # Shared Redis — the ERP/portal/ai bus. Prove it is actually usable
  # (accepting the password from .env), not merely running.
  if "${COMPOSE[@]}" -f "$COMPOSE_FILE" exec -T redis \
       sh -c 'redis-cli --no-auth-warning -a "$REDIS_PASSWORD" ping' 2>/dev/null | grep -q PONG; then
    ok "Shared Redis is reachable (lims_redis, password auth)"
  else
    warn "Shared Redis did not answer PING — check 'docker compose -f $COMPOSE_FILE logs redis'."
    warn "Backends fall back to no-Redis mode, but realtime/queue features will be disabled."
    return 1
  fi

  # Portal stack — verify the BFF is healthy (portal-frontend is on Vercel now).
  if [ -f "$PORTAL_COMPOSE_FILE" ]; then
    info "Waiting for the portal backend to become healthy (up to 60s)..."
    local p=0
    until [ "$p" -ge 60 ]; do
      if "${COMPOSE[@]}" -f "$PORTAL_COMPOSE_FILE" exec -T portal-backend \
           curl -fsS -m 5 http://localhost:8001/api/health >/dev/null 2>&1; then
        ok "Portal backend healthy (http://localhost:8001/api/health inside the network)"
        return 0
      fi
      p=$((p + 1))
      sleep 1
    done
    warn "Portal backend did not become healthy in time."
    "${COMPOSE[@]}" -f "$PORTAL_COMPOSE_FILE" ps || true
    "${COMPOSE[@]}" -f "$PORTAL_COMPOSE_FILE" logs --tail=25 portal-backend 2>/dev/null || true
    return 1
  fi
  return 0
}

print_summary() {
  printf '\n%s%sBackend stack is up%s\n' "$BOLD" "$GREEN" "$RESET"
  printf '  API health: http://localhost/api/v1/health\n'
  printf '  Database  : localhost:5431 (postgres)\n'
  printf '  Redis     : lims_redis :6379 (shared by ERP + portal + ai, password auth)\n'
  printf '  Logs      : docker compose logs -f backend\n'
  if [ -f "$PORTAL_COMPOSE_FILE" ]; then
    printf '  Portal    : portal-backend :8001, ai-service :8002 (on lims-internal)\n'
    printf '  Portal log: docker compose -f %s logs -f portal-backend\n' "$PORTAL_COMPOSE_FILE"
  fi
  printf '\n  Frontends are hosted on Vercel — this server serves APIs only.\n'
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
  prepare_host
  if [ "$FRESH" = "1" ]; then
    warn "Wiping ALL containers and volumes (--fresh). Data will be lost."
    "${COMPOSE[@]}" -f "$COMPOSE_FILE" down -v || true
    if [ -f "$PORTAL_COMPOSE_FILE" ]; then
      "${COMPOSE[@]}" -f "$PORTAL_COMPOSE_FILE" down -v || true
    fi
  fi
  pull_code
  compose_up
  verify || fail "Deployment failed — inspect the logs above."
  print_summary
}

main "$@"
