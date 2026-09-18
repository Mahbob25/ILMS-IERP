#!/usr/bin/env bash
set -uo pipefail
#
# bootstrap.sh — zero-to-running host bootstrap for LIMS.
#
# setup.sh deploys the stack but assumes a ready host (tools installed,
# repo cloned, .env complete). This script closes that gap: run it on ANY
# fresh VM or in WSL and it prepares the host, fetches the repo, fills the
# .env gaps setup.sh does not cover (notably PORTAL_SSO_SECRET), hands off
# to setup.sh for the actual deploy, then prints the public URL + debug
# cheat-sheet.
#
#   Fresh Ubuntu VM (one-liner over SSH):
#     curl -fsSL https://raw.githubusercontent.com/Mahbob25/ILMS-IERP/main/scripts/bootstrap.sh -o bootstrap.sh \
#       && bash bootstrap.sh --install-deps --yes --with-cron
#   WSL / local dev (from a clone):
#     bash scripts/bootstrap.sh --dev
#   Report only (changes nothing):
#     bash scripts/bootstrap.sh --check-only
#
# The update path is unchanged:  git pull && bash scripts/setup.sh
# (bootstrap.sh always lets setup.sh do the deploy — no duplicated logic).

BOLD='\033[1m'
BLUE='\033[1;34m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
CYAN='\033[1;36m'
RESET='\033[0m'

REPO_URL_DEFAULT="https://github.com/Mahbob25/ILMS-IERP.git"
BRANCH_DEFAULT="main"

MODE_WANT="auto"   # auto | dev | prod
INSTALL_DEPS=0
ASSUME_YES=0
REPO_URL="$REPO_URL_DEFAULT"
CLONE_DIR=""
BRANCH="$BRANCH_DEFAULT"
SKIP_PULL=0
FRESH=0
NO_TUNNEL=0
WITH_CRON=0
CHECK_ONLY=0
QUIET=0
FULL_LOCAL=0
STOP=0

OS="unknown"
IS_WSL=0
SUDO=""
REPO_ROOT=""
MODE="local"       # local | prod (resolved later)
PUBLIC_IP=""
SETUP_RC=0

log()  { [ "$QUIET" = "1" ] || printf "${BLUE}[BOOT]${RESET} %s\n" "$*"; }
ok()   { [ "$QUIET" = "1" ] || printf "${GREEN}[ OK ]${RESET} %s\n" "$*"; }
info() { [ "$QUIET" = "1" ] || printf "${CYAN}[INFO]${RESET} %s\n" "$*"; }
warn() { printf "${YELLOW}[WARN]${RESET} %s\n" "$*"; }
fail() { printf "${RED}[FAIL]${RESET} %s\n" "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
LIMS bootstrap — prepares ANY host (fresh cloud VM, WSL, Docker Desktop),
fetches the repo, completes .env, then runs setup.sh and prints the
public URL + debug guide.

Usage:
  bash scripts/bootstrap.sh [options]
  bash bootstrap.sh [options]                       (fresh VM one-liner file)
  curl -fsSL <raw-url>/scripts/bootstrap.sh | bash -s -- [options]

Options:
  --dev            Development mode: local stack, ENVIRONMENT=development,
                   localhost entries ensured in CORS_ORIGINS
  --prod           Production mode: ENVIRONMENT=production (needs TUNNEL_TOKEN
                   in .env for a public HTTPS URL, else plain http://<ip>)
  --install-deps   Auto-install missing tools (git/curl/docker/...) via the
                   OS package manager. Without it, missing tools are a fatal
                   error with manual fix steps.
  --yes            Non-interactive: assume yes, no prompts (needed for
                   --fresh on a non-TTY). Sets DEBIAN_FRONTEND=noninteractive.
  --repo URL       Repo to clone on a fresh host (default: the ILMS-IERP URL)
  --dir PATH       Clone target / existing repo dir (default: ~/lms for a
                   fresh host; auto-detected when run from a clone)
  --branch NAME    Branch to clone (default: main)
  --skip-pull      Don't git pull an existing checkout (bootstrap still
                   forwards --skip-pull to setup.sh; it owns all git sync)
  --fresh          Forward to setup.sh: wipe containers AND volumes (DATA LOSS).
                   Asks for confirmation unless --yes is given.
  --no-tunnel      Forward to setup.sh: force local mode even with TUNNEL_TOKEN
  --with-cron      Install the daily 03:00 backup cron (Linux only, skipped
                   on WSL / Git Bash with a note)
  --full-local   Dev backend (implies --dev) PLUS all three frontends via
                 npm dev (erp :3000, portal :3001, marketing :3002):
                 writes .env.local files, npm installs, starts servers with
                 PIDs in .bootstrap/pids, waits for health, prints URLs.
                 Needs Node 18+ (auto-installed with --install-deps).
  --stop         Stop frontend dev servers started by --full-local and exit.
                 Backend containers keep running.
  --check-only     Print the preflight report and exit (changes nothing)
  --quiet          Reduce output
  -h, --help       Show this help

Examples:
  Fresh VM:   bash bootstrap.sh --install-deps --yes --with-cron
  WSL dev:    bash scripts/bootstrap.sh --dev
  Full local: bash scripts/bootstrap.sh --full-local --install-deps
  Stop dev:   bash scripts/bootstrap.sh --stop
  Prod VM:    bash scripts/bootstrap.sh --prod --install-deps --yes --with-cron
EOF
  exit 0
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --dev) MODE_WANT="dev" ;;
      --prod) MODE_WANT="prod" ;;
      --install-deps) INSTALL_DEPS=1 ;;
      --yes) ASSUME_YES=1 ;;
      --repo) REPO_URL="${2:?--repo needs a URL}"; shift ;;
      --repo=*) REPO_URL="${1#--repo=}" ;;
      --dir) CLONE_DIR="${2:?--dir needs a path}"; shift ;;
      --dir=*) CLONE_DIR="${1#--dir=}" ;;
      --branch) BRANCH="${2:?--branch needs a name}"; shift ;;
      --branch=*) BRANCH="${1#--branch=}" ;;
      --skip-pull) SKIP_PULL=1 ;;
      --fresh) FRESH=1 ;;
      --no-tunnel) NO_TUNNEL=1 ;;
      --with-cron) WITH_CRON=1 ;;
      --full-local) FULL_LOCAL=1 ;;
      --stop) STOP=1 ;;
      --check-only) CHECK_ONLY=1 ;;
      --quiet) QUIET=1 ;;
      -h|--help) usage ;;
      --) shift; break ;;
      *) fail "Unknown option: $1  (see --help)" ;;
    esac
    shift
  done
  if [ "$FULL_LOCAL" = "1" ]; then
    if [ "$MODE_WANT" = "prod" ]; then
      fail "--full-local cannot be combined with --prod (frontends run against a local backend)."
    fi
    MODE_WANT="dev" # full-local always brings its own local backend
  fi
}

