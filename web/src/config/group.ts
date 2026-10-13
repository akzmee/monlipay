import { isAddress, zeroAddress, type Address } from "viem";
import { monadChain } from "./chain";
import { LUCKY_VAULTS, resolveLuckyVault, supportsOpenLuckyLinks } from "./lucky";

const configured = process.env.NEXT_PUBLIC_GROUP_VAULT_ADDRESS;
export const GROUP_VAULT_ADDRESS: Address = configured && isAddress(configured) ? configured : zeroAddress;
export const isGroupConfigured = GROUP_VAULT_ADDRESS !== zeroAddress;
export const GROUP_VAULTS = [...new Set([
  ...(isGroupConfigured ? [GROUP_VAULT_ADDRESS.toLowerCase() as Address] : []),
  ...LUCKY_VAULTS,
])];

export function isEqualGroupVault(vault: Address): boolean {
  return isGroupConfigured && vault.toLowerCase() === GROUP_VAULT_ADDRESS.toLowerCase();
}

export function supportsOpenGroupLinks(vault: Address): boolean {
  return isEqualGroupVault(vault) || supportsOpenLuckyLinks(vault);
}

export function resolveGroupVault(value: string | null, legacy = false): Address | null {
  if (value === null) return legacy ? resolveLuckyVault(null) : null;
  if (!isAddress(value)) return null;
  return GROUP_VAULTS.find((vault) => vault === value.toLowerCase()) ?? null;
}

export function groupClaimPath(id: bigint, vault: Address): string {
  return `/group/claim?id=${id}&chain=${monadChain.id}&vault=${vault}`;
}
