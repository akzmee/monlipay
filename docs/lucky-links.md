# Lucky Links

A funded link for a chosen group. The sender selects a token, total pool, recipient slots, expiry, title, and up to 100 eligible wallets. Select private saved contacts or paste new addresses. Saving a contact is optional. A wallet gets one draw; if the eligible list is larger than the quota, the first wallets to request a draw reserve the available slots.

## What is new for Metropolis

This work extends the existing MonliPay project, based on `5544bf7` (July 2026). The existing single-recipient LinkVault, sponsored claims, bridge, and indexer predate this work. Identify them as the existing foundation in the submission.

New work: `LuckyVault.sol`, the Pyth Entropy allocation flow, `/create/lucky`, `/lucky/claim`, private contacts with wallet-signature login, and the coordinated Metropolis-inspired visual update. No invoice feature is included. Consumer Products & Payments is the relevant track. The official [Metropolis page](https://monad.xyz/developers/hackathons/metropolis) permits existing projects only for new contributions made during the build period; describe this delta explicitly.

## Product hierarchy

MonliPay remains a payment-link product. The landing leads to `/create`, where Payment link is selected by default. Lucky link is a second choice in the shared link-type picker and opens `/create/lucky`; `/lucky` redirects there for compatibility. Shared claim URLs remain at `/lucky/claim`. The main navigation has one Create entry. Contacts support selecting eligible wallets for the Lucky mode.

## Allocation and refunds

1. The sender deposits MON or a supported standard ERC-20. Recipient eligibility becomes an immutable on-chain snapshot. Updating contacts later does not change that snapshot.
2. `requestClaim` authenticates the recipient, reserves a slot, and forwards the current oracle fee to Pyth Entropy V2. The sender's deposited pool is not used to pay oracle fees.
3. Only the configured Entropy contract and provider can deliver randomness. The callback allocates a share without sending tokens to the recipient.
4. `withdrawShare` lets the recipient collect the assigned amount in a separate transaction. A failed transfer can be retried, including to another destination through the contract.
5. At expiry the sender may refund only the unallocated balance. Pending draws get one additional hour; callbacks later than this cannot allocate funds. Previously allocated shares remain withdrawable after refund.

Shares are not independent or identically distributed. Each settled draw, except the last, samples between a minimum of `max(1, total / (slots * 10))` base units and a cap of twice the current average, while reserving the minimum for remaining slots. The last settled slot gets the remainder. Callback order affects the distribution. Pyth provides verifiable randomness; this implementation still trusts oracle availability and the configured provider's delivery. This is a gift allocation mechanism, not a lottery-ticket sale.

The one-claim rule applies to wallets, not unique people. Titles, eligible addresses, pool values, and claims are public blockchain data. Contact names remain in the backend database. Contacts are access-controlled, not end-to-end encrypted.

Native MON and ordinary ERC-20 transfers are supported. Fee-on-transfer deposits revert. Rebasing, blacklistable, malicious, or later-upgraded token behavior can affect custody; the UI offers a curated token list rather than arbitrary imports. Both network gas and an oracle fee are required for the draw, followed by network gas for collection. The UI reads the fee rather than hardcoding it.

## Local development

Requires Node 22.13 or newer and Foundry with Solidity 0.8.28 support.

```sh
bash scripts/install-contract-deps.sh
cd web
npm ci
cp .env.example .env.local
npm run dev
```

Set `NEXT_PUBLIC_NETWORK=testnet` for a testnet build. Set `NEXT_PUBLIC_LUCKY_VAULT_ADDRESS` from the matching network's [deployment receipt](../contracts/deployments), or leave it at zero for an unconfigured preview with funding disabled. Existing payment links use their own, separate contract address.

Contacts use Node's SQLite backend. `CONTACTS_DB_PATH` defaults to `web/data/contacts.sqlite` when the server starts in `web`. `APP_ORIGIN` must be the exact public origin in production, for example `https://monlipay.xyz`, with no path. Development derives the origin from the request host. A signature opens a one-hour HttpOnly, SameSite=Strict session; login challenges expire in five minutes and can be consumed only once. Each request also checks the active wallet so switching wallets cannot reveal another wallet's contacts.

## Deploying LuckyVault

LuckyVault was deployed to Monad testnet and mainnet on 2026-10-12 with the user's authorization. See the public deployment records below. For another deployment, review the configuration and choose a funded deployer. The script creates a separate contract and does not upgrade the existing LinkVault.

As checked against the [official Pyth chain list](https://docs.pyth.network/entropy/chainlist) and read-only `getFeeV2` calls on 2026-10-12:

| Network | Entropy V2 contract | Provider |
| --- | --- | --- |
| Monad testnet (10143) | `0x825c0390f379C631f3Cf11A82a37D20BddF93c07` | `0x6CC14824Ea2918f5De5C2f75A9Da968ad4BD6344` |
| Monad mainnet (143) | `0xD458261E832415CFd3BAE5E416FdF3230ce6F134` | `0x52DeaA1c84233F7bb8C8A45baeDE41091c616506` |

Verify the chain list again before deployment. The callback gas limit is 180,000. The integration uses `getFeeV2(address,uint32)` and `requestV2(address,bytes32,uint32)`; see [Pyth's request variants](https://docs.pyth.network/entropy/request-callback-variants).

Example testnet dry run using a locally managed Foundry keystore account:

```sh
cd contracts
export PYTH_ENTROPY_ADDRESS=0x825c0390f379C631f3Cf11A82a37D20BddF93c07
export PYTH_ENTROPY_PROVIDER=0x6CC14824Ea2918f5De5C2f75A9Da968ad4BD6344
forge script script/DeployLuckyVault.s.sol:DeployLuckyVault \
  --rpc-url https://testnet-rpc.monad.xyz --account your-deployer
```

After an approved broadcast, put the resulting address in `NEXT_PUBLIC_LUCKY_VAULT_ADDRESS`, rebuild the frontend, and verify a full draw/callback/collection on the actual network before submission. Also configure a valid WalletConnect project ID and allowed domain for QR/mobile connections. Browser extension wallets can connect independently of WalletConnect.

For the existing Docker Compose deployment, set `TESTNET_LUCKY_VAULT_ADDRESS` or `MAINNET_LUCKY_VAULT_ADDRESS` in the deployment environment. The image accepts the new build argument. Each network has its own named contacts volume and exact `APP_ORIGIN`. Back up these volumes with SQLite-aware tooling; do not delete them during redeployment. The app runs as UID 1001 and needs write access to its data directory. SQLite is intended for this persistent single-host deployment. An ephemeral Vercel filesystem is not a durable contacts backend; use an external database before choosing that hosting model.

## Validation

Run web unit/integration tests with `npm test` and `npx tsc --noEmit` in `web`; run `forge test` in `contracts`. Contract tests include conservation across 1–100 recipients, positive minimum payouts, out-of-order callbacks, reentrancy, double claims and withdrawals, unauthorized callbacks, expiry, oracle timeout, fee-on-transfer rejection, and refunds that preserve allocated funds.

On 2026-10-12, 705 web tests and 122 contract tests passed (including 19 LuckyVault cases), TypeScript and scoped ESLint passed, and the production build completed. The Compose configuration parsed; no container deployment was performed.

A real wallet-signature HTTP smoke check passed contact CRUD, account isolation, origin validation, replay rejection, and logout. Playwright exercised an injected Anvil wallet through contact sign-in, saving a contact from the picker, adding an unsaved address, funding a 10 MON pool with two slots, copying the share link, requesting randomness, receiving a local mock callback, and collecting 7.226646754211326083 MON. After advancing local time, the browser sent the refund for the remaining 2.773353245788673917 MON; the local vault's resulting balance was zero. The temporary chain and wallet have been stopped. The default preview again has funding disabled until a public vault is configured.

Browser captures distinguish disconnected/unconfigured screens from locally exercised funded states. Local tests and mock oracle callbacks are not evidence of a public-network deployment or an independent security audit. This initial browser test used an injected wallet; see the later WalletConnect verification below.

The Impeccable visual review covered the new landing, creation, contacts, and claim surfaces. Its three requested fixes—desktop hero overlap, duration clipping at 320px, and inconsistent arrow icons—were applied and scored resolved in a follow-up verdict. Dark and light form captures and responsive widths of 320, 390, and 1440 pixels were checked. The visual verdict does not cover contract security or every legacy screen.

After the user's product-positioning correction, the landing and metadata were refocused on payment links, and both creation modes were grouped under Create. The follow-up passed 45 existing CreateForm, NavBar, and ShareLink tests, scoped ESLint, and a production build. Browser checks verified the default Payment link mode, both directions of the mode switch, the legacy redirect, keyboard focus and activation, mobile navigation, contacts entry, and the existing Lucky claim route. Captures at 320, 390, 768, and 1440 pixels had no horizontal overflow. This follow-up changed presentation and routing; no contract or public deployment was performed.

## Wallet connection configuration

Set `NEXT_PUBLIC_WC_PROJECT_ID` to a real Reown project ID before building. Empty, malformed, and all-zero IDs select the injected browser-wallet connector without initializing WalletConnect. QR/mobile pairing requires a valid ID and an accepted origin in Reown. These public settings are baked into the image, so changing only the running container's environment is insufficient.

RainbowKit 2.2.11 uses Cuer 0.0.3 for QR rendering. Cuer requests `border: 0`, which `qr` 0.6 and 0.7 reject. The scoped npm override `cuer > qr = 0.5.5` keeps pairing QR codes working. Keep the `wallet-qr.test.ts` regression test and verify the actual wallet modal when upgrading these dependencies.

The Chrome automatic-workspace endpoint returns 204 rather than advertising a Linux filesystem path to a browser that may run on another machine or operating system. This does not disable source maps. CSP now includes `'wasm-unsafe-eval'` as a `script-src` source expression.

The 2026-10-12 follow-up passed 86 relevant tests, TypeScript, and scoped ESLint. A local browser check verified Reown config HTTP 200, a visible WalletConnect pairing QR, no captured page errors or failed wallet-service responses, and HTTP 204 for the workspace endpoint. An unconfigured-ID check verified that browser-wallet mode makes no WalletConnect requests. No real wallet pairing or public transfer was performed by these checks.

The initial [VPS update](vps-deployment.md) deployed both web frontends, the contacts backend, and the existing indexer. Both public domains passed QR and signed contacts API checks. The authorized contract deployment below subsequently enabled Lucky Link funding.

## Public LuckyVault deployment — 2026-10-12

Both deployed runtimes matched the constructor simulation, and Sourcify returned an exact match for creation and runtime bytecode. Public receipts record the network, contract, deployment transaction, compiler settings, gas cost, and oracle configuration:

- [Monad testnet receipt](../contracts/deployments/10143/LuckyVault.json)
- [Monad mainnet receipt](../contracts/deployments/143/LuckyVault.json)
- [Real testnet lifecycle transactions](../contracts/deployments/10143/LuckyVault.smoke.json)

Deployment cost 0.330340872 MON on each network. The deployer key was read only inside a temporary VPS process from the existing private environment file; it was not copied locally or enabled as a public gas sponsor.

The testnet smoke test funded a 0.01 MON packet with two slots, requested a draw, received the actual Pyth callback (sequence 4115), and withdrew 0.007144751555912533 MON. After expiry it refunded the remaining 0.002855248444087467 MON. The vault balance was zero afterward. Mainnet validation covered deployment, bytecode, configuration, fee reads, and source verification; no mainnet pool was funded during this update.

Both public frontends were rebuilt with their LuckyVault addresses. Browser checks loaded the live fee and the completed testnet packet. At verification the draw fee was 0.128159999999100001 MON on testnet and 1.4 MON on mainnet; fees are dynamic. Payment mode supports the broader mainnet token list; Lucky mode currently offers MON, USDC, USDT0, and AUSD. Testnet displays native MON only. Network gas and Lucky draw fees remain payable in MON.

Read-only checks against all ten configured mainnet ERC-20 contracts found two incorrect decimal entries: AUSD and USD1 use six decimals, not eighteen. These were corrected before the final frontend build. Four amount-encoding regression cases plus the existing chain, creation-form, and Lucky validation tests passed (47 tests); all 19 LuckyVault tests also passed before broadcast. Stablecoin transfers were not executed on mainnet in these checks.

Gas sponsorship is disabled in the current frontend configuration because the serving containers do not have a configured relay key. The UI therefore does not advertise free claims. Sourcify verification succeeded; its optional Etherscan forwarding hit provider rate/daily limits, so Etherscan/Monadscan verification is not claimed.

## Demo and token flow follow-up (12 October 2026)

The Metropolis demo uses a dedicated wallet on real Monad testnet, with a locally
served frontend and an automated signer restricted to that network and demo
contracts. Wallet confirmation popups are omitted from the recording. DEMOUSD is
a six-decimal test token with no monetary value, not Agora AUSD or a redeemable
stablecoin. Mainnet stablecoin balances were zero; no mainnet purchase was made.

The live ERC-20 test exposed missing approval in the original payment create
hook. Creation now reads allowance, approves exactly the requested amount, resets
nonzero insufficient allowance for USDT-style tokens, waits for success, and then
funds the link. Approval failure prevents the deposit. Claim and history amounts
use token metadata; unknown decimals are shown as base units, never assumed to
be 18. Payment history now distinguishes Refunded from Claimed. Visiting My Links
no longer starts a wallet transaction; refund is an explicit action.

My Links lists Payment and Lucky links independently so an indexer failure cannot
hide Lucky history. Lucky expiry status respects pending draws and the one-hour
grace period. Fully allocated does not imply all recipients have withdrawn.

The home page links to an inline, user-started demo player. `/demo` is its direct
submission URL. The player uses `preload="none"`, a poster, native controls,
English captions and a text walkthrough. No autoplay or external video tracking.
Submission fields are in `docs/metropolis-submission.json`; run
`scripts/prepare-submission.sh` to print them. No organizer submission is performed.

The final MP4 runs 80 seconds at 1440 × 900, weighs 1,336,404 bytes and includes
burned-in English captions. There is no audio track. Raw captures remain local in
`output/playwright`; `scripts/render-demo.py` and `docs/demo-manifest.json` record
the editing process and source hashes. The testnet wallet self-claims the payment
link to verify the complete token lifecycle; it is not a user adoption claim.
Actual receipts are recorded in
`contracts/deployments/10143/DemoUSD.payment-smoke.json` and
`contracts/deployments/10143/LuckyVault.demo.json`.

Targeted follow-up checks: 115 tests across eight relevant files passed; TypeScript
and lint of the changed UI/metadata/history files passed. Browser playback advanced
with readyState 4 and the expected 80-second duration. My Links and the demo player
were inspected at 1440px and 390px in light and dark themes, without horizontal
overflow. These checks do not constitute a full security audit.
