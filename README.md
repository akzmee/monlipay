# NgatMON — Send MON via link

> Send tokens on Monad as easily as sharing a WhatsApp link. Recipient clicks, funds arrive. Unclaimed? Refund anytime.

Built for the **BuildAnything "Spark"** hackathon on Monad.

---

## Problem

Every time you want to send crypto to a friend, you have to:

1. Ask for their wallet address
2. Copy-paste it carefully
3. Check the first and last 4 digits
4. Hope you're on the right chain

Friends without a wallet? They can't receive anything at all.

## Solution

NgatMON turns token transfers into a shareable link:

1. **Create** — deposit MON (or any ERC-20) into the LinkVault contract
2. **Share** — send the link via WhatsApp, Telegram, or any messenger
3. **Claim** — recipient opens the link, connects their wallet, claims with one click
4. **Refund** — if nobody claims before expiry, the sender takes the funds back

No address swapping. No chain confusion. One link is all you need.

---

## How It Works

### Secret-based claim (front-run resistant)

The core trick: the sender generates an **ephemeral keypair** in the browser using `crypto.getRandomValues`. The public address (`claimKey`) goes on-chain; the private key (the "secret") goes into the URL **fragment** (`#`).

```
https://ngatmon.app/claim#sec=0xabc123...
                      └──────────────────┘
                      URL fragment — never sent to any server
```

When the recipient claims, their browser signs `(depositId, recipient)` via **EIP-712 typed data** with the secret key. The contract verifies the signature with `ecrecover` against `claimKey`.

Since the secret never appears in calldata, mempool watchers **cannot** front-run the claim transaction.

### Flow diagram

```
SENDER                                          RECIPIENT
  │                                                │
  │  1. Generate ephemeral keypair                 │
  │  2. createLink(token, amount, claimKey, exp)   │
  │  ──────────────► CONTRACT                      │
  │                    stores deposit              │
  │  3. Share link via WhatsApp                    │
  │  ──────────────────────────────────────────────►│
  │                                                │  4. Open link
  │                                                │  5. sign(depositId, addr) with secret
  │                                                │  6. claim(depositId, addr, v, r, s)
  │                                                │  ──────────────► CONTRACT
  │                                                │                    ecrecover → matches claimKey
  │                                                │                    transfer funds to recipient
  │                                                │  ◄─── MON received ──│
  │                                                │
  │  If unclaimed after expiry:                    │
  │  7. refund(depositId)                          │
  │  ──────────────► CONTRACT                      │
  │                    return funds to sender      │
```

---

## Smart Contract — LinkVault.sol

A single contract with three core functions:

| Function | Description |
|---|---|
| `createLink(token, amount, claimKey, expiry)` | Deposit tokens (MON native or ERC-20), register claim key |
| `claim(depositId, recipient, v, r, s)` | Claim funds with a valid EIP-712 signature |
| `refund(depositId)` | Sender reclaims unclaimed funds after expiry |

### Security features

- **`ReentrancyGuardTransient`** — uses Cancun `tstore`/`tload` opcodes (zero storage cost reentrancy protection)
- **`SafeERC20`** — handles non-standard tokens like USDT that don't return a bool
- **EIP-712 domain separation** — prevents cross-chain and cross-contract signature replay
- **EIP-2 s-value malleability check** — rejects high-order s-values and invalid v to prevent signature replay
- **Effects-before-interactions** — state updated before external transfers
- **Custom errors** — gas-efficient reverts (no string storage)

### Contract address

