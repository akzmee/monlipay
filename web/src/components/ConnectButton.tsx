"use client";

import { ConnectButton as RKConnectButton } from "@rainbow-me/rainbowkit";
import { monadChain } from "@/config/chain";

/**
 * Wrapper around RainbowKit's ConnectButton with custom branding.
 *
 * Layout (left → right) is always `[primary action][chain pill]` so the
 * navbar never shifts when the user transitions between states:
 *
 *   Disconnected:        [Connect Wallet] [green dot — "Monad online"]
 *   Connected + correct: [account address] [green dot — click = chain modal]
 *   Connected + wrong:   [account address] [amber Wrong Network]
 *
 * The chain pill is always present and always 36×36 px (h-9 w-9) so it
 * renders identically in light and dark mode. The green dot doubles as a
 * "Monad network is reachable" signal even before the user connects, so
 * the page doesn't feel empty.
 *
 * Click behavior of the chain pill depends on state:
 *   - Disconnected → openConnectModal (can't switch chain without wallet)
 *   - Connected    → openChainModal (switch between Monad Testnet/Mainnet)
 */
export function ConnectButton() {
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
            className="flex items-center gap-2"
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
                {/* Online indicator — signals "Monad network is reachable"
                    before the user connects. Click falls through to the
                    connect modal because switching chains requires a wallet. */}
                <button
                  onClick={openConnectModal}
                  type="button"
                  aria-label={`${monadChain.name} online. Click to connect wallet.`}
                  title={`${monadChain.name} online`}
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
                {/* Chain indicator — green dot only, click opens chain modal.
                    Fixed dimensions ensure identical size in light and dark mode. */}
                <button
                  onClick={openChainModal}
                  type="button"
                  aria-label={`Connected to ${chain.name}. Click to switch network.`}
                  title={chain.name}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-300 text-sm font-medium transition-colors hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800"
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                </button>
              </>
            )}
          </div>
        );
      }}
    </RKConnectButton.Custom>
  );
}
