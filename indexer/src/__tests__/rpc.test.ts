import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublicClient } from "viem";
import { rpcWithFallback } from "../../rpc";

const servers: Server[] = [];
async function endpoint(reply: () => { status?: number; result?: string; error?: object } | null) {
  let calls = 0;
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (data) => { body += data; });
    req.on("end", () => {
      calls++;
      const response = reply();
      if (!response) return;
      res.writeHead(response.status ?? 200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: JSON.parse(body).id, result: response.result, error: response.error }));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test address");
  return { url: `http://127.0.0.1:${address.port}`, calls: () => calls };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  })));
});

describe("RPC failover", () => {
  it.each([403, 429, 200])("survives quota errors with HTTP %s, skips the primary during cooldown and recovers", async (status) => {
    let exhausted = true;
    const primary = await endpoint(() => exhausted
      ? { status, error: { code: -32600, message: "Monthly capacity limit exceeded" } }
      : { result: "0x8f" });
    const publicRpc = await endpoint(() => ({ result: "0x8f" }));
    const client = createPublicClient({ transport: rpcWithFallback(primary.url, publicRpc.url) });
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    expect(await client.getChainId()).toBe(143);
    expect(await client.getChainId()).toBe(143);
    expect(primary.calls()).toBe(1);
    expect(publicRpc.calls()).toBe(2);
    exhausted = false;
    vi.mocked(Date.now).mockReturnValue(now + 60_001);
    expect(await client.getChainId()).toBe(143);
    expect(primary.calls()).toBe(2);
    expect(publicRpc.calls()).toBe(2);
  });

  it("uses the primary while healthy", async () => {
    const primary = await endpoint(() => ({ result: "0x8f" }));
    const publicRpc = await endpoint(() => ({ result: "0x8f" }));
    const client = createPublicClient({ transport: rpcWithFallback(primary.url, publicRpc.url) });
    expect(await client.getChainId()).toBe(143);
    expect(publicRpc.calls()).toBe(0);
  });

  it("falls back when the primary never responds", async () => {
    const primary = await endpoint(() => null);
    const publicRpc = await endpoint(() => ({ result: "0x8f" }));
    const client = createPublicClient({ transport: rpcWithFallback(primary.url, publicRpc.url) });
    expect(await client.getChainId()).toBe(143);
    expect(primary.calls()).toBe(1);
    expect(publicRpc.calls()).toBe(1);
  }, 10_000);

  it("does not silently return data when both providers fail", async () => {
    const primary = await endpoint(() => ({ status: 503 }));
    const publicRpc = await endpoint(() => ({ status: 503 }));
    const client = createPublicClient({ transport: rpcWithFallback(primary.url, publicRpc.url) });
    await expect(client.getChainId()).rejects.toThrow();
    expect(publicRpc.calls()).toBe(1);
  });

  it("uses one request when only a public endpoint is configured", async () => {
    const publicRpc = await endpoint(() => ({ result: "0x279f" }));
    const client = createPublicClient({ transport: rpcWithFallback(publicRpc.url, publicRpc.url) });
    expect(await client.getChainId()).toBe(10143);
    expect(publicRpc.calls()).toBe(1);
  });
});