**Monad Testnet (Chain ID 10143):** [`0xEB9a0BC1c7518F839B8F249E407A1AfC011E0aB3`](https://testnet.monadscan.com/address/0xEB9a0BC1c7518F839B8F249E407A1AfC011E0aB3)

Verified on Sourcify: `exact_match`

---

## Frontend

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Web3 | wagmi v2 + viem v2 |
| Wallet UI | RainbowKit v2 (popup modal, MetaMask, WalletConnect, etc.) |
| Styling | Tailwind CSS v4 |
| Dark mode | next-themes (system / light / dark toggle) |
| Testing | Vitest + Testing Library (180 tests) |
| Hosting | Vercel |

### Pages

- **`/`** — Create a payment link (select token, amount, expiry → get shareable URL)
- **`/claim`** — Claim a payment link (parse secret from URL hash → sign → claim)
- **`/my-links`** — Track created links and refund expired ones

### Features

- **RainbowKit wallet modal** — branded popup with MetaMask, WalletConnect, Coinbase, and more
- **Dark mode** — system-aware with manual toggle (sun/moon icon)
- **Wrong-chain guard** — detects when wallet is on the wrong network and prompts switch
- **WhatsApp share** — one-click share with pre-filled message
- **Link status from chain** — all statuses (pending, claimed, expired, refunded) read from on-chain state

---

## Project Structure

```
paymentlink/
├── contracts/                      # Foundry project
│   ├── src/
│   │   └── LinkVault.sol           # Core contract: create / claim / refund
│   ├── test/
│   │   ├── LinkVault.t.sol         # 33 unit tests (create, claim, refund, edge cases)
│   │   ├── LinkVaultCoverage.t.sol # 15 coverage tests (revert paths)
│   │   ├── LinkVaultSecurity.t.sol # 11 security tests (malleability, reentrancy)
│   │   └── mocks/
│   │       ├── MaliciousERC20.sol  # Reentrancy-attacking token
│   │       └── MockNonStandardERC20.sol  # USDT-style (no bool return)
│   ├── script/
│   │   └── DeployLinkVault.s.sol
│   └── foundry.toml
├── web/                            # Next.js 16 frontend
│   └── src/
│       ├── app/                    # Pages: /, /claim, /my-links
│       ├── components/             # ConnectButton, CreateForm, ClaimForm, etc.
│       ├── config/                 # Chain config + wagmi config
│       ├── hooks/                  # useCreateLink, useClaimLink, useRefundLink
│       ├── lib/                    # ABI, crypto (EIP-712), localStorage
│       └── test/                   # Vitest setup
└── README.md
```

---

## Quick Start

### Prerequisites

- [Foundry](https://www.getfoundry.sh/) (smart contract development)
- Node.js 20+ (frontend)
- MetaMask or any EVM wallet

### 1. Deploy the contract

```bash
cd contracts
forge install

# Deploy to Monad Testnet
forge script script/DeployLinkVault.s.sol \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $YOUR_PRIVATE_KEY \
  --broadcast
```

Note the deployed contract address.

### 2. Set up the frontend

```bash
cd web
npm install

# Configure environment
cat > .env.local << 'EOF'
NEXT_PUBLIC_LINK_VAULT_ADDRESS=0xEB9a0BC1c7518F839B8F249E407A1AfC011E0aB3
NEXT_PUBLIC_WC_PROJECT_ID=your_walletconnect_project_id
EOF

npm run dev
```

Open http://localhost:3000

> Get a free WalletConnect project ID at [cloud.walletconnect.com](https://cloud.walletconnect.com).

### 3. Run tests

```bash
# Smart contract tests (59 tests)
cd contracts
forge test -vv

# Frontend tests (180 tests)
cd web
npm test
```

---

## Testing

### Smart Contracts — 59 tests

| Suite | Tests | Coverage |
|---|---|---|
| `LinkVault.t.sol` | 33 | Core flows: create, claim, refund, double-claim, expiry, fuzz |
| `LinkVaultCoverage.t.sol` | 15 | All revert paths and error conditions |
| `LinkVaultSecurity.t.sol` | 11 | Signature malleability, reentrancy (native + ERC-20), non-standard tokens |

### Frontend — 180 tests

Covers all components, hooks, config, and utility libraries. Includes tests for:
- RainbowKit ConnectButton (disconnected, connected, wrong-chain states)
- ThemeToggle (dark/light mode switching, hydration safety)
- Providers (nested provider tree verification)
- Create/Claim/Refund flows
- Crypto utilities (keypair generation, EIP-712 signing)
- Storage (localStorage link persistence)

---

## Tech Stack

- **Blockchain:** Monad — Ethereum-compatible L1, 10,000 TPS, 400ms blocks
- **Smart Contracts:** Solidity 0.8.28 + Foundry
- **Frontend:** Next.js 16 + wagmi v2 + viem v2 + RainbowKit v2
- **Styling:** Tailwind CSS v4 + next-themes (dark mode)
- **Testing:** Foundry (contracts) + Vitest (frontend)

## License

MIT
