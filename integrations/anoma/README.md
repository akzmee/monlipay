# AnomaPay integration

Browser integration and isolated mainnet verification harness for MonliPay’s optional **Private payment** mode. SDK 1.2.0 and the provider configuration are pinned. The funded WMON mainnet pilot passed: deposit → private bearer transfer → claim → withdraw remainder → unwrap. See [public receipts and costs](../../docs/anoma-private-payment-readiness.json). The harness keeps wallet keys and bearer recovery material outside this repository.

## Verified so far

- SDK 1.2.0 runs with its actual WASM cryptography. Dependencies are pinned in
  `package-lock.json`; the Node bootstrap handles only the installed WASM file.
- The live Monad configuration matches `monad-reference.json`. The adapter and
  forwarder have bytecode, and Galileo indexes the Monad adapter. This is an
  availability check, not a contract audit.
- The live fee API accepts our wire format. A newly generated, unfunded account
  can register its discovery key and retrieve an empty resource collection.
- Local tests cover domain-separated claim accounts, resource/fee conservation,
  spend signatures, Permit2 amount/network/action binding, quotes without spend
  authorization, receipt binding, request redaction, budget caps, durable recovery,
  and prevention of automatic resubmission after an ambiguous POST response.
- End-to-end funded deposit, private transfer, discovery/decryption of a real
  resource, withdrawal, and sender recovery passed in the authorized 1 MON pilot.

The live configuration currently has Monad mainnet (143), not Monad testnet.
Supported tokens are USDC, USDT0, WETH and WMON. Native MON is wrapped to
WMON explicitly. The pilot does not trade or bridge funds.

## Privacy and product behavior

The flow deposits into a sender account, then transfers privately to a
**different**, random bearer account. The recipient derives that account from
the URL fragment. Depositing publicly straight into the bearer account would let
the holder trace its original deposit; this implementation avoids that flow.

This protects shielded transaction details from public chain observers. Deposit
and withdrawal addresses/amounts remain public. The proving operator receives
unencrypted witness data. Galileo receives the discovery key by protocol design;
it does not receive the spending authority or encryption private key. Timing,
amount correlations, network metadata, and a compromised frontend remain limits.
It must not be marketed as complete sender anonymity.

Anoma notes do not provide LinkVault-style expiry or a contract-enforced timed
refund. A sender holding the bearer seed can reclaim an unspent note before the
recipient does. The MVP must explain that first-spend behavior and must not show
an expiry field or promise an automatic refund.

`/claim/private#p=1.143.<token>.<seed>` is a **reserved prototype format**; the web
route does not exist yet. Never share generated pilot URLs as working payment
links. Bearer seeds and discovery URLs must not appear in analytics or logs.

## Reproduce without spending funds

Requires Node 22.13 or later:

```sh
cd integrations/anoma
npm ci --ignore-scripts
npm test
npm run check
npm run plan
```

`check` reads public configuration, health and chain state. `plan` additionally
requests fees for synthetic unfunded resources; it does not sign a wallet permit,
submit a transaction, approve tokens, or deposit funds. Neither command reads
the user's private key.

The SDK's online examples describe older APIs. This integration uses SDK 1.2.0
and the active backend OpenAPI schema: token **address** in `feeToken`, base64
32-byte Permit2 nonce, base64 65-byte signature, snake-case resource fields, and
camel-case outer transaction fields. Fee quotes use a parseable signature that
does not authorize the resource's action.

## Funded pilot harness — completed with explicit authorization

The concrete test is in `scripts/pilot.mjs`; its only supported wallet is the
existing deployer `0xd16385B936BDC12BEc3f363521513419C0cED249` on chain 143.
It caps the deposit at **1 MON**, wallet gas at **0.1 MON**, and protocol fees
within that deposit at **0.35 WMON**. The maximum total exposed is **1.1 MON**.
Fees are spent; successful claims and sender change return to that same wallet.
Protocol failure may leave deposited funds needing manual recovery.

The script refuses to execute unless all three operator environment variables
are supplied after approval:

- `MONLIPAY_ANOMA_APPROVED_MAX_MON=1.1`
- `MONLIPAY_ANOMA_TEST_PRIVATE_KEY` (load inside the VPS process; never print it,
  copy it locally, put it in shell arguments, or write it into this repository)
- `MONLIPAY_ANOMA_JOURNAL_DIR` (a persistent private directory outside the repo
  and web root, owned by the operator, permissions 0700)

The harness wraps 1 MON, approves exactly 1 WMON to Permit2, deposits into the
sender account, transfers 0.5 WMON to the claim account, withdraws the claim and
sender change, unwraps returned WMON, and checks balances and allowance. Signed
permits bind the forwarder, token, amount, chain, nonce, deadline and action tree.

The journal is operator-only recovery material with 0600 files and fsynced atomic
writes. It contains bearer keys and transaction state, so do not publish or
upload it as an artifact. It is **not** the intended product storage: the browser
feature uses passkey-encrypted account and link records. Keep the journal
until all funds have been accounted for.

Exit 2 means a transaction or discovery is pending; resume with the **same**
journal. A POST with no recorded request ID is ambiguous: the harness stops and
does not retry it. Review the saved action onchain before taking further action.
Never delete the journal or start a new funded pilot to work around an error.
Exit 1 requires investigation; public logs deliberately omit raw provider and
SDK error bodies that might contain secrets. The complete funded orchestration passed; its public receipt record excludes private journals and bearer keys.

## Browser release

`src/browser.mjs` exports the shared integration as the local package in `web/vendor`.
The SDK loads only when private payment functionality is opened. `/create/private`
requires mainnet, a wallet signature and a passkey before funding. `/claim/private`
uses a domain-separated bearer account from the URL fragment and does not require
a sender passkey. My Links decrypts saved private link records on the client.

Encrypted intent is persisted before each protocol submission. Revision conflicts
stop stale sessions; uncertain responses require status checks against the saved
action root, never automatic resubmission. Claim progress is encrypted on the
recipient device using a separate key derived from the bearer secret. A sender
can reclaim an unspent bearer link; first successful spend wins, with no expiry.

The mainnet pilot validates WMON only. Stablecoins are configured by the provider
but have not had funded end-to-end validation. Browser PRF testing uses Chromium's
native virtual authenticator, not physical device or cross-device validation.
There is no independent security audit.

Primary references:

- [AnomaPay introduction](https://docs.anoma.net/anoma-pay-introduction)
- [Privacy guarantees](https://docs.anoma.net/anoma-pay-privacy-guarantees)
- [Trust model](https://docs.anoma.net/anoma-pay-trust-model)
- [SDK source](https://github.com/anoma/anoma-app-sdk)
- [Active backend schema](https://pay.prod.heliax.app/api-docs/openapi.json)
- [Monad protocol registry](https://github.com/monad-crypto/protocols)
- [Forwarder source](https://github.com/anoma/anomapay-erc20-forwarder)

This integration has not undergone an independent security audit.
