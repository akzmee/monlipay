---
name: MonliPay
description: Ink, lilac, angular lettering, and a prismatic envelope on Monad.
colors:
  ground-dark: "#111116"
  panel-dark: "#19191f"
  line-dark: "#373540"
  ink-dark: "#f4f2fa"
  muted-dark: "#b6b0c4"
  action-dark: "#a58bff"
  action-hover-dark: "#bba7ff"
  action-ink-dark: "#19102f"
  lilac-dark: "#302644"
  error-dark: "#ffb0be"
  notice-dark: "#d3c5ff"
  ground-light: "#f5f4fa"
  panel-light: "#ffffff"
  field-light: "#f7f6fb"
  line-light: "#dcd9e8"
  ink-light: "#211a36"
  muted-light: "#655d76"
  action-light: "#6944d7"
  action-hover-light: "#5635b9"
  lilac-light: "#ece7ff"
  error-light: "#b02946"
  notice-light: "#55418e"
typography:
  display:
    fontFamily: "Chakra Petch, Geist, sans-serif"
    fontSize: "clamp(3.5rem, 6.6vw, 6rem)"
    fontWeight: 600
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 650
    lineHeight: 1.1
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
  account:
    fontFamily: "Geist Mono, monospace"
    fontSize: "0.875rem"
    fontWeight: 500
rounded:
  chip: "5px"
  control: "6px"
  icon-control: "8px"
  panel: "10px"
spacing:
  inline-tight: "8px"
  inline: "12px"
  field-inset: "16px"
  panel-mobile: "20px"
  section: "24px"
  panel: "28px"
  heading: "32px"
  workspace-gap: "48px"
components:
  button-primary-dark:
    backgroundColor: "{colors.action-dark}"
    textColor: "{colors.action-ink-dark}"
    rounded: "{rounded.control}"
    padding: "12px 20px"
  button-primary-hover-dark:
    backgroundColor: "{colors.action-hover-dark}"
  button-primary-light:
    backgroundColor: "{colors.action-light}"
    textColor: "{colors.panel-light}"
    rounded: "{rounded.control}"
    padding: "12px 20px"
  button-primary-hover-light:
    backgroundColor: "{colors.action-hover-light}"
  button-secondary-dark:
    backgroundColor: "transparent"
    textColor: "{colors.ink-dark}"
    rounded: "{rounded.control}"
    padding: "12px 20px"
  button-secondary-hover-dark:
    backgroundColor: "{colors.lilac-dark}"
  text-link-dark:
    textColor: "{colors.action-dark}"
    typography: "{typography.label}"
  input-dark:
    backgroundColor: "{colors.ground-dark}"
    textColor: "{colors.ink-dark}"
    rounded: "{rounded.control}"
    padding: "11px 13px"
  panel-dark:
    backgroundColor: "{colors.panel-dark}"
    textColor: "{colors.ink-dark}"
    rounded: "{rounded.panel}"
    padding: "28px"
  network-tag-dark:
    textColor: "{colors.muted-dark}"
    rounded: "{rounded.chip}"
    padding: "5px 8px"
  contact-option-selected-dark:
    backgroundColor: "{colors.lilac-dark}"
    textColor: "{colors.ink-dark}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
---

# Design System: MonliPay

## Overview

**Creative North Star: "Metropolis: ink, lilac, prismatic geometry"**

MonliPay carries the user-selected Monad Metropolis visual world into a calm payment interface. Near-neutral ink, angular display lettering, a restrained square grid, and an original faceted envelope give the system its identity. Lilac connects the illustration, emphasis, and primary actions; white and muted lavender text keep the hierarchy clear.

Large expressive typography belongs to the landing. Working screens use quieter Geist headings, ordinary form controls, generous insets, and thin dividers. The envelope supplies the playful material and the claim reveal; the surrounding interface stays legible and still. The same roles translate to cool paper and white panels in light mode.

This record covers the landing, payment-link creation, Lucky Link creation and claim surfaces, contacts, and shared navigation. Its source of truth is the built CSS and components, checked against browser captures. Older payment-success, bridge, wallet-modal, and invoice styling is not an additional visual authority.

**Key Characteristics:**

- Near-neutral ink and cool paper themes with solid lilac actions.
- Angular Chakra Petch display paired with clear Geist interface type.
- A fine square grid and one reusable prismatic envelope.
- Slightly rounded controls, thin borders, and flat working surfaces.
- Responsive stacking and an immediate reveal under reduced motion.

## Colors

The palette is a restrained violet family over near-neutral surfaces; the frontmatter records the actual theme values from `web/src/app/lucky.css`.

### Primary

- **Action Lilac** (`action-dark`, `action-hover-dark`): filled actions, text links, selected contact borders, the caret, and display emphasis on dark ground. The action label uses deep ink.
- **Action Violet** (`action-light`, `action-hover-light`): the corresponding light-mode roles, with white labels on filled actions.
- **Quiet Lilac** (`lilac-dark`, `lilac-light`): selected recipients, notices, loading placeholders, and the claim illustration compartment.

