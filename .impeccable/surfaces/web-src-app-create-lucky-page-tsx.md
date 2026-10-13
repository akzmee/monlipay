---
version: 1
slug: "web-src-app-create-lucky-page-tsx"
primary_target: "web/src/app/create/lucky/page.tsx"
related_targets: ["web/src/app/lucky/claim/page.tsx","web/src/app/contacts/page.tsx"]
---

# Create a link: Lucky mode and contacts

Mode: Operate. Extend MonliPay with a pool creation form, private contacts and a shared claim page. User approved proceeding and pinned the Metropolis reference; no new aesthetic selection is needed.

## Direction contract

THESIS: Lucky Link is an optional mode within MonliPay’s Create a link flow. Keep the shared page heading and link-type picker visible; show budget, recipients and funding action together.

OWN-WORLD: Inherit Monad violet and the MonliPay wordmark. Use the reference’s ink ground, faint grid, squared controls and prismatic geometry. Forms use quiet surfaces, white text and one violet action. One drawn envelope carries the playful visual; fields stay plain.

STORY: Set the pool, recipient count and claim window, keep Anyone for a public giveaway or choose Selected wallets to add recipients, then create and share. Claimants see access, fees, pending draw, assigned amount and collection status.

FIRST VIEWPORT: Shared navigation, a 40px Create a link title, the shared link-type picker (Payment link, optional Private payment beta on mainnet, and Lucky link), then a two-column workspace: creation form on the left, live envelope preview on the right. Mobile stacks form and summary without horizontal scroll. Contacts use an inline address book and a compact add form.

FORM: User-pinned Metropolis reference adapted to the existing application. Direct extension, no concept-seed round. The signature moment is an envelope opening when an assigned share arrives; reduced motion shows the final state immediately.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Open giveaways and shared token selection

Anyone is the default under Who can claim?. It creates a public onchain giveaway without registered recipients or a wallet list. The sender chooses 1 to 100 recipient slots. The first successful onchain draw requests reserve those slots; opening the link does not reserve a share. Each wallet can request one share per packet, and the form explains that a person can use more than one wallet. Selected wallets retains the existing `ContactsPicker` and requires at least one eligible wallet per slot. The live summary and success copy reflect the chosen mode.

Total pool reuses Payment Link's `TokenSelectModal`, `TokenAvatar` and `useTokenRegistry`. The amount control shows the selected token logo and symbol. The modal supports token name, symbol and address search, plus custom ERC-20 import and removal. Below the control, Native MON identifies the native asset; a selected ERC-20 shows its name and shortened contract address linked to the explorer. Preserve decimal precision checks, the minimum pool needed to fund every share, and the existing allowance reset and approval flow.

The shared claim page checks whether the packet is open before applying selected-wallet eligibility. Its public-giveaway copy explains first wallets and one share per wallet. Request, oracle callback and collection remain distinct states; fees, expiry, pending-draw grace and recovery behavior remain unchanged. New claim URLs include the vault address, while old URLs without it resolve to the legacy vault. Lucky history reads both vaults and preserves each row's vault when opening a claim.

This is an ordinary extension of the existing visual system. Keep the ink/lilac themes, Geist hierarchy, form and preview grid, shared token modal, native radios, envelope artwork, responsive stacking and reduced-motion behavior. No new palette, typography, raster asset or system-wide visual rule is introduced. `DESIGN.md` and `.impeccable/design.json` remain the design authority without regeneration.

The finish reviewer disposition is **ship**, with no material fixes. Reviewed captures cover the default Anyone form, Selected wallets, and shared token picker at 1440px desktop and 390px mobile, including the light Selected wallets state: [desktop](../review/open-lucky-desktop.png), [mobile](../review/open-lucky-mobile.png), [selected desktop](../review/open-lucky-selected-desktop.png), [selected mobile light](../review/open-lucky-selected-light-mobile.png), [token picker desktop](../review/open-lucky-tokens-desktop.png), and [token picker mobile](../review/open-lucky-tokens-mobile.png). These captures establish interface evidence, not funded transaction or deployment evidence.
