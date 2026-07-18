import { defineChain, isAddress } from "viem";
import tokenList from "./tokens.json";

/** Monad chain configs. Testnet reuses RainbowKit's built-in logo; mainnet needs an inline data URL since RainbowKit has no icon for chain 143. */
const MONAD_MAINNET_ICON_URL =
  "data:image/svg+xml,%3Csvg%20width%3D%2233%22%20height%3D%2232%22%20viewBox%3D%220%200%2033%2032%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%0A%3Cpath%20d%3D%22M16.8163%200C12.1959%200%200.816406%2011.3792%200.816406%2015.9999C0.816406%2020.6206%2012.1959%2032%2016.8163%2032C21.4367%2032%2032.8164%2020.6204%2032.8164%2015.9999C32.8164%2011.3794%2021.4369%200%2016.8163%200ZM14.323%2025.1492C12.3746%2024.6183%207.13621%2015.455%207.66723%2013.5066C8.19825%2011.5581%2017.3614%206.31979%2019.3097%206.8508C21.2582%207.38173%2026.4966%2016.5449%2025.9656%2018.4934C25.4346%2020.4418%2016.2714%2025.6802%2014.323%2025.1492Z%22%20fill%3D%22%23836EF9%22%2F%3E%0A%3C%2Fsvg%3E%0A";

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
 * Monad Mainnet (chain ID 143).
 * Verified token addresses: WMON, USDC, USDT0 (see tokens.json).
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
  // Reuse RainbowKit's built-in Monad logo (see MONAD_MAINNET_ICON_URL above)
  iconUrl: MONAD_MAINNET_ICON_URL,
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

/** LinkVault address from env; falls back to zero-address (UI renders as undeployed). */
const RAW_LINK_VAULT_ADDRESS =
  process.env.NEXT_PUBLIC_LINK_VAULT_ADDRESS ??
  "0x0000000000000000000000000000000000000000";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

if (
  RAW_LINK_VAULT_ADDRESS !== ZERO_ADDRESS &&
  !isAddress(RAW_LINK_VAULT_ADDRESS)
) {
  // Log loudly; treat invalid address as undeployed.
  console.error(
    `[chain] NEXT_PUBLIC_LINK_VAULT_ADDRESS is not a valid address: "${RAW_LINK_VAULT_ADDRESS}". ` +
      `Treating contract as not deployed. Please fix your .env.local.`,
  );
}

export const LINK_VAULT_ADDRESS = (
  isAddress(RAW_LINK_VAULT_ADDRESS)
    ? RAW_LINK_VAULT_ADDRESS
    : ZERO_ADDRESS
) as `0x${string}`;

/** Check if the contract has been deployed. */
export const isContractDeployed = LINK_VAULT_ADDRESS !== ZERO_ADDRESS;

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
