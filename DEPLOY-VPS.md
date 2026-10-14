# Self-hosting MonliPay

The Compose stack runs a Ponder indexer and separate Next.js instances for mainnet and testnet. Use a server with Docker Compose and an HTTPS reverse proxy.

## Configure

```sh
cp .env.deploy.example .env
mkdir -p public-artifacts
```

Edit `.env` with the network contract addresses, Reown project ID and the server API keys needed by your deployment. Set `MAINNET_APP_ORIGIN` and `TESTNET_APP_ORIGIN` to the exact public origins. Add those origins to the Reown project allowlist.

The checked-in example leaves Group and Lucky addresses at zero. Copy the matching addresses from `contracts/deployments/143/` and `contracts/deployments/10143/` before building. `NEXT_PUBLIC_*` values are compiled into the frontend; changing them requires a rebuild.

Keep `.env` private. The Venice key used to produce the demo is not needed to run the app.

For email onboarding, set `NEXT_PUBLIC_PRIVY_APP_ID`, enable email login in Privy, and allow both app origins in its dashboard. User transactions and wallet export require no server-side Privy secret. Set `ENVIO_API_TOKEN` for Group Payment activity. Both values are optional for self-hosting; without Privy the app uses its existing wallet connectors, and without Envio payments remain usable while activity is unavailable.

## Build and start

```sh
docker compose --env-file .env config --quiet
docker compose --env-file .env build
docker compose --env-file .env up -d --wait
docker compose --env-file .env ps
```

| Service | Host port | Container port |
| --- | --- | --- |
| Mainnet app | 4100 | 3000 |
| Testnet app | 3100 | 3000 |
| Indexer | 42068 | 42069 |

The current Compose ports bind to all host interfaces. Use firewall rules or adjust the bindings for your reverse proxy setup. Serve the apps over HTTPS; passkeys require a secure origin. Proxy examples are in `deploy/nginx/` and `deploy/caddy/`.

The apps reach the indexer through `INDEXER_INTERNAL_URL=http://indexer:42069`. Set `ALCHEMY_API_KEY` to prefer Alchemy for Monad mainnet and testnet indexing and bridge balance scans. Leave `PONDER_RPC_MAINNET` and `PONDER_RPC_TESTNET` blank for this default, or set explicit provider URLs to override it. Both indexer chains and bridge balance scans fall back to their public RPC when the preferred provider fails, with a four-second primary timeout and a one-minute cooldown before retrying it. Keys remain server-side. Changing a key requires recreating the affected containers, not rebuilding images; preserve the data directory and schema.

For Nginx Proxy Manager, add this to the Advanced configuration of the two MonliPay hosts. It prevents Cloudflare from injecting analytics into payment pages and preserves API and asset cache headers. The `headers-more` module is included in Nginx Proxy Manager.

```nginx
more_set_headers -t "text/html" "Cache-Control: private, no-cache, no-store, must-revalidate, no-transform";
```

## Persistent data

`mainnet-contacts` and `testnet-contacts` hold the contacts and encrypted-record SQLite databases. Preserve those named volumes across updates. The indexer stores its data under `indexer/.ponder`.

Create a consistent snapshot before replacing containers:

```sh
python3 scripts/backup-private-data.py --destination /path/to/private-backups
```

The destination must be private and outside the public web root. Backups contain contacts, metadata and encrypted records. They do not replace a user's passkey.

`public-artifacts/` is an optional read-only mount under `/submission/`. Leave it empty unless you deliberately want to publish files there.

## Update

```sh
git pull --ff-only
docker compose --env-file .env build monlipay-mainnet monlipay-testnet
docker compose --env-file .env up -d --no-deps --wait monlipay-mainnet monlipay-testnet
```

Retain the previous image IDs and database snapshot for rollback. Check container health, create/claim routes and saved-record access after an update. Avoid `docker compose down -v`, which removes the application's persistent volumes.
