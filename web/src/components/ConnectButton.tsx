"use client";

import { useAccount, useConnect, useDisconnect, useChainId } from "wagmi";
import { useState, useRef, useEffect } from "react";
import { monadChain } from "@/config/chain";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isWrongChain = isConnected && chainId !== monadChain.id;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!isConnected) {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 active:bg-violet-700"
        >
          Connect Wallet
        </button>
        {showDropdown && (
          <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
            {connectors.map((connector) => (
              <button
                key={connector.uid}
                onClick={async () => {
                  try {
                    await connectAsync({ connector });
                    setShowDropdown(false);
                  } catch {
                    // User rejected or error
                  }
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <span className="font-medium">{connector.name}</span>
              </button>
            ))}
            {connectors.length === 0 && (
              <div className="px-4 py-3 text-sm text-neutral-500">
                No wallet detected. Install MetaMask.
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
          isWrongChain
            ? "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
            : "border-neutral-300 hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${isWrongChain ? "bg-amber-500" : "bg-green-500"}`}
        />
        {address && (
          <span className="font-mono">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
        )}
      </button>
      {showMenu && (
        <div className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          {isWrongChain && (
            <div className="border-b border-neutral-200 px-4 py-2 text-xs text-amber-600 dark:border-neutral-700 dark:text-amber-400">
              Wrong network. Switch to Monad Testnet in your wallet.
            </div>
          )}
          <button
            onClick={() => {
              disconnect();
              setShowMenu(false);
            }}
            className="flex w-full items-center px-4 py-3 text-left text-sm text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
