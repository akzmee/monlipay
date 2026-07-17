/**
 * Bridge module shared types.
 *
 * These types are used by both the server-side API routes and the
 * client-side hooks/components. They define the contract between the
 * frontend and backend for all bridge-related operations.
 *
 * Security note: API keys (LI.FI, Alchemy) are NEVER included in these
 * types. They live only in server-side environment variables.
 */

/** A supported source chain for bridging TO Monad. */
export interface SourceChain {
  id: number;
  name: string;
  shortName: string;
  logoURI?: string;
}

/** A token on a source chain that can be bridged. */
export interface BridgeToken {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  logoURI?: string;
  priceUSD?: number;
}

/** A quote request — sent from client to /api/bridge/quote. */
export interface QuoteRequest {
  /** Source chain ID (e.g. 1 = Ethereum, 42161 = Arbitrum). */
  fromChain: number;
  /** Source token address (ERC-20 or zero address for native). */
  fromToken: `0x${string}`;
  /** Amount in smallest unit (wei / base units). */
  fromAmount: string;
  /** Destination chain ID — always Monad testnet (10143) or mainnet (143). */
  toChain: number;
  /** Destination token address on Monad. */
  toToken: `0x${string}`;
  /** Recipient address on Monad. */
  fromAddress: `0x${string}`;
}

/** A single route option returned by the quote API. */
export interface BridgeRoute {
  /** Unique route identifier from LI.FI. */
  id: string;
  /** Tool / bridge provider name (e.g. "deBridge", "Across"). */
  tool: string;
  /** Tool subvariant (e.g. "deBridge-v2"). */
  toolDetails: {
    key: string;
    name: string;
    logoURI: string;
  };
  /** Estimated time in seconds for the full bridge. */
  executionDuration: number;
  /** Input token info. */
  fromToken: BridgeToken;
  /** Output token info (on Monad). */
  toToken: BridgeToken;
  /** Input amount in smallest units. */
  fromAmount: string;
  /** Expected output amount in smallest units. */
  toAmount: string;
  /** Minimum received after slippage. */
  toAmountMin: string;
  /** Total estimated cost in USD (gas + fees). */
  gasCostUSD: string;
  /** All fees breakdown. */
  fees: {
    /** Bridge provider fee in USD. */
    bridgeFeeUSD: string;
    /** Source chain gas cost in USD. */
    gasCostUSD: string;
  };
  /** Number of steps in the route. */
  steps: number;
}

/** Response from /api/bridge/quote. */
export interface QuoteResponse {
  routes: BridgeRoute[];
}

/** A token balance on a specific chain. */
export interface TokenBalance {
  chainId: number;
  token: BridgeToken;
  balance: string; // smallest units
  balanceFormatted: string;
  balanceUSD: number;
}

/** Response from /api/bridge/balance. */
export interface BalanceResponse {
  balances: TokenBalance[];
  chains: number[];
}

/** Transaction status stages. */
export type BridgeStatus =
  | "unknown"
  | "not_started"
  | "waiting"
  | "pending"
  | "done"
  | "failed"
  | "refunded";

/** Response from /api/bridge/status. */
export interface StatusResponse {
  status: BridgeStatus;
  /** Human-readable substatus message. */
  substatus?: string;
  /** Explorer URL for the bridge transaction. */
  explorerUrl?: string;
  /** From chain transaction hash. */
  sending?: { txHash: string; chainId: number };
  /** To chain transaction hash (when received). */
  receiving?: { txHash: string; chainId: number };
}

/** Standard API error response shape. */
export interface ApiErrorResponse {
  error: string;
  code: string;
}