self_crlf_fix() {
  case "${BASH_SOURCE[0]:-$0}" in *bash|/dev/*|"") return 0 ;; esac
  if [ -f "${BASH_SOURCE[0]}" ] && grep -q $'\r' "${BASH_SOURCE[0]}" 2>/dev/null; then
    echo "bootstrap.sh has Windows (CRLF) line endings — stripping and re-running..."
    sed -i 's/\r$//' "${BASH_SOURCE[0]}"
    exec bash "${BASH_SOURCE[0]}" "$@"
  fi
}

is_interactive() {
  [ "$ASSUME_YES" = "0" ] && [ -t 0 ] && [ -z "${CI:-}" ]
}

confirm() { # confirm "prompt" -> 0=yes, 1=no
  if [ "$ASSUME_YES" = "1" ]; then return 0; fi
  if ! is_interactive; then return 1; fi
  local ans
  if [ -r /dev/tty ]; then
    printf "${YELLOW}[ASK]${RESET} %s [y/N] " "$1" > /dev/tty
    read -r ans < /dev/tty || return 1
  else
    printf "${YELLOW}[ASK]${RESET} %s [y/N] " "$1"
    read -r ans || return 1
  fi
  case "$ans" in [yY][eE][sS]|[yY]) return 0 ;; *) return 1 ;; esac
}

detect_os() {
  if [ -n "${MSYSTEM:-}" ]; then
    OS="git-bash"
  elif grep -qi microsoft /proc/version 2>/dev/null; then
    OS="wsl"; IS_WSL=1
  elif [ -f /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    case "${ID:-}" in
      ubuntu|debian) OS="debian" ;;
      fedora) OS="fedora" ;;
      centos|rhel|rocky|almalinux) OS="rhel" ;;
      arch|manjaro) OS="arch" ;;
      alpine) OS="alpine" ;;
      *) OS="${ID:-unknown}" ;;
    esac
    # WSL2 with systemd still reports microsoft in /proc/version (checked
    # above); this is only a second net for odd kernels exposing WSL elsewhere.
    case "$(uname -r 2>/dev/null)" in *microsoft*|*WSL*) OS="wsl"; IS_WSL=1 ;; esac
  fi
  log "Detected environment: $OS"
  [ "$IS_WSL" = "1" ] && info "WSL detected — host-level steps (firewall/cron/sysctl) will be skipped with notes."
}

resolve_sudo() {
  if [ "$(id -u 2>/dev/null || echo 99)" = "0" ]; then
    SUDO=""
  elif command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
    if [ "$ASSUME_YES" = "1" ]; then export DEBIAN_FRONTEND=noninteractive; fi
    if ! $SUDO -n true 2>/dev/null; then
      if is_interactive; then
        warn "sudo will prompt for a password during install steps."
      else
        fail "sudo needs a password but there is no TTY. Re-run with --yes on a host with passwordless sudo, or as root."
      fi
    fi
  elif [ "$OS" = "git-bash" ]; then
    SUDO=""
  else
    fail "Neither root nor sudo available — cannot install packages. Run as root or install sudo."
  fi
}

# ── .env helpers (same semantics as setup.sh) ──────────────────────────────
ENV_FILE=".env"

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

# ── Preflight: hardware + tools (read-only; safe for --check-only) ─────────
mem_mb() {
  awk '/^MemTotal:/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo ""
}

hardware_report() {
  local mem disk cpu arch
  mem=$(mem_mb)
  disk=$(df -P . 2>/dev/null | awk 'NR==2 {print int($4/1024)}')
  cpu=$(nproc 2>/dev/null || echo "?")
  arch=$(uname -m 2>/dev/null || echo "?")
  printf '  OS      : %s%s\n' "$OS" "$([ "$IS_WSL" = "1" ] && echo ' (WSL)' || echo '')"
  printf '  CPU/arch: %s / %s\n' "$cpu" "$arch"
  printf '  Memory  : %s\n' "$([ -n "$mem" ] && echo "${mem} MB" || echo 'unknown')"
  printf '  Disk    : %s\n' "$([ -n "$disk" ] && echo "${disk} MB free" || echo 'unknown')"
  if [ -n "$mem" ]; then
    if [ "$mem" -lt 3500 ]; then
      warn "Low memory (${mem} MB). The stack's container limits sum to ~9GB; expect OOM kills."
    elif [ "$mem" -lt 8000 ]; then
      warn "Memory ${mem} MB is tight for the full stack (ai-service alone allows 4GB). Prod hosts should have 8GB+."
    else
      ok "Memory OK (${mem} MB)"
    fi
  fi
  if [ -n "$disk" ] && [ "$disk" -lt 5120 ]; then
    warn "Low disk (${disk} MB free). Image builds need 5GB+ — free space: docker system prune -a"
  elif [ -n "$disk" ]; then
    ok "Disk OK (${disk} MB free)"
  fi
}

missing_tools() { # echoes space-separated list of missing base tools
  local out="" c
  for c in git curl python3; do
    command -v "$c" >/dev/null 2>&1 || out="${out}${c} "
  done
  printf '%s' "${out% }"
}

docker_present()  { command -v docker >/dev/null 2>&1; }
docker_daemon_ok() { docker info >/dev/null 2>&1; }
compose_present() {
  (docker compose version >/dev/null 2>&1) || \
  (command -v docker-compose >/dev/null 2>&1 && docker-compose --version >/dev/null 2>&1)
}

install_hint() { # install_hint <tool>: one-line manual fix for the current OS
  case "$OS/$1" in
    debian/*) echo "sudo apt-get update && sudo apt-get install -y $1" ;;
    fedora/*|rhel/*) echo "sudo dnf install -y $1" ;;
    arch/*) echo "sudo pacman -S $1" ;;
    alpine/*) echo "apk add $1" ;;
    wsl/*) echo "sudo apt-get update && sudo apt-get install -y $1   (inside this WSL distro)" ;;
    git-bash/*) echo "winget install -e --id Git.Git / Docker.DockerDesktop / Python.Python.3" ;;
    *) echo "install $1 with your OS package manager" ;;
  esac
}

apt_install() { # apt_install pkg... (debian/wsl)
  $SUDO apt-get update || fail "apt-get update failed — check network/DNS."
  $SUDO apt-get install -y "$@" || fail "apt-get install failed for: $*"
}

install_base_tools() {
  local missing="$1"
  [ -z "$missing" ] && return 0
  info "Installing missing tools: $missing"
  case "$OS" in
    debian|wsl) apt_install git curl python3 openssl ca-certificates ;;
    fedora) $SUDO dnf install -y git curl python3 openssl ca-certificates || fail "dnf install failed." ;;
    rhel)   $SUDO dnf install -y git curl python3 openssl ca-certificates || fail "dnf install failed." ;;
    arch)   $SUDO pacman -Sy --noconfirm git curl python openssl || fail "pacman install failed." ;;
    alpine) $SUDO apk add git curl python3 openssl || fail "apk add failed." ;;
    *) fail "Cannot auto-install on '$OS'. Install manually: $missing" ;;
  esac
  ok "Base tools installed"
}

install_docker() {
  info "Installing Docker (engine + compose plugin)"
  case "$OS" in
    debian)
      apt_install ca-certificates curl gnupg
      $SUDO install -m 0755 -d /etc/apt/keyrings
      # shellcheck disable=SC1091
      . /etc/os-release
      $SUDO curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
      $SUDO chmod a+r /etc/apt/keyrings/docker.asc
      # shellcheck disable=SC1091
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        | $SUDO tee /etc/apt/sources.list.d/docker.list > /dev/null
      apt_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
      start_docker_service
      ;;
    fedora)
      $SUDO dnf install -y moby-engine docker-compose-plugin || fail "dnf docker install failed."
      start_docker_service
      ;;
    arch)
      $SUDO pacman -Sy --noconfirm docker docker-compose || fail "pacman docker install failed."
      start_docker_service
      ;;
    alpine)
      $SUDO apk add docker docker-cli-compose || fail "apk docker install failed."
      $SUDO rc-update add docker 2>/dev/null || true
      $SUDO rc-service docker start 2>/dev/null || warn "Start dockerd manually: sudo dockerd"
      ;;
    rhel)
      fail "RHEL-family Docker install needs the official repo — follow https://docs.docker.com/engine/install/ then re-run."
      ;;
    wsl|git-bash|*)
      fail "Docker cannot be auto-installed here. See the guidance above, then re-run."
      ;;
  esac
  if [ "$(id -u)" != "0" ] && ! id -nG 2>/dev/null | grep -qw docker; then
    $SUDO usermod -aG docker "$(id -un)" 2>/dev/null \
      && info "Added $(id -un) to the 'docker' group (takes effect after re-login)" \
      || warn "Could not add the user to the 'docker' group — run: sudo usermod -aG docker \$USER"
  fi
  ok "Docker installed"
}

start_docker_service() {
  if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
    $SUDO systemctl enable --now docker || warn "Could not enable docker via systemctl — start it manually."
  elif command -v service >/dev/null 2>&1; then
    $SUDO service docker start || warn "Could not start docker via 'service' — start it manually."
  fi
}

ensure_docker() {
  if ! docker_present; then
    if [ "$OS" = "wsl" ]; then
      fail "Docker is not reachable from WSL. Install Docker Desktop on Windows (https://www.docker.com/products/docker-desktop/), start it, then enable: Settings -> Resources -> WSL Integration -> this distro. Re-run after that."
    elif [ "$OS" = "git-bash" ]; then
      fail "Docker is not reachable. Install and start Docker Desktop on Windows, then re-run."
    fi
    fail "Docker CLI not found and --install-deps was not given. Fix: re-run with --install-deps, or install manually."
  fi
  ok "docker CLI found"
  if ! docker_daemon_ok; then
    if [ -e /var/run/docker.sock ]; then
      fail "Docker daemon runs but this user cannot access it. Fix: sudo usermod -aG docker \$USER, then log out/in (or: newgrp docker) and re-run."
    else
      fail "Cannot talk to the Docker engine. Fix: sudo systemctl start docker && sudo systemctl enable docker (WSL: start Docker Desktop + WSL Integration)."
    fi
  fi
  ok "Docker engine reachable"
  if ! compose_present; then
    fail "docker compose plugin missing. Fix: $(install_hint docker-compose-plugin) — or re-run with --install-deps."
  fi
  ok "docker compose available"
}

post_install_docker_group() {
  # Fresh --install-deps runs often add the user to the docker group; the
  # current shell does not pick that up until re-login. Detect and say so.
  if [ "$(id -u)" != "0" ] && ! docker_daemon_ok && [ -e /var/run/docker.sock ]; then
    if id -nG 2>/dev/null | grep -qw docker; then
      return 0
    fi
    warn "Added \$USER to the 'docker' group — you must log out and back in (or run: newgrp docker), then re-run this script."
    exit 1
  fi
}

configure_firewall() {
  if [ "$IS_WSL" = "1" ] || [ "$OS" = "git-bash" ]; then
    info "Skipping host firewall (WSL/Desktop — managed by the host OS)."
    return 0
  fi
  if command -v ufw >/dev/null 2>&1 && $SUDO ufw status 2>/dev/null | grep -q "Status: active"; then
    info "Opening 80,443/tcp in ufw"
    $SUDO ufw allow 80,443/tcp >/dev/null 2>&1 \
      && ok "ufw allows 80,443/tcp" \
      || warn "ufw rule failed — open ports 80+443/tcp manually."
  else
    warn "No active ufw — if this is a cloud VM, open inbound TCP 80+443 in the cloud firewall (AWS security group / GCP firewall rule / Azure NSG), else the public URL will time out."
  fi
}

# ── Repo: locate, clone, or update ──────────────────────────────────────────
has_repo_marker() { # has_repo_marker <dir>
  [ -f "$1/scripts/setup.sh" ] && [ -f "$1/docker-compose.yml" ]
}

locate_or_clone_repo() {
  local script_dir="" candidates="" c
  case "${BASH_SOURCE[0]:-$0}" in *bash|/dev/*|"") script_dir="" ;; *)
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" ;;
  esac
  if [ -n "$script_dir" ] && [ "$(basename "$script_dir")" = "scripts" ]; then
    candidates="$(dirname "$script_dir")"
  fi
  candidates="$candidates
$script_dir
$PWD
${CLONE_DIR:-}"
  while read -r c; do
    [ -n "$c" ] || continue
    [ -d "$c" ] || continue
    c="$(cd "$c" 2>/dev/null && pwd)" || continue
    if has_repo_marker "$c"; then
      REPO_ROOT="$c"
      break
    fi
  done <<< "$candidates"

  if [ -z "$REPO_ROOT" ]; then
    if [ "$CHECK_ONLY" = "1" ]; then
      warn "No repo found nearby — fresh hosts would clone $REPO_URL ($BRANCH)."
      return 0
    fi
    clone_repo
  else
    log "Using repo at $REPO_ROOT"
    cd "$REPO_ROOT" || fail "Cannot cd to $REPO_ROOT"
    if [ -n "$CLONE_DIR" ]; then
      local want
      want="$(cd "$CLONE_DIR" 2>/dev/null && pwd || echo "$CLONE_DIR")"
      [ "$want" = "$REPO_ROOT" ] || warn "--dir $CLONE_DIR ignored: a repo was already found at $REPO_ROOT."
    fi
    sync_repo
  fi
}

clone_repo() {
  local dest="${CLONE_DIR:-${HOME:-$PWD}/lms}"
  if [ -e "$dest" ] && ! has_repo_marker "$dest"; then
    if [ -n "$(ls -A "$dest" 2>/dev/null)" ]; then
      fail "$dest exists, is not empty, and is not the repo. Pass --dir <empty-or-new-path> or run from a clone."
    fi
  fi
  if has_repo_marker "$dest"; then
    REPO_ROOT="$(cd "$dest" && pwd)"
    cd "$REPO_ROOT" || fail "Cannot cd to $REPO_ROOT"
    sync_repo
    return 0
  fi
  command -v git >/dev/null 2>&1 || fail "git is required to clone. Re-run with --install-deps."
  info "Cloning $REPO_URL ($BRANCH) into $dest"
  git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$dest" \
    || fail "Clone failed — check network and the --repo/--branch values."
  REPO_ROOT="$(cd "$dest" && pwd)"
  cd "$REPO_ROOT" || fail "Cannot cd to $REPO_ROOT"
  ok "Cloned into $REPO_ROOT"
}

sync_repo() {
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 \
    || fail "Not a git repository — clone first or pass --dir <path>."
  local branch
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  if [ "$MODE_WANT" = "prod" ] && [ "$branch" != "main" ] && [ "$branch" != "$BRANCH" ]; then
    warn "On branch '$branch' (expected '$BRANCH'). Production deploys from $BRANCH are assumed."
  fi
  if [ "$SKIP_PULL" = "1" ]; then
    info "Skipping git pull (--skip-pull)"
    return 0
  fi
  if ! git diff --quiet; then
    fail "Working tree has uncommitted changes; 'git pull' would fail. Fix: git stash (or: git add -A && git commit -m wip). Or use --skip-pull."
  fi
  info "Pulling latest code ($branch)"
  git pull --ff-only || warn "git pull failed (network?). Continuing with current code — or re-run with --skip-pull to silence this."
  ok "Repo synced (branch: $branch)"
}

# ── .env: copy + fill the gaps setup.sh leaves ─────────────────────────────
ensure_env_copy() {
  ENV_FILE="$REPO_ROOT/.env"
  if [ ! -f "$ENV_FILE" ]; then
    [ -f "$REPO_ROOT/.env.example" ] || fail ".env.example is missing — the clone looks incomplete. Re-clone."
    info "No .env — creating from .env.example"
    cp "$REPO_ROOT/.env.example" "$ENV_FILE"
  fi
  if grep -q $'\r' "$ENV_FILE" 2>/dev/null; then
    sed -i 's/\r$//' "$ENV_FILE"
    info "Stripped CRLF line endings from .env"
  fi
}

resolve_mode() {
  if [ "$MODE_WANT" = "dev" ]; then
    MODE="local"
    return 0
  fi
  if [ "$MODE_WANT" = "prod" ]; then
    MODE="prod"
    return 0
  fi
  local tok="${TUNNEL_TOKEN:-}"
  [ -z "$tok" ] && tok=$(get_env TUNNEL_TOKEN)
  case "$tok" in ""|"your_cloudflare_tunnel_token_here") MODE="local" ;; *) MODE="prod" ;; esac
}

fill_env_gaps() {
  # Everything setup.sh generates stays its job; bootstrap only fills what
  # setup.sh misses, so the two never fight.
  local new sso env_now cors changed=0
  sso=$(get_env PORTAL_SSO_SECRET)
  case "$sso" in
    ""|"change_me_shared_sso_secret_48_chars")
      new=$(generate_secret)
      set_env PORTAL_SSO_SECRET "$new"
      info "Generated PORTAL_SSO_SECRET (unified ERP<->portal login)"
      changed=1
      ;;
  esac
  env_now=$(get_env ENVIRONMENT)
  if [ -z "$env_now" ]; then
    if [ "$MODE" = "prod" ]; then set_env ENVIRONMENT "production"; else set_env ENVIRONMENT "development"; fi
    info "Set ENVIRONMENT=$([ "$MODE" = "prod" ] && echo production || echo development) (was empty)"
    changed=1
  fi

  # Full-local runs the portal dev server on :3001, so the ERP's SSO ticket
  # redirect must point there. Only an empty value or the stock vercel.app
  # default is overridden — a custom URL is left alone.
  if [ "$FULL_LOCAL" = "1" ]; then
    local pfu
    pfu=$(get_env PORTAL_FRONTEND_URL)
    case "$pfu" in
      ""|"https://aldirasat-portal.vercel.app")
        set_env PORTAL_FRONTEND_URL "http://localhost:3001"
        info "Set PORTAL_FRONTEND_URL=http://localhost:3001 (local SSO tickets)"
        changed=1
        ;;
      *) info "PORTAL_FRONTEND_URL is custom ($pfu) — leaving it for local SSO" ;;
    esac
  fi
  cors=$(get_env CORS_ORIGINS)
  if [ "$MODE" = "local" ]; then
    # Backend on :80 plus every locally-run frontend. Full-local additionally
    # serves the portal (:3001) and marketing (:3002) dev servers to browsers.
    local want="http://localhost:80,http://localhost:3000" o cors_changed=0
    [ "$FULL_LOCAL" = "1" ] && want="$want,http://localhost:3001,http://localhost:3002"
    for o in $(printf '%s' "$want" | tr ',' ' '); do
      case ",$cors," in
        *",$o,"*) ;;
        *)
          [ -z "$cors" ] && cors="$o" || cors="$cors,$o"
          cors_changed=1
          ;;
      esac
    done
    if [ "$cors_changed" = "1" ]; then
      set_env CORS_ORIGINS "$cors"
      info "Ensured local origins in CORS_ORIGINS (browser -> Caddy dev access)"
      changed=1
    fi
  else
    if [ -n "$PUBLIC_IP" ]; then
      case ",$cors," in
        *"$PUBLIC_IP"*) ;;
        *)
          [ -z "$cors" ] && cors="http://$PUBLIC_IP" || cors="$cors,http://$PUBLIC_IP"
          set_env CORS_ORIGINS "$cors"
          info "Added http://$PUBLIC_IP to CORS_ORIGINS (raw-IP access until the domain is live)"
          changed=1
          ;;
      esac
    fi
  fi
  [ "$changed" = "1" ] || ok ".env gaps already filled (SSO secret / ENVIRONMENT / CORS origins)"
}

detect_public_ip() {
  local ip u
  for u in https://api.ipify.org https://ifconfig.me; do
    ip=$(curl -fsS -m 5 "$u" 2>/dev/null | tr -d ' \r\n' || true)
    if printf '%s' "$ip" | grep -Eq '^[0-9]{1,3}(\.[0-9]{1,3}){3}$'; then
      PUBLIC_IP="$ip"
      return 0
    fi
  done
  PUBLIC_IP=""
  return 0
}

run_setup() {
  local args=(--skip-pull) # bootstrap already synced git; avoid a second pull
  if [ "$MODE" = "local" ] || [ "$NO_TUNNEL" = "1" ]; then
    args+=(--no-tunnel)
  fi
  [ "$FRESH" = "1" ] && args+=(--fresh)
  [ "$QUIET" = "1" ] && args+=(--quiet)
  [ -x "$REPO_ROOT/scripts/setup.sh" ] || chmod +x "$REPO_ROOT/scripts/setup.sh" 2>/dev/null || true
  log "Handing off to setup.sh (${args[*]})"
  bash "$REPO_ROOT/scripts/setup.sh" "${args[@]}"
  SETUP_RC=$?
  return $SETUP_RC
}

install_cron() {
  if [ "$IS_WSL" = "1" ] || [ "$OS" = "git-bash" ]; then
    warn "--with-cron skipped: no cron daemon on WSL/Git Bash. On the prod VM re-run with --with-cron."
    return 0
  fi
  command -v crontab >/dev/null 2>&1 || {
    warn "crontab not found — cron not installed. Fix: $(install_hint cron), then add: 0 3 * * * $REPO_ROOT/scripts/backup.sh >> /var/log/lms/backup.log 2>&1"
    return 0
  }
  local line="0 3 * * * $REPO_ROOT/scripts/backup.sh >> /var/log/lms/backup.log 2>&1"
  if crontab -l 2>/dev/null | grep -qF "$REPO_ROOT/scripts/backup.sh"; then
    ok "Backup cron already installed"
    return 0
  fi
  $SUDO mkdir -p /var/log/lms 2>/dev/null || true
  (crontab -l 2>/dev/null; printf '%s\n' "$line") | crontab - \
    && ok "Backup cron installed (daily 03:00 -> /var/log/lms/backup.log)" \
    || warn "Could not install cron — add manually: $line"
}

# ── Full-local frontends (npm dev for all three apps) ──────────────────────
# erp :3000 (Next default), portal :3001 (in its dev script), marketing :3002
# (explicit -p: its default would collide with the ERP on :3000).
frontend_list() {
  printf '%s\n' \
    "erp|apps/erp/frontend|3000|" \
    "portal|apps/portal/frontend|3001|" \
    "marketing|apps/marketing|3002|-p 3002"
}

boot_pid_dir() { printf '%s/.bootstrap/pids' "$REPO_ROOT"; }
boot_log_dir() { printf '%s/.bootstrap/logs' "$REPO_ROOT"; }

pipe_to_root_shell() { # pipe_to_root_shell <url> — run a remote setup script as root
  if [ -n "$SUDO" ]; then
    curl -fsSL "$1" | $SUDO -E bash -
  else
    curl -fsSL "$1" | bash -
  fi
}

ensure_node() {
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    local major
    major=$(node --version 2>/dev/null | sed 's/^v//; s/\..*//')
    case "$major" in ''|*[!0-9]*) fail "Cannot parse the node version — reinstall Node 20 LTS." ;; esac
    [ "$major" -ge 18 ] || fail "Node v$major is too old (Next.js 14 needs 18+, 20 LTS recommended)."
    ok "Node $(node --version) + npm available"
    return 0
  fi
  [ "$INSTALL_DEPS" = "1" ] || fail "Node.js 20 LTS is required for --full-local. Fix: re-run with --install-deps (or install Node 20 manually)."
  info "Installing Node.js 20 LTS"
  case "$OS" in
    debian|wsl)
      pipe_to_root_shell https://deb.nodesource.com/setup_20.x \
        || fail "NodeSource setup failed — check network."
      apt_install nodejs
      ;;
    rhel)
      pipe_to_root_shell https://rpm.nodesource.com/setup_20.x \
        || fail "NodeSource setup failed — check network."
      $SUDO dnf install -y nodejs || fail "dnf nodejs install failed."
      ;;
    fedora) $SUDO dnf install -y nodejs npm || fail "dnf nodejs install failed." ;;
    arch) $SUDO pacman -Sy --noconfirm nodejs npm || fail "pacman nodejs install failed." ;;
    alpine) $SUDO apk add nodejs npm || fail "apk nodejs install failed." ;;
    *) fail "Cannot auto-install Node on '$OS'. Install Node 20 LTS manually (Windows: winget install -e --id OpenJS.NodeJS.LTS), then re-run." ;;
  esac
  command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 \
    || fail "Node install did not land on PATH. Open a fresh shell and re-run."
  ok "Node $(node --version) installed"
}

