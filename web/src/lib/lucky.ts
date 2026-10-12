import {
  getAddress,
  isAddress,
  parseUnits,
  zeroAddress,
  type Address,
} from "viem";
import { MAX_LUCKY_RECIPIENTS } from "@/config/lucky";

export function parseRecipients(input: string): Address[] {
  const entries = input.split(/[\s,;]+/).filter(Boolean);
  const unique = new Map<string, Address>();
  for (const entry of entries) {
    if (!isAddress(entry) || entry.toLowerCase() === zeroAddress)
      throw new Error(`Invalid wallet address: ${entry}`);
    unique.set(entry.toLowerCase(), getAddress(entry));
  }
  if (unique.size > MAX_LUCKY_RECIPIENTS)
    throw new Error(`Choose up to ${MAX_LUCKY_RECIPIENTS} wallets.`);
  return [...unique.values()];
}
export function validateLuckyInput(
  amount: string,
  decimals: number,
  slots: number,
  wallets: Address[],
  title: string,
) {
  if (
    !/^\d+(\.\d+)?$/.test(amount) ||
    (amount.split(".")[1]?.length || 0) > decimals
  )
    throw new Error(
      `Enter a positive amount with up to ${decimals} decimal places.`,
    );
  const total = parseUnits(amount, decimals);
  if (total <= 0n || total > (1n << 128n) - 1n)
    throw new Error("Enter a valid positive amount.");
  if (
    !Number.isInteger(slots) ||
    slots < 1 ||
    slots > wallets.length ||
    wallets.length > MAX_LUCKY_RECIPIENTS
  )
    throw new Error(
      "Choose at least as many eligible wallets as there are recipient slots (up to 100).",
    );
  if (total < BigInt(slots))
    throw new Error("The pool is too small to give every recipient a share.");
  if (!title.trim() || new TextEncoder().encode(title.trim()).length > 80)
    throw new Error("Add a short title (up to 80 bytes).");
  return total;
}
export const shortAddress = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;
