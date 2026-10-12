#!/usr/bin/env bash
# =============================================================================
# deploy.sh — MonliPay VPS one-command deploy
# =============================================================================
#
# Pulls the latest code from git, rebuilds both Docker images (testnet +
# mainnet), and recreates changed containers after the build succeeds.
#
# Designed to be run on the VPS. Assumes:
#   - git repo cloned to ~/monlipay (or wherever)
#   - .env (or .env.deploy) exists in repo root with real configuration
#   - docker + docker compose plugin installed
#   - nginx OR caddy already configured (see deploy/nginx/ or deploy/caddy/)
#
# Usage:
#   cd ~/monlipay
#   ./deploy/deploy.sh             # deploy current branch (usually main)
#   ./deploy/deploy.sh testnet     # deploy after switching to testnet branch
#   ./deploy/deploy.sh --no-pull   # rebuild without git pull (e.g. local edits)
#
# To run automatically on every push: set up a webhook that SSHes into the
# VPS and runs this script. Simpler alternative: GitHub Actions with
# ssh-action. See DEPLOY-VPS.md for examples.
# =============================================================================

set -euo pipefail

DEPLOY_ENV_FILE="${MONLIPAY_ENV_FILE:-.env}"
if [[ ! -f "$DEPLOY_ENV_FILE" && -z "${MONLIPAY_ENV_FILE:-}" && -f .env.deploy ]]; then
    DEPLOY_ENV_FILE=.env.deploy
fi

# --- Pretty output -----------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()  { echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $*"; }
ok()   { echo -e "${GREEN}[$(date +%H:%M:%S)] ✓${NC} $*"; }
warn() { echo -e "${YELLOW}[$(date +%H:%M:%S)] ⚠${NC} $*"; }
err()  { echo -e "${RED}[$(date +%H:%M:%S)] ✗${NC} $*" >&2; }

# --- Pre-flight checks -------------------------------------------------------
preflight() {
    local missing=0

    if ! command -v docker &>/dev/null; then
        err "docker not found. Install: https://docs.docker.com/engine/install/"
        missing=1
    fi

    if ! docker compose version &>/dev/null; then
        err "docker compose plugin not found. Install the 'docker-compose-plugin' package."
        missing=1
    fi

    if [[ ! -f "$DEPLOY_ENV_FILE" ]]; then
        err "$DEPLOY_ENV_FILE not found. Create it from .env.deploy.example first."
        missing=1
    fi

    if [[ ! -f docker-compose.yml ]]; then
        err "docker-compose.yml not found. Run this script from the repo root."
        missing=1
    fi

    if [[ $missing -ne 0 ]]; then
        exit 1
    fi
}

# --- Main --------------------------------------------------------------------
main() {
    local do_pull=1
    local branch=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --no-pull)
                do_pull=0
                shift
                ;;
            testnet|main)
                branch="$1"
                shift
                ;;
            *)
                err "Unknown argument: $1"
                echo "Usage: $0 [--no-pull] [testnet|main]"
                exit 1
                ;;
        esac
    done

    preflight

    log "=== MonliPay VPS Deploy ==="

    # --- Pull latest code ---
    if [[ $do_pull -eq 1 ]]; then
        if [[ -n "$branch" ]]; then
            log "Switching to branch: $branch"
            git fetch --all --prune
            git checkout "$branch"
            git pull --ff-only
        else
            log "Pulling latest code on current branch ($(git rev-parse --abbrev-ref HEAD))..."
            git pull --ff-only
        fi
        ok "Code up to date at $(git rev-parse --short HEAD)"
    else
        warn "Skipping git pull (--no-pull)"
    fi

    # --- Sanity check: env.deploy must have non-empty values for required keys ---
    log "Validating $DEPLOY_ENV_FILE..."
    local required_keys=(
        NEXT_PUBLIC_WC_PROJECT_ID
        TESTNET_LINK_VAULT_ADDRESS
        MAINNET_LINK_VAULT_ADDRESS
    )
    for key in "${required_keys[@]}"; do
        local val
        val=$(grep -E "^${key}=" "$DEPLOY_ENV_FILE" | cut -d= -f2- || true)
        if [[ -z "$val" || "$val" == *"your_"* || "$val" == "0x0000000000000000000000000000000000000000" ]]; then
            if [[ "$key" == "MAINNET_LINK_VAULT_ADDRESS" ]]; then
                warn "$key is empty/placeholder — mainnet container will render 'contract not deployed'. Deploy the contract first."
            else
                err "$key is empty or placeholder in $DEPLOY_ENV_FILE. Fix and rerun."
                exit 1
            fi
        fi
    done
    docker compose --env-file "$DEPLOY_ENV_FILE" config --quiet
    ok "$DEPLOY_ENV_FILE validated"

    # --- Build images ---
    log "Building Docker images (this takes 2-5 min the first time)..."
    # Use --build to force rebuild, since NEXT_PUBLIC_* is baked at build time.
    # Buildkit cache makes subsequent builds much faster.
    DOCKER_BUILDKIT=1 COMPOSE_PARALLEL_LIMIT=1 docker compose --env-file "$DEPLOY_ENV_FILE" build --pull
    ok "Images built"

    # --- Recreate changed containers; a brief restart window is expected ---
    log "Starting containers..."
    # `up -d` recreates only containers whose image or config changed.
    # Other containers stay running during the rebuild.
    docker compose --env-file "$DEPLOY_ENV_FILE" up -d --wait --wait-timeout 120
    ok "Containers up"

    # --- Final status ---
    log "Container status:"
    docker compose --env-file "$DEPLOY_ENV_FILE" ps

    ok "Deploy complete."
    echo ""
    log "Endpoints:"
    echo -e "  ${GREEN}http://localhost:3100${NC}  → testnet"
    echo -e "  ${GREEN}http://localhost:4100${NC}  → mainnet"
    echo ""
    if [[ -n "$(command -v curl)" ]]; then
        log "Smoke test:"
        curl -fsSI http://localhost:3100/ | head -1 || warn "testnet container not responding on :3100"
        curl -fsSI http://localhost:4100/ | head -1 || warn "mainnet container not responding on :4100"
    fi
}

main "$@"
