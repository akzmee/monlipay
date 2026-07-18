"use client";

import { useState, useRef, useEffect } from "react";
import { ConnectButton as RKConnectButton } from "@rainbow-me/rainbowkit";
import { monadChain, isMainnet } from "@/config/chain";

/**
 * Cross-domain network switcher URLs.
 *
 * Each deployment lives on its own subdomain and is built with a different
 * NEXT_PUBLIC_NETWORK env var, so "switching network" means redirecting to a
 * different origin. We hardcode the production URLs here because:
 *   1. They are stable for the foreseeable future (hackathon + early mainnet).
 *   2. Exposing them via NEXT_PUBLIC_* would add config ceremony without value.
 *
 * During local dev (localhost / 127.0.0.1) the dropdown opens but clicking the
 * "other" network just keeps you on the same origin — we don't want to bounce
 * a developer to production mid-debug.
 */
const NETWORK_URLS = {
  testnet: "https://testnet.monlipay.xyz",
  mainnet: "https://monlipay.xyz",
} as const;

/**
 * Returns true if the current page is running on a non-production origin
 * (localhost, 127.0.0.1, or any *.vercel.app preview branch). On those
 * origins the network dropdown shows but does not redirect.
 */
function isDevOrigin(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".vercel.app") ||
    host.endsWith(".local")
  );
}

/**
 * Wrapper around RainbowKit's ConnectButton with custom branding.
 *
 * Layout (left → right) is always `[primary action][chain pill]` so the
 * navbar never shifts when the user transitions between states:
 *
 *   Disconnected:        [Connect Wallet] [green dot — "Monad online"]
 *   Connected + correct: [account address] [green dot — click = network menu]
 *   Connected + wrong:   [account address] [amber Wrong Network]
 *
 * The chain pill is always present and always 36×36 px (h-9 w-9) so it
 * renders identically in light and dark mode. The green dot doubles as a
 * "Monad network is reachable" signal even before the user connects, so
 * the page doesn't feel empty.
 *
 * Click behavior of the chain pill:
 *   - Disconnected → opens cross-domain network switcher dropdown
 *   - Connected    → opens cross-domain network switcher dropdown
 *     (Used to open RainbowKit's chain modal, but since MonliPay is
 *      single-chain per deployment, the more useful action is jumping
 *      between the testnet and mainnet deployments.)
 *
 * The "Wrong Network" amber button still opens RainbowKit's chain modal,
 * because that case genuinely needs the user to switch their wallet to
 * the deployment's chain.
 */
export function ConnectButton() {
  const [showNetworkMenu, setShowNetworkMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or Escape.
  useEffect(() => {
    if (!showNetworkMenu) return;

    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowNetworkMenu(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setShowNetworkMenu(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showNetworkMenu]);

  function handleSelectNetwork(target: "testnet" | "mainnet") {
    setShowNetworkMenu(false);
    if (target === (isMainnet ? "mainnet" : "testnet")) {
      // Same network — no-op.
      return;
    }
    if (isDevOrigin()) {
      // Don't bounce devs to production; just log it.
      console.info(
        `[network] Would redirect to ${target} (${NETWORK_URLS[target]}) in production.`,
      );
      return;
    }
    window.location.href = NETWORK_URLS[target];
  }

  const currentNetworkLabel = isMainnet ? "Mainnet" : "Testnet";
  const otherNetwork: "testnet" | "mainnet" = isMainnet ? "testnet" : "mainnet";
  const otherNetworkLabel = isMainnet ? "Testnet" : "Mainnet";

  return (
    <RKConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const connected = !!account && !!chain;
        const isWrongChain = mounted && connected && chain.id !== monadChain.id;

        return (
          <div
            className="relative flex items-center gap-2"
            ref={menuRef}
            {...(!mounted && {
              "aria-hidden": true,
              style: { opacity: 0, pointerEvents: "none", userSelect: "none" },
            })}
          >
            {!connected ? (
              <>
                <button
                  onClick={openConnectModal}
                  type="button"
                  className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:from-violet-500 hover:to-indigo-500 active:scale-95"
                >
                  Connect Wallet
                </button>
                {/* Online indicator — clicking opens the cross-domain
                    network switcher (testnet ↔ mainnet), NOT the wallet
                    modal. The user shouldn't have to connect a wallet just
                    to pick which deployment they want to use. */}
                <button
                  onClick={() => setShowNetworkMenu((v) => !v)}
                  type="button"
                  aria-label={`Monad ${currentNetworkLabel} online. Click to switch network.`}
                  title={`Monad ${currentNetworkLabel}`}
                  aria-expanded={showNetworkMenu}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-300 text-sm font-medium transition-colors hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800"
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                </button>
              </>
            ) : isWrongChain ? (
              <button
                onClick={openChainModal}
                type="button"
                aria-label="Wrong network"
                className="flex items-center gap-2 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-300"
              >
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                <span className="hidden sm:inline">Wrong Network</span>
              </button>
            ) : (
              <>
                {/* Account button */}
                <button
                  onClick={openAccountModal}
                  type="button"
                  className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium font-mono transition-colors hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800"
                >
                  {account.address.slice(0, 6)}...{account.address.slice(-4)}
                </button>
                {/* Chain indicator — green dot only. Click opens the
                    cross-domain network switcher dropdown so users can
                    jump between testnet and mainnet deployments.
                    Fixed dimensions ensure identical size in light and
                    dark mode. */}
                <button
                  onClick={() => setShowNetworkMenu((v) => !v)}
                  type="button"
                  aria-label={`Connected to Monad ${currentNetworkLabel}. Click to switch network.`}
                  title={`Monad ${currentNetworkLabel}`}
                  aria-expanded={showNetworkMenu}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-300 text-sm font-medium transition-colors hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800"
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                </button>
              </>
            )}

            {/* Cross-domain network switcher dropdown.
                Renders for all states (connected or disconnected) because
                picking a deployment is orthogonal to wallet state. */}
            {showNetworkMenu && (
              <div
                role="menu"
                aria-label="Switch network"
                className="absolute right-0 top-11 z-50 w-48 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-lg dark:border-stone-700 dark:bg-stone-900"
              >
                <div className="border-b border-stone-100 px-3 py-2 text-xs font-medium uppercase tracking-wide text-stone-500 dark:border-stone-800 dark:text-stone-400">
                  Network
                </div>

                {/* Active network (current deployment) */}
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked="true"
                  onClick={() =>
                    handleSelectNetwork(isMainnet ? "mainnet" : "testnet")
                  }
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-stone-50 dark:hover:bg-stone-800"
                >
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Monad {currentNetworkLabel}
                  </span>
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    Active
                  </span>
                </button>

                {/* Other network (redirect target) */}
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked="false"
                  onClick={() => handleSelectNetwork(otherNetwork)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-stone-50 dark:hover:bg-stone-800"
                >
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-stone-300 dark:bg-stone-600" />
                    Monad {otherNetworkLabel}
                  </span>
                  <span className="text-xs text-stone-400 dark:text-stone-500">
                    Switch →
                  </span>
                </button>

                {isDevOrigin() && (
                  <div className="border-t border-stone-100 px-3 py-2 text-xs text-stone-400 dark:border-stone-800 dark:text-stone-500">
                    Dev mode: redirect disabled on localhost
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }}
    </RKConnectButton.Custom>
  );
}
