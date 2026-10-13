import { type Address } from "viem";
import { validateLuckyInput, type LuckyAccess } from "./lucky";

export type GroupDistribution = "equal" | "random";

export function validateGroupInput(
  amount: string, decimals: number, slots: number, wallets: Address[], title: string,
  access: LuckyAccess, distribution: GroupDistribution,
) {
  const total = validateLuckyInput(amount, decimals, slots, wallets, title, access);
  if (distribution === "equal" && total % BigInt(slots) !== 0n)
    throw new Error("This pool cannot split evenly. Adjust the pool amount or number of recipients.");
  return total;
}
