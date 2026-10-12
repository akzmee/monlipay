---
version: 1
slug: "web-src-app-create-private-page-tsx"
primary_target: "web/src/app/create/private/page.tsx"
related_targets: ["web/src/components/PrivatePaymentWorkspace.tsx", "web/src/app/claim/private/page.tsx", "web/src/components/PrivateClaim.tsx", "web/src/components/PrivateLinkHistory.tsx", "web/src/components/LinkTypePicker.tsx", "web/src/app/lucky.css"]
---

# Create a link: Private Payment

Mode: Operate. An approved optional Monad mainnet beta within payment-first MonliPay. This is an ordinary extension of the incumbent Metropolis visual system.

## Direction contract

THESIS: Add a shielded payment option to Create a link, with a visible private balance, fee review and honest privacy limits.

OWN-WORLD: Reuse ink and cool-paper themes, solid lilac actions, Geist workspace type, thin boundaries and the shared prismatic envelope. Operational fields remain quiet.

STORY: Connect on mainnet, open the passkey, add funds, review a private link and share it. Recipients review the withdrawal amount and fee before claiming to their wallet.

FIRST VIEWPORT: Shared navigation and Create a link heading precede the Payment / Private / Lucky picker. Desktop pairs the balance and form at left with the envelope and explanation at right. Mobile stacks the picker and form, hiding preview art while retaining explanatory copy. Wallet, network and passkey gates occupy the working panel.

FORM: Direct extension of the user-approved system; no new world or concept round. Disclosure, status and next actions accompany the payment task.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Operational contract

Passkey setup precedes private funding. The sender account and payment records use the same browser encryption and passkey access as saved Payment Links; no new-user recovery string is introduced. Unsupported access, cancellation and storage failure must leave an explicit next step and must not imply funding succeeded.

The token selector, private balance and Add funds / Withdraw / Refresh actions precede Link amount. Funding expands inline; MON funding clearly wraps to WMON. Review shows the amount and protocol fee before submission. Separate activity rows distinguish deposits, withdrawals and link creation, with appropriate continuation or status checks. Failed operations say “Not completed”; pending ones say “In progress”.

The claim page reuses the two-column envelope/details panel and narrow-screen stack. It shows available balance, receiving-wallet connection or network switch, fee review, submission progress and confirmed receipt. An empty balance is qualified as possibly claimed, reclaimed or still syncing. WMON is received as WMON. Keep the original link until the claim completes; local claim progress is encrypted using the bearer secret.

Private links have no expiry or automatic refund. The complete link permits its holder, including its sender, to spend the unspent balance; the first successful spend wins. Saved creation is not proof of later claim completion. Keep this behavior distinct from expired standard-payment refunds and Lucky allocation.

## Privacy language

Describe shielded transfers inside AnomaPay's pool, not complete anonymity. Deposits and withdrawals remain public, and timing or amounts can be correlated. The proving operator and infrastructure receive unencrypted witness details; Galileo receives the discovery key. Spending authority and encryption private keys remain in the browser. Keep the compact disclosure under creation/claim and link to the fuller /privacy explanation.

## Evidence and system preservation

Compared the workspace, claim, history, picker, passkey access, home, privacy and demo source with `web/src/app/lucky.css`, `DESIGN.md` and `.impeccable/design.json`. The private extension consumes existing theme roles, control shapes, typography and responsive composition; it adds no durable system token. Both design-system files are preserved.

The supplied finish review covered 17 private desktop/mobile captures at 1440 × 1000 and 390 × 844 viewports, including light themes, pending activity and locked history. Its single material finding was the failed-record status label; the final verdict accepted “Not completed” with Check activity retained. Documentation independently sampled `private-create-desktop.png`, `private-light-mobile.png`, `private-history-mobile.png` and `private-home-desktop.png` against the source. The final history fixture is unfunded.

Funded evidence is separately recorded in `docs/anoma-private-payment-readiness.json`: the WMON pilot used an isolated harness sharing the web transaction library, not a funded browser recording. Read its deployment fields for release status; interface implementation and review alone do not establish deployment. Other supported tokens have not each received a funded end-to-end test.

The incumbent design record's surface inventory predates passkey/private extensions; that coverage lag is recorded here without rewriting global rules. The detector's existing decorative-grid advisory concerns the explicitly requested Metropolis material and is retained. Neither is promoted into a new token or repaired outside this scope.
