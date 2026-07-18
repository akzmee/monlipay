#!/usr/bin/env bash
# ============================================================================
# deploy-mainnet.sh — One-command deploy for MonliPay to Monad Mainnet
# ============================================================================
# This script:
#   1. Deploys LinkVault V2 + ERC2771Forwarder to Monad Mainnet
#   2. Waits for the deployment tx to be confirmed
#   3. Best-effort source verification on Monadscan (Blockscout API)
#   4. Updates web/.env.example with the new vault address
#   5. Prints the Monadscan URL and next-step instructions
#
# PREREQUISITES:
#   - Foundry installed (forge, cast)
#   - A funded wallet on Monad Mainnet with real MON for gas
#   - Your private key exported as an env var:
#       export PRIVATE_KEY=0xabc...
#
# USAGE:
#   chmod +x scripts/deploy-mainnet.sh
#   ./scripts/deploy-mainnet.sh
#
# WARNING: This deploys to MAINNET with REAL value. Gas costs are real.
# Make sure you have enough MON for the deployment (~0.01 MON should be plenty).
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

RPC_URL="https://rpc.monad.xyz"
CHAIN_ID=143
MONADSCAN_URL="https://monadscan.com"

log "MonliPay — Monad Mainnet deployment"
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
  err "Make sure the wallet has real MON for gas on mainnet."
  exit 1
fi

