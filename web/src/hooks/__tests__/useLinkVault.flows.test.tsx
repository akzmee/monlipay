import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";

// --- Mocks ---

const mockSendTransactionAsync = vi.fn();
const mockWaitForReceipt = vi.fn();

// Helper to create a log entry
function createLog(eventName: string, args: Record<string, unknown> = {}) {
  return {
    address: "0xvault",
    data: "0xdata",
    topics: ["0xtopic1", "0xtopic2", "0xtopic3", "0xtopic4"],
    eventName,
    args,
  };
}

vi.mock("wagmi", () => ({
  useAccount: () => ({
    address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
    isConnected: true,
  }),
  useSendTransaction: () => ({
    sendTransactionAsync: mockSendTransactionAsync,
    isPending: false,
    data: "0xtxhash",
  }),
  useReadContract: () => ({
    data: undefined,
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("wagmi/actions", () => ({
  waitForTransactionReceipt: (...args: unknown[]) => mockWaitForReceipt(...args),
}));

vi.mock("@/config/wagmi", () => ({
  wagmiConfig: {},
}));

vi.mock("viem", () => ({
  parseEther: (v: string) => BigInt(Math.floor(parseFloat(v) * 1e18)),
  encodeFunctionData: () => "0xencoded",
  decodeEventLog: vi.fn((args: { topics: string[] }) => {
    // Return different event based on topic[0]
    const topic0 = args.topics?.[0] ?? "";
    if (topic0 === "0xtopic1") {
      return {
        eventName: "LinkCreated",
        args: { depositId: 42n },
      };
    }
    return { eventName: "Unknown", args: {} };
  }),
}));

const mockSignClaim = vi.fn().mockResolvedValue({ v: 27, r: "0xr", s: "0xs" });

vi.mock("@/lib/crypto", () => ({
  generateSecretKey: () =>
    "0x0000000000000000000000000000000000000000000000000000000000000001",
  privateKeyToClaimKey: () => "0xclaimkeyaddress",
  buildShareableUrl: (_base: string, id: bigint, _key: string) =>
    `https://test.app/claim#${id}`,
  signClaim: () => mockSignClaim(),
}));

const mockAddStoredLink = vi.fn();
vi.mock("@/lib/storage", () => ({
  addStoredLink: (...args: unknown[]) => mockAddStoredLink(...args),
  getStoredLinks: () => [],
  removeStoredLink: vi.fn(),
}));

vi.mock("@/config/chain", () => ({
  LINK_VAULT_ADDRESS: "0xvault" as `0x${string}`,
  monadChain: { id: 10143 },
}));

vi.mock("@/lib/abi", () => ({
  linkVaultAbi: [],
}));

// --- Tests ---

describe("useCreateLink - transaction flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should complete full create flow on success", async () => {
    mockSendTransactionAsync.mockResolvedValue("0xhash");
    mockWaitForReceipt.mockResolvedValue({
      status: "success",
      logs: [
        {
          address: "0xvault",
          data: "0xdata",
          topics: ["0xtopic1", "0xtopic2", "0xtopic3"],
        },
      ],
    });

    const { useCreateLink } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useCreateLink());

    await act(async () => {
      await result.current.create({
        token: "0x0000000000000000000000000000000000000000" as `0x${string}`,
        amount: "1.5",
        expirySeconds: 3600,
        isNative: true,
        baseUrl: "https://test.app",
      });
    });

    expect(result.current.result).toEqual({
      depositId: 42n,
      shareableUrl: "https://test.app/claim#42",
    });
    expect(result.current.error).toBeNull();
    expect(result.current.isConfirming).toBe(false);
    expect(mockAddStoredLink).toHaveBeenCalled();
  });

  it("should set error when transaction reverts", async () => {
    mockSendTransactionAsync.mockResolvedValue("0xhash");
    mockWaitForReceipt.mockResolvedValue({
      status: "reverted",
      logs: [],
    });

    const { useCreateLink } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useCreateLink());

    await act(async () => {
      await result.current.create({
        token: "0x0000000000000000000000000000000000000000" as `0x${string}`,
        amount: "1.0",
        expirySeconds: 3600,
        isNative: true,
        baseUrl: "https://test.app",
      });
    });

    expect(result.current.result).toBeNull();
    expect(result.current.error).toBe("Transaction reverted");
  });

  it("should set error when sendTransactionAsync throws", async () => {
    mockSendTransactionAsync.mockRejectedValue(new Error("User rejected"));

    const { useCreateLink } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useCreateLink());

    await act(async () => {
      await result.current.create({
        token: "0x0000000000000000000000000000000000000000" as `0x${string}`,
        amount: "1.0",
        expirySeconds: 3600,
        isNative: true,
        baseUrl: "https://test.app",
      });
    });

    expect(result.current.error).toBe("User rejected");
    expect(result.current.result).toBeNull();
  });

  it("should set error when receipt has no LinkCreated event", async () => {
    mockSendTransactionAsync.mockResolvedValue("0xhash");
    mockWaitForReceipt.mockResolvedValue({
      status: "success",
      logs: [],
    });

    const { useCreateLink } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useCreateLink());

    await act(async () => {
      await result.current.create({
        token: "0x0000000000000000000000000000000000000000" as `0x${string}`,
        amount: "1.0",
        expirySeconds: 3600,
        isNative: true,
        baseUrl: "https://test.app",
      });
    });

    expect(result.current.error).toBe(
      "Transaction succeeded but could not find deposit ID in logs",
    );
  });

  it("should handle non-Error thrown objects", async () => {
    mockSendTransactionAsync.mockRejectedValue("string error");

    const { useCreateLink } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useCreateLink());

    await act(async () => {
      await result.current.create({
        token: "0x0000000000000000000000000000000000000000" as `0x${string}`,
        amount: "1.0",
        expirySeconds: 3600,
        isNative: true,
        baseUrl: "https://test.app",
      });
    });

    expect(result.current.error).toBe("Failed to create payment link");
  });
});

