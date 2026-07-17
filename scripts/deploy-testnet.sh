#!/usr/bin/env bash
# ============================================================================
# deploy-testnet.sh — One-command deploy for MonliPay to Monad Testnet
# ============================================================================
# This script:
#   1. Deploys LinkVault.sol to Monad Testnet
#   2. Waits for the deployment tx to be confirmed
#   3. Verifies the source on Sourcify (exact_match)
#   4. Updates web/.env.testnet and web/.env.example with the new address
#   5. Prints the Monadscan URL and submission-ready details
#
# PREREQUISITES:
#   - Foundry installed (forge, cast)
#   - A funded wallet on Monad Testnet (get MON from the faucet)
#   - Your private key exported as an env var:
#       export PRIVATE_KEY=0xabc...
#
# USAGE:
#   chmod +x scripts/deploy-testnet.sh
#   ./scripts/deploy-testnet.sh
#
# ============================================================================
set -euo pipefail

# Color codes for pretty output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()  { echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $*"; }
ok()   { echo -e "${GREEN}[$(date +%H:%M:%S)] ✓${NC} $*"; }
warn() { echo -e "${YELLOW}[$(date +%H:%M:%S)] ⚠${NC} $*"; }
err()  { echo -e "${RED}[$(date +%H:%M:%S)] ✗${NC} $*" >&2; }

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONTRACTS_DIR="$REPO_DIR/contracts"
WEB_DIR="$REPO_DIR/web"

log "MonliPay — Monad Testnet deployment"
log "Repo: $REPO_DIR"
echo ""

# Check forge
if ! command -v forge >/dev/null 2>&1; then
  err "Foundry 'forge' not found in PATH."
  err "Install from https://www.getfoundry.sh/"
  exit 1
fi

# Check PRIVATE_KEY
if [[ -z "${PRIVATE_KEY:-}" ]]; then
  err "PRIVATE_KEY environment variable is not set."
  err "Run: export PRIVATE_KEY=0xyour_private_key"
  err "Get testnet MON from the Monad faucet first."
  exit 1
fi

