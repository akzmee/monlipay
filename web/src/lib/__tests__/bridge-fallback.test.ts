import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const address = "0x0000000000000000000000000000000000000001";
const response = (result: string) => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("ALCHEMY_API_KEY", "test-key-for-failover");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("bridge balance RPC failover", () => {
  it.each([403, 429, 503, 200])("falls back on HTTP %s or JSON-RPC quota errors, then retries after cooldown", async (status) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: -32600, message: "Monthly capacity limit exceeded" } }), { status }))
      .mockResolvedValueOnce(response("0xa"))
      .mockResolvedValueOnce(response("0xb"))
      .mockResolvedValueOnce(response("0xc"));
    vi.stubGlobal("fetch", fetchMock);
    const { readNativeBalance } = await import("../bridge-server");
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    expect(await readNativeBalance(8453, address)).toBe(10n);
    expect(await readNativeBalance(8453, address)).toBe(11n);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://base-mainnet.g.alchemy.com/v2/test-key-for-failover",
      "https://mainnet.base.org", "https://mainnet.base.org",
    ]);
    vi.mocked(Date.now).mockReturnValue(now + 60_001);
    expect(await readNativeBalance(8453, address)).toBe(12n);
    expect(fetchMock.mock.calls[3][0]).toContain("g.alchemy.com");
  });

  it("falls back on network failures and sends a bounded request", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("network failure"))
      .mockResolvedValueOnce(response("0x1"));
    vi.stubGlobal("fetch", fetchMock);
    const { readNativeBalance } = await import("../bridge-server");
    expect(await readNativeBalance(8453, address)).toBe(1n);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("treats a zero balance as success without calling the public endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response("0x0"));
    vi.stubGlobal("fetch", fetchMock);
    const { readNativeBalance } = await import("../bridge-server");
    expect(await readNativeBalance(8453, address)).toBe(0n);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the public endpoint directly without a key", async () => {
    vi.stubEnv("ALCHEMY_API_KEY", "");
    const fetchMock = vi.fn().mockResolvedValueOnce(response("0x10"));
    vi.stubGlobal("fetch", fetchMock);
    const { readNativeBalance } = await import("../bridge-server");
    expect(await readNativeBalance(8453, address)).toBe(16n);
    expect(fetchMock.mock.calls[0][0]).toBe("https://mainnet.base.org");
  });

  it("reports provider failure without exposing URLs or credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
    const { readNativeBalance } = await import("../bridge-server");
    await expect(readNativeBalance(8453, address)).rejects.toThrow("Balance provider unavailable");
  });
});
