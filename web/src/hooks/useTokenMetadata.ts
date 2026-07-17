"use client";

import { useReadContracts } from "wagmi";
import { erc20Abi } from "@/lib/abi";
import { isAddress, type Address } from "viem";

/**
 * Token metadata fetched from an ERC-20 contract.
 */
export interface TokenMetadata {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
  isNative: boolean;
}

/**
 * Fetch ERC-20 token metadata (name, symbol, decimals) from a contract address.
 * Returns null for the zero address (native token) — use SUPPORTED_TOKENS for that.
 *
 * Only fetches when `tokenAddress` is a valid non-zero address.
 */
export function useTokenMetadata(tokenAddress: string | null) {
  const isValid =
    tokenAddress !== null &&
    tokenAddress !== "" &&
    tokenAddress !== "0x0000000000000000000000000000000000000000" &&
    isAddress(tokenAddress);

  const addr = isValid ? (tokenAddress as Address) : undefined;

  const { data, isLoading, isError, error } = useReadContracts({
    contracts: addr
      ? [
          { address: addr, abi: erc20Abi, functionName: "name" },
          { address: addr, abi: erc20Abi, functionName: "symbol" },
          { address: addr, abi: erc20Abi, functionName: "decimals" },
        ]
      : undefined,
    query: {
      enabled: !!addr,
    },
  });

  let metadata: TokenMetadata | null = null;
  if (data && addr && data[0].status === "success" && data[1].status === "success" && data[2].status === "success") {
    metadata = {
      address: addr,
      name: data[0].result as string,
      symbol: data[1].result as string,
      decimals: data[2].result as number,
      isNative: false,
    };
  }

  return { metadata, isLoading, isError, error };
}
