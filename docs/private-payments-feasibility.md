# Optional sender privacy — feasibility check, 12 October 2026

The user wants an optional private Payment Link that does not expose their funding wallet to the recipient. This is separate from encrypted backups. A forwarding contract or relayer alone does not remove the funding trace, and stealth recipient addresses alone do not hide the sender. The existing LinkVault records a public sender and emits publicly indexed deposit/claim events. Its ordinary flow must not be labelled anonymous.

## Candidate evidence

- [Murk documentation](https://staging-docs.murk.world/) describes an initial Monad-only release: public deposits, private in-pool sends, and public withdrawals/DeFi edges. [Private notes](https://staging-docs.murk.world/concepts/notes-and-shielded-pool) and [DeFi visibility](https://staging-docs.murk.world/concepts/defi) explain that the external transaction is public. This makes it a candidate for investigation, not a verified MonliPay integration. Direct documentation fetches intermittently returned 502/timeouts during this check. The searched official Monad mainnet registry did not contain a Murk entry at inspection; this is not proof that it is undeployed.
- [RAILGUN](https://docs.railgun.org/wiki/learn/privacy-system) provides a shielded balance system and [private transfer SDK](https://docs.railgun.org/developer-guide/wallet/transactions/private-transfers). The official [getting-started network list](https://docs.railgun.org/wiki/learn/getting-started) names Ethereum, Arbitrum, Polygon and BNB Chain. Monad deployment/support was not verified, so it is not a drop-in Monad dependency for this release.
- [ERC-5564 / Ethereum's stealth-address guide](https://ethereum.org/developers/tutorials/stealth-addr/) is useful for recipient-address privacy, with traffic-analysis limitations. It does not by itself meet the requested sender-unlinkability goal.

## Required integration proof

Before exposing a real private-payment option: verify published source, deployed Monad addresses and bytecode, SDK/license, relayer availability, token coverage, review/audit evidence, fees, proof-generation performance and failure recovery. Then test a small-value testnet flow with a distinct sender and recipient, including an externally observable trace. Privacy depends on the protocol's actual anonymity set and deposit/withdrawal amount/timing correlations; it cannot be guaranteed by a toggle.

A suitable flow would keep a sender's pre-funded shielded balance separate from a private claim note; the recipient consumes the note through the protocol's supported relay/proof flow. Passing the original funding wallet through the existing public `createLink` call would defeat the intended privacy. Public exits, refund design, replay prevention, gas funding, and optional transaction receipts for the participants require explicit design.

Decision for this release: ship encrypted history as tested. Do not enable a dummy privacy switch, deploy a homegrown pool, route user funds through an unverified provider, or advertise sender anonymity. Murk is the most directly relevant candidate found, but a deployable SDK/contract integration has not been established. No protocol integration, funds movement, external outreach or partnership claim was performed for this investigation.

## Follow-up evidence for the passkey MVP

The [official networks page](https://staging-docs.murk.world/concepts/networks) now provides a pool proxy at `0x851DA49CA836d318977De6A0bD999b8A5CDAFBAa` on chain 143. Read-only `eth_getCode` requests to `https://rpc.monad.xyz` and `https://rpc1.monad.xyz` each returned 176 bytes at that address. This establishes bytecode presence, not source verification, security assurance or working private transfers. The same documentation calls the software pre-release.

The [security page](https://staging-docs.murk.world/security), retrieved through the search index when direct requests failed, states that its source repository is not public yet. It also separates limited circuit/contract formal verification from unverified SDK, relay and other surfaces. No public integration package, testnet proof/relay workflow or source-to-deployment verification was established in this follow-up. Documentation is evidence about the provider's claims, not an independent audit.

The MVP therefore ships passkey-protected claim-link storage and explicit privacy explanations, with no anonymous-payment control. Integrating a private pool requires a distinct payment/claim/refund design: routing a call into the existing public LinkVault would still publish a sender and amount and may assign refund authority to the intermediary. Passkeys do not solve that onchain problem. No funds were deposited into Murk and no protocol partnership is implied.
