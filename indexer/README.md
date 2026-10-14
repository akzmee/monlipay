# MonliPay Ponder Indexer

Indexes all `LinkVault` events on Monad mainnet (and/or testnet) and exposes
an HTTP + GraphQL API consumed by the web app's "My Links" page.

The indexer stores public payment events. Claim secrets are not onchain and cannot
be reconstructed from this API; saved links use the web app's encrypted storage.

## Quick start

```bash
cd indexer
npm ci
npm run dev            # starts Ponder on http://localhost:42069
```

The dev server hot-reloads when you edit `src/index.ts`, `ponder.config.ts`,
or `ponder.schema.ts`.

## Environment

Mainnet is enabled by default. Set a testnet vault address to index testnet too.
Override via `.env.local` (gitignored):

```bash
# Deployed LinkVault contracts. Testnet is optional.
PONDER_MONAD_MAINNET_VAULT=0xf7B6aE721d5C851A2269A675Ee43D60c3E34F9c9
PONDER_MONAD_TESTNET_VAULT=0xEB9a0BC1c7518F839B8F249E407A1AfC011E0aB3

# Optional server-only key for Alchemy RPC on both Monad networks:
ALCHEMY_API_KEY=
# An explicit RPC URL overrides the Alchemy preference.
PONDER_RPC_MAINNET=
PONDER_RPC_TESTNET=

```

Each chain automatically falls back to its public Monad RPC if the preferred
provider fails. Primary requests time out after four seconds; failed providers
are skipped for one minute before retrying. Without a key or override, only the
public RPC is used.

## HTTP API

The web app uses these JSON endpoints (not GraphQL : simpler client code).

| Endpoint                                       | Purpose                            |
| ---------------------------------------------- | ---------------------------------- |
| `GET /healthz`                                 | liveness probe                     |
| `GET /graphql`                                 | Ponder's GraphQL playground        |
| `GET /v1/links/:address`                       | All links created by `address`     |
| `GET /v1/links/:address?status=active`         | Active links only                  |
| `GET /v1/links/:address?status=refunded`       | Refunded links only                |
| `GET /v1/links/:address/expired`               | Active + past expiry (auto-refund) |
| `GET /v1/links/:address?limit=50&offset=0`     | Paginated                          |
| `GET /v1/stats/:address`                       | Counts by status                   |

All bigint fields (`depositId`, `amount`, `expiry`) are returned as strings
because JSON has no native bigint. The client wraps them with `BigInt()`.

## Indexing model

| Event          | Table mutation                                            |
| -------------- | --------------------------------------------------------- |
| `LinkCreated`  | INSERT row in `links` with status `active`                |
| `LinkClaimed`  | UPDATE `links` → status `claimed`, set `recipient`        |
| `LinkRefunded` | UPDATE `links` → status `refunded`                        |
| `RefundFailed` | UPDATE `links` → status `refund_failed` (recoverable)     |

The `links` table mirrors what the frontend previously stored in
localStorage, except for `shareableUrl` : the link URL containing the
secret key fragment cannot be reconstructed from on-chain data (the secret
key is generated client-side and never sent to the contract). The web
create flow now warns the user to save the URL immediately.

## Deployment

This indexer is **separate from the Next.js app** : it runs as its own
process, ideally on a long-running VM (not Vercel serverless, because
Ponder keeps an in-memory event queue).

Suggested setup:

```bash
# Production (VPS or Docker)
pnpm build
pnpm start           # serves on port 42069 (override with PORT=...)
```

Configure the web app to point at the indexer:

```
# web/.env.local
NEXT_PUBLIC_INDEXER_URL=https://indexer.monlipay.xyz
```

## Why Ponder

- Ponder was acquired by the Monad Foundation and is the recommended
  indexer for Monad.
- TypeScript-first : types flow from the ABI into the schema into the API.
- Hot-reload dev server (very fast iteration).
- Built-in GraphQL playground for ad-hoc queries.

See https://ponder.sh for full docs.
