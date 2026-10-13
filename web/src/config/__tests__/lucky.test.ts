import { afterEach, describe, expect, it, vi } from "vitest";

const current = "0x1111111111111111111111111111111111111111";
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("Lucky contract routing", () => {
  it.each(["mainnet", "testnet"])("preserves old %s links while routing new ones explicitly", async (network) => {
    vi.stubEnv("NEXT_PUBLIC_NETWORK", network);
    vi.stubEnv("NEXT_PUBLIC_LUCKY_VAULT_ADDRESS", current);
    vi.resetModules();
    const config = await import("../lucky");
    const old = config.LEGACY_LUCKY_VAULT_ADDRESS;
    expect(config.resolveLuckyVault(null)).toBe(old);
    expect(config.resolveLuckyVault(current)).toBe(current);
    expect(config.resolveLuckyVault(old)).toBe(old);
    expect(config.LUCKY_VAULTS).toHaveLength(2);
    expect(config.luckyClaimPath(1n, current)).toContain(`vault=${current}`);
    expect(config.luckyClaimPath(1n, old)).toContain(`vault=${old}`);
    expect(config.supportsOpenLuckyLinks(old)).toBe(false);
    expect(config.supportsOpenLuckyLinks(current)).toBe(true);
  });
  it("rejects an arbitrary contract supplied through the URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_LUCKY_VAULT_ADDRESS", current);
    vi.resetModules();
    const { resolveLuckyVault } = await import("../lucky");
    for (const value of ["", "invalid", "0x2222222222222222222222222222222222222222", "0x0000000000000000000000000000000000000000"]) {
      expect(resolveLuckyVault(value)).toBeNull();
    }
  });
  it("deduplicates the history when the old deployment is still active", async () => {
    vi.stubEnv("NEXT_PUBLIC_NETWORK", "mainnet");
    vi.stubEnv("NEXT_PUBLIC_LUCKY_VAULT_ADDRESS", "0x96d8fa162b1a98fa1144b5879c139e9c71c30dec");
    vi.resetModules();
    const config = await import("../lucky");
    expect(config.LUCKY_VAULTS).toHaveLength(1);
    expect(config.supportsOpenLuckyLinks(config.LUCKY_VAULT_ADDRESS)).toBe(false);
  });
});
