"use client";

import { http, createConfig, createStorage } from "wagmi";
import { getDefaultWallets } from "@rainbow-me/rainbowkit";
import {
  monadChain,
  monadTestnetChain,
  monadMainnetChain,
  isMainnet,
} from "./chain";
import { isValidWalletConnectId } from "@/lib/wallet-connect";

/** WalletConnect project ID. Falls back to all-zeros if missing (WC will reject connections cleanly). */
const RAW_WC_PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "";

if (!isValidWalletConnectId(RAW_WC_PROJECT_ID)) {
  if (typeof window !== "undefined") {
    console.warn(
      "[wagmi] NEXT_PUBLIC_WC_PROJECT_ID is missing or invalid. " +
        "WalletConnect v2 connections will not work. " +
        "Get a free project ID at https://cloud.walletconnect.com",
    );
  }
}

const WC_PROJECT_ID = isValidWalletConnectId(RAW_WC_PROJECT_ID)
  ? RAW_WC_PROJECT_ID
  : "00000000000000000000000000000000"; // 32 zero chars — WalletConnect will reject cleanly

/**
 * RainbowKit default wallets — includes MetaMask, WalletConnect, Coinbase, etc.
 * The connectors are passed to wagmi's createConfig.
 */
const { connectors } = getDefaultWallets({
  appName: "MonliPay",
  projectId: WC_PROJECT_ID,
});

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
