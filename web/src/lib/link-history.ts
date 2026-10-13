import { formatUnits } from "viem";

export function historyAmount(
  amount: bigint,
  decimals?: number,
  symbol?: string,
) {
  // Never guess 18 decimals for an unknown ERC-20.
  return decimals === undefined
    ? `${amount} base units`
    : `${formatUnits(amount, decimals)} ${symbol || "tokens"}`;
}

export function luckyStatus(
  packet: {
    closed: boolean;
    remaining: bigint;
    expiry: number;
    requested: number;
    settled: number;
    slots: number;
  },
  now: number,
) {
  if (packet.closed) return "Closed";
  if (packet.remaining === 0n) return "Fully allocated";
  if (now >= packet.expiry) {
    return packet.requested > packet.settled && now < packet.expiry + 3600
      ? "Waiting for draws"
      : "Refund available";
  }
  return packet.requested >= packet.slots ? "Draws pending" : "Open";
}

export function groupStatus(packet: Parameters<typeof luckyStatus>[0], now: number, equal: boolean) {
  if (!equal) return luckyStatus(packet, now);
  if (packet.requested >= packet.slots) return "Completed";
  if (packet.closed) return "Closed";
  return now >= packet.expiry ? "Refund available" : "Open";
}