# Validate key format
if [[ ! "$PRIVATE_KEY" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
  err "PRIVATE_KEY must be a 0x-prefixed 32-byte hex string."
  exit 1
fi

# Check wallet balance
log "Checking wallet balance..."
WALLET_ADDR=$(cast wallet address "$PRIVATE_KEY" 2>/dev/null || true)
if [[ -z "$WALLET_ADDR" ]]; then
  err "Could not derive wallet address from PRIVATE_KEY."
  exit 1
fi

BALANCE=$(cast balance \
  --rpc-url https://testnet-rpc.monad.xyz \
  "$WALLET_ADDR" 2>/dev/null || echo "0")

BALANCE_MON=$(echo "scale=4; $BALANCE / 1000000000000000000" | bc 2>/dev/null || echo "?")
log "Wallet: $WALLET_ADDR"
log "Balance: $BALANCE_MON MON"

if [[ "$BALANCE" == "0" || "$BALANCE" == "" ]]; then
  err "Wallet has 0 balance. Get testnet MON from the faucet first."
  err "Try: https://faucet.monad.xyz"
  exit 1
fi

ok "Pre-flight checks passed"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Build
# ---------------------------------------------------------------------------
log "Building contracts..."
cd "$CONTRACTS_DIR"
forge build
ok "Build successful"
echo ""

# ---------------------------------------------------------------------------
# Step 2: Deploy
# ---------------------------------------------------------------------------
log "Deploying LinkVault to Monad Testnet (chain ID 10143)..."

DEPLOY_OUTPUT=$(forge script script/DeployLinkVault.s.sol \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key "$PRIVATE_KEY" \
  --broadcast 2>&1)

echo "$DEPLOY_OUTPUT"

# Extract the deployed address from the output
# Look for either "Contract Address" or "LinkVault deployed at"
CONTRACT_ADDR=$(echo "$DEPLOY_OUTPUT" | \
  grep -iE "LinkVault|contract address" | \
  grep -oiE "0x[0-9a-fA-F]{40}" | \
  head -1 || true)

if [[ -z "$CONTRACT_ADDR" ]]; then
  err "Could not extract contract address from forge output."
  err "Check the forge script output above and update web/.env.testnet manually."
  exit 1
fi

ok "Deployed at: $CONTRACT_ADDR"
echo ""

# ---------------------------------------------------------------------------
# Step 3: Verify on Sourcify (best-effort, not blocking)
# ---------------------------------------------------------------------------
log "Verifying source on Sourcify (this may take 30s)..."
if forge verify-contract "$CONTRACT_ADDR" LinkVault \
  --chain-id 10143 \
  --verifier sourcify \
  --verifier-url https://sourcify.dev/server/ 2>&1 | grep -qi "success\|already"; then
  ok "Source verified on Sourcify"
else
  warn "Sourcify verification failed or timed out — not blocking."
  warn "You can retry later with:"
  warn "  forge verify-contract $CONTRACT_ADDR LinkVault \\"
  warn "    --chain-id 10143 --verifier sourcify \\"
  warn "    --verifier-url https://sourcify.dev/server/"
fi
echo ""

# ---------------------------------------------------------------------------
# Step 4: Update .env files
# ---------------------------------------------------------------------------
log "Updating web/.env.testnet..."
ENV_TESTNET="$WEB_DIR/.env.testnet"
if [[ -f "$ENV_TESTNET" ]]; then
  # Replace the existing address line
  sed -i.bak -E \
    "s|^NEXT_PUBLIC_LINK_VAULT_ADDRESS=.*|NEXT_PUBLIC_LINK_VAULT_ADDRESS=$CONTRACT_ADDR|" \
    "$ENV_TESTNET"
  rm -f "$ENV_TESTNET.bak"
  ok "Updated $ENV_TESTNET"
else
  warn "$ENV_TESTNET not found — skipping"
fi

log "Updating web/.env.example..."
ENV_EXAMPLE="$WEB_DIR/.env.example"
if [[ -f "$ENV_EXAMPLE" ]]; then
  sed -i.bak -E \
    "s|^NEXT_PUBLIC_LINK_VAULT_ADDRESS=.*|NEXT_PUBLIC_LINK_VAULT_ADDRESS=$CONTRACT_ADDR|" \
    "$ENV_EXAMPLE"
  rm -f "$ENV_EXAMPLE.bak"
  ok "Updated $ENV_EXAMPLE"
else
  warn "$ENV_EXAMPLE not found — skipping"
fi
echo ""

# ---------------------------------------------------------------------------
# Step 5: Print submission-ready summary
# ---------------------------------------------------------------------------
echo ""
echo "================================================================"
echo -e "${GREEN}                    DEPLOYMENT SUCCESSFUL${NC}"
echo "================================================================"
echo ""
echo "Contract address:  $CONTRACT_ADDR"
echo "Chain:             Monad Testnet (10143)"
echo "Deployer:          $WALLET_ADDR"
echo ""
echo "Monadscan URL:"
echo "  https://testnet.monadscan.com/address/$CONTRACT_ADDR"
echo ""
echo "Updated files:"
echo "  - web/.env.testnet"
echo "  - web/.env.example"
echo ""
echo -e "${YELLOW}NEXT STEPS:${NC}"
echo ""
echo "1. Test the contract is reachable:"
echo "   cast call $CONTRACT_ADDR \"nextDepositId()\" \\"
echo "     --rpc-url https://testnet-rpc.monad.xyz"
echo "   # Should return 0x01 (counter starts at 1)"
echo ""
echo "2. Deploy frontend to Vercel:"
echo "   cd web && vercel --prod"
echo "   # Set env vars in Vercel dashboard:"
echo "   #   NEXT_PUBLIC_LINK_VAULT_ADDRESS=$CONTRACT_ADDR"
echo "   #   NEXT_PUBLIC_NETWORK=testnet"
echo "   #   NEXT_PUBLIC_WC_PROJECT_ID=<your-walletconnect-id>"
echo ""
echo "3. Commit the updated .env files:"
echo "   git add web/.env.testnet web/.env.example"
echo "   git commit -m 'Update contract address to $CONTRACT_ADDR'"
echo ""
echo "4. Record your demo video. Suggested flow:"
echo "   - Connect wallet on https://your-app.vercel.app"
echo "   - Create a 1 MON link with 1 hour expiry"
echo "   - Copy the shareable URL"
echo "   - Open in incognito with a different wallet"
echo "   - Claim → show balance arrived"
echo "   - Open My Links to show tracking"
echo ""
echo "================================================================"
