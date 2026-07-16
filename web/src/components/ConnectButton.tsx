"use client";

import { ConnectButton as RKConnectButton } from "@rainbow-me/rainbowkit";
import { monadChain } from "@/config/chain";

/**
 * Wrapper around RainbowKit's ConnectButton with custom branding.
 *
 * Uses RainbowKit's render prop API to customize the button label
 * and ensure the modal shows our brand colors (configured in Providers).
 *
 * When the user is on the wrong network, RainbowKit automatically
 * shows a "Wrong network" button that prompts switching.
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
                className="rounded-lg bg-gradient-to-r from-red-600 to-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:from-red-500 hover:to-orange-400 active:scale-95"
              >
                Connect Wallet
              </button>
            ) : isWrongChain ? (
              <button
                onClick={openChainModal}
                type="button"
                className="flex items-center gap-2 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-300"
              >
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                Wrong Network
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={openChainModal}
                  type="button"
                  className="flex items-center gap-2 rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium transition-colors hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800"
                >
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="hidden sm:inline">{chain.name}</span>
                </button>
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