frontend_env_for() { # frontend_env_for <app> — prints KEY=VALUE lines
  case "$1" in
    erp) printf '%s\n' \
      "API_ORIGIN=http://localhost" \
      "NEXT_PUBLIC_API_URL=http://localhost/api/v1" \
      "NEXT_PUBLIC_PORTAL_URL=http://localhost:3001" \
      "NEXT_PUBLIC_MARKETING_URL=http://localhost:3002" ;;
    portal) printf '%s\n' \
      "API_ORIGIN=http://localhost" \
      "NEXT_PUBLIC_API_URL=http://localhost/api" \
      "NEXT_PUBLIC_ERP_URL=http://localhost:3000" \
      "NEXT_PUBLIC_MARKETING_URL=http://localhost:3002" ;;
    marketing) printf '%s\n' \
      "API_ORIGIN=http://localhost" \
      "NEXT_PUBLIC_ERP_URL=http://localhost:3000" \
      "NEXT_PUBLIC_PORTAL_URL=http://localhost:3001" ;;
  esac
}

ensure_frontend_env() {
  local name dir port args f kv k want have
  while IFS='|' read -r name dir port args; do
    f="$REPO_ROOT/$dir/.env.local"
    if [ ! -f "$f" ]; then
      frontend_env_for "$name" > "$f"
      info "Wrote $dir/.env.local (local API + cross-app URLs)"
      continue
    fi
    while IFS= read -r kv; do
      [ -n "$kv" ] || continue
      k="${kv%%=*}"; want="${kv#*=}"
      have=$(grep -E "^${k}=" "$f" 2>/dev/null | head -1 | cut -d= -f2-)
      if [ -z "$have" ]; then
        warn "$dir/.env.local lacks $k (want: $want) — add it, or delete the file and re-run to regenerate."
      elif [ "$have" != "$want" ]; then
        warn "$dir/.env.local: $k=$have (full-local wants: $want)."
      fi
    done <<< "$(frontend_env_for "$name")"
  done <<< "$(frontend_list)"
  ok "Frontend env files checked (.env.local is never overwritten)"
}

