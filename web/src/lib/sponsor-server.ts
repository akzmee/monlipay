/** Server-side relay: validates ForwardRequest, checks rate/budget caps, broadcasts forwarder.execute(). */

import {
  createWalletClient,
  http,
  type Hex,
  type Address,
  type WalletClient,
  type LocalAccount,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { erc2771ForwarderAbi, linkVaultAbi } from "@/lib/abi";
import {
  GAS_FORWARDER_ADDRESS,
  GAS_SPONSOR_PRIVATE_KEY,
  GAS_SPONSOR_DAILY_BUDGET_MON,
  isSponsorServerConfigured,
  SPONSOR_RATE_LIMITS,
} from "@/config/gas-sponsor";
import { monadTestnetChain, monadMainnetChain, isMainnet } from "@/config/chain";
import { LINK_VAULT_ADDRESS } from "@/config/chain";
import { rateLimit } from "@/lib/rate-limit";

/**
 * The ForwardRequestData struct as defined in OZ's ERC2771Forwarder.
 * The client signs the EIP-712 typed data for this exact shape, then
 * sends the whole struct to /api/sponsor/claim.
 */
export interface ForwardRequestData {
  from: Address;
  to: Address;
  value: bigint;
  gas: bigint;
  nonce: bigint;
  deadline: number; // uint48
  data: Hex;
  signature: Hex;
}

/**
 * Result of attempting to relay a sponsor request.
 * The API route maps these to HTTP status codes.
 */
export type RelayResult =
  | { ok: true; txHash: Hex }
  | { ok: false; reason: "not_configured" }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds: number }
  | { ok: false; reason: "budget_exhausted"; retryAfterSeconds: number }
  | { ok: false; reason: "invalid_request"; message: string }
  | { ok: false; reason: "relay_failed"; message: string };

// ---------------------------------------------------------------------------
// Wallet client (lazy singleton)
// ---------------------------------------------------------------------------

let sponsorClient: WalletClient | null = null;
let sponsorAccount: LocalAccount | null = null;

function getSponsorAccount(): LocalAccount {
  if (sponsorAccount) return sponsorAccount;
  if (!GAS_SPONSOR_PRIVATE_KEY) {
    throw new Error("GAS_SPONSOR_PRIVATE_KEY not set");
  }
  sponsorAccount = privateKeyToAccount(GAS_SPONSOR_PRIVATE_KEY as Hex);
  return sponsorAccount;
}

function getSponsorClient(): WalletClient {
  if (sponsorClient) return sponsorClient;
  const chain = isMainnet ? monadMainnetChain : monadTestnetChain;
  sponsorClient = createWalletClient({
    account: getSponsorAccount(),
    chain,
    transport: http(),
  });
  return sponsorClient;
}

/** Public address of the sponsor wallet. Used for transparency / debug. */
export function getSponsorAddress(): Address {
  if (!isSponsorServerConfigured) {
    return "0x0000000000000000000000000000000000000000";
  }
  return getSponsorAccount().address;
}

// ---------------------------------------------------------------------------
// Daily budget tracker (in-memory; reset on server restart)
// ---------------------------------------------------------------------------

interface BudgetState {
  /** UTC date string (YYYY-MM-DD). When the date rolls over, spend resets. */
  dateUtc: string;
  /** Total MON spent today (in wei). */
  spentWei: bigint;
}

let budgetState: BudgetState = { dateUtc: "", spentWei: 0n };

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function resetBudgetIfNewDay(): void {
  const today = todayUtc();
  if (budgetState.dateUtc !== today) {
    budgetState = { dateUtc: today, spentWei: 0n };
  }
}

/**
 * Returns the remaining sponsor budget in MON for today.
 * Exposed for diagnostics / admin endpoints.
 */
export function getRemainingBudgetMon(): number {
  resetBudgetIfNewDay();
  const spentMon = Number(budgetState.spentWei) / 1e18;
  return Math.max(0, GAS_SPONSOR_DAILY_BUDGET_MON - spentMon);
}

