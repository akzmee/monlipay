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

/**
 * WalletConnect Cloud project ID.
 * Get one at https://cloud.walletconnect.com (free, takes 30 seconds).
 *
 * SECURITY: If the env var is missing or contains a known placeholder value,
 * we log a loud warning so the deployer notices. WalletConnect v2 will not
 * work without a real project ID — silently falling back to "dummy" makes
 * debugging painful and may even cause connection attempts to leak metadata
 * to whoever owns the placeholder project (if any).
 *
 * Validation logic lives in src/lib/wallet-connect.ts so it can be unit-tested.
 */
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

/**
 * Wagmi configuration.
 *
 * SECURITY: Only the active chain is registered (single-chain mode).
 * Registering both testnet and mainnet simultaneously is dangerous —
 * it allows the user to send transactions to the wrong network, where
 * the contract either doesn't exist (funds lost) or where the deposit
 * id space overlaps with another network.
 *
 * The active chain is selected by NEXT_PUBLIC_NETWORK env var:
 *   "mainnet" → Monad Mainnet (chain ID 143)
 *   anything  → Monad Testnet (chain ID 10143)
 *
 * See `chain.ts` for the canonical chain definitions and contracts.
 */
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