install_frontend_deps() {
  local name dir port args
  while IFS='|' read -r name dir port args; do
    if [ -d "$REPO_ROOT/$dir/node_modules" ]; then
      ok "$name: node_modules present — skipping install"
      continue
    fi
    info "$name: installing dependencies (first run takes a few minutes)"
    if [ -f "$REPO_ROOT/$dir/package-lock.json" ]; then
      (cd "$REPO_ROOT/$dir" && npm ci --no-audit --no-fund) \
        || (cd "$REPO_ROOT/$dir" && npm install --no-audit --no-fund) \
        || fail "$name: npm install failed — see output above."
    else
      (cd "$REPO_ROOT/$dir" && npm install --no-audit --no-fund) \
        || fail "$name: npm install failed — see output above."
    fi
    ok "$name: dependencies installed"
  done <<< "$(frontend_list)"
}

port_open() { # port_open <port> — 0 when something answers on localhost
  curl -s -o /dev/null -m 3 "http://localhost:$1" 2>/dev/null
}

start_frontends() {
  local name dir port args pidfile logf setsid_bin=""
  mkdir -p "$(boot_pid_dir)" "$(boot_log_dir)"
  command -v setsid >/dev/null 2>&1 && setsid_bin="setsid"
  while IFS='|' read -r name dir port args; do
    pidfile="$(boot_pid_dir)/$name.pid"
    logf="$(boot_log_dir)/$name.log"
    if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile" 2>/dev/null)" 2>/dev/null; then
      ok "$name: already started by bootstrap (pid $(cat "$pidfile"))"
      continue
    fi
    [ -f "$pidfile" ] && rm -f "$pidfile"
    if port_open "$port"; then
      ok "$name: port $port already serves something — leaving it alone (stop it first if stale)"
      continue
    fi
    log "Starting $name dev server (-> http://localhost:$port, log .bootstrap/logs/$name.log)"
    # setsid makes the server a process-group leader so --stop kills the whole
    # npm+next tree, not just the npm wrapper.
    # shellcheck disable=SC2086
    (cd "$REPO_ROOT/$dir" && $setsid_bin nohup npm run dev ${args:-} >"$logf" 2>&1 < /dev/null & echo $! > "$pidfile")
    sleep 2
    if ! kill -0 "$(cat "$pidfile")" 2>/dev/null; then
      warn "$name: process died immediately — last lines of $logf:"
      tail -15 "$logf" 2>/dev/null || true
      rm -f "$pidfile"
      return 1
    fi
  done <<< "$(frontend_list)"
  return 0
}

