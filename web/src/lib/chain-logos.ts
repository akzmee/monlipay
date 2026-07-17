/**
 * Chain slug & logo URI mappings shared by server and client.
 *
 * Trustwallet/assets organizes chain-level assets under
 * `blockchains/<slug>/info/logo.png` where <slug> is NOT the chain shortName
 * (e.g. BNB Chain slug is "binance", Avalanche is "avalanchex"). This module
 * is the single source of truth for those slugs.
 *
 * Verified 200 OK on 2025-07-17.
 */

/** Trustwallet blockchain slug for each supported chain ID. */
export const CHAIN_SLUGS: Record<number, string> = {
  1: "ethereum",
  10: "optimism",
  8453: "base",
  42161: "arbitrum",
  137: "polygon",
  56: "binance",
  43114: "avalanchex",
  // Monad (destination) — only used as a sanity fallback, MON has its own
  // brand-kit SVG in /public/monad/token-mon.svg that takes precedence.
  10143: "monad",
  143: "monad",
};

/**
 * Logo URL for a chain's primary asset (i.e. the chain icon itself, which is
 * visually identical to its native token icon for ETH/MATIC/BNB/AVAX/MON).
 *
 * Returns undefined for unknown chain IDs so callers can fall back to the
 * gradient avatar rather than rendering a broken image.
 */
export function chainLogoUri(chainId: number): string | undefined {
  const slug = CHAIN_SLUGS[chainId];
  if (!slug) return undefined;
  return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${slug}/info/logo.png`;
}

/**
 * Logo URL for an ERC-20 token on a given chain, using trustwallet/assets.
 *
 * Note: the address MUST be EIP-55 checksummed for the URL to resolve.
 * Returns undefined if the chain is unknown so callers can fall back.
 */
export function erc20LogoUri(
  chainId: number,
  checksummedAddress: string,
): string | undefined {
  const slug = CHAIN_SLUGS[chainId];
  if (!slug) return undefined;
  return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${slug}/assets/${checksummedAddress}/logo.png`;
}
