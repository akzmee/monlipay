import { isAddress, zeroAddress, type Address } from "viem";

const configured = process.env.NEXT_PUBLIC_LUCKY_VAULT_ADDRESS;
export const LUCKY_VAULT_ADDRESS: Address =
  configured && isAddress(configured) ? configured : zeroAddress;
export const isLuckyConfigured = LUCKY_VAULT_ADDRESS !== zeroAddress;
export const MAX_LUCKY_RECIPIENTS = 100;