### Neutral

- **Ink Ground / Cool Paper** (`ground-dark`, `ground-light`): the page field. Dark inputs also use Ink Ground.
- **Raised Ink / White Panel** (`panel-dark`, `panel-light`): working panels, separated from their ground by a fine boundary.
- **Cool Field** (`field-light`): the light-mode input fill.
- **Soft Chalk / Deep Ink** (`ink-dark`, `ink-light`): headings, entered values, and primary copy.
- **Muted Lavender / Muted Plum** (`muted-dark`, `muted-light`): explanatory copy, hints, counts, and secondary data.
- **Quiet Boundary** (`line-dark`, `line-light`): input outlines, panel edges, summary rules, and the grid.
- **Notice Violet** (`notice-dark`, `notice-light`) and **Error Rose** (`error-dark`, `error-light`): readable status and error text, always accompanied by words.

The SVG envelope owns its lavender facets, pink edge, and small green and pink shares. These are illustration materials, not extra action or form-status colors. Preserve the supplied Monad mark as an identity asset.

**The Theme Pair Rule.** Switch semantic roles together: ground, panel, field, boundary, ink, muted copy, action, and action-label contrast. Do not transplant a dark-mode action label into light mode.

## Typography

**Display Font:** Chakra Petch SemiBold, with Geist and sans-serif fallbacks.
**Body Font:** Geist, with system-ui and sans-serif fallbacks.
**Label/Mono Font:** Geist for labels; Geist Mono for the connected wallet address.

Both main families are bundled locally. Chakra Petch gives the landing its angular silhouette; Geist carries forms, facts, and navigation without making operational screens resemble posters.

### Hierarchy

- **Display:** use the frontmatter display role for the landing hero. Below the compact breakpoint it changes to a viewport-responsive size (`clamp(2.875rem, 12.2vw, 4.375rem)`). Landing section headings use Chakra Petch at a smaller scale (`clamp(2rem, 3.5vw, 3rem)`, line-height `1.12`).
- **Headline:** use the frontmatter headline role for workspace titles; compact screens reduce it (`2rem`).
- **Title:** use the frontmatter title role for panel headings. Preview titles are larger (`1.875rem`, line-height `1.18`, weight `600`), reducing to (`1.5rem`) on compact screens.
- **Body:** use Geist with relaxed leading for explanatory copy. The hero introduction is slightly larger (`1.0625rem`, line-height `1.7`) and restrained in width (`400px`). Form hints are smaller (`0.8125rem`, line-height `1.65`).
- **Label:** use the frontmatter label role for fields. Filled buttons increase the weight (`600`); supporting text and navigation remain visually quieter.
- **Amounts:** use tabular numerals for pool amounts, summaries, and reveals. The claim amount is prominent (`2.5rem`, line-height `1.2`, weight `600`); its token suffix is smaller (`1.25rem`).

**The Display Boundary Rule.** Reserve Chakra Petch for landing display and step numerals. Use Geist for working-screen titles, values, labels, and explanatory copy.

## Layout

Working pages use a centered content width (`1120px`) with side allowance (`48px` total), top space (`56px`), and bottom space (`72px`). Their heading and workspace are separated (`32px`). Primary form and address-book panels use the panel inset; related sections use measured whitespace and a single divider instead of nested cards.

Desktop creation pairs the form and preview in a proportional grid (`1.45fr 1fr`, gap `48px`). Contacts use a wider list beside an add form (`1.8fr 1fr`, gap `24px`). Claim content is capped (`900px`) and splits illustration from details (`1fr 1.35fr`). The landing has a larger outer canvas (`1440px`), left-aligned display, and an oversized envelope; its copy still aligns to the shared content width.

At the intermediate breakpoint (`900px`), the creation gap becomes tighter (`24px`) and contacts stack. At the compact breakpoint (`640px`), workspaces use side gutters (`16px` each), top space (`32px`), and smaller panel insets (`20px`). Creation, success, claim, and contact-gate columns stack. The creation preview artwork and decorative contact stubs disappear, while the summary remains. The landing places actions before its in-flow envelope and uses wider editorial gutters (`24px` each).

At the narrow breakpoint (`360px`), recipient-count and claim-window fields stack at full width. Keep complete labels and selected values visible at (`320px`). Long titles and values wrap; contact address previews truncate within their rows. The shared header switches to its mobile menu below (`1024px`), retains the wallet control, and uses a scrollable full-screen menu below the header.

## Elevation & Depth

Working surfaces are flat: tonal separation, one-pixel boundaries, and generous insets define groups. The envelope earns dimensionality through drawn facets, a ground plane, and one diffuse landing-only drop shadow (`14px 26px 28px #0002`). There is no general card-shadow ladder. The square grid remains a quiet reference material: broad cells behind the hero (`72px`) at low opacity (`0.3`), smaller cells around the preview (`44px`).

**The Material Boundary Rule.** Keep prismatic gradients and dimensional shadows on the envelope artwork; use solid fills and thin boundaries for working controls and panels.

## Shapes

