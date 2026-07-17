"use client";

import { ConnectButton as RKConnectButton } from "@rainbow-me/rainbowkit";
import { monadChain } from "@/config/chain";

/**
 * Wrapper around RainbowKit's ConnectButton with custom branding.
 *
 * When connected to the correct chain, shows only a small green dot
 * indicator (no chain name text). Click opens RainbowKit's chain modal
 * where users can switch between Monad Testnet and Mainnet.
 *
 * When on the wrong network, shows an amber pulsing "Wrong Network" badge.
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
            {...(!mounted && {
              "aria-hidden": true,
              style: { opacity: 0, pointerEvents: "none", userSelect: "none" },
            })}
          >
            {!connected ? (
              <button
                onClick={openConnectModal}
                type="button"
                className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:from-violet-500 hover:to-indigo-500 active:scale-95"
              >
                Connect Wallet
              </button>
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
              <div className="flex items-center gap-2">
                {/* Chain indicator — green dot only, click opens chain modal */}
                <button
                  onClick={openChainModal}
                  type="button"
                  aria-label={`Connected to ${chain.name}. Click to switch network.`}
                  className="flex items-center gap-1.5 rounded-lg border border-stone-300 px-2.5 py-2 text-sm font-medium transition-colors hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800"
                  title={chain.name}
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                </button>
                {/* Account button */}
                <button
                  onClick={openAccountModal}
                  type="button"
                  className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium font-mono transition-colors hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800"
                >
                  {account.address.slice(0, 6)}...{account.address.slice(-4)}
                </button>
              </div>
            )}
          </div>
        );
      }}
    </RKConnectButton.Custom>
  );
}
