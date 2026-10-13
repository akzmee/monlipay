import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), rateLimit: vi.fn(() => true) }));
const vault = "0x0e767de29c64e3a283a02c211aabbcd498a3ff86";
vi.mock("@/config/chain", () => ({ monadChain: { id: 10143 } }));
vi.mock("@/config/group", () => ({ GROUP_VAULTS: ["0x0e767de29c64e3a283a02c211aabbcd498a3ff86"] }));
vi.mock("@/lib/envio-group-activity", () => ({ getGroupActivity: mocks.read }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit, getClientIp: () => "127.0.0.1" }));
import { GET } from "./route";
const request = (params: Record<string, string> = {}) => new Request(`https://monlipay.example/api/group-activity?${new URLSearchParams({ chain: "10143", vault, id: "3", ...params })}`);
beforeEach(() => { mocks.read.mockReset(); mocks.rateLimit.mockReturnValue(true); });
describe("Group Payment activity endpoint", () => {
  it("returns only the allowlisted network and vault's activity without a shared HTTP cache", async () => {
    mocks.read.mockResolvedValue({ source: "envio", events: [], complete: true, indexedBlock: 70402000 });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.read).toHaveBeenCalledWith(10143, vault, 3n);
  });
  it.each<Record<string, string>>([{ chain: "143" }, { vault: "0x1111111111111111111111111111111111111111" }, { id: "0" }, { id: "-1" }, { id: "1.5" }, { id: "1".repeat(78) }])("rejects unsupported queries %o before calling Envio", async (params) => {
    expect((await GET(request(params))).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("hides provider error details and keeps funding/claim routes independent", async () => {
    mocks.read.mockRejectedValue(new Error("Bearer secret-token failed"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret-token");
  });
  it("limits requests before provider access", async () => {
    mocks.rateLimit.mockReturnValue(false);
    expect((await GET(request())).status).toBe(429);
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
