import { defineChain } from "viem";
import { monadTestnet } from "wagmi/chains";

/**
 * Monad Testnet configuration.
 * Chain ID: 10143
 * Block time: ~400ms
 * Finality: ~800ms
 *
 * For mainnet deployment, swap to chain ID 143 and rpc.monad.xyz.
 */
export const monadChain = defineChain({
  ...monadTestnet,
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: {
    name: "Monad",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://testnet-rpc.monad.xyz"],
    },
  },
  blockExplorers: {
    default: {
      name: "Monadscan",
      url: "https://testnet.monadscan.com",
    },
  },
  testnet: true,
});

/**
 * Contract address — set in .env.local after deploying LinkVault.sol.
 * The zero address means the contract is not deployed yet.
 */
export const LINK_VAULT_ADDRESS = (process.env.NEXT_PUBLIC_LINK_VAULT_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

/** Check if the contract has been deployed. */
export const isContractDeployed = LINK_VAULT_ADDRESS !== "0x0000000000000000000000000000000000000000";

/** Supported tokens for the create page (testnet). */
export const SUPPORTED_TOKENS = [
  {
    symbol: "MON",
    name: "Monad (Native)",
    address: "0x0000000000000000000000000000000000000000" as `0x${string}`,
    decimals: 18,
    isNative: true,
  },
  // Add ERC-20 tokens here after deployment / faucet claims
  // {
  //   symbol: "WMON",
  //   name: "Wrapped MON",
  //   address: "0x..." as `0x${string}`,
  //   decimals: 18,
  //   isNative: false,
  // },
] as const;

/** Expiry preset options (in seconds) for the UI. */
export const EXPIRY_PRESETS = [
  { label: "1 hour", value: 3600 },
  { label: "6 hours", value: 21600 },
  { label: "24 hours", value: 86400 },
  { label: "3 days", value: 259200 },
  { label: "7 days", value: 604800 },
] as const;
