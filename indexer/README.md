# MonliPay Ponder Indexer

Indexes all `LinkVault` events on Monad mainnet (and/or testnet) and exposes
an HTTP + GraphQL API consumed by the web app's "My Links" page.

This replaces the previous localStorage-based link history (which broke when
the user switched wallets — see commit history for `web/src/lib/storage.ts`).
The source of truth is now on-chain, indexed here, and served via Ponder's
SQLite (dev) or Postgres (prod) store.

## Quick start

```bash
cd indexer
pnpm install        # or npm install / yarn
pnpm dev            # starts Ponder on http://localhost:42069
```

The dev server hot-reloads when you edit `src/index.ts`, `ponder.config.ts`,
or `ponder.schema.ts`.

## Environment

Defaults point at the deployed mainnet + testnet LinkVault contracts.
Override via `.env.local` (gitignored):

```bash
# Both chains are indexed by default. Set either to "" to disable it.
PONDER_MONAD_MAINNET_VAULT=0xd7846DC6Fd8c159cF59957c532173d828f7B5BBC
PONDER_MONAD_TESTNET_VAULT=0x90978783cb701AEe7896975B43ecd37e0B4819DC

# Optional — override the public RPCs (recommended in prod for rate limits):
PONDER_RPC_MAINNET=https://rpc.monad.xyz
PONDER_RPC_TESTNET=https://testnet-rpc.monad.xyz

# Optional — Postgres for production (SQLite by default in dev):
# DATABASE_URL=postgresql://user:pass@host:5432/monlipay_indexer
```

## HTTP API

The web app uses these JSON endpoints (not GraphQL — simpler client code).

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
localStorage, except for `shareableUrl` — the link URL containing the
secret key fragment cannot be reconstructed from on-chain data (the secret
key is generated client-side and never sent to the contract). The web
create flow now warns the user to save the URL immediately.

## Deployment

This indexer is **separate from the Next.js app** — it runs as its own
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
- TypeScript-first — types flow from the ABI into the schema into the API.
- Hot-reload dev server (very fast iteration).
- Built-in GraphQL playground for ad-hoc queries.

See https://ponder.sh for full docs.
