"use client";

import { http, createConfig, createStorage } from "wagmi";
import { getDefaultWallets } from "@rainbow-me/rainbowkit";
import { monadChain } from "./chain";

/**
 * WalletConnect Cloud project ID.
 * Get one at https://cloud.walletconnect.com (free, takes 30 seconds).
 * Falls back to a dummy value so the build doesn't crash during SSR/SSG
 * — WalletConnect will simply not work until a real ID is provided.
 */
const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID || "dummy-project-id";

/**
 * RainbowKit default wallets — includes MetaMask, WalletConnect, Coinbase, etc.
 * The connectors are passed to wagmi's createConfig.
 */
const { connectors } = getDefaultWallets({
  appName: "MonliPay",
  projectId: WC_PROJECT_ID,
});

/**
 * Wagmi configuration for the Monad chain with RainbowKit connectors.
 *
 * Only the active chain (testnet or mainnet) is registered. Switching
 * between networks requires setting NEXT_PUBLIC_NETWORK and rebuilding.
 */
export const wagmiConfig = createConfig({
  chains: [monadChain],
  connectors,
  storage: createStorage({
    storage: typeof window !== "undefined" ? localStorage : undefined,
  }),
  ssr: true,
  multiInjectedProviderDiscovery: true,
  transports: {
    // Use the chain's built-in RPC URL (defined in chain.ts)
    [monadChain.id]: http(),
  } as Record<typeof monadChain.id, ReturnType<typeof http>>,
});

