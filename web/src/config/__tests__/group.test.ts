import { afterEach, describe, expect, it, vi } from "vitest";
const equal="0x1111111111111111111111111111111111111111";
const random="0x2222222222222222222222222222222222222222";
afterEach(()=>{vi.unstubAllEnvs();vi.resetModules();});
describe("Group contract routing",()=>{
  it.each(["mainnet","testnet"])("preserves all %s deployments without guessing missing new addresses",async network=>{
    vi.stubEnv("NEXT_PUBLIC_NETWORK",network);
    vi.stubEnv("NEXT_PUBLIC_GROUP_VAULT_ADDRESS",equal);
    vi.stubEnv("NEXT_PUBLIC_LUCKY_VAULT_ADDRESS",random);vi.resetModules();
    const c=await import("../group");const l=await import("../lucky");
    expect(c.GROUP_VAULTS).toHaveLength(3);
    expect(c.resolveGroupVault(null)).toBeNull();
    expect(c.resolveGroupVault(null,true)).toBe(l.LEGACY_LUCKY_VAULT_ADDRESS);
    for(const vault of c.GROUP_VAULTS)expect(c.resolveGroupVault(vault)).toBe(vault);
    expect(c.isEqualGroupVault(equal)).toBe(true);expect(c.isEqualGroupVault(random)).toBe(false);
    expect(c.supportsOpenGroupLinks(equal)).toBe(true);expect(c.supportsOpenGroupLinks(l.LEGACY_LUCKY_VAULT_ADDRESS)).toBe(false);
    expect(c.resolveGroupVault("0x3333333333333333333333333333333333333333")).toBeNull();
    expect(c.groupClaimPath(1n,equal)).toContain(`/group/claim?id=1&chain=${network==="mainnet"?143:10143}&vault=${equal}`);
  });
});
