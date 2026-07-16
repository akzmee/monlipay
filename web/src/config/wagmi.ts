"use client";

import { http, createConfig, createStorage } from "wagmi";
import { injected } from "wagmi/connectors";
import { monadChain } from "./chain";

/**
 * Wagmi configuration for the Monad chain.
 * Uses injected connector (MetaMask, Rabby, etc.) for wallet connection.
 */
export const wagmiConfig = createConfig({
  chains: [monadChain],
  connectors: [
    injected({ shimDisconnect: true }),
  ],
  storage: createStorage({ storage: typeof window !== "undefined" ? localStorage : undefined }),
  ssr: true,
  multiInjectedProviderDiscovery: true,
  transports: {
    [monadChain.id]: http("https://testnet-rpc.monad.xyz"),
  },
});
