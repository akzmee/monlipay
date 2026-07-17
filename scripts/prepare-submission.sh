#!/usr/bin/env bash
# ============================================================================
# prepare-submission.sh — Print hackathon submission details from current repo
# ============================================================================
# Run this AFTER deploy-testnet.sh and AFTER `vercel --prod`.
# It reads the deployed contract address and prints a ready-to-paste block
# for the hackathon submission form.
#
# USAGE:
#   ./scripts/prepare-submission.sh <your-production-url>
#
# EXAMPLE:
#   ./scripts/prepare-submission.sh https://monlipay.vercel.app
#
# ============================================================================
set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_DIR/web/.env.testnet"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE not found. Run deploy-testnet.sh first." >&2
  exit 1
fi

# Extract contract address
CONTRACT_ADDR=$(grep -E "^NEXT_PUBLIC_LINK_VAULT_ADDRESS=" "$ENV_FILE" | \
  cut -d= -f2- | tr -d '"' || true)

if [[ -z "$CONTRACT_ADDR" || "$CONTRACT_ADDR" == "0x0000000000000000000000000000000000000000" ]]; then
  echo "Error: No valid contract address in $ENV_FILE." >&2
  echo "Run deploy-testnet.sh first." >&2
  exit 1
fi

# Get production URL from arg or prompt
PROD_URL="${1:-}"
if [[ -z "$PROD_URL" ]]; then
  echo -n "Paste your Vercel production URL (e.g. https://monlipay.vercel.app): "
  read -r PROD_URL
fi

# Strip trailing slash
PROD_URL="${PROD_URL%/}"

# Validate URL
if [[ ! "$PROD_URL" =~ ^https?:// ]]; then
  echo "Error: invalid URL: $PROD_URL" >&2
  exit 1
fi

# Get git remote
GIT_REMOTE=$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null || echo "")
GITHUB_URL="${GIT_REMOTE%.git}"
GITHUB_URL="${GITHUB_URL/git@github.com:/https://github.com/}"

# ============================================================================
echo ""
echo "================================================================"
echo -e "${GREEN}       HACKATHON SUBMISSION — READY TO PASTE${NC}"
echo "================================================================"
echo ""
echo "Copy the fields below into the BuildAnything submission form:"
echo ""
echo "----------------------------------------------------------------"
echo "Name:"
echo "MonliPay"
echo ""
echo "----------------------------------------------------------------"
echo "Description:"
echo "Send MON on Monad via a shareable link. Recipient clicks, funds arrive. Unclaimed funds auto-refund."
echo ""
echo "----------------------------------------------------------------"
echo "Problem:"
echo "Sending crypto to a friend means asking for their wallet address, copying"
echo "it carefully, and double-checking the first/last 4 digits. Friends without"
echo "a wallet are excluded entirely. Address swapping is tedious and error-prone."
echo ""
echo "----------------------------------------------------------------"
echo "Solution:"
echo "MonliPay turns token transfers into a shareable link. The sender deposits"
echo "MON (or any ERC-20) into the LinkVault contract; an ephemeral keypair is"
echo "generated in the browser and the private key is embedded in the URL"
echo "fragment (#) so it never touches a server. The recipient opens the link,"
echo "connects their wallet, and signs an EIP-712 claim — the contract verifies"
echo "the signature via ecrecover and releases the funds. If nobody claims"
echo "before the expiry, the funds auto-refund to the sender the next time they"
echo "open 'My Links'. Front-running is impossible because the secret never"
echo "appears in calldata."
echo ""
echo "----------------------------------------------------------------"
echo "Project URL:"
echo "$PROD_URL"
echo ""
echo "----------------------------------------------------------------"
echo "Github repo:"
echo "$GITHUB_URL"
echo ""
echo "----------------------------------------------------------------"
echo "Category:"
echo "Testnet"
echo ""
echo "----------------------------------------------------------------"
echo "Contract address:"
echo "$CONTRACT_ADDR"
echo ""
echo "Monadscan:"
echo "https://testnet.monadscan.com/address/$CONTRACT_ADDR"
echo ""
echo "----------------------------------------------------------------"
echo "Demo video:"
echo "<paste your YouTube/loom/streamable URL here>"
echo ""
echo "----------------------------------------------------------------"
echo "Post URL (social media — required for Most Viral Solution prize):"
echo "<paste your tweet/X post URL here>"
echo ""
echo "================================================================"
echo ""
echo -e "${YELLOW}CHECKLIST BEFORE SUBMITTING:${NC}"
echo "  [ ] Demo video uploaded and URL pasted above"
echo "  [ ] Social media post published and URL pasted above"
echo "  [ ] Repository is PUBLIC on GitHub"
echo "  [ ] git push origin testnet (or main) — judges need to see commits"
echo "  [ ] Test the live app end-to-end one more time"
echo "  [ ] Verify contract on Monadscan shows 'Source Code' tab"
echo ""
