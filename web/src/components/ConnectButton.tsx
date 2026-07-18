"use client";

import { useState } from "react";
import { ConnectButton as RKConnectButton } from "@rainbow-me/rainbowkit";
import { monadChain, isMainnet } from "@/config/chain";
import { NetworkSwitcherModal } from "./NetworkSwitcherModal";

/**
 * Wrapper around RainbowKit's ConnectButton with custom branding.
 *
 * Layout (left → right) is always `[primary action][chain pill]` so the
 * navbar never shifts when the user transitions between states:
 *
 *   Disconnected:        [Connect Wallet] [green dot — "Monad online"]
 *   Connected + correct: [account address] [green dot — click = network modal]
 *   Connected + wrong:   [account address] [amber Wrong Network]
 *
 * The chain pill is always present and always 36×36 px (h-9 w-9) so it
 * renders identically in light and dark mode. The green dot doubles as a
 * "Monad network is reachable" signal even before the user connects, so
 * the page doesn't feel empty.
 *
 * Click behavior of the chain pill:
 *   - Disconnected → opens network switcher modal
 *   - Connected    → opens network switcher modal
 *     (Used to open RainbowKit's chain modal, but since MonliPay is
 *      single-chain per deployment, the more useful action is jumping
 *      between the testnet and mainnet deployments.)
 *
 * The "Wrong Network" amber button still opens RainbowKit's chain modal,
 * because that case genuinely needs the user to switch their wallet to
 * the deployment's chain.
 */
export function ConnectButton() {
  const [showNetworkModal, setShowNetworkModal] = useState(false);

  const currentNetworkLabel = isMainnet ? "Mainnet" : "Testnet";

  return (
    <>
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
          const isWrongChain =
            mounted && connected && chain.id !== monadChain.id;

          return (
            <div
              className="flex items-center gap-2"
              {...(!mounted && {
                "aria-hidden": true,
                style: {
                  opacity: 0,
                  pointerEvents: "none",
                  userSelect: "none",
                },
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
                  {/* Online indicator — clicking opens the network
                      switcher modal (testnet ↔ mainnet), NOT the wallet
                      modal. The user shouldn't have to connect a wallet
                      just to pick which deployment they want to use. */}
                  <button
                    onClick={() => setShowNetworkModal(true)}
                    type="button"
                    aria-label={`Monad ${currentNetworkLabel} online. Click to switch network.`}
                    title={`Monad ${currentNetworkLabel}`}
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
                    {account.address.slice(0, 6)}...
                    {account.address.slice(-4)}
                  </button>
                  {/* Chain indicator — green dot only. Click opens the
                      network switcher modal so users can jump between
                      testnet and mainnet deployments.
                      Fixed dimensions ensure identical size in light and
                      dark mode. */}
                  <button
                    onClick={() => setShowNetworkModal(true)}
                    type="button"
                    aria-label={`Connected to Monad ${currentNetworkLabel}. Click to switch network.`}
                    title={`Monad ${currentNetworkLabel}`}
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

      <NetworkSwitcherModal
        open={showNetworkModal}
        onClose={() => setShowNetworkModal(false)}
      />
    </>
  );
}