The form language is rectangular with modest corner relief. Use the frontmatter control radius for buttons, inputs, notices, artwork frames, and contact choices; the panel radius for larger containers; the chip radius for small network labels and selected recipient tags. Header icon controls use the icon-control radius. Contact initials are circular, while the envelope and its floating shares use deliberate angular geometry.

Directional icons come from the shared inline SVG system: rounded strokes (`1.5px`) in a square view box (`20 × 20`), normally displayed (`18px`) or inside primary buttons (`20px`). Keep the right, left, and up-right arrows within this family.

## Components

### Buttons

Compact, solid, and readable. Primary actions use theme-specific action and label colors, a transparent border, and the control radius. Their minimum height is (`48px`), with the frontmatter padding and an internal gap (`12px`). Landing actions are slightly taller (`50px`); the wallet control is more compact horizontally.

Hover moves to the theme's action-hover color; pressing shifts the control down (`1px`). Disabled actions reduce opacity (`0.45`) and show a not-allowed cursor. Secondary actions retain the same dimensions with transparent fill, ink text, and a boundary; hover introduces Quiet Lilac. Text actions use Action Lilac or Action Violet and gain an underline on hover.

Global keyboard focus is a visible two-pixel violet outline with an offset (`2px`). Shared interactive states transition over (`150ms`) with `cubic-bezier(0.4, 0, 0.2, 1)`.

### Inputs / Fields

Plain filled fields with a fine boundary, control radius, and minimum height (`46px`). Labels sit above the field; hints follow with relaxed leading. Focus uses the current action color in an outline (`2px`) offset from the field (`3px`). Disabled fields reduce opacity (`0.55`); errors appear as nearby Error Rose text and can wrap long messages.

The amount control combines a large tabular input (`1.75rem`) and token selector in one bordered enclosure. A divider separates the selector; focusing either child outlines the whole group. Textareas remain vertically resizable.

### Chips

Network labels are small outlined tags with muted text. Selected recipient tags use Quiet Lilac, a boundary, and a removable inline label; the removal control has a generous target (`44px`). Saved-contact choices use checkboxes (`18px`) and readable name/address pairs. Selection adds Quiet Lilac and an action-colored border.

### Cards / Containers

Working panels are solid, outlined, and unshadowed. The frontmatter panel primitive applies to the form and contact surfaces. Summary and history items use horizontal rules and aligned text instead of separate floating cards. Claim panels contain an illustration compartment and a plain information compartment; the selected theme governs both.

### Navigation

The sticky header is compact (`64px`) with a thin bottom border. The MonliPay wordmark and Monad mark anchor the left; navigation occupies the center, wallet and theme controls the right. Desktop links use Geist (`0.875rem`, weight `500`), modest rounding, and a minimum target (`44px`). Active links use a violet tint and text, while inactive links remain muted and gain a tonal hover fill. The current utility-level violet values remain local to navigation rather than introducing a second palette for new surfaces.

Mobile moves links into a vertical menu below the header, with larger text (`1rem`), wider padding, a close control, network selection, and theme selection. The wallet action stays visible. Preserve route indication, keyboard focus, and the shared SVG icon family.

### Link-type picker

Creation modes share one heading and a two-column picker capped at (`640px`). Each option has a strong name and a short explanation, with a minimum height (`76px`) and control radius. The current option uses Quiet Lilac and an action-colored border; `aria-current` carries the same state. Labels wrap inside their columns at narrow widths. Expiry choices reuse the same selected treatment with minimum targets (`44px`) and `aria-pressed`.

### Prismatic envelope

Reuse the original `LuckyArtwork` SVG for the landing, preview, success, and claim states. Its facets, pale flap, small seal, floating shares, and quiet cross marks form one recognizable object. The landing is still. When a claim becomes assigned, the flap opens and the shares move using a reveal transition (`650ms`, `cubic-bezier(0.16, 1, 0.3, 1)`). Pending draw dots use a soft opacity cycle (`1.5s`) with short staggered delays.

Reduced motion removes the flap/share transition and pending-dot animation. The assigned state remains visible immediately; no information depends on animation. Global reduced-motion CSS also minimizes other transition and animation durations.

## Do's and Don'ts

### Do:

- **Do** preserve the MonliPay wordmark, supplied Monad mark, and shared original envelope.
- **Do** use paired theme roles so filled actions, fields, and explanatory text remain readable in both modes.
- **Do** keep functional forms quiet and reserve large angular type for the landing.
- **Do** retain the restrained square grid where the implemented reference world uses it.
- **Do** stack narrow fields before their labels or selected values become clipped.
- **Do** use shared SVG arrows, visible focus, and immediate final states under reduced motion.

### Don't:

- **Don't** replace the near-neutral ground with blue-slate surfaces or expand the illustration colors into routine controls.
- **Don't** turn working panels into floating gradient cards; preserve their solid fills and thin boundaries.
- **Don't** substitute glyph arrows for the shared SVG icons.
- **Don't** add overlapping artwork captions or let decoration cross readable content.
- **Don't** promote unreviewed legacy utility styling into new-screen design rules.
