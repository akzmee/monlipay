"use client";

import { http, createConfig, createStorage } from "wagmi";
import {
  connectorsForWallets,
  getDefaultWallets,
} from "@rainbow-me/rainbowkit";
import { injectedWallet } from "@rainbow-me/rainbowkit/wallets";
import {
  monadChain,
  monadTestnetChain,
  monadMainnetChain,
  isMainnet,
} from "./chain";
import { isValidWalletConnectId } from "@/lib/wallet-connect";

/** Without a valid project ID, offer browser wallets without starting WalletConnect. */
const RAW_WC_PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "";

if (!isValidWalletConnectId(RAW_WC_PROJECT_ID)) {
  if (typeof window !== "undefined") {
    console.warn(
      "[wagmi] NEXT_PUBLIC_WC_PROJECT_ID is missing or invalid. " +
        "Only browser wallets are enabled. " +
        "Configure a project from https://dashboard.reown.com for WalletConnect.",
    );
  }
}

const connectors = isValidWalletConnectId(RAW_WC_PROJECT_ID)
  ? getDefaultWallets({
      appName: "MonliPay",
      projectId: RAW_WC_PROJECT_ID,
    }).connectors
  : connectorsForWallets(
      [{ groupName: "Browser wallets", wallets: [injectedWallet] }],
      { appName: "MonliPay", projectId: "" },
    );

/** Wagmi config — single-chain per build (NEXT_PUBLIC_NETWORK: "mainnet" or "testnet"). */
const activeChain = isMainnet ? monadMainnetChain : monadTestnetChain;

export const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors,
  storage: createStorage({
    storage: typeof window !== "undefined" ? localStorage : undefined,
  }),
  ssr: true,
  multiInjectedProviderDiscovery: true,
  transports: {
    [activeChain.id]: http(),
  } as Record<typeof activeChain.id, ReturnType<typeof http>>,
});

export { monadChain, isMainnet };