wait_frontends() {
  local name dir port args i failed=""
  while IFS='|' read -r name dir port args; do
    i=0
    while [ "$i" -lt 120 ]; do
      if port_open "$port"; then
        ok "$name up at http://localhost:$port"
        break
      fi
      i=$((i + 3))
      sleep 3
    done
    if ! port_open "$port"; then
      failed="${failed}${name} "
      warn "$name did not answer on :$port within 120s — last log lines:"
      tail -20 "$(boot_log_dir)/$name.log" 2>/dev/null || true
    fi
  done <<< "$(frontend_list)"
  if [ -n "$failed" ]; then
    fail "Frontend(s) failed to start: ${failed% }. Logs: .bootstrap/logs/. (Backend stack is still up.)"
  fi
  return 0
}

run_frontends() {
  ensure_node
  ensure_frontend_env
  install_frontend_deps
  start_frontends || return 1
  wait_frontends
}

stop_frontends() {
  local name dir port args pidfile pid
  if [ ! -d "$(boot_pid_dir)" ]; then
    info "No frontend PIDs recorded — nothing started by bootstrap."
    return 0
  fi
  while IFS='|' read -r name dir port args; do
    pidfile="$(boot_pid_dir)/$name.pid"
    if [ -f "$pidfile" ]; then
      pid=$(cat "$pidfile" 2>/dev/null || echo "")
      if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
        sleep 1
        if kill -0 "$pid" 2>/dev/null; then
          warn "$name (pid $pid) did not stop — kill it manually: kill $pid"
        else
          ok "$name stopped"
        fi
      else
        info "$name: pid file stale — already gone"
      fi
      rm -f "$pidfile"
    elif port_open "$port"; then
      warn "$name: port $port serves something not started by bootstrap — leaving it (stop manually if stale)."
    else
      info "$name: not running"
    fi
  done <<< "$(frontend_list)"
  return 0
}

