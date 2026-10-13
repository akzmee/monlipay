---
version: 1
slug: "web-src-app-create-lucky-page-tsx"
primary_target: "web/src/app/create/lucky/page.tsx"
related_targets: ["web/src/app/lucky/page.tsx", "web/src/app/lucky/claim/page.tsx", "web/src/app/create/group/page.tsx", "web/src/components/GroupPaymentClaim.tsx"]
---

# Lucky Link: legacy routes and historical surface

Status: legacy reference. The user approved Group Payment as the current visible feature name. The [Group Payment brief](web-src-app-create-group-page-tsx.md) owns current creation, Equal and Random distribution, access, claim and visual guidance. The existing MonliPay design system continues unchanged.

## Current route contract

`/create/lucky` and `/lucky` redirect to `/create/group`; they are no longer separate creation surfaces. The shared link-type picker names Group payment and opens the canonical route. New links use `/group/claim` with pool ID, chain and vault selector.

Keep `/lucky/claim` compatible with existing Lucky V1/V2 pools. It renders the shared Group claim component in legacy mode, honoring a recognized vault selector and resolving old links without one to the original Lucky deployment. Do not redirect a legacy claim to creation or reinterpret a Random pool as Equal. Group history reads the legacy vaults, preserves vault plus pool ID, and opens the correct canonical claim URL.

## Historical behavior and evidence

Lucky Link was the optional Random pool mode within Create a link. Its open-giveaway extension added Anyone as the default alongside Selected wallets, retained one draw per wallet and the recipient quota, and reused Payment Link's searchable token selector. Random allocation still uses Pyth Entropy: request a draw, wait for assignment, then collect the share. Its variable oracle fee, network gas, pending-draw grace and assigned-share collection remain part of Random behavior under Group Payment.

The prior open-giveaway finish reviewer disposition was **ship**, with no material fixes. Historical captures cover the default Anyone form, Selected wallets and shared token picker at desktop and mobile widths, including a light Selected wallets state: [desktop](../review/open-lucky-desktop.png), [mobile](../review/open-lucky-mobile.png), [selected desktop](../review/open-lucky-selected-desktop.png), [selected mobile light](../review/open-lucky-selected-light-mobile.png), [token picker desktop](../review/open-lucky-tokens-desktop.png), and [token picker mobile](../review/open-lucky-tokens-mobile.png). These establish the earlier interface and shared component lineage, not the current Equal flow or funded transaction evidence.

Preserve the historical Lucky name in old evidence where it describes what was recorded. Visible current product guidance uses Group Payment and distinguishes Equal amount from Random amount. Internal `LuckyArtwork`, `lucky-*` classes and LuckyVault contracts are implementation lineage, not a second visual authority. No global design file, token, asset or legacy contract is changed by this documentation update.
