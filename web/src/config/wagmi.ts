"use client";

import { http, createConfig, createStorage } from "wagmi";
import { getDefaultWallets } from "@rainbow-me/rainbowkit";
import {
  monadChain,
  monadTestnetChain,
  monadMainnetChain,
  isMainnet,
} from "./chain";

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
 * Wagmi configuration.
 *
 * Both Monad Testnet and Mainnet are registered so users can switch
 * between them via the chain modal — the default chain is controlled
 * by NEXT_PUBLIC_NETWORK env var.
 */
export const wagmiConfig = createConfig({
  chains: [monadTestnetChain, monadMainnetChain],
  connectors,
  storage: createStorage({
    storage: typeof window !== "undefined" ? localStorage : undefined,
  }),
  ssr: true,
  multiInjectedProviderDiscovery: true,
  transports: {
    [monadTestnetChain.id]: http(),
    [monadMainnetChain.id]: http(),
  } as Record<
    typeof monadTestnetChain.id | typeof monadMainnetChain.id,
    ReturnType<typeof http>
  >,
});

export { monadChain, isMainnet };
