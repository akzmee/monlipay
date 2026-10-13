"use client";

import { useState } from "react";
import { ConnectButton as RKConnectButton } from "@rainbow-me/rainbowkit";
import { monadChain, isMainnet } from "@/config/chain";
import { NetworkSwitcherModal } from "./NetworkSwitcherModal";
import { useWalletEntry } from "./WalletEntryContext";

/** Branded wrapper around RainbowKit ConnectButton. The chain pill opens the cross-domain network switcher; "Wrong Network" opens RainbowKit's chain modal. */
export function ConnectButton() {
  const entry = useWalletEntry();
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
                    onClick={entry?.open ?? openConnectModal}
                    disabled={entry ? !entry.ready : false}
                    type="button"
                    className="mp-button mp-button-primary mp-wallet-button"
                  >
                    {entry ? "Get started" : "Connect Wallet"}
                  </button>
                  {/* Online indicator — opens the network switcher. */}
                  <button
                    onClick={() => setShowNetworkModal(true)}
                    type="button"
                    aria-label={`Monad ${currentNetworkLabel} online. Click to switch network.`}
                    title={`Monad ${currentNetworkLabel}`}
                    className="hidden sm:flex h-11 w-11 items-center justify-center rounded-lg border border-stone-300 text-sm font-medium transition-colors hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800"
                  >
                    <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                  </button>
                </>
              ) : isWrongChain ? (
                <button
                  onClick={openChainModal}
                  type="button"
                  aria-label="Wrong network"
                  className="flex min-h-11 items-center gap-2 rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-300"
                >
                  <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                  <span className="hidden sm:inline">Wrong Network</span>
                </button>
              ) : (
                <>
                  {/* Account button */}
                  <button
                    onClick={entry?.openAccount ?? openAccountModal}
                    type="button"
                    className="mp-wallet-account min-h-11 rounded-md border border-stone-300 px-3 py-2 text-sm font-medium font-mono transition-colors hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800"
                  >
                    {account.address.slice(0, 6)}...
                    {account.address.slice(-4)}
                  </button>
                  {/* Chain indicator — opens the network switcher. */}
                  <button
                    onClick={() => setShowNetworkModal(true)}
                    type="button"
                    aria-label={`Connected to Monad ${currentNetworkLabel}. Click to switch network.`}
                    title={`Monad ${currentNetworkLabel}`}
                    className="hidden sm:flex h-11 w-11 items-center justify-center rounded-lg border border-stone-300 text-sm font-medium transition-colors hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800"
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
