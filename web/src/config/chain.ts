import { defineChain } from "viem";
import tokenList from "./tokens.json";

/**
 * NOTE: We intentionally do NOT set `iconUrl` on either chain definition.
 * RainbowKit ships its own Monad logo in its built-in chain registry, which
 * is higher quality than anything we could inline. Overriding with a custom
 * iconUrl replaces that logo — so we leave it unset and let RainbowKit's
 * default logo render.
 */

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
