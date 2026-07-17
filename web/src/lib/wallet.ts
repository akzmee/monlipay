/**
 * Mobile wallet detection and deep link utilities.
 *
 * On mobile browsers (Safari, Chrome), the injected provider is not available.
 * We detect this and offer to open the dApp inside the wallet's built-in browser,
 * where the provider IS available.
 *
 * Deep link formats:
 * - MetaMask:    https://metamask.app.link/dapp/{url}
 * - Rabby:       (no deep link, uses WalletConnect)
 * - Trust Wallet: https://link.trustwallet.com/open_url?coin_id=20000714&url={url}
 */

/**
 * Detect if the user is on a mobile device.
 */
export function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
}

/**
 * Detect if a wallet provider (ethereum object) is injected.
 * This tells us if we're inside a wallet's built-in browser.
 */
export function hasInjectedProvider(): boolean {
  if (typeof window === "undefined") return false;
  return !!window.ethereum || !!(window as any).rabby;
}

/**
 * Check if the user is on mobile AND doesn't have an injected provider.
 * This means they opened the link in a regular browser (Safari/Chrome)
 * and need to switch to a wallet browser to interact with the dApp.
 */
export function needsWalletBrowser(): boolean {
  return isMobile() && !hasInjectedProvider();
}

/**
 * Generate a MetaMask deep link to open the current dApp inside MetaMask.
 */
export function getMetaMaskDeepLink(currentUrl?: string): string {
  const url = currentUrl ?? (typeof window !== "undefined" ? window.location.href : "");
  const encoded = encodeURIComponent(url);
  return `https://metamask.app.link/dapp/${url.replace(/^https?:\/\//, "")}`;
}

/**
 * Generate a Trust Wallet deep link.
 */
export function getTrustWalletDeepLink(currentUrl?: string): string {
  const url = currentUrl ?? (typeof window !== "undefined" ? window.location.href : "");
  return `https://link.trustwallet.com/open_url?coin_id=20000714&url=${encodeURIComponent(url)}`;
}
