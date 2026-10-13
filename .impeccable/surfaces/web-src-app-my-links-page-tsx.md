---
version: 1
slug: "web-src-app-my-links-page-tsx"
primary_target: "web/src/app/my-links/page.tsx"
related_targets: ["web/src/components/GroupLinkHistory.tsx", "web/src/components/PrivateLinkHistory.tsx", "web/src/components/LinkBackupPanel.tsx", "web/src/app/lucky.css"]
---

# My Links

Mode: Operate. Extend MonliPay's established ink/lilac workspace. One wallet-scoped history entry point, with All links, Payment links, Private links on mainnet, and Group Payments filters. Flat rows show amounts, lifecycle status, and a clear action. Payment metadata respects token decimals; unknown values are base units. Random allocation is not labelled withdrawal. Refund requires a deliberate wallet confirmation. A failure of payment indexing must not hide Group or private history. No aggregate balances, invented activity, or statistics. Mobile rows stack actions below amounts.

## Passkey access and saved links

The user rejected the visible “backup” feature and manual recovery-key setup as too cumbersome. The approved MVP direction uses a passkey, preserves client-side encryption and avoids server custody of the decryption secret. Primary task: Create → Share → My Links → Open link. The visual world remains unchanged.

A flat inline access area replaces the large backup panel. Wallet verification controls storage access; a passkey opens the encryption key. New users see Use passkey, then their device's native prompts; no recovery string or download appears. Legacy profiles enter their previous key once to migrate, without replacing stored records. The old key remains an optional recovery route for those migrated profiles only. No replacement or reset is implied.

The page retains history, amounts, status, refund controls, filters and independent saved-link access. Opening exposes a bounded URL, copy, QR and hide actions. Refresh, wallet change and 15-minute idle timeout lock decrypted links. Saving success is acknowledged by the server, with explicit retry on failure. Browser/provider incompatibility and cancelled ceremonies explain the next action without breaking creation or erasing existing links.

Quality bar: existing ink/lilac semantic themes, quiet Geist hierarchy, native controls with visible labels and focus, minimum established touch targets, desktop/mobile stacking, no new cards/icons/typography. Required evidence: locked/unlocked links, new passkey setup, unsupported provider, compact creation, home privacy explanation and privacy detail page. Do not expose test recovery keys in captures. The demo payment is already claimed, with real testnet state.

Home keeps payment links as the main promise and uses the established two-column guide layout to explain passkey encryption and optional private payments. /privacy uses a restrained reading layout. Standard payments remain public; Private Payment shields transfers within AnomaPay but does not hide public deposits and withdrawals or data from its proving service. No complete-anonymity claim, audit badge, enterprise certification or promise of universal passkey compatibility.

## Private links extension

The shared access area opens saved Payment Links and private payment records with the same passkey-protected key. Its saved Payment Link count excludes private records. On mainnet, the separate Private links section remains visible while locked and directs users to open their passkey above. An unlocked section shows the amount and an action, with a quiet route back to Private balance and activity.

Completed creation reads “Created · open to check claim status”; copy and Open or reclaim expose the bearer link. This is not a claim receipt or a remaining-balance guarantee. Failed operations read “Not completed”; unresolved operations read “In progress”. Both retain Check activity. Private links have no expiry or automatic refund; reclaim competes with the recipient's claim for the same unspent balance.

Keep the existing flat history rows, tabular amounts, muted metadata, semantic theme colors and mobile action stacking. The final private-history desktop/mobile captures show an unfunded failed-record fixture, not successful payment evidence. Review resolved the failed-state label and retained its recovery action.

## Group Payment extension

Group Payments replaces the visible Lucky Links filter and section name. `GroupLinkHistory` reads the configured Equal GroupVault and both legacy Lucky vaults. Each row keeps its vault address with its pool ID, so overlapping IDs remain distinct and View link opens the correct `/group/claim` URL. Legacy Random pools remain available in this same history.

Rows distinguish Equal payments claimed from Random shares reserved, and label the distribution beside the pool ID and lifecycle status. A settled Random allocation is not proof of collection. View refund remains the action when unallocated funds can be recovered; the claim page owns the wallet-confirmed refund. Keep independent vault errors, retry, wallet-scoped pagination, existing flat rows and mobile stacking. This is an ordinary extension with no new visual primitives. The [Group surface brief](web-src-app-create-group-page-tsx.md) records the current creation and claim contract and the six reviewed captures; those captures do not add a new My Links visual test.
