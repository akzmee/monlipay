import { defineChain } from "viem";
import tokenList from "./tokens.json";

/**
 * Monad logo as inline SVG data URI.
 *
 * RainbowKit doesn't ship a logo for Monad, so without this both chains
 * show a blank placeholder circle in the chain modal. We use the Monad
 * "M" mark on the official brand violet (#6E54FF).
 */
const MONAD_ICON_URL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="16" fill="#6E54FF"/><path d="M9 23V9h2.5l7 9.5V9H21v14h-2.5l-7-9.5V23H9Z" fill="#fafaf9"/></svg>`,
  );

/**
 * Monad Testnet configuration.
 * Chain ID: 10143
 */
export const monadTestnetChain = defineChain({
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
  iconUrl: MONAD_ICON_URL,
});

/**
 * Monad Mainnet configuration.
 * Chain ID: 143
 *
 * Verified canonical contracts:
 *   Wrapped MON (WMON): 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A
 *   USDC:               0x754704Bc059F8C67012fEd69BC8A327a5aafb603
 *   USDT0:              0xe7cd86e13AC4309349F30B3435a9d337750fC82D
 *
 * Source: https://skills.devnads.com/addresses + docs.monad.xyz
 */
export const monadMainnetChain = defineChain({
  id: 143,
  name: "Monad Mainnet",
  nativeCurrency: {
    name: "Monad",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.monad.xyz"],
    },
  },
  blockExplorers: {
    default: {
      name: "Monadscan",
      url: "https://monadscan.com",
    },
  },
  testnet: false,
  iconUrl: MONAD_ICON_URL,
});

/**
 * Active chain — controlled by NEXT_PUBLIC_NETWORK env var.
 * Set to "mainnet" to switch to Monad mainnet (chain ID 143).
 * Defaults to "testnet" for development.
 */
const NETWORK = process.env.NEXT_PUBLIC_NETWORK || "testnet";
export const isMainnet = NETWORK === "mainnet";

/**
 * The chain this app is configured for.
 * Components import this to check chain IDs, build explorer URLs, etc.
 */
export const monadChain = isMainnet ? monadMainnetChain : monadTestnetChain;

/**
 * Contract address — set in .env.local after deploying LinkVault.sol.
 * The zero address means the contract is not deployed yet.
 */
export const LINK_VAULT_ADDRESS = (process.env.NEXT_PUBLIC_LINK_VAULT_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

/** Check if the contract has been deployed. */
export const isContractDeployed =
  LINK_VAULT_ADDRESS !== "0x0000000000000000000000000000000000000000";

/**
 * Token info for tokens shown in the create form.
 */
export interface TokenInfo {
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
  isNative: boolean;
  logoURI?: string;
}

/**
 * Supported tokens loaded from tokens.json.
 *
 * For mainnet: includes MON (native) + popular bridged/natively-issued tokens
 * (USDC, USDT0, WETH, WBTC, WMON, etc.) verified against the MONSKILLS
 * address registry and docs.monad.xyz.
 *
 * For testnet: MON only (other testnet tokens are rarely useful since
 * faucets are scarce and balances are ephemeral).
 *
 * User-added custom tokens (via the token modal) are stored in localStorage
 * and merged at runtime — see useTokenRegistry.
 */
export const SUPPORTED_TOKENS: readonly TokenInfo[] = tokenList.tokens
  .filter((t) => (isMainnet ? true : t.isNative))
  .map((t) => ({
    symbol: t.symbol,
    name: t.name,
    address: t.address as `0x${string}`,
    decimals: t.decimals,
    isNative: t.isNative,
    logoURI: t.logoURI || undefined,
  }));

/** Expiry preset options (in seconds) for the UI. */
export const EXPIRY_PRESETS = [
  { label: "1 hour", value: 3600 },
  { label: "6 hours", value: 21600 },
  { label: "24 hours", value: 86400 },
  { label: "3 days", value: 259200 },
  { label: "7 days", value: 604800 },
] as const;
