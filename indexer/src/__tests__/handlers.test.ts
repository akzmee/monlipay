import { describe, it, expect } from "vitest";
import {
  applyLinkCreated,
  applyLinkClaimed,
  applyLinkRefunded,
  applyRefundFailed,
  REFUNDABLE_STATUSES,
  type LinkCreatedEvent,
  type LinkClaimedEvent,
  type LinkRefundedEvent,
  type RefundFailedEvent,
} from "../handlers";

// Sample event args + metadata used across multiple tests.
const SENDER = "0x1234567890123456789012345678901234567890" as `0x${string}`;
const SENDER_UPPER =
  "0x1234567890123456789012345678901234567890".toUpperCase() as `0x${string}`;
const RECIPIENT = "0xabc0000000000000000000000000000000000000" as `0x${string}`;
const TOKEN = "0x0000000000000000000000000000000000000000" as `0x${string}`;
const ERC20 = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603" as `0x${string}`;

const META = {
  blockNumber: 1234,
  timestamp: 1_700_000_000,
  chainId: 143,
};

describe("applyLinkCreated", () => {
  it("builds a row with status=active", () => {
    const args: LinkCreatedEvent = {
      depositId: 1n,
      sender: SENDER,
      token: TOKEN,
      amount: 1_000_000_000_000_000_000n,
      claimKey: RECIPIENT,
      expiry: 1_700_003_600n,
    };
    const row = applyLinkCreated(args, META);
    expect(row.depositId).toBe(1n);
    expect(row.sender).toBe(SENDER);
    expect(row.token).toBe(TOKEN);
    expect(row.amount).toBe(1_000_000_000_000_000_000n);
    expect(row.expiry).toBe(1_700_003_600n);
    expect(row.status).toBe("active");
    expect(row.recipient).toBeUndefined();
    expect(row.createdAtBlock).toBe(1234);
    expect(row.createdAtTs).toBe(1_700_000_000);
    expect(row.closedAtBlock).toBeUndefined();
    expect(row.closedAtTs).toBeUndefined();
    expect(row.chainId).toBe(143);
  });

  it("normalizes sender + token to lowercase", () => {
    const args: LinkCreatedEvent = {
      depositId: 1n,
      sender: SENDER_UPPER,
      token: ERC20, // mixed-case checksummed
      amount: 1n,
      claimKey: RECIPIENT,
      expiry: 1_700_003_600n,
    };
    const row = applyLinkCreated(args, META);
    expect(row.sender).toBe(SENDER);
    expect(row.token).toBe(ERC20.toLowerCase());
  });

  it("handles native MON (zero token address)", () => {
    const args: LinkCreatedEvent = {
      depositId: 2n,
      sender: SENDER,
      token: "0x0000000000000000000000000000000000000000",
      amount: 500_000_000_000_000n, // 0.0005 MON
      claimKey: RECIPIENT,
      expiry: 1_700_003_600n,
    };
    const row = applyLinkCreated(args, META);
    expect(row.token).toBe("0x0000000000000000000000000000000000000000");
    expect(row.amount).toBe(500_000_000_000_000n);
  });

  it("is pure — same input always produces same output", () => {
    const args: LinkCreatedEvent = {
      depositId: 42n,
      sender: SENDER,
      token: TOKEN,
      amount: 1n,
      claimKey: RECIPIENT,
      expiry: 1_700_003_600n,
    };
    expect(applyLinkCreated(args, META)).toEqual(applyLinkCreated(args, META));
  });
});

describe("applyLinkClaimed", () => {
  it("returns status=claimed + recipient", () => {
    const args: LinkClaimedEvent = {
      depositId: 1n,
      recipient: RECIPIENT,
      token: TOKEN,
      amount: 1_000_000_000_000_000_000n,
    };
    const update = applyLinkClaimed(args, {
      blockNumber: 2000,
      timestamp: 1_700_001_000,
    });
    expect(update.status).toBe("claimed");
    expect(update.recipient).toBe(RECIPIENT);
    expect(update.closedAtBlock).toBe(2000);
    expect(update.closedAtTs).toBe(1_700_001_000);
  });

  it("lowercases the recipient", () => {
    const args: LinkClaimedEvent = {
      depositId: 1n,
      recipient:
        "0xABCDEFabcdef1234567890abcdef1234567890AB" as `0x${string}`,
      token: TOKEN,
      amount: 1n,
    };
    const update = applyLinkClaimed(args, {
      blockNumber: 1,
      timestamp: 1,
    });
    expect(update.recipient).toBe("0xabcdefabcdef1234567890abcdef1234567890ab");
  });
});

describe("applyLinkRefunded", () => {
  it("returns status=refunded", () => {
    const args: LinkRefundedEvent = {
      depositId: 1n,
      sender: SENDER,
      token: TOKEN,
      amount: 1_000_000_000_000_000_000n,
    };
    const update = applyLinkRefunded(args, {
      blockNumber: 3000,
      timestamp: 1_700_002_000,
    });
    expect(update.status).toBe("refunded");
    expect(update.closedAtBlock).toBe(3000);
    expect(update.closedAtTs).toBe(1_700_002_000);
  });
});

describe("applyRefundFailed", () => {
  it("returns status=refund_failed (NOT refunded)", () => {
    const args: RefundFailedEvent = {
      depositId: 1n,
      sender: SENDER,
      token: TOKEN,
      amount: 1_000_000_000_000_000_000n,
    };
    const update = applyRefundFailed(args, {
      blockNumber: 3000,
      timestamp: 1_700_002_000,
    });
    // CRITICAL: refund_failed is distinct from refunded so the UI can
    // hint the user to call claimFailedRefund().
    expect(update.status).toBe("refund_failed");
    expect(update.closedAtBlock).toBe(3000);
    expect(update.closedAtTs).toBe(1_700_002_000);
  });
});

describe("REFUNDABLE_STATUSES", () => {
  it("includes 'active' (normal refund path)", () => {
    expect(REFUNDABLE_STATUSES).toContain("active");
  });

  it("includes 'refund_failed' (claimFailedRefund recovery path)", () => {
    // CRITICAL: without this, a link that went active → refund_failed can
    // never transition to "refunded" after the user calls
    // claimFailedRefund() — the LinkRefunded event would be a no-op.
    expect(REFUNDABLE_STATUSES).toContain("refund_failed");
  });

  it("does NOT include 'claimed' or 'refunded' (terminal states)", () => {
    expect(REFUNDABLE_STATUSES).not.toContain("claimed");
    expect(REFUNDABLE_STATUSES).not.toContain("refunded");
  });
});
