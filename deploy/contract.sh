#!/usr/bin/env bash
# =============================================================================
# contract.sh — Deploy LinkVault.sol to Monad (testnet OR mainnet)
# =============================================================================
#
# Wrapper around `forge script` with safety checks. Auto-updates .env.deploy
# with the new contract address so docker-compose picks it up on next build.
#
# Usage:
#   ./deploy/contract.sh testnet    # deploy to chain ID 10143
#   ./deploy/contract.sh mainnet    # deploy to chain ID 143 (real money!)
#
# Environment (set in shell, not .env.deploy):
#   DEPLOYER_PRIVATE_KEY  — hex string with or without 0x prefix
#
# Example:
#   DEPLOYER_PRIVATE_KEY=0xabc123... ./deploy/contract.sh testnet
#
# After successful deploy:
#   1. Verifies source on Sourcify (best-effort)
#   2. Updates .env.deploy with new contract address
#   3. Prints explorer URL + next steps
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $*"; }
ok()   { echo -e "${GREEN}[$(date +%H:%M:%S)] ✓${NC} $*"; }
warn() { echo -e "${YELLOW}[$(date +%H:%M:%S)] ⚠${NC} $*"; }
err()  { echo -e "${RED}[$(date +%H:%M:%S)] ✗${NC} $*" >&2; }

# --- Network configs ---------------------------------------------------------
declare -A RPC_URL=(
    [testnet]="https://testnet-rpc.monad.xyz"
    [mainnet]="https://rpc.monad.xyz"
)
declare -A CHAIN_ID=(
    [testnet]=10143
    [mainnet]=143
)
declare -A EXPLORER=(
    [testnet]="https://testnet.monadscan.com"
    [mainnet]="https://monadscan.com"
)
declare -A ENV_KEY=(
    [testnet]="TESTNET_LINK_VAULT_ADDRESS"
    [mainnet]="MAINNET_LINK_VAULT_ADDRESS"
)

main() {
    local network="${1:-}"
    if [[ -z "$network" ]]; then
        err "Usage: $0 <testnet|mainnet>"
        exit 1
    fi
    if [[ -z "${RPC_URL[$network]:-}" ]]; then
        err "Unknown network: $network. Use 'testnet' or 'mainnet'."
        exit 1
    fi

    # --- Pre-flight ---
    if ! command -v forge &>/dev/null; then
        err "forge not installed. Install: https://www.getfoundry.sh/"
        exit 1
    fi

    if [[ -z "${DEPLOYER_PRIVATE_KEY:-}" ]]; then
        err "DEPLOYER_PRIVATE_KEY env var is required."
        err "Example: DEPLOYER_PRIVATE_KEY=0xabc... $0 $network"
        exit 1
    fi

    # Normalize private key (add 0x prefix if missing)
    local pk="$DEPLOYER_PRIVATE_KEY"
    if [[ ! "$pk" == 0x* ]]; then
        pk="0x$pk"
    fi

    # --- Final confirmation for mainnet (real money) ---
    if [[ "$network" == "mainnet" ]]; then
        echo ""
        warn "=================================================="
        warn "  YOU ARE ABOUT TO DEPLOY TO MAINNET (chain 143)."
        warn "  This uses REAL MON tokens for gas."
        warn "=================================================="
        # Pre-flight balance check
        local balance
        balance=$(cast balance "$(cast wallet address "$pk")" --rpc-url "${RPC_URL[$network]}" 2>/dev/null || echo "0")
        if [[ "$balance" == "0" ]]; then
            err "Wallet has 0 MON on mainnet — deploy will fail. Fund the wallet first."
            exit 1
        fi
        ok "Wallet balance: $(cast --from-wei "$balance") MON"
        echo ""
        read -r -p "Type 'mainnet' to confirm: " confirmation
        if [[ "$confirmation" != "mainnet" ]]; then
            err "Aborted."
            exit 1
        fi
    fi

    local rpc="${RPC_URL[$network]}"
    local chain="${CHAIN_ID[$network]}"
    local explorer="${EXPLORER[$network]}"
    local env_key="${ENV_KEY[$network]}"

    log "=== Deploying LinkVault to $network (chain $chain) ==="
    log "RPC: $rpc"

    # --- Run forge script ---
    pushd contracts >/dev/null

    # Make sure deps are installed
    if [[ ! -d lib/forge-std ]]; then
        log "Installing forge dependencies..."
        forge install --no-commit
    fi

    log "Broadcasting deploy transaction..."
    local forge_output
    forge_output=$(forge script script/DeployLinkVault.s.sol \
        --rpc-url "$rpc" \
        --private-key "$pk" \
        --broadcast \
        --verify \
        --verifier sourcify \
        --verifier-url "https://sourcify.dev/server/" \
        --slow 2>&1) || {
        err "forge script failed:"
        echo "$forge_output" | tail -30
        popd >/dev/null
        exit 1
    }
    popd >/dev/null

    # --- Extract deployed address from forge output ---
    # forge prints: "Contract Address: 0x..."
    local address
    address=$(echo "$forge_output" | grep -oE '0x[0-9a-fA-F]{40}' | head -1)

    if [[ -z "$address" ]]; then
        err "Could not extract contract address from forge output."
        err "Check the forge output manually:"
        echo "$forge_output" | tail -50
        exit 1
    fi

    ok "Deployed at: $address"
    log "Explorer: $explorer/address/$address"

    # --- Update .env.deploy ---
    if [[ -f .env.deploy ]]; then
        log "Updating .env.deploy ($env_key)..."
        # Use sed to replace the value (handles both = and = with comment)
        if grep -q "^${env_key}=" .env.deploy; then
            sed -i.bak "s|^${env_key}=.*|${env_key}=${address}|" .env.deploy
            rm -f .env.deploy.bak
            ok ".env.deploy updated: $env_key=$address"
        else
            warn "$env_key not found in .env.deploy. Add this line manually:"
            echo "  $env_key=$address"
        fi
    else
        warn ".env.deploy not found. Add this to your docker env:"
        echo "  $env_key=$address"
    fi

    echo ""
    ok "Done. Next step:"
    echo "  ./deploy/deploy.sh  --no-pull  # rebuild + restart containers"
}

main "$@"
