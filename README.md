# MonliPay

Send MON or tokens through a link. Fund it, share it in a chat, and let the recipient claim to their wallet.

[Live app](https://monlipay.xyz) · [Testnet](https://testnet.monlipay.xyz) · [Demo with audio](https://monlipay.xyz/demo)

## Payment modes

- **Payment Link:** one amount for one recipient. The claim secret stays in the URL fragment. Expired, unclaimed funds can be refunded.
- **Group Payment:** one pool for multiple recipients. Equal amounts are the default: 100 USDC across 10 slots pays 10 USDC per wallet. Random amounts use Pyth Entropy. Access can be open to anyone or restricted to selected wallets, with one share per wallet.
- **Private Payment:** optional AnomaPay beta transfers on Monad mainnet. Transfers inside the pool are shielded; deposits and withdrawals remain public.

My Links tracks payments and opens saved links using a passkey. Contacts let senders reuse wallet addresses. The token picker supports MON and ERC-20 tokens, including custom token addresses.

Public payments require a wallet and MON for network gas. Random Group Payments also have an oracle fee. Gas sponsorship is disabled. A wallet limit does not verify unique people.

Group pools have a fixed amount, recipient quota and expiry. They cannot be topped up or reused. Equal pools must divide exactly in token base units. Unclaimed funds are refundable after expiry; pending Random draws have a one-hour grace period, and assigned shares remain collectable.

## Try it

1. Open the [testnet app](https://testnet.monlipay.xyz) and connect a Monad testnet wallet funded with test MON.
2. Choose Payment Link or Group Payment. Select a token, amount and expiry. ERC-20 funding may require an approval transaction.
3. Fund the link and send its URL to the recipient.
4. Open the link in another wallet and claim. My Links shows the updated status.

The [1:48 demo](https://monlipay.xyz/demo) shows a live Equal Group Payment with English narration, music and captions. It uses a test token with no monetary value. Private Payment in the video is an interface overview.

## How it works

Payment Links use an ephemeral browser-generated key. Its public address goes into LinkVault; its private key stays in the URL fragment, which is omitted from ordinary HTTP requests. The recipient signs the deposit and destination with that key. An EIP-712 signature binds the claim to the recipient, chain and contract.

Equal Group Payments settle each fixed share directly through GroupVault. Random Group Payments use LuckyVault: request a Pyth draw, wait for the result, then collect the assigned amount. Existing Lucky URLs remain supported.

Saved link secrets and private payment records are encrypted in the browser. Wallet signatures control access to stored ciphertext; a passkey opens the encryption key. MonliPay cannot reset a lost passkey. Public payment activity remains visible onchain.

Private Payment uses a separate bearer account inside AnomaPay. Anyone holding the complete private link, including the sender, can spend its unclaimed balance. First successful spend wins; private links have no expiry or automatic refund. Proving services receive witness details, and timing or amounts can correlate public deposits and withdrawals. See the [privacy page](https://monlipay.xyz/privacy) and [integration README](integrations/anoma/README.md). There is no independent security audit.

## Contracts

| Network | Chain ID | LinkVault | GroupVault |
| --- | --- | --- | --- |
| Monad mainnet | 143 | `0xd7846DC6Fd8c159cF59957c532173d828f7B5BBC` | `0x9a313800032e81d5bd0f89099912def7e8915c86` |
| Monad testnet | 10143 | `0x90978783cb701AEe7896975B43ecd37e0B4819DC` | `0x0e767de29c64e3a283a02c211aabbcd498a3ff86` |

LuckyVault V2 is `0xa52e018765b266dbf9743cd11d126338d018ee47` on both networks. Deployment addresses and verification receipts are in [contracts/deployments](contracts/deployments).

## Development

Requires Node.js 22.13 or later. Contract development also requires Foundry.

```sh
cd web
npm ci
cp .env.testnet .env.local
npm run dev
```

Open `http://localhost:3000`. Set a Reown project ID in `NEXT_PUBLIC_WC_PROJECT_ID` and allow your local origin in the project's settings for WalletConnect support. Configure `NEXT_PUBLIC_GROUP_VAULT_ADDRESS` and `NEXT_PUBLIC_LUCKY_VAULT_ADDRESS` for the selected network.

The frontend uses Next.js 16, React, wagmi, viem and RainbowKit. Contacts and encrypted records need persistent writable storage. The Ponder indexer provides Payment Link history; see [indexer/README.md](indexer/README.md) for its API and configuration.

```sh
# Web tests and production build
cd web
npm test
npm run build

# Contracts, from the repository root
bash scripts/install-contract-deps.sh
cd contracts
forge test

# Private payment integration, from the repository root
cd integrations/anoma
npm ci --ignore-scripts
npm test
```

Deployment instructions are in [DEPLOY-VPS.md](DEPLOY-VPS.md). Keep credentials and runtime databases outside Git.

## Repository

| Directory | Contents |
| --- | --- |
| `contracts/` | Solidity vaults, deployment scripts and Foundry tests |
| `web/` | Next.js app, API routes and product assets |
| `indexer/` | Ponder event indexing and HTTP API |
| `integrations/anoma/` | Private payment adapter and integration tests |
| `deploy/` | Reverse proxy configuration and deployment helpers |

## Metropolis scope

MonliPay predates Metropolis. Commit `5544bf7` contains the existing payment-link product, bridge and indexer. Metropolis work adds Group Payments, optional AnomaPay Private Payment, contacts, passkey-encrypted history and the revised interface.

## License

MIT