describe("useClaimLink - transaction flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should complete claim flow on success", async () => {
    mockSendTransactionAsync.mockResolvedValue("0xhash");
    mockWaitForReceipt.mockResolvedValue({
      status: "success",
      logs: [],
    });

    const { useClaimLink } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useClaimLink());

    await act(async () => {
      await result.current.claim({
        depositId: 42n,
        secretKey:
          "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
        recipient: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        chainId: 10143,
      });
    });

    expect(result.current.isSuccess).toBe(true);
    expect(result.current.error).toBeNull();
    expect(mockSignClaim).toHaveBeenCalled();
  });

  it("should set error when claim transaction reverts", async () => {
    mockSendTransactionAsync.mockResolvedValue("0xhash");
    mockWaitForReceipt.mockResolvedValue({
      status: "reverted",
      logs: [],
    });

    const { useClaimLink } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useClaimLink());

    await act(async () => {
      await result.current.claim({
        depositId: 42n,
        secretKey:
          "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
        recipient: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        chainId: 10143,
      });
    });

    expect(result.current.error).toBe("Claim transaction reverted");
    expect(result.current.isSuccess).toBe(false);
  });

  it("should set error when signClaim throws", async () => {
    mockSignClaim.mockRejectedValueOnce(new Error("Signing failed"));

    const { useClaimLink } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useClaimLink());

    await act(async () => {
      await result.current.claim({
        depositId: 42n,
        secretKey:
          "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
        recipient: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        chainId: 10143,
      });
    });

    expect(result.current.error).toBe("Signing failed");
  });

  it("should set generic error for non-Error throws", async () => {
    mockSignClaim.mockRejectedValueOnce("unknown error");

    const { useClaimLink } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useClaimLink());

    await act(async () => {
      await result.current.claim({
        depositId: 42n,
        secretKey:
          "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
        recipient: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        chainId: 10143,
      });
    });

    expect(result.current.error).toBe("Failed to claim payment link");
  });
});

describe("useRefundLink - transaction flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should complete refund flow on success", async () => {
    mockSendTransactionAsync.mockResolvedValue("0xhash");
    mockWaitForReceipt.mockResolvedValue({
      status: "success",
      logs: [],
    });

    const { useRefundLink } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useRefundLink());

    await act(async () => {
      await result.current.refund(42n);
    });

    expect(result.current.isSuccess).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("should set error when refund reverts", async () => {
    mockSendTransactionAsync.mockResolvedValue("0xhash");
    mockWaitForReceipt.mockResolvedValue({
      status: "reverted",
      logs: [],
    });

    const { useRefundLink } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useRefundLink());

    await act(async () => {
      await result.current.refund(42n);
    });

    expect(result.current.error).toBe("Refund transaction reverted");
  });

  it("should set error when sendTransaction throws", async () => {
    mockSendTransactionAsync.mockRejectedValue(new Error("Network error"));

    const { useRefundLink } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useRefundLink());

    await act(async () => {
      await result.current.refund(42n);
    });

    expect(result.current.error).toBe("Network error");
  });

  it("should set generic error for non-Error throws", async () => {
    mockSendTransactionAsync.mockRejectedValue(42);

    const { useRefundLink } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useRefundLink());

    await act(async () => {
      await result.current.refund(42n);
    });

    expect(result.current.error).toBe("Failed to refund payment link");
  });
});
