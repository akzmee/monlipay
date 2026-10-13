# AnomaPay integration

The browser adapter for MonliPay's optional Private Payment mode. It uses Anoma SDK 1.2.0 on Monad mainnet (chain 143). The frontend consumes the package from `web/vendor/`.

## Payment flow

1. Deposit into a sender account.
2. Transfer to a separate, randomly generated bearer account inside the pool.
3. Share the bearer secret through a URL fragment.
4. The recipient opens `/claim/private` and withdraws to their wallet.

Supported pool assets are USDC, USDT0, WETH and WMON. MON funding wraps to WMON; a claim receives WMON. Only WMON has been exercised through a funded end-to-end test.

Shielded transfers hide parties and amounts from public chain observers. Deposits and withdrawals remain public. The proving operator receives witness data, and Galileo receives the discovery key. Timing and amount correlation remain possible. This is not complete anonymity and has no independent security audit.

Private links have no expiry or automatic refund. The sender and any other holder of the complete link can spend its unclaimed balance; first successful spend wins.

## Browser state

`src/browser.mjs` exports the integration. The SDK loads when private payment functionality is opened. The sender connects a wallet and opens a passkey before funding. Saved account and payment records are encrypted in the browser.

An encrypted operation record is persisted before submission. Revision conflicts stop stale sessions. Uncertain responses require a status check against the saved action root rather than automatic resubmission. Recipient claim progress is encrypted using a key derived from the bearer secret.

## Development

Requires Node.js 22.13 or later:

```sh
npm ci --ignore-scripts
npm test
npm run check
npm run plan
```

`check` reads public configuration and chain state. `plan` requests fee quotes for unfunded resources. Neither command approves tokens or deposits funds.

The SDK and backend formats are pinned: token addresses in `feeToken`, base64 Permit2 nonce and signature, snake-case resource fields, and camel-case outer transaction fields. `monad-reference.json` records provider configuration.

## Funded test harness

`scripts/pilot.mjs` is an operator tool for the fixed deployer configured in its source. It caps the deposit at 1 MON, wallet gas at 0.1 MON, and protocol fees at 0.35 WMON within the deposit. It wraps MON, deposits, transfers 0.5 WMON to a separate claim account, withdraws the claim and remainder, and unwraps returned WMON.

Running it spends network and protocol fees. It requires these operator variables:

- `MONLIPAY_ANOMA_APPROVED_MAX_MON=1.1`
- `MONLIPAY_ANOMA_TEST_PRIVATE_KEY`
- `MONLIPAY_ANOMA_JOURNAL_DIR`

Keep the journal in a persistent private directory outside the repository and web root. It contains recovery secrets. Exit 2 means an operation is pending: resume with the same journal. An ambiguous submission stops instead of retrying. Exit 1 requires investigation. Do not discard a journal while funds remain unresolved.

## Protocol references

- [AnomaPay](https://docs.anoma.net/anoma-pay-introduction)
- [Privacy guarantees](https://docs.anoma.net/anoma-pay-privacy-guarantees)
- [Trust model](https://docs.anoma.net/anoma-pay-trust-model)
- [SDK source](https://github.com/anoma/anoma-app-sdk)
