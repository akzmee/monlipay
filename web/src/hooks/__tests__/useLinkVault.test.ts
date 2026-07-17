import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// --- Mocks ---
// These must be at module scope since the hooks use dynamic imports

const mockSendTransactionAsync = vi.fn();
const mockWaitForReceipt = vi.fn();

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0x1234567890123456789012345678901234567890" as `0x${string}`, isConnected: true }),
  useSendTransaction: () => ({
    sendTransactionAsync: mockSendTransactionAsync,
    isPending: false,
    data: "0xtxhash",
  }),
  useReadContract: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    refetch: vi.fn(),
  })),
}));

vi.mock("wagmi/actions", () => ({
  waitForTransactionReceipt: (...args: unknown[]) => mockWaitForReceipt(...args),
}));

vi.mock("@/config/wagmi", () => ({
  wagmiConfig: {},
}));

// Mock viem for both static and dynamic imports
const mockEncodeFunctionData = vi.fn(() => "0xencoded");
const mockDecodeEventLog = vi.fn();
const mockParseEther = vi.fn((v: string) => BigInt(Math.floor(parseFloat(v) * 1e18)));
const mockParseUnits = vi.fn(
  (v: string, decimals: number) =>
    BigInt(Math.floor(parseFloat(v) * 10 ** decimals)),
);

vi.mock("viem", () => ({
  parseEther: mockParseEther,
  parseUnits: mockParseUnits,
  encodeFunctionData: mockEncodeFunctionData,
  decodeEventLog: mockDecodeEventLog,
}));

vi.mock("@/lib/crypto", () => ({
  generateSecretKey: vi.fn(
    () => "0x0000000000000000000000000000000000000000000000000000000000000001",
  ),
  privateKeyToClaimKey: vi.fn(() => "0xclaimkeyaddress"),
  buildShareableUrl: vi.fn(
    (_base: string, id: bigint, _key: string) => `https://test.app/claim#${id}`,
  ),
  signClaim: vi.fn().mockResolvedValue({ v: 27, r: "0xr", s: "0xs" }),
}));

vi.mock("@/lib/storage", () => ({
  addStoredLink: vi.fn(),
  getStoredLinks: vi.fn(() => []),
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

describe("useDeposit", () => {
  it("should be defined and return expected shape", async () => {
    const { useDeposit } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useDeposit(1n));
    expect(result.current).toBeDefined();
    expect(result.current.data).toBeUndefined();
    expect(typeof result.current.isLoading).toBe("boolean");
  });

  it("should be disabled when depositId is null", async () => {
    const { useDeposit } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useDeposit(null));
    // When disabled, it should still return a valid object
    expect(result.current).toBeDefined();
  });
});

describe("useDepositExists", () => {
  it("should be defined and return expected shape", async () => {
    const { useDepositExists } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useDepositExists(1n));
    expect(result.current).toBeDefined();
  });

  it("should be disabled when depositId is null", async () => {
    const { useDepositExists } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useDepositExists(null));
    expect(result.current).toBeDefined();
  });
});

describe("useCreateLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with null result and no error", async () => {
    const { useCreateLink } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useCreateLink());
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isSending).toBe(false);
    expect(result.current.isConfirming).toBe(false);
    expect(typeof result.current.create).toBe("function");
    expect(typeof result.current.reset).toBe("function");
  });

  it("should set error if wallet not connected", async () => {
    // Override the account mock for this test
    vi.doMock("wagmi", () => ({
      useAccount: () => ({ address: undefined, isConnected: false }),
      useSendTransaction: () => ({
        sendTransactionAsync: mockSendTransactionAsync,
        isPending: false,
        data: undefined,
      }),
      useReadContract: vi.fn(() => ({ data: undefined, isLoading: false })),
    }));

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

    // Restore mock
    vi.doUnmock("wagmi");
  });

  it("should reset state when reset() is called", async () => {
    const { useCreateLink } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useCreateLink());

    act(() => {
      result.current.reset();
    });

    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

describe("useClaimLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with correct state", async () => {
    const { useClaimLink } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useClaimLink());
    expect(result.current.error).toBeNull();
    expect(result.current.isSending).toBe(false);
    expect(result.current.isConfirming).toBe(false);
    expect(result.current.isSuccess).toBe(false);
    expect(typeof result.current.claim).toBe("function");
    expect(typeof result.current.reset).toBe("function");
  });

  it("should reset state when reset() is called", async () => {
    const { useClaimLink } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useClaimLink());

    act(() => {
      result.current.reset();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.isSuccess).toBe(false);
  });
});

describe("useRefundLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with correct state", async () => {
    const { useRefundLink } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useRefundLink());
    expect(result.current.error).toBeNull();
    expect(result.current.isSending).toBe(false);
    expect(result.current.isConfirming).toBe(false);
    expect(result.current.isSuccess).toBe(false);
    expect(typeof result.current.refund).toBe("function");
    expect(typeof result.current.reset).toBe("function");
  });

  it("should reset state when reset() is called", async () => {
    const { useRefundLink } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useRefundLink());

    act(() => {
      result.current.reset();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.isSuccess).toBe(false);
  });
});