# Validate key format
if [[ ! "$PRIVATE_KEY" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
  err "PRIVATE_KEY must be a 0x-prefixed 32-byte hex string."
  exit 1
fi

# Check wallet balance
log "Checking wallet balance on mainnet..."
WALLET_ADDR=$(cast wallet address "$PRIVATE_KEY" 2>/dev/null || true)
if [[ -z "$WALLET_ADDR" ]]; then
  err "Could not derive wallet address from PRIVATE_KEY."
  exit 1
fi

BALANCE=$(cast balance --rpc-url "$RPC_URL" "$WALLET_ADDR" 2>/dev/null || echo "0")
BALANCE_MON=$(echo "scale=6; $BALANCE / 1000000000000000000" | bc 2>/dev/null || echo "?")
log "Wallet: $WALLET_ADDR"
log "Balance: $BALANCE_MON MON"

if [[ "$BALANCE" == "0" || "$BALANCE" == "" ]]; then
  err "Wallet has 0 balance on mainnet. Acquire real MON before deploying."
  err "Deploying LinkVault + ERC2771Forwarder typically costs ~0.005-0.02 MON."
  exit 1
fi

ok "Pre-flight checks passed"
echo ""

# ---------------------------------------------------------------------------
# Confirmation prompt — this is REAL mainnet
# ---------------------------------------------------------------------------
echo -e "${YELLOW}================================================================${NC}"
echo -e "${YELLOW}WARNING: You are about to deploy to MONAD MAINNET (chain $CHAIN_ID).${NC}"
echo -e "${YELLOW}This transaction uses real MON and cannot be undone.${NC}"
echo -e "${YELLOW}================================================================${NC}"
echo ""
read -r -p "Type 'yes' to continue: " CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
  log "Aborted by user."
  exit 0
fi
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
# Step 2: Deploy LinkVault V2 + ERC2771Forwarder
# ---------------------------------------------------------------------------
log "Deploying LinkVault + ERC2771Forwarder to Monad Mainnet (chain ID $CHAIN_ID)..."

DEPLOY_OUTPUT=$(forge script script/DeployLinkVault.s.sol \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast \
  --chain-id "$CHAIN_ID" 2>&1)

echo "$DEPLOY_OUTPUT"
echo ""

# Extract contract addresses from the output.
# The forge script logs:
#   "LinkVault deployed at: 0x..."
#   "ERC2771Forwarder deployed at: 0x..."
VAULT_ADDR=$(echo "$DEPLOY_OUTPUT" | \
  grep -i "LinkVault deployed at:" | \
  grep -oiE "0x[0-9a-fA-F]{40}" | head -1 || true)

FORWARDER_ADDR=$(echo "$DEPLOY_OUTPUT" | \
  grep -i "ERC2771Forwarder deployed at:" | \
  grep -oiE "0x[0-9a-fA-F]{40}" | head -1 || true)

if [[ -z "$VAULT_ADDR" ]]; then
  err "Could not extract LinkVault address from forge output."
  err "Update web/.env.example manually with the address from the output above."
  exit 1
fi

ok "LinkVault deployed at: $VAULT_ADDR"
if [[ -n "$FORWARDER_ADDR" ]]; then
  ok "ERC2771Forwarder deployed at: $FORWARDER_ADDR"
fi
echo ""

# ---------------------------------------------------------------------------
# Step 3: Verify source on Monadscan (best-effort, not blocking)
# ---------------------------------------------------------------------------
log "Verifying source on Monadscan (Blockscout-compatible API)..."
log "This may take 30-60s..."

# Try Blockscout-compatible verifier (Monadscan uses Blockscout under the hood)
VAULT_VERIFY=$(forge verify-contract "$VAULT_ADDR" \
  src/LinkVault.sol:LinkVault \
  --chain-id "$CHAIN_ID" \
  --verifier blockscout \
  --verifier-url "$MONADSCAN_URL/api" 2>&1 || true)

if echo "$VAULT_VERIFY" | grep -qi "success\|already\|pending"; then
  ok "LinkVault source verified on Monadscan"
else
  warn "LinkVault verification pending or failed — not blocking."
  warn "You can retry later:"
  warn "  forge verify-contract $VAULT_ADDR \\"
  warn "    src/LinkVault.sol:LinkVault \\"
  warn "    --chain-id $CHAIN_ID \\"
  warn "    --verifier blockscout \\"
  warn "    --verifier-url $MONADSCAN_URL/api"
fi

if [[ -n "$FORWARDER_ADDR" ]]; then
  log "Verifying ERC2771Forwarder..."
  FORWARDER_VERIFY=$(forge verify-contract "$FORWARDER_ADDR" \
    "src/../../lib/openzeppelin-contracts/contracts/metatx/ERC2771Forwarder.sol:ERC2771Forwarder" \
    --constructor-args "MonliPay LinkVault" \
    --chain-id "$CHAIN_ID" \
    --verifier blockscout \
    --verifier-url "$MONADSCAN_URL/api" 2>&1 || true)
  if echo "$FORWARDER_VERIFY" | grep -qi "success\|already\|pending"; then
    ok "ERC2771Forwarder source verified on Monadscan"
  else
    warn "ERC2771Forwarder verification skipped/failed — not blocking."
  fi
fi
echo ""

# ---------------------------------------------------------------------------
# Step 4: Sanity-check on-chain read
# ---------------------------------------------------------------------------
log "Sanity check: reading nextDepositId()..."
NEXT_ID=$(cast call "$VAULT_ADDR" "nextDepositId()" --rpc-url "$RPC_URL" 2>/dev/null || true)
if [[ -n "$NEXT_ID" ]]; then
  ok "nextDepositId() returned $NEXT_ID (expected 0x01 — counter starts at 1)"
else
  warn "Could not read nextDepositId() — contract may still be syncing."
fi
echo ""

# ---------------------------------------------------------------------------
# Step 5: Update .env.example (mainnet branch)
# ---------------------------------------------------------------------------
log "Updating web/.env.example..."
ENV_EXAMPLE="$WEB_DIR/.env.example"
if [[ -f "$ENV_EXAMPLE" ]]; then
  # Replace the existing address line
  sed -i.bak -E \
    "s|^NEXT_PUBLIC_LINK_VAULT_ADDRESS=.*|NEXT_PUBLIC_LINK_VAULT_ADDRESS=$VAULT_ADDR|" \
    "$ENV_EXAMPLE"
  rm -f "$ENV_EXAMPLE.bak"
  ok "Updated $ENV_EXAMPLE with new vault address"
else
  warn "$ENV_EXAMPLE not found — skipping"
fi
echo ""

# ---------------------------------------------------------------------------
# Step 6: Print summary
# ---------------------------------------------------------------------------
echo ""
echo "================================================================"
echo -e "${GREEN}                MAINNET DEPLOYMENT SUCCESSFUL${NC}"
echo "================================================================"
echo ""
echo "LinkVault:         $VAULT_ADDR"
if [[ -n "$FORWARDER_ADDR" ]]; then
  echo "ERC2771Forwarder:  $FORWARDER_ADDR"
fi
echo "Chain:             Monad Mainnet ($CHAIN_ID)"
echo "Deployer:          $WALLET_ADDR"
echo ""
echo "Monadscan:"
echo "  $MONADSCAN_URL/address/$VAULT_ADDR"
if [[ -n "$FORWARDER_ADDR" ]]; then
  echo "  $MONADSCAN_URL/address/$FORWARDER_ADDR"
fi
echo ""
echo "Updated files:"
echo "  - web/.env.example (vault address)"
echo ""
echo -e "${YELLOW}NEXT STEPS:${NC}"
echo ""
echo "1. Commit the updated .env.example:"
echo "   cd $REPO_DIR"
echo "   git add web/.env.example"
echo "   git commit -m 'Update mainnet LinkVault V2 address: $VAULT_ADDR'"
echo "   git push origin main"
echo ""
echo "2. Set the new env vars in your production hosting (Vercel/Docker):"
echo "   NEXT_PUBLIC_LINK_VAULT_ADDRESS=$VAULT_ADDR"
if [[ -n "$FORWARDER_ADDR" ]]; then
  echo "   # Optional — only needed when you activate the gas sponsor:"
  echo "   # NEXT_PUBLIC_LINK_VAULT_FORWARDER_ADDRESS=$FORWARDER_ADDR"
fi
echo "   NEXT_PUBLIC_NETWORK=mainnet"
echo "   NEXT_PUBLIC_WC_PROJECT_ID=<your-walletconnect-id>"
echo ""
if [[ -n "$FORWARDER_ADDR" ]]; then
  echo "3. To ACTIVATE gasless claims later, also set (server-side only):"
  echo "   GAS_SPONSOR_ENABLED=true"
  echo "   GAS_SPONSOR_FORWARDER_ADDRESS=$FORWARDER_ADDR"
  echo "   GAS_SPONSOR_RELAYER_PRIVATE_KEY=<funded relayer key>"
  echo "   GAS_SPONSOR_DAILY_BUDGET_MON=0.5"
  echo "   # Fund the relayer wallet with MON to cover sponsored gas."
  echo ""
fi
echo "================================================================"
