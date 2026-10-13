import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, parseAbi, zeroAddress } from "viem";

const vault = "0x0e767de29c64e3a283a02c211aabbcd498a3ff86";
const recipient = "0x1111111111111111111111111111111111111111";
const hash = `0x${"ab".repeat(32)}`;
const fetchMock = vi.fn();
const abi = parseAbi(["event ShareWithdrawn(uint256 indexed packetId, address indexed recipient, address destination, uint256 amount)"]);
function withdrawal(packet = 3n, block = 70401800) {
  const topics = encodeEventTopics({ abi, eventName: "ShareWithdrawn", args: { packetId: packet, recipient } });
  return {
    address: vault, block_number: block, log_index: 2, transaction_hash: hash,
    topic0: topics[0], topic1: topics[1], topic2: topics[2], topic3: null,
    data: encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [recipient, 10_000_000n]),
  };
}
function page(logs: ReturnType<typeof withdrawal>[], next = 70402001, height = 70402000) {
  return Response.json({
    archive_height: height, next_block: next,
    data: [{ logs, blocks: logs.map((log) => ({ number: log.block_number, timestamp: 1791900000 })) }],
  });
}
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("ENVIO_API_TOKEN", "server-test-token");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Envio Group Payment activity", () => {
  it("decodes public settlement with exact amounts and timestamps and coalesces requests", async () => {
    fetchMock.mockResolvedValue(page([withdrawal()]));
    const { getGroupActivity } = await import("./envio-group-activity");
    const [result, same] = await Promise.all([getGroupActivity(10143, vault, 3n), getGroupActivity(10143, vault, 3n)]);
    expect(same).toEqual(result);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.events[0]).toMatchObject({ kind: "claimed", address: recipient, amount: "10000000", timestamp: 1791900000, transactionHash: hash });
    expect(result.complete).toBe(true);
    expect(result.source).toBe("envio");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://monad-testnet.hypersync.xyz/query");
    expect(options.headers.Authorization).toBe("Bearer server-test-token");
    expect(JSON.parse(options.body).logs[0].address).toEqual([vault]);
    expect(JSON.stringify(result)).not.toContain("server-test-token");
  });
  it("resumes a paginated query against a fixed snapshot and deduplicates events", async () => {
    fetchMock.mockResolvedValueOnce(page([withdrawal()], 70401900))
      .mockResolvedValueOnce(page([withdrawal(), { ...withdrawal(3n, 70401901), log_index: 3 }], 70402001, 70403000));
    const { getGroupActivity } = await import("./envio-group-activity");
    const result = await getGroupActivity(10143, vault, 3n);
    expect(result.events).toHaveLength(2);
    expect(result.events[0].blockNumber).toBe(70401901);
    expect(result.complete).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ from_block: 70401900, to_block: 70402000 });
  });
  it("finishes when the next cursor equals the archive height", async () => {
    fetchMock.mockResolvedValue(page([withdrawal()], 70402000, 70402000));
    const { getGroupActivity } = await import("./envio-group-activity");
    const result = await getGroupActivity(10143, vault, 3n);
    expect(result.complete).toBe(true);
    expect(result.events).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("excludes removed logs, other vaults and other payment IDs", async () => {
    fetchMock.mockResolvedValue(page([
      { ...withdrawal(), removed: true } as ReturnType<typeof withdrawal>,
      { ...withdrawal(), address: zeroAddress }, withdrawal(4n),
    ]));
    const { getGroupActivity } = await import("./envio-group-activity");
    expect((await getGroupActivity(10143, vault, 3n)).events).toEqual([]);
  });
  it("does not cache provider failures or mistake an invalid cursor for completed history", async () => {
    fetchMock.mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(page([], 70401713))
      .mockResolvedValueOnce(page([withdrawal()]));
    const { getGroupActivity } = await import("./envio-group-activity");
    await expect(getGroupActivity(10143, vault, 3n)).rejects.toThrow("temporarily unavailable");
    await expect(getGroupActivity(10143, vault, 3n)).rejects.toThrow("Could not read");
    expect((await getGroupActivity(10143, vault, 3n)).events).toHaveLength(1);
  });
  it("uses the documented chain-ID endpoint when named endpoint DNS fails", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(page([withdrawal()]));
    const { getGroupActivity } = await import("./envio-group-activity");
    expect((await getGroupActivity(10143, vault, 3n)).events).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("https://10143.hypersync.xyz/query");
    expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);
  });
  it("does not retry invalid credentials across endpoints", async () => {
    fetchMock.mockResolvedValue(new Response("unauthorized", { status: 401 }));
    const { getGroupActivity } = await import("./envio-group-activity");
    await expect(getGroupActivity(10143, vault, 3n)).rejects.toThrow("temporarily unavailable");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("marks truncated scans as incomplete and bounds provider requests", async () => {
    fetchMock.mockImplementation(async (_url, options) => page([], JSON.parse(options.body).from_block + 1, 80000000));
    const { getGroupActivity } = await import("./envio-group-activity");
    expect((await getGroupActivity(10143, vault, 3n)).complete).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
  it("requires a server token and a supported network", async () => {
    const { getGroupActivity } = await import("./envio-group-activity");
    await expect(getGroupActivity(1, vault, 3n)).rejects.toThrow();
    vi.stubEnv("ENVIO_API_TOKEN", "");
    await expect(getGroupActivity(10143, vault, 3n)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
