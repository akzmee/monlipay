---
version: 1
slug: "web-src-app-create-group-page-tsx"
primary_target: "web/src/app/create/group/page.tsx"
related_targets: ["web/src/components/GroupPaymentForm.tsx", "web/src/app/group/claim/page.tsx", "web/src/components/GroupPaymentClaim.tsx", "web/src/components/GroupLinkHistory.tsx", "web/src/components/LinkTypePicker.tsx", "web/src/config/group.ts", "web/src/lib/group.ts", "web/src/app/lucky/claim/page.tsx"]
---

# Create a link: Group Payment

Mode: Operate. Ordinary extension of the incumbent MonliPay design system. The user approved Group Payment replacing the visible Lucky Link name, Equal amount as the default, and Random amount as an optional distribution. Keep the existing folded-M identity, envelope, typography, paired themes and workspace rhythm.

## Direction contract

THESIS: One link shares a fixed pool with multiple recipients. Keep the shared Create a link heading and link-type picker; make the total pool, recipient count, distribution, access and funding action understandable together. Payment Link remains the default creation mode for one recipient.

OWN-WORLD: Inherit the Metropolis ink/lilac world, quiet Geist working hierarchy, solid surfaces, thin rules and shared SVG arrows. The original envelope with its M seal carries the playful visual. No new palette, typeface, raster asset or global design rule is introduced.

STORY: Set a title, token pool, recipient count and claim window. Keep Equal amount or choose Random amount; keep Anyone or choose Selected wallets. Review the live summary, fund and share the link. Equal recipients claim directly to their wallet; Random recipients request a draw and later collect the assigned share.

FIRST VIEWPORT: Shared navigation and Create a link heading, followed by the existing mode picker. Desktop pairs the form with an envelope and live summary. On mainnet the picker includes Payment link, Private payment and Group payment; testnet omits Private payment. Mobile stacks the picker, form and summary and hides the decorative creation artwork. Claims retain the existing illustration/details panel, stacked on mobile.

FORM: Direct extension of the user-approved visual world. Reuse the shared token picker, native labeled radios, contacts, amount field and primary action. The claim envelope opens when an amount is recorded for the connected wallet; reduced motion shows the final state immediately. Equal does not acquire a draw or waiting step from the shared artwork.

FINISH: The finish reviewer disposition is **ship**, with no material fixes, across the six supplied captures below. This brief records the current surface contract and source comparison. `DESIGN.md` and `.impeccable/design.json` remain preserved.

## Creation and claim behavior

Equal amount is the initial distribution and Anyone is the initial access mode. The pool, 1 to 100 recipient slots and claim window are fixed at creation. Equal validation uses token base units and rejects a remainder instead of rounding away funds. The form and preview show the exact per-recipient amount, such as 100 USDC across 10 recipients paying 10 USDC each. An invalid split explains that the sender must adjust the pool or recipient count and disables funding.

Total pool uses Payment Link's `TokenSelectModal`, `TokenAvatar` and `useTokenRegistry` for native MON and ERC-20 tokens. Preserve token logos, name/symbol/address search, custom-token import and removal, and the selected ERC-20 explorer link. Funding retains decimal precision, minimum pool, allowance reset and approval checks. Fees remain separate from the displayed pool.

Anyone needs no recipient registration or list. Selected wallets exposes the existing contacts picker and requires at least as many eligible wallets as recipient slots; eligibility is fixed onchain at creation. Contact names remain in the private address book while selected wallet addresses become public onchain. Both distributions enforce one share per wallet per link. A person can use multiple wallets, and opening the link does not reserve a share. Equal slots fill through successful claims; Random slots reserve through successful draw requests.

Equal uses the new GroupVault. Claim my payment sends the share to the connected wallet in one transaction, with network gas and no oracle or draw fee. The claim summary distinguishes Payments claimed, Per recipient, Remaining pool and Equal amount. An expired pool says the link has ended; a fully claimed Equal pool says all payments have been claimed. A disconnected wallet can still view pool details and connect to inspect its own claim.

Random continues to use LuckyVault and Pyth Entropy. Reveal my share requests a draw, the pending state waits for the callback, and Collect my share transfers the assigned amount in a second transaction. Show the variable draw fee and separate gas requirement. Reserved slots and assigned shares must not be described as completed collection. Keep the existing eligibility, request, fee-loading, unavailable-link and retry states.

