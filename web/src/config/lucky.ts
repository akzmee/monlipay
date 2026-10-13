import { isAddress, zeroAddress, type Address } from "viem";
import { monadChain } from "./chain";

const configured = process.env.NEXT_PUBLIC_LUCKY_VAULT_ADDRESS;
export const LUCKY_VAULT_ADDRESS: Address =
  configured && isAddress(configured) ? configured : zeroAddress;
export const isLuckyConfigured = LUCKY_VAULT_ADDRESS !== zeroAddress;
export const MAX_LUCKY_RECIPIENTS = 100;

// Unversioned links belong to the original deployment. Never redirect them to
// a new contract: packet IDs start over on each deployment.
export const LEGACY_LUCKY_VAULT_ADDRESS: Address = monadChain.id === 143
  ? "0x96d8fa162b1a98fa1144b5879c139e9c71c30dec"
  : "0xd7846dc6fd8c159cf59957c532173d828f7b5bbc";
export const LUCKY_VAULTS = [...new Set(
  [LUCKY_VAULT_ADDRESS, LEGACY_LUCKY_VAULT_ADDRESS]
    .filter((address) => address !== zeroAddress)
    .map((address) => address.toLowerCase() as Address),
)];

export function resolveLuckyVault(value: string | null): Address | null {
  if (value === null) return LEGACY_LUCKY_VAULT_ADDRESS;
  if (!isAddress(value)) return null;
  return LUCKY_VAULTS.find((address) => address === value.toLowerCase()) ?? null;
}

export function supportsOpenLuckyLinks(vault: Address): boolean {
  return vault !== zeroAddress &&
    vault.toLowerCase() === LUCKY_VAULT_ADDRESS.toLowerCase() &&
    vault.toLowerCase() !== LEGACY_LUCKY_VAULT_ADDRESS.toLowerCase();
}

export function luckyClaimPath(id: bigint, vault: Address): string {
  return `/lucky/claim?id=${id}&chain=${monadChain.id}&vault=${vault}`;
}
