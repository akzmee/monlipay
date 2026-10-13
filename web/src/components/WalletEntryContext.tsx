"use client";

import { createContext, useContext } from "react";
import { useConnectModal as useRainbowConnectModal } from "@rainbow-me/rainbowkit";

export const WalletEntryContext = createContext<{
  open: () => void;
  openAccount: () => void;
  ready: boolean;
} | null>(null);

export const useWalletEntry = () => useContext(WalletEntryContext);

/** A single entry point for embedded and existing wallets throughout the app. */
export function useConnectModal() {
  const entry = useWalletEntry();
  const rainbow = useRainbowConnectModal();
  return { openConnectModal: entry?.open ?? rainbow.openConnectModal };
}