stop_repo_locate() {
  local c
  for c in "$PWD" "${CLONE_DIR:-}"; do
    if [ -n "$c" ] && [ -d "$c" ] && has_repo_marker "$c"; then
      REPO_ROOT="$(cd "$c" && pwd)"
      cd "$REPO_ROOT" || fail "Cannot cd to $REPO_ROOT"
      return 0
    fi
  done
  fail "No repo found here. cd into the clone (or pass --dir) and retry."
}

# ── Final report: public URL + debug guide ─────────────────────────────────
print_footer() {
  local base_local="http://localhost"
  printf '\n%s%sBootstrap complete — stack is up%s\n' "$BOLD" "$GREEN" "$RESET"
  printf '  Local API health : %s/api/v1/health\n' "$base_local"
  printf '  Database         : localhost:5431 (postgres) / Redis: lims_redis :6379 (password auth, see .env)\n'
  if [ "$FULL_LOCAL" = "1" ]; then
    printf '\n%s%sFrontends (npm dev)%s\n' "$BOLD" "$BLUE" "$RESET"
    printf '  ERP:       http://localhost:3000\n'
    printf '  Portal:    http://localhost:3001\n'
    printf '  Marketing: http://localhost:3002\n'
    printf '  Logs:      .bootstrap/logs/<app>.log\n'
    printf '  Stop:      bash scripts/bootstrap.sh --stop   (backend keeps running)\n'
    printf '  Dev logins: seeded accounts printed by setup.sh on first start (manager@institute.dev, secretary@institute.dev, teacher@institute.dev)\n'
  fi

  printf '\n%s%sPublic URL%s\n' "$BOLD" "$BLUE" "$RESET"
  if [ "$MODE" = "prod" ]; then
    printf '  Tunnel mode: the public hostname lives in Cloudflare Zero Trust -> Networks -> Tunnels\n'
    printf '  -> your tunnel -> Public Hostnames (service http://caddy:80).\n'
    printf '  Expected:  https://<your-hostname>/api/v1/health   (ERP)   and   https://<your-hostname>/api/auth/session (portal BFF)\n'
    printf '  Tunnel check:  docker logs lims_cloudflared --tail=30 | grep -iE "register|error"\n'
    printf '  (look for "Registered tunnel connection"). If missing: wrong TUNNEL_TOKEN or hostname not added yet.\n'
  elif [ -n "$PUBLIC_IP" ] && [ "$IS_WSL" = "0" ] && [ "$OS" != "git-bash" ]; then
    printf '  No tunnel:  http://%s/api/v1/health\n' "$PUBLIC_IP"
    printf '  If that times out: open inbound TCP 80+443 in the cloud firewall (security group).\n'
    printf '  For HTTPS: create a tunnel (Zero Trust -> Networks -> Tunnels), set TUNNEL_TOKEN in .env, re-run this script.\n'
  else
    printf '  Dev box:  %s/api/v1/health   (also reachable from the Windows browser on WSL/Desktop)\n' "$base_local"
    printf '  For a public URL: set TUNNEL_TOKEN in .env and re-run without --dev.\n'
  fi

  printf '\n%s%sFrontend wiring (Vercel)%s\n' "$BOLD" "$BLUE" "$RESET"
  if [ "$MODE" = "prod" ]; then
    printf '  ERP site:    NEXT_PUBLIC_API_URL=https://<your-hostname>/api/v1\n'
    printf '  Portal site: NEXT_PUBLIC_API_URL=https://<your-hostname>/api\n'
  elif [ -n "$PUBLIC_IP" ] && [ "$IS_WSL" = "0" ] && [ "$OS" != "git-bash" ]; then
    printf '  ERP site:    NEXT_PUBLIC_API_URL=http://%s/api/v1\n' "$PUBLIC_IP"
    printf '  Portal site: NEXT_PUBLIC_API_URL=http://%s/api\n' "$PUBLIC_IP"
  else
    printf '  Local dev: frontends default to localhost; set NEXT_PUBLIC_API_URL only if the API runs elsewhere.\n'
  fi
  printf '  SSO redirect: PORTAL_FRONTEND_URL / NEXT_PUBLIC_PORTAL_URL must match the deployed portal URL.\n'

  printf '\n%s%sDebug%s\n' "$BOLD" "$BLUE" "$RESET"
  printf '  Status:  docker compose ps; docker compose -f docker-compose.portal.yml ps\n'
  printf '  Logs:    docker compose logs --tail=50 backend\n'
  printf '           docker compose -f docker-compose.portal.yml logs --tail=50 portal-backend\n'
  printf '           docker logs lims_cloudflared --tail=30   (tunnel mode only)\n'
  printf '           docker compose logs --tail=30 redis caddy\n'
  printf '  Checks:  bash scripts/setup.sh --check-only\n'
  printf '  Support bundle:\n'
  printf '    { docker compose ps; docker compose logs --tail=50 backend; docker compose -f docker-compose.portal.yml logs --tail=50 portal-backend; } > bootstrap-debug.txt 2>&1\n'

  printf '\n%s%sNext steps%s\n' "$BOLD" "$BLUE" "$RESET"
  printf '  Update:  git pull && bash scripts/setup.sh\n'
  if [ "$WITH_CRON" = "1" ]; then
    printf '  Backups: cron active (daily 03:00). Test restore: bash scripts/restore-drill.sh\n'
  else
    printf '  Backups: not scheduled. Install: re-run with --with-cron (prod Linux) — then test: bash scripts/restore-drill.sh\n'
  fi
}