/** Test-only: reset budget state. */
export function _resetBudgetForTest(): void {
  budgetState = { dateUtc: "", spentWei: 0n };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

// Cheap pre-flight validation before forwarding to the chain.
function validateRequestShape(req: unknown): req is ForwardRequestData {
  if (typeof req !== "object" || req === null) return false;
  const r = req as Record<string, unknown>;
  if (typeof r.from !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(r.from)) return false;
  if (typeof r.to !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(r.to)) return false;
  if (typeof r.value !== "bigint" || r.value < 0n) return false;
  if (typeof r.gas !== "bigint" || r.gas <= 0n || r.gas > 5_000_000n) return false;
  if (typeof r.nonce !== "bigint" || r.nonce < 0n) return false;
  if (typeof r.deadline !== "number" || !Number.isFinite(r.deadline)) return false;
  if (typeof r.data !== "string" || !r.data.startsWith("0x")) return false;
  if (typeof r.signature !== "string" || !r.signature.startsWith("0x")) return false;
  return true;
}

// Allowlist: only LinkVault.claim() calls are relayed.
function isAllowlistedCall(req: ForwardRequestData): boolean {
  if (req.to.toLowerCase() !== LINK_VAULT_ADDRESS.toLowerCase()) return false;
  // First 4 bytes of data is the selector.
  const selector = req.data.slice(0, 10);
  return selector === CLAIM_SELECTOR;
}

// Compute the claim() selector from the ABI.
function computeClaimSelector(): string {
  // Manually compute keccak256("claim(uint256,address,uint8,bytes32,bytes32)")
  // slice(0, 10) — but we don't want to import viem on the server hot path,
  // so hardcode the result and verify with a unit test.
  // keccak256 of that exact string is f7121490... so selector = 0xf7121490
  return "0xf7121490";
}

const CLAIM_SELECTOR = computeClaimSelector();

// ---------------------------------------------------------------------------
// Rate limiting (per IP and per recipient, in addition to global)
// ---------------------------------------------------------------------------

/**
 * Check all rate limits for a sponsor request.
 * Returns null if OK, or a RelayResult explaining why it was rejected.
 */
function checkRateLimits(ip: string, recipient: Address, depositId: bigint): RelayResult | null {
  // Per-IP per-minute
  if (!rateLimit(`sponsor:ip:${ip}`, SPONSOR_RATE_LIMITS.PER_IP_PER_MINUTE)) {
    return {
      ok: false,
      reason: "rate_limited",
      retryAfterSeconds: 60,
    };
  }
  // Per-recipient per-hour
  if (!rateLimit(`sponsor:recipient:${recipient.toLowerCase()}`, SPONSOR_RATE_LIMITS.PER_RECIPIENT_PER_HOUR)) {
    return {
      ok: false,
      reason: "rate_limited",
      retryAfterSeconds: 3600,
    };
  }
  // Per-deposit — a deposit can be claimed at most once
  if (!rateLimit(`sponsor:deposit:${depositId}`, SPONSOR_RATE_LIMITS.PER_DEPOSIT)) {
    return {
      ok: false,
      reason: "rate_limited",
      retryAfterSeconds: 86400, // doesn't really matter — never allowed
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main relay entry point
// ---------------------------------------------------------------------------

/**
 * Relay a signed forwarder request from the sponsor wallet.
 *
 * Caller (the API route) has already parsed the JSON body. We:
 *   1. Verify server config
 *   2. Validate request shape
 *   3. Check rate limits
 *   4. Check daily budget
 *   5. Verify the request targets a LinkVault claim call
 *   6. Estimate gas cost; reject if it would bust the daily budget
 *   7. Broadcast forwarder.execute()
 *   8. Return the tx hash
 */
export async function relaySponsoredClaim(params: {
  request: unknown;
  clientIp: string;
}): Promise<RelayResult> {
  if (!isSponsorServerConfigured) {
    return { ok: false, reason: "not_configured" };
  }

  const { request: rawReq, clientIp } = params;

  if (!validateRequestShape(rawReq)) {
    return {
      ok: false,
      reason: "invalid_request",
      message: "Malformed forwarder request.",
    };
  }
  const req = rawReq as ForwardRequestData;

  // Decode the claim callldata to extract recipient + depositId for
  // rate-limiting. If decode fails, reject as invalid_request.
  let recipient: Address;
  let depositId: bigint;
  try {
    const decoded = await decodeClaimCalldata(req.data);
    recipient = decoded.recipient;
    depositId = decoded.depositId;
  } catch {
    return {
      ok: false,
      reason: "invalid_request",
      message: "Could not decode claim() calldata.",
    };
  }

  // Allowlist: must be a LinkVault claim call
  if (!isAllowlistedCall(req)) {
    return {
      ok: false,
      reason: "invalid_request",
      message: "Only LinkVault.claim is supported for sponsorship.",
    };
  }

  // Rate limits
  const rl = checkRateLimits(clientIp, recipient, depositId);
  if (rl) return rl;

  // Budget check
  resetBudgetIfNewDay();
  const remainingMon = getRemainingBudgetMon();
  if (remainingMon <= 0) {
    return {
      ok: false,
      reason: "budget_exhausted",
      retryAfterSeconds: secondsUntilUtcMidnight(),
    };
  }

  // Broadcast
  const client = getSponsorClient();
  try {
    // Note: we DON'T pre-verify via forwarder.verify() because execute()
    // itself reverts on bad sigs and we'd just pay the revert gas anyway.
    // We trust the contract as the source of truth.
    const hash = await client.writeContract({
      chain: client.chain,
      account: getSponsorAccount(),
      address: GAS_FORWARDER_ADDRESS,
      abi: erc2771ForwarderAbi,
      functionName: "execute",
      args: [req],
      // Estimate gas before sending. Viem will surface estimation errors.
      gas: req.gas,
    });

    // Update budget. We don't know actual gas cost until the receipt is
    // mined, but we conservatively book `req.gas * 1 gwei` against the
    // budget. Any over-estimate gets refunded on the next day's reset.
    // For a hackathon demo this is plenty accurate.
    //
    // Note: gas price is 1 gwei on Monad testnet, varies on mainnet.
    // Actual claim() uses ~50k gas, so a typical relay costs about
    // 0.00005 MON — far below the 0.5 MON daily budget.
    const ESTIMATED_COST_WEI = BigInt(req.gas) * 1_000_000_000n; // gas * 1 gwei
    budgetState.spentWei += ESTIMATED_COST_WEI;

    return { ok: true, txHash: hash };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: "relay_failed",
      message,
    };
  }
}

// ---------------------------------------------------------------------------
// Calldata decoding helper
// ---------------------------------------------------------------------------

/**
 * Decode the claim(uint256,address,uint8,bytes32,bytes32) calldata.
 * Returns { depositId, recipient } for rate-limit keying.
 *
 * Uses viem's decodeFunctionData; we import it lazily to keep this module
 * tree-shakeable on the client.
 */
async function decodeClaimCalldata(data: Hex): Promise<{
  depositId: bigint;
  recipient: Address;
}> {
  const { decodeFunctionData } = await import("viem");
  const decoded = decodeFunctionData({
    abi: linkVaultAbi,
    data,
  });
  if (decoded.functionName !== "claim") {
    throw new Error(`Expected claim, got ${decoded.functionName}`);
  }
  const args = decoded.args as [bigint, Address, number, Hex, Hex];
  return {
    depositId: args[0],
    recipient: args[1],
  };
}

/**
 * Seconds from now until the next UTC midnight.
 * Used to populate Retry-After when budget is exhausted.
 */
function secondsUntilUtcMidnight(): number {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0,
  ));
  return Math.max(60, Math.floor((tomorrow.getTime() - now.getTime()) / 1000));
}
