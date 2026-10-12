# VPS deployment — 2026-10-12

Updated the existing checkout at `/home/clawuser/monlipay` on `clawuser@168.110.205.224` from the local Metropolis workspace. This release includes uncommitted workspace changes; it is not a new GitHub commit.

| Service | Public origin / endpoint | Host port |
| --- | --- | --- |
| Mainnet web | https://monlipay.xyz | 4100 |
| Testnet web | https://testnet.monlipay.xyz | 3100 |
| Ponder indexer | `/indexer/healthz` and `/indexer/v1/...` through either web origin | 42068 |

Both public sites initially returned 502 and no MonliPay containers or images were present. The existing Nginx Proxy Manager routes and TLS setup were retained. The three containers now pass health checks. The web health probe uses `127.0.0.1`, matching the IPv4 listener; Alpine's `localhost` resolved to an unbound IPv6 address.

## Configuration and data

- Compose explicitly uses the existing `.env`. The separate `.env.deploy` had a stale mainnet address and was not substituted. Both files have mode 600. No server API keys or private keys were copied into the local project.
- The existing Reown project ID and LinkVault addresses were retained. The configured vaults returned contract bytecode on their respective networks. The wallet fix and QR dependency override are described in [Lucky Links notes](lucky-links.md#wallet-connection-configuration).
- Each web service has an exact `APP_ORIGIN` and a separate persistent contacts volume: `monlipay_mainnet-contacts` and `monlipay_testnet-contacts`. Both databases are writable by the application user. Do not run `docker compose down -v` during an update.
- The existing indexer directory is mounted at `/app/.ponder`. Inspection of a stopped database copy found zero rows in the old `monlipay.links` table. Ponder rejected its old build identity, so the new instance uses `PONDER_DATABASE_SCHEMA=monlipay_metropolis_20261012`. The previous schema and data remain intact; no schema was dropped or metadata forced. Ponder is indexing new mainnet and testnet blocks. The inherited `startBlock: "latest"` configuration does not backfill historical links.
- The existing PGlite backend remains in place. This update does not migrate the indexer to PostgreSQL, which [Ponder recommends for production](https://ponder.sh/docs/database).
- The effective environment has no gas sponsor private key. Sponsorship was not activated using a key from the stale alternative file. Claims must retain the existing wallet-paid fallback.

The pre-update code, configuration, and indexer snapshot are in `/home/clawuser/backups/monlipay-20261012-115544/before-update.tar.gz`. This backup predates the update; it is not a previously verified working container image. Build logs and a verified release manifest are stored in the same private backup directory.

## Initial VPS verification

- Production builds completed for both networks. All three services became healthy with zero restart counts after the fixes.
- Public `/`, `/create`, `/create/lucky`, and `/contacts` returned HTTP 200 on both domains. The indexer health and stats endpoints also returned HTTP 200 through both frontends.
- Both public WalletConnect modals displayed pairing QR codes. Reown config returned HTTP 200, with no captured JavaScript page errors or failed wallet-service responses. These checks did not pair a real wallet or send a transaction.
- Both Create routes selected Payment link by default and showed the correct network. The Lucky option opened its form with the unavailable-funding notice. The testnet Create page had no horizontal overflow at 390 pixels.
- Both public contacts APIs passed a smoke test using real SIWE signatures from temporary test accounts: create/read/delete, account isolation, cross-origin rejection, logout, and challenge replay rejection. The test contacts were removed.
- The Chrome automatic-workspace endpoint returned HTTP 204 locally and on both public origins.
- The browser still reports a blocked Cloudflare analytics beacon under the existing script policy and unused font preload warnings. These are separate from the resolved Reown 403 and QR crash; no blanket allowance for external scripts was added.
- Before deployment, 86 relevant web tests, TypeScript, scoped ESLint, shell syntax validation, and Compose configuration validation passed.

At the end of the initial VPS update, Lucky Link forms were deployed with funding disabled. No public-chain transactions were performed in that phase. The user subsequently authorized both network deployments, recorded below.

## Authorized LuckyVault activation

On 2026-10-12 the user requested deployment on both networks. [Public deployment receipts](../contracts/deployments) and the [real testnet lifecycle record](../contracts/deployments/10143/LuckyVault.smoke.json) capture the results. Both contracts have exact source matches on Sourcify, and the frontend now enables Lucky Links on both domains. The existing LinkVault addresses were retained.

The VPS `.env` now sets `TESTNET_LUCKY_VAULT_ADDRESS`, `MAINNET_LUCKY_VAULT_ADDRESS`, and `NEXT_PUBLIC_GAS_SPONSOR_ENABLED=false`. Compose honors the sponsorship flag instead of hardcoding it on. The sponsor key from `.env.deploy` was used in a temporary signing process for the authorized deployments and testnet validation; it remains absent from the serving web containers.

The pre-activation environment backup, deployment journals, compiled artifact, standard compiler input, and frontend build logs are stored privately in `/home/clawuser/backups/monlipay-lucky-20261012`. The final frontend build also corrects AUSD and USD1 to six decimals, verified by on-chain reads. Both frontend builds and health checks passed. Browser checks displayed the live oracle fee on each network and read the completed testnet packet from the deployed vault.

To rebuild this workspace on the VPS, run `bash deploy/deploy.sh --no-pull` from the checkout. Use `MONLIPAY_ENV_FILE` only when intentionally choosing a different environment file. Public frontend settings require a rebuild.

## Product demo and ERC-20 follow-up — 12 October 2026

Both web services were rebuilt and activated from the 235-file source archive
`monlipay-demo-release.tar.gz` (SHA-256
`715e18ae75e117edc9440498a1940db953a620b5d2dcd81302af7fe44a6a5455`).
Backup of the preceding web source: `before-demo-source.tar.gz` alongside the
previous private deployment records. The build used `.env`; no deployment keys,
network contract addresses, contacts volumes or indexer schema were changed.
The deployment job completed with exit 0; both web services and indexer are
healthy with zero restarts.

Public verification on both origins: `/`, `/demo`, `/my-links` and the English
VTT return 200. The 1,336,404-byte MP4 is served as `video/mp4`, matches the local
SHA-256 `23efbfc02adf93b4a2040104af2960d7e622f7556f3519462200927d04eb52aa`,
and supports range requests with HTTP 206. Chromium played the full source with
an 80-second duration and advancing currentTime on each origin. Playback does not
start until requested by the visitor.

This release also includes explicit payment refunds in My Links, independent
Lucky history, exact ERC-20 approval before funding, and token-aware claim/history
amounts. DEMOUSD test receipts are in the repository, with the test-only token
clearly distinguished from mainnet stablecoins. Mainnet stablecoin transactions
remain untested; no stablecoins were purchased or swapped.

## Encrypted Payment Link backups — 12 October 2026

Both web services were rebuilt and activated from the 251-file archive
`monlipay-backups-release.tar.gz`, SHA-256
`630ec567889020766cd9be7c6034389668ecd8d507b4abcaa2d2e3fbc37682e4`.
Build and activation completed with exit 0. Existing environment files, contract
addresses, indexer schema and persistent volumes were retained. No contracts were
deployed and no onchain transactions were sent for this release.

My Links now supports optional browser-encrypted Payment Link backups, recovery-key
confirmation, opening/copying/QR display, older-link import, idle locking, and
ciphertext-only sync retries. The success screen backs up new links while unlocked
and confirms a save only after acknowledgement. See [the recovery and security
boundaries](encrypted-link-backups.md); this does not hide onchain sender activity.

Verification:

- All 748 web tests in 51 files passed, along with TypeScript, scoped ESLint, and
  both production builds. An independent Impeccable visual reviewer returned
  `ship` for the supplied desktop/mobile, light/dark states.
- Both live APIs passed real wallet-signature login, exact-origin protection,
  wallet isolation, cross-site read rejection, immutable profile/retry behavior,
  invalid-ID rejection, onchain ownership rejection, no-store and logout checks.
- An already-claimed testnet DEMOUSD Payment Link #13 was encrypted, stored, read
  and decrypted to its exact original URL. Browser checks on the live testnet
  domain passed sign-in, unlock, copy, QR, manual lock and refresh/unlock recovery.
- Testnet's container was replaced once more after saving; the same profile,
  record and successful decryption survived in the existing volume. Mainnet
  verified an empty backup profile and rejection of an unowned link, without
  funding or claiming any mainnet payment.
- Consistent SQLite snapshots of contacts and encrypted backups on both networks
  passed integrity and foreign-key checks after restoration to disposable copies.
  The restored testnet snapshot's encrypted fixture decrypted to the original
  link using the recovery key held only on the verification client.

Rollback image tags, preceding source, before/after database snapshots, build logs
and activation records are private at
`/home/clawuser/backups/monlipay-backups-20261012`. Snapshot files are mode 600 in
private directories. The snapshot script is available at
`scripts/backup-private-data.py`; no recurring or off-host backup destination has
been configured. The public [release record](encrypted-backups-release.json)
contains no recovery keys, original claim URLs, session cookies or wallet keys.

The existing Cloudflare analytics beacon remains blocked by the application CSP;
font preload warnings also remain. Initial automated requests received an edge
403, then passed with a browser user agent; the application authentication checks
and actual browser recovery passed. The UI review is not a cryptographic audit.

## Passkey saved links and privacy — 12 October 2026

Both sites now use **Continue with wallet → Use passkey**, replacing manual
recovery-key setup for new users. Existing profiles can migrate once with their
previous key without replacing their encrypted records. The home page and
`/privacy` distinguish encrypted claim secrets from public blockchain activity.
Anonymous payments remain unavailable.

The 255-file source archive `monlipay-passkey-release.tar.gz` has SHA-256
`49da6f15a948a145f088e38664a76655e9b302277dea8350f711ef9a9ba273d4`.
Both production builds passed and services were activated at
2026-10-12T16:15:46Z. Environment files, contracts, indexer and persistent volumes
were preserved. No onchain transactions were sent.

Validation: 761 web tests in 52 files, TypeScript and scoped ESLint passed.
Impeccable's fresh finish reviewer returned `ship` for all 12 supplied captures;
its documenter recorded an ordinary extension of the existing design system.
Live mainnet passed new-user passkey setup and refresh/unlock. Live testnet passed
legacy migration, exact original-link recovery, copy/QR, lock, wallet isolation
and origin rejection. The original profile and record ciphertext were unchanged.
These browser checks used native Chromium WebAuthn with a virtual CTAP2 PRF
authenticator; physical-device support and cross-device syncing are not claimed.

Both containers were replaced again after passkey enrollment. Hashes of all
profiles, link records and wrapped passkey records remained identical. Both networks
unlocked after replacement; testnet recovered its original link. Four consistent after-release
SQLite snapshots passed integrity checks; the live saved-link databases also
passed foreign-key checks. Source rollback, image tags, snapshots and build logs
are private in `/home/clawuser/backups/monlipay-passkey-20261012`. No off-host
snapshot destination or schedule has been configured.

The [release record](passkey-privacy-release.json) records images, scope and
limitations. Post-verification release documentation is synced separately from
the immutable build archive. Existing CSP-blocked Cloudflare analytics and font
preload warnings are unchanged. This verification is not a security audit.
