import { describe, expect, it } from "vitest";
import { historyAmount, luckyStatus } from "./link-history";

describe("link history amounts", () => {
  it("preserves stablecoin units and never guesses unknown decimals", () => {
    expect(historyAmount(12340000n, 6, "AUSD")).toBe("12.34 AUSD");
    expect(historyAmount(12340000n)).toBe("12340000 base units");
  });
});
describe("Lucky history lifecycle", () => {
  const p = {
    closed: false,
    remaining: 100n,
    expiry: 1000,
    requested: 1,
    settled: 0,
    slots: 2,
  };
  it("waits for outstanding draws during the one-hour grace period", () => {
    expect(luckyStatus(p, 999)).toBe("Open");
    expect(luckyStatus(p, 1000)).toBe("Waiting for draws");
    expect(luckyStatus(p, 4599)).toBe("Waiting for draws");
    expect(luckyStatus(p, 4600)).toBe("Refund available");
  });
  it("allows refund immediately after expiry if draws have settled", () => {
    expect(luckyStatus({ ...p, settled: 1 }, 1000)).toBe("Refund available");
  });
  it("distinguishes allocation from withdrawal and closure", () => {
    expect(luckyStatus({ ...p, requested: 2 }, 900)).toBe("Draws pending");
    expect(luckyStatus({ ...p, remaining: 0n }, 900)).toBe("Fully allocated");
    expect(luckyStatus({ ...p, closed: true, remaining: 0n }, 2000)).toBe(
      "Closed",
    );
  });
});
