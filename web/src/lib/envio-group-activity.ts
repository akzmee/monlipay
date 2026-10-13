import { decodeEventLog, encodeEventTopics, parseAbi, toHex, type Address, type Hex } from "viem";
import type { GroupActivityEvent, GroupActivityResponse } from "./group-activity";

const eventsAbi = parseAbi([
  "event PacketCreated(uint256 indexed packetId, address indexed sender, address indexed token, uint256 total, uint16 slots, uint40 expiry)",
  "event DrawRequested(uint256 indexed packetId, address indexed recipient, uint64 sequence)",
  "event ShareReady(uint256 indexed packetId, address indexed recipient, uint256 amount)",
  "event ShareWithdrawn(uint256 indexed packetId, address indexed recipient, address destination, uint256 amount)",
  "event PacketRefunded(uint256 indexed packetId, address indexed sender, uint256 amount)",
]);
const topics = eventsAbi.map((event) => encodeEventTopics({ abi: [event], eventName: event.name })[0]);
type Network = { urls: readonly string[]; fromBlock: number };
const networks: Record<number, Network> = {
  143: { urls: ["https://monad.hypersync.xyz/query", "https://143.hypersync.xyz/query"], fromBlock: 112759497 },
  10143: { urls: ["https://monad-testnet.hypersync.xyz/query", "https://10143.hypersync.xyz/query"], fromBlock: 70401713 },
};

type RawLog = {
  address: Address;
  block_number: number;
  log_index: number;
  transaction_hash: Hex;
  data: Hex;
  topic0: Hex;
  topic1: Hex;
  topic2?: Hex;
  topic3?: Hex;
  removed?: boolean;
};
type Batch = { logs?: RawLog[]; blocks?: { number: number; timestamp: number | string }[] };
type Page = { data: Batch[]; archive_height: number; next_block: number };

function decode(log: RawLog, timestamp: number | null, vault: Address, packet: bigint): GroupActivityEvent | null {
  if (log.removed || log.address.toLowerCase() !== vault.toLowerCase()) return null;
  const decoded = decodeEventLog({
    abi: eventsAbi,
    data: log.data,
    topics: [log.topic0, ...[log.topic1, log.topic2, log.topic3].filter((t): t is Hex => Boolean(t))],
  });
  if (decoded.args.packetId !== packet) return null;
  const common = {
    id: `${log.transaction_hash}:${log.log_index}`,
    transactionHash: log.transaction_hash,
    blockNumber: log.block_number,
    timestamp,
  };
  switch (decoded.eventName) {
    case "PacketCreated": return { ...common, kind: "funded", address: decoded.args.sender, amount: decoded.args.total.toString() };
    case "DrawRequested": return { ...common, kind: "requested", address: decoded.args.recipient, amount: null };
    case "ShareReady": return { ...common, kind: "ready", address: decoded.args.recipient, amount: decoded.args.amount.toString() };
    case "ShareWithdrawn": return { ...common, kind: "claimed", address: decoded.args.destination, amount: decoded.args.amount.toString() };
    case "PacketRefunded": return { ...common, kind: "refunded", address: decoded.args.sender, amount: decoded.args.amount.toString() };
  }
}

const cache = new Map<string, { expires: number; value: Promise<GroupActivityResponse> }>();

/** Only public GroupVault/LuckyVault events are sent to Envio. Never payment-link secrets. */
export async function getGroupActivity(chainId: number, vault: Address, packet: bigint): Promise<GroupActivityResponse> {
  const network = networks[chainId];
  const token = process.env.ENVIO_API_TOKEN?.trim();
  if (!network || !token) throw new Error("Payment activity is temporarily unavailable.");
  const key = `${chainId}:${vault.toLowerCase()}:${packet}`;
  const existing = cache.get(key);
  if (existing && existing.expires > Date.now()) return existing.value;
  const value = readActivity(network, token, vault, packet);
  if (cache.size >= 200) cache.delete(cache.keys().next().value!);
  cache.set(key, { expires: Date.now() + 10_000, value });
  try {
    return await value;
  } catch (error) {
    cache.delete(key);
    throw error;
  }
}

async function queryPage(urls: readonly string[], options: RequestInit): Promise<Response> {
  for (const url of urls) {
    let response: Response;
    try {
      response = await fetch(url, { ...options, signal: AbortSignal.timeout(8_000) });
    } catch {
      // Envio publishes both named and chain-ID endpoints. Try the other
      // endpoint when DNS or the connection fails, without changing providers.
      continue;
    }
    if (response.ok) return response;
    if (response.status !== 429 && response.status < 500) break;
  }
  throw new Error("Payment activity is temporarily unavailable.");
}

async function readActivity(network: Network, token: string, vault: Address, packet: bigint): Promise<GroupActivityResponse> {
  const events = new Map<string, GroupActivityEvent>();
  let cursor = network.fromBlock;
  let end: number | undefined;
  for (let pageIndex = 0; pageIndex < 6; pageIndex++) {
    const response = await queryPage(network.urls, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from_block: cursor,
        ...(end === undefined ? {} : { to_block: end }),
        logs: [{ address: [vault], topics: [topics, [toHex(packet, { size: 32 })]] }],
        field_selection: {
          block: ["number", "timestamp"],
          log: ["block_number", "transaction_hash", "log_index", "address", "data", "topic0", "topic1", "topic2", "topic3", "removed"],
        },
        max_num_logs: 500,
      }),
      cache: "no-store",
    });
    const page = await response.json() as Page;
    if (!Array.isArray(page.data) || !Number.isSafeInteger(page.next_block) ||
        page.next_block <= cursor || !Number.isSafeInteger(page.archive_height))
      throw new Error("Could not read payment activity. Please try again.");
    // HyperSync may return next_block == archive_height when caught up.
    // Do not request a block beyond that snapshot and misread its idle cursor.
    end ??= page.archive_height;
    for (const batch of page.data) {
      const timestamps = new Map((batch.blocks ?? []).map((b) => [b.number, Number(b.timestamp)]));
      for (const log of batch.logs ?? []) {
        const timestamp = timestamps.get(log.block_number);
        const event = decode(log, timestamp !== undefined && Number.isFinite(timestamp) ? timestamp : null, vault, packet);
        if (event) events.set(event.id, event);
      }
    }
    cursor = page.next_block;
    if (cursor >= end || events.size >= 500) break;
  }
  return {
    source: "envio",
    events: [...events.values()].sort((a, b) => b.blockNumber - a.blockNumber || Number(b.id.split(":")[1]) - Number(a.id.split(":")[1])),
    indexedBlock: cursor - 1,
    complete: cursor >= (end ?? Infinity),
  };
}