check_only_report() {
  local miss tok repo_state
  printf '\n%s%sBootstrap preflight report (no changes made)%s\n' "$BOLD" "$BLUE" "$RESET"
  hardware_report
  miss=$(missing_tools)
  printf '  Tools   : %s\n' "$([ -z "$miss" ] && echo 'git/curl/python3 OK' || echo "MISSING: $miss (fix: re-run with --install-deps)")"
  if docker_present; then
    printf '  Docker  : CLI present, daemon %s, compose %s\n' \
      "$(docker_daemon_ok && echo reachable || echo UNREACHABLE)" \
      "$(compose_present && echo present || echo MISSING)"
  else
    printf '  Docker  : MISSING (fix: re-run with --install-deps; WSL/Desktop needs Docker Desktop + WSL Integration)\n'
  fi
  repo_state="not found nearby (fresh host would clone $REPO_URL $BRANCH)"
  [ -n "$REPO_ROOT" ] && repo_state="$REPO_ROOT"
  # REPO_ROOT is empty here unless locate ran; do a light locate for the report
  if [ -z "$REPO_ROOT" ]; then
    local c
    for c in "$PWD" "${CLONE_DIR:-}"; do
      [ -n "$c" ] && [ -d "$c" ] && has_repo_marker "$c" && repo_state="$(cd "$c" && pwd)" && REPO_ROOT="$repo_state" && break
    done
  fi
  printf '  Repo    : %s\n' "$repo_state"
  if [ -n "$REPO_ROOT" ]; then
    printf '  .env    : %s\n' "$([ -f "$REPO_ROOT/.env" ] && echo 'present' || echo 'absent (will be created from .env.example)')"

    tok="${TUNNEL_TOKEN:-}$(grep -E '^TUNNEL_TOKEN=' "$REPO_ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2-)"
    case "$tok" in ""*"your_cloudflare_tunnel_token_here"*|"") printf '  Tunnel  : no token -> local mode\n' ;; *)
      printf '  Tunnel  : token set -> tunnel (prod) mode\n' ;; esac
  else
    printf '  .env    : unknown (no repo yet)\n'
    printf '  Tunnel  : unknown (no repo yet)\n'
  fi
  printf '  Mode    : %s\n' "$([ "$MODE_WANT" = "auto" ] && echo 'auto (token -> prod, else local)' || echo "$MODE_WANT")"
  if command -v node >/dev/null 2>&1; then
    printf '  Node    : %s\n' "$(node --version 2>/dev/null || echo present)"
  elif [ "$FULL_LOCAL" = "1" ]; then
    printf '  Node    : MISSING (required for --full-local; re-run with --install-deps)\n'
  else
    printf '  Node    : missing (only needed for --full-local)\n'
  fi
  [ "$FULL_LOCAL" = "1" ] && printf '  Frontends: would write .env.local, npm install, and start erp:3000 portal:3001 marketing:3002 (PIDs in .bootstrap/pids)\n'
  printf '  Cron    : %s\n' "$([ "$WITH_CRON" = "1" ] && echo 'would install daily 03:00 backup' || echo 'not requested (add --with-cron on prod)')"

  printf '\nWould run: preflight -> install (only with --install-deps) -> clone/pull -> .env gaps -> setup.sh -> URL + debug report.\n'
  printf 'Nothing was changed. Re-run without --check-only to bootstrap.\n'
}

