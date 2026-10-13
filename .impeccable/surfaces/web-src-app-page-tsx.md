---
version: 1
slug: "web-src-app-page-tsx"
primary_target: "web/src/app/page.tsx"
related_targets: ["web/src/components/NavBar.tsx","web/src/app/layout.tsx","web/src/app/globals.css","web/src/components/DemoVideo.tsx","web/src/app/privacy/page.tsx"]
---

# MonliPay landing

Mode: Persuade. The user explicitly requested a consistent Metropolis-inspired identity while extending MonliPay; this landing leads with MonliPay as a payment-link product. Private Payment and Lucky Link are optional creation modes, per the user’s payment-first direction.

## Direction contract

THESIS: Create a link and easily send MON or tokens. Make sending tangible with an envelope and one primary Create a link action.

OWN-WORLD: Ink ground, restrained square grid from the user-pinned Metropolis reference, Chakra Petch angular display lettering, Geist UI, solid lilac action, and one prismatic vector envelope shared with creation and claim screens.

STORY: Understand payment links, choose Create a link, then use the default Payment link or choose an optional mode. The ordered sequence explains creating, sharing and claiming; Lucky Link supports group sharing. A later privacy section explains passkey encryption and Private Payment on mainnet without changing the hero's main promise.

FIRST VIEWPORT: Left-aligned three-line display headline, two actions and short supporting copy; a large envelope fills the right. Below, a separated row anchors Monad and group distribution. Mobile stacks copy, actions and illustration, with the primary action preceding the artwork.

FORM: User-pinned reference extended directly from the app's new visual system. No generated comp or invented trust claims. The user's request for animation and parallax “seperti web3 native” adds a brief hero arrival and bounded artwork depth. Text and actions remain stationary during scroll; the functional envelope-opening moment remains independent in the claim flow. Reduced motion shows the static landing and immediate final claim state.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Landing motion extension

Keep the original envelope, typography, palette, composition, and payment-first copy. The title arrives in `560ms`, the envelope in `760ms`, and its two shares in `720ms` and `800ms`, using `cubic-bezier(0.16, 1, 0.3, 1)`. Landing action arrows shift slightly on hover or keyboard focus; controls retain visible focus and their existing targets.

Scroll parallax moves the envelope, shares, and background grid at different depths. Maximum envelope travel is `110px`, reduced to `30px` at widths up to `640px`; the headline, explanatory text, and calls to action stay on the page plane. Fine mouse input adds bounded perspective with a `260ms` settling transition. Coarse and touch input do not tilt the artwork. Updates use event-triggered animation frames, stop while the hero is offscreen or the document is hidden, and introduce no continuous loops. The enhancement cleans up its listeners, observer, and pending frame on disposal.

Reduced motion removes the arrival, parallax, perspective, and arrow movement, leaving the complete static hero visible. The server-rendered content and calls to action also work without JavaScript. Landing decoration does not signal claim assignment or alter the claim flow's existing envelope reveal.

The finish review is **ship**, with no material fixes: [motion-finish-review.md](../../output/playwright/motion-finish-review.md). [Verification](../../output/playwright/motion-verification.json) records pointer and scroll behavior, reduced motion, actual keyboard navigation, coarse-pointer behavior, no-JavaScript navigation, overflow checks from `320px` through `1440px`, lint, type checking, and mainnet/testnet builds. Browser coverage uses Chromium desktop and mobile emulation; it does not establish physical low-end-device performance.

Reviewed captures: [desktop dark](../../output/playwright/motion-desktop-dark.png), [desktop light](../../output/playwright/motion-desktop-light.png), [desktop scrolled](../../output/playwright/motion-desktop-scrolled.png), [mobile dark](../../output/playwright/motion-mobile-dark.png), [mobile light](../../output/playwright/motion-mobile-light.png), and [reduced motion](../../output/playwright/motion-reduced.png), compared with the [baseline](../../output/playwright/motion-before.png). The extension adds no raster asset or product capability.

## Privacy and demo extension

Reuse the established two-column guide: the left introduces saved links encrypted on the device and passkey access without a recovery file; the right distinguishes protection of saved claim secrets from optional shielded transfers. Keep the visible limits beside the Private Payment introduction: deposits and withdrawals remain public, and the proving service can see transfer details. Link to both /privacy and /create/private. Private Payment is a Monad mainnet beta, not complete anonymity.

The demo remains a native controlled player with captions, download and a concise expandable walkthrough of normal product instructions. The user removed the internal paragraph about automated testnet activity and the separately verified funded pilot. Historical evidence remains in developer records: the video records Payment and Lucky Link transactions on testnet, using valueless Demo USD, and a private-payment interface walkthrough. The funded WMON mainnet pilot was verified separately; do not present the walkthrough or unfunded browser fixtures as live transaction evidence.

/privacy remains a quiet reading surface using Geist, the existing 800px reading width, thin section rules and semantic text colors. Its approved scope includes passkey support and loss, public chain activity, provider visibility including Galileo's discovery key, server metadata, first-spend-wins private reclaim, fees and the limited funded-test scope. No new visual authority or security certification is introduced.

## MonliPay identity and copy refinement

The user approved an original folded-M MonliPay mark in the existing violet visual world. Shared navigation uses `MonliPayLogo` at 30px beside the wordmark; the landing footer uses 24px beside the product name. The image is decorative because the adjacent text names the link. App icons use the M on an ink tile, and the envelope uses an M seal. Monad assets remain network and MON token identifiers. This changes app identity assets without changing the palette, typography, layout, or motion contract.

The demo poster is a 1440 × 900 browser capture of the current dark homepage with reduced motion and loaded fonts. The historical 104-second video remains unchanged. `docs/brand-asset-provenance.json` records the vectors, browser-rasterized icons, and screenshot origin; no generative image asset was used.

Visible web copy contains no em dashes. The page title uses a vertical bar; sentences and status labels use ordinary punctuation. The demo retains concise product instructions, while financial and privacy limits remain on the relevant creation, claim, and privacy surfaces.

The brand finish review is **ship**, with no material fixes, across seven desktop/mobile captures at 1440px and 390px, including the light private-payment panel. `docs/brand-release.json` records validation and release status. The `.impeccable/review/brand-*.png` captures cover the home, demo, and private passkey panel. The browser coverage is Chromium emulation; it does not establish physical-device performance. The design frontmatter and sidecar token extensions are unchanged; identity prose and the sidecar envelope seal now match the implementation.
