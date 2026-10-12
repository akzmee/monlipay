# MonliPay

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People sending MON or tokens through chat. The sender funds a link and shares it; the recipient opens the link and claims to their wallet. Private payments and group gifting are optional modes.

## Product Purpose

MonliPay is a payment-link product: create a link and easily send MON or tokens. Payment Link is the default creation mode for one recipient. Private Payment is an optional Monad mainnet beta using AnomaPay for shielded transfers. Lucky Link is another optional link type within the same creation flow, adding a funded pool with randomly sized shares, a recipient quota, eligible wallets, and an expiry. Neither optional mode replaces MonliPay's brand or the landing page's payment-first promise.

## Capabilities and Constraints

- Single-recipient Payment Links are the primary capability and default creation mode. Private Payment and Lucky Link are selected through the link-type picker under Create; Private Payment requires Monad mainnet.
- Saved Payment Link secrets, the private account, and sender-side private payment records are encrypted in the browser with the same passkey-protected key. Wallet verification controls access to stored ciphertext; the server does not hold the decryption secret. New users use a passkey without managing a recovery string or download. Existing recovery-key profiles can migrate without replacing their records.
- Passkey encryption support varies by browser and provider. Encrypted records lock on refresh, wallet change, or 15 minutes of inactivity. MonliPay cannot reset a lost passkey; loss can make the sender's private balance inaccessible.
- Private Payment deposits into an AnomaPay balance, transfers to a separate bearer account, and gives the recipient a link to withdraw. Supported pool assets are USDC, USDT0, WETH and WMON. Adding MON wraps it to WMON; claims receive WMON, not automatically unwrapped MON. Protocol fees are reviewed before transfer or withdrawal and deducted from the private balance.
- Shielded transfers hide their parties and amounts from public chain observers. Deposits and withdrawals remain public and may be correlated by amount or timing. The proving operator and infrastructure receive unencrypted witness details; Galileo receives the account's discovery key. Spending authority and encryption private keys stay in the browser. This is not complete anonymity or anonymous browsing.
- Private links have no expiry or automatic refund. Anyone holding the complete bearer link, including the sender, can withdraw its unspent balance; the first successful spend wins. Recipient claim progress is encrypted locally using the link secret. Lost bearer links cannot be reset.
- My Links includes Payment, Private and Lucky history, with Private links on mainnet only. Opening private records requires the same passkey session. A created private link is not proof of a completed claim: users open it to check the available balance. Incomplete activity retains an explicit next action.
- Contacts are a private backend address book, scoped to a signed-in wallet. A sender can select contacts or enter new wallet addresses without saving them.
- A Lucky Link snapshots eligibility on-chain at creation. Contact names stay in the backend. The wallet list becomes public blockchain data.
- Slots are first-come, first-served among eligible wallets. A wallet may request only one share. This is a wallet limit, not proof of unique humans.
- Random allocation uses Pyth Entropy. A recipient requests a draw, waits for its callback, and collects the assigned share. Network and oracle fees are separate from the funded pool.
- Pending draws receive a one-hour grace period after expiry. The sender can then recover unallocated funds. Allocated shares remain collectable.
- Invoice functionality is a later priority; current work extends payment links, optional private payments, Lucky Links and contacts.
- Private Payment relies on the existing AnomaPay provider contracts and infrastructure. It has not undergone an independent security audit. Adoption statistics and user testimonials are not established evidence.

## Brand Commitments

The user requested consistent design, no generic AI styling, the Impeccable skill, and the Monad Metropolis page as the visual reference. Preserve MonliPay's name and Monad assets. The feature must have an internationally understandable name, not THR. Lucky Link is the working feature name.

## Evidence on Hand

Existing code and assets in web/src and web/public/monad. Existing project predates Metropolis; additions must be identified separately in submission materials. Visual reference: https://monad.xyz/developers/hackathons/metropolis.

`docs/anoma-private-payment-readiness.json` records a funded Monad mainnet WMON pilot through an isolated harness using the same transaction library as the web app: deposit, separate private bearer transfer, claim, sender remainder withdrawal and unwrap passed. It is not a funded browser recording; other supported assets have not each received a funded end-to-end test. Its readiness and deployment fields are the release-status authority, separate from the implemented surface.

The browser review captures under `.impeccable/review/private-*.png` cover the interface, including pending, locked and failed-record states. The failed history fixture is unfunded. The product demo distinguishes recorded Payment and Lucky transactions on Monad testnet from its private-payment interface walkthrough and separately verified funded mainnet pilot.