main() {
  parse_args "$@"
  self_crlf_fix "$@"
  log "LIMS bootstrap — $([ "$CHECK_ONLY" = "1" ] && echo 'preflight only' || echo 'host prep + deploy')"
  detect_os

  if [ "$STOP" = "1" ]; then
    stop_repo_locate
    stop_frontends
    exit 0
  fi

  # Light repo locate for --check-only so the report knows the state.
  if [ "$CHECK_ONLY" = "1" ]; then
    local c
    for c in "$PWD" "${CLONE_DIR:-}"; do
      [ -n "$c" ] && [ -d "$c" ] && has_repo_marker "$c" && REPO_ROOT="$(cd "$c" && pwd)" && break
    done
    check_only_report
    exit 0
  fi

  resolve_sudo

  # ── 1. Tools ──
  local miss
  miss=$(missing_tools)
  if [ -n "$miss" ]; then
    if [ "$INSTALL_DEPS" = "1" ]; then
      install_base_tools "$miss"
    else
      warn "Missing tools: $miss"
      for t in $miss; do printf '    %s\n' "$(install_hint "$t")"; done
      fail "Re-run with --install-deps to install automatically."
    fi
  else
    ok "Base tools present (git/curl/python3)"
  fi
  if ! docker_present || ! compose_present; then
    if [ "$INSTALL_DEPS" = "1" ]; then
      install_docker
      post_install_docker_group
    else
      ensure_docker # prints the precise manual fix, then fails
    fi
  fi
  ensure_docker

  # ── 2. Host ──
  hardware_report
  configure_firewall

  # ── 3. Repo ──
  locate_or_clone_repo
  ensure_env_copy

  # ── 4. Mode + .env gaps + public IP (before setup.sh needs them) ──
  resolve_mode
  info "Mode: $MODE$([ "$MODE_WANT" = "dev" ] && echo ' (--dev: local stack)' || true)$([ "$MODE_WANT" = "prod" ] && echo ' (--prod)' || true)"
  if [ "$MODE" = "prod" ]; then
    local tok="${TUNNEL_TOKEN:-}$(get_env TUNNEL_TOKEN)"
    case "$tok" in ""*"your_cloudflare_tunnel_token_here"*|"")
      warn "No TUNNEL_TOKEN — prod mode will serve plain http://<ip> until a tunnel token is set in .env." ;;
    esac
  fi
  detect_public_ip
  [ -n "$PUBLIC_IP" ] && info "Public IP detected: $PUBLIC_IP"
  fill_env_gaps

  # ── 5. Safety gate for the destructive flag ──
  if [ "$FRESH" = "1" ]; then
    warn "Wiping ALL containers and volumes (--fresh). Data will be lost."
    if ! confirm "Back up first if needed. Really wipe and continue?"; then
      fail "Aborted. (Non-interactive runs need --yes to confirm --fresh.)"
    fi
  fi

  # ── 6. Deploy (setup.sh owns this) ──
  if ! run_setup; then
    warn "setup.sh failed (exit $SETUP_RC). Start here:"
    warn "  docker compose ps; docker compose logs --tail=50 backend"
    warn "  docker compose -f docker-compose.portal.yml logs --tail=50 portal-backend"
    exit "$SETUP_RC"
  fi

  # ── 6b. Full-local frontends (npm dev for all three apps) ──
  if [ "$FULL_LOCAL" = "1" ]; then
    run_frontends || exit $?
  fi

  # ── 7. Optional production extras + final report ──
  if [ "$WITH_CRON" = "1" ]; then
    install_cron
  fi
  print_footer
}

main "$@"
