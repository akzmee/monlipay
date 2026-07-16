# NgatMON — Send MON via link

> Send tokens on Monad as easily as sharing a WhatsApp link. Recipient clicks, funds arrive. Unclaimed? Refund anytime.

Built for the **BuildAnything "Spark"** hackathon on Monad.

## Problem

Every time you want to send crypto to a friend, you have to:
1. Ask for their wallet address
2. Copy-paste it carefully
3. Check the first and last 4 digits
4. Hope you're on the right chain

Friends without a wallet? They can't receive anything at all.

## Solution

NgatMON turns token transfers into a shareable link:

1. **Create** a link by depositing MON (or ERC-20 tokens) into the LinkVault contract
2. **Share** the link via WhatsApp, Telegram, or any messenger
3. **Claim** — the recipient opens the link, connects their wallet, and claims the funds with one click
4. **Refund** — if nobody claims before expiry, the sender takes the funds back

### How it works (technical)

The secret-based claim mechanism prevents front-running:

- Sender generates an ephemeral keypair in the browser (`crypto.getRandomValues`)
- The public address (`claimKey`) is stored on-chain; the private key goes into the URL fragment (`#`)
- The URL fragment is never sent to any server
- When claiming, the recipient signs `(depositId, recipient)` via EIP-712 typed data
- The contract verifies the signature with `ecrecover` — matching it against `claimKey`
- Since the secret never appears in calldata, mempool watchers can't front-run the claim

## Architecture

```
paymentlink/
├── contracts/           # Foundry project
│   ├── src/
│   │   └── LinkVault.sol    # Single contract: create/claim/refund
│   ├── test/
│   │   └── LinkVault.t.sol  # 33 tests (unit, edge case, fuzz)
│   └── script/
│       └── DeployLinkVault.s.sol
├── web/                 # Next.js 16 frontend
│   └── src/
│       ├── config/      # Chain + wagmi config
│       ├── lib/         # ABI, crypto utils, localStorage
│       ├── hooks/       # useCreateLink, useClaimLink, useRefundLink
│       ├── components/  # UI components (ConnectButton, CreateForm, etc.)
│       └── app/         # Pages: /, /claim, /my-links
└── .monskills           # Monskills metadata
```

### Smart Contract

**LinkVault.sol** — a single contract with three functions:

| Function | Description |
|----------|-------------|
| `createLink(token, amount, claimKey, expiry)` | Deposit tokens, register claim key |
| `claim(depositId, recipient, v, r, s)` | Claim funds with a valid signature |
| `refund(depositId)` | Sender reclaims unclaimed funds after expiry |

Security features:
- **Reentrancy guard pattern** (effects before interactions)
- **EIP-712 domain separation** (prevents cross-chain/cross-contract replay)
- **Custom errors** (gas-efficient reverts)
- **Expiry enforcement** (claim blocked at exact expiry timestamp)

### Frontend Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Web3 | wagmi + viem |
| Styling | Tailwind CSS v4 |
| Wallet | MetaMask (injected connector) |
| Hosting | Vercel |

## Quick Start

### Prerequisites

- [Foundry](https://www.getfoundry.sh/) (for smart contracts)
- Node.js 20+ (for frontend)
- MetaMask or any EVM wallet

### Deploy the contract

```bash
cd contracts
forge install  # installs forge-std + openzeppelin

# Deploy to Monad Testnet (chain ID 10143)
forge script script/DeployLinkVault.s.sol \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $YOUR_PRIVATE_KEY \
  --broadcast
```

Note the deployed contract address.

### Set up the frontend

```bash
cd web
npm install

# Set the contract address
echo "NEXT_PUBLIC_LINK_VAULT_ADDRESS=0xYOUR_DEPLOYED_ADDRESS" > .env.local

npm run dev
```

Open http://localhost:3000

### Run tests

```bash
cd contracts
forge test -vv
```

## Contract Address

- **Monad Testnet**: `0xYOUR_DEPLOYED_ADDRESS` *(update after deployment)*

## Tech Stack

- **Blockchain**: Monad (Ethereum-compatible L1, 10,000 TPS, 400ms blocks)
- **Smart Contracts**: Solidity 0.8.28 + Foundry
- **Frontend**: Next.js 16 + wagmi + viem + Tailwind CSS v4
- **Design**: Clean, accessible, dark-mode-first

## License

MIT