After expiry, the sender may recover unclaimed Equal funds. Random keeps the one-hour grace period for pending draws and lets assigned shares remain collectable. Pool amount, recipient quota and expiry cannot be topped up, extended into recurring rounds or reset for another distribution. Source behavior and its validation evidence remain separate from claims of consumer use or contract audit.

## Routes and history

`/create/group` is canonical. `/create/lucky` and `/lucky` redirect there. New links use `/group/claim` with `id`, `chain` and `vault`; the recognized vault selects Equal or Random behavior. The canonical route requires the selector. The legacy `/lucky/claim` route still accepts Lucky V1/V2 links and resolves URLs without a selector to the original Lucky deployment. Preserve old links instead of changing their pool identity.

My Links uses the Group Payments filter and `GroupLinkHistory`, reading the configured Equal vault and both Lucky vaults. Keep vault plus pool ID as the record identity and retain the selector in every claim link. Equal rows say payments claimed; Random rows say shares reserved. Both keep distribution, lifecycle state, retry and refund navigation within the established flat history rows. See the [My Links brief](web-src-app-my-links-page-tsx.md).

## Comparison with the incumbent system

Compared the form, claim, history, picker, Group configuration and validation source with `DESIGN.md`, `.impeccable/design.json` and `web/src/app/lucky.css`, then visually inspected all six supplied captures.

| Incumbent rule | Evidence in this extension |
| --- | --- |
| Paired ink/lilac and cool-paper/violet themes | The Group components reuse the existing semantic classes; shared theme declarations match the documented colors. Dark captures retain ink panels and lilac actions; the light Selected wallets capture retains cool fields, white panels and violet actions. |
| Geist for working screens | Form, summary and claim headings use the existing workspace styles. No landing display type is introduced into operational screens. |
| Flat panels and responsive rhythm | Creation keeps the existing 1120px workspace, 1.45:1 columns, 48px desktop gap and 28px form inset. Captures show the existing narrow-screen stacking and summary without creation artwork. |
| Existing controls and state emphasis | Distribution reuses the access radio treatment, labeled controls, focus outline, hints and error roles. Selected wallets reuses contacts and tags; the token control retains its combined amount/selector enclosure. |
| Shared signature artwork | Desktop creation and both claim captures retain the folded-M envelope. The claim panel preserves its quiet lilac illustration compartment and ruled summary. No new shipping raster was created. |

No material visual drift was found in the supplied Group surfaces. There is pre-existing documentation drift: the global Link-type picker prose describes the original two-column, 640px picker, while the established private-payment CSS already supports three columns at 840px and stacks them below 640px. The global coverage paragraph and sidecar narrative still name Lucky creation/claim, and the sidecar component inventory predates Group. These are coverage and terminology gaps, not authorization to regenerate the system. This brief records the current surface behavior; the global files and unrelated styles are unchanged.

## Reviewed evidence and limits

| Capture | Observed state |
| --- | --- |
| [Equal desktop](../review/group-equal-desktop.png) | Dark mainnet form with 100 USDC, 10 recipients, Equal amount and Anyone; exact 10 USDC preview. |
| [Equal mobile](../review/group-equal-mobile.png) | Same configured Equal form, visible field focus, stacked mode picker and summary. |
| [Random Selected wallets desktop](../review/group-random-selected-desktop.png) | Dark Random form with contacts entry, one selected wallet, distribution summary and draw-fee copy. |
| [Random Selected wallets mobile light](../review/group-random-selected-light-mobile.png) | Light theme, stacked form, selected-wallet tag, fee explanation and summary. |
| [Claim desktop](../review/group-claim-desktop.png) | Dark testnet expired Equal DEMOUSD pool, one of ten payments claimed, exact share and remaining pool visible. |
| [Claim mobile](../review/group-claim-mobile.png) | Dark testnet fully claimed Equal native MON pool, zero remaining and an accurate completion heading. |

This pass inspects source and supplied images, not a fresh browser session. The images include development tooling; that overlay is not product styling. They do not establish keyboard traversal, live wallet submission, all claim states, every token, physical-device performance, consumer validation or traction. The finish review and automated checks are recorded separately in `docs/group-payment-release.json`, which also owns current deployment and transaction evidence. The creation captures show a configured mainnet form, not a funded mainnet Group pool. The claim captures show testnet states; the DEMOUSD asset has no monetary value. The historical product video does not demonstrate Equal mode.
