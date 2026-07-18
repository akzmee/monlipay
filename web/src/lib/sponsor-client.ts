"use client";

/** Build, sign, and POST an EIP-2771 ForwardRequest for gasless claim(). Callers fall back to direct claim on any failure. */

import {
  type Address,
  type Hex,
  encodeFunctionData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { linkVaultAbi } from "@/lib/abi";
import {
  GAS_FORWARDER_ADDRESS,
  isGasSponsorAvailable,
} from "@/config/gas-sponsor";
import { LINK_VAULT_ADDRESS } from "@/config/chain";

/**
 * The ForwardRequestData struct, in the shape the API route expects.
 * BigInts are used because the wire format is JSON — the server
 * re-parses them.
 *
 * Note: we serialize BigInts as strings when sending over the wire.
 */
export interface ForwardRequestData {
  from: Address;
  to: Address;
  value: bigint;
  gas: bigint;
  nonce: bigint;
  deadline: number; // uint48 (fits in JS number safely)
  data: Hex;
  signature: Hex;
}

/**
 * JSON-serializable form of ForwardRequestData (bigint → string).
 * Used as the actual wire format in the POST body.
 */
export type ForwardRequestDataJson = {
  from: Address;
  to: Address;
  value: string;
  gas: string;
  nonce: string;
  deadline: number;
  data: Hex;
  signature: Hex;
};

/**
 * Result of a sponsor-claim attempt.
 * On failure, callers should fall back to direct claim.
 */
export type SponsorClaimResult =
  | { ok: true; txHash: Hex }
  | { ok: false; reason: "not_configured" | "rate_limited" | "budget_exhausted" | "invalid_request" | "relay_failed" | "network_error"; message?: string };

/**
 * Parameters for sponsoring a claim.
 * Same shape as the direct claim, plus an optional deadline.
 */
export interface SponsorClaimParams {
  depositId: bigint;
  secretKey: Hex;
  recipient: Address;
  /** Forwarder request deadline (seconds since epoch). Default: 1 hour from now. */
  deadlineSeconds?: number;
}

/**
 * Attempt a gasless claim via the sponsor server.
 *
 * Returns:
 *   - { ok: true, txHash } on success
 *   - { ok: false, reason, message? } on any failure
 *
 * This function never throws — all errors are returned in the result.
 * The caller decides whether to fall back to direct claim.
 */
export async function sponsorClaim(params: SponsorClaimParams): Promise<SponsorClaimResult> {
  if (!isGasSponsorAvailable) {
    return { ok: false, reason: "not_configured" };
  }

  // 1. Sign the LinkVault's claim signature using the link's secret key.
  // This is the (depositId, recipient) EIP-712 digest computed by the
  // contract — we replicate it here via signClaim.
  const { signClaim } = await import("@/lib/crypto");
  const { v, r, s } = await signClaim({
    privateKey: params.secretKey,
    depositId: params.depositId,
    recipient: params.recipient,
    chainId: getChainId(),
    verifyingContract: LINK_VAULT_ADDRESS,
  });

  // 2. Build the inner claim() calldata with the real signature.
  // This is what the forwarder will pass through to LinkVault.claim().
  const claimDataWithSig = encodeFunctionData({
    abi: linkVaultAbi,
    functionName: "claim",
    args: [params.depositId, params.recipient, v, r, s],
  });

  // 3. Derive the "from" address (link's claimKey) from the secret key.
  // The forwarder nonce is per-"from"-address, and the signature over
  // the request must be from this same address.
  const account = privateKeyToAccount(params.secretKey);

  // 4. Read the current forwarder nonce for this address.
  // We do this via a direct eth_call — no wallet connection needed.
  let nonce: bigint;
  try {
    nonce = await readForwarderNonce(account.address);
  } catch (err) {
    return {
      ok: false,
      reason: "network_error",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // 5. Build the forwarder request struct.
  const deadline = (params.deadlineSeconds ?? Math.floor(Date.now() / 1000) + 3600) | 0;
  // Bitwise OR with 0 forces the value into a 32-bit int. uint48 fits
  // comfortably but Date.now() + 3600 is well under 2^31 today.
  const request: Omit<ForwardRequestData, "signature"> = {
    from: account.address,
    to: LINK_VAULT_ADDRESS,
    value: 0n,
    gas: 500_000n, // ample for a claim() call
    nonce,
    deadline,
    data: claimDataWithSig,
  };

  // 6. Sign the EIP-712 typed data with the link's secret key.
  // This is the signature that authorizes the sponsor to relay this
  // exact request. The forwarder verifies it on-chain.
  const signature = await signForwarderRequest({
    privateKey: params.secretKey,
    request,
  });

  const fullRequest: ForwardRequestData = { ...request, signature };

  // 7. POST to /api/sponsor/claim
  try {
    const res = await fetch("/api/sponsor/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request: serializeRequest(fullRequest),
      }),
    });

    const body = (await res.json()) as SponsorClaimResult;
    return body;
  } catch (err) {
    return {
      ok: false,
      reason: "network_error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read the current forwarder nonce for a signer.
 * Uses the public RPC directly (no wallet popup).
 */
async function readForwarderNonce(from: Address): Promise<bigint> {
  const { createPublicClient, http } = await import("viem");
  const { monadTestnetChain, monadMainnetChain, isMainnet } = await import("@/config/chain");
  const chain = isMainnet ? monadMainnetChain : monadTestnetChain;
  const client = createPublicClient({ chain, transport: http() });
  const nonce = await client.readContract({
    address: GAS_FORWARDER_ADDRESS,
    abi: [
      {
        type: "function",
        name: "nonces",
        inputs: [{ name: "signer", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
      },
    ] as const,
    functionName: "nonces",
    args: [from],
  });
  return nonce as bigint;
}

// Sign the EIP-712 ForwardRequest struct.
async function signForwarderRequest(params: {
  privateKey: Hex;
  request: Omit<ForwardRequestData, "signature">;
}): Promise<Hex> {
  const { privateKey, request } = params;
  const account = privateKeyToAccount(privateKey);

  const chainId = getChainId();

  // Read domain (name, version) from eip712Domain() to match the deployed forwarder.
  const { name, version } = await readForwarderDomain();

  const signature = await account.signTypedData({
    domain: {
      name,
      version,
      chainId: BigInt(chainId),
      verifyingContract: GAS_FORWARDER_ADDRESS,
    },
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      ForwardRequest: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "gas", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint48" },
        { name: "data", type: "bytes" },
      ],
    },
    primaryType: "ForwardRequest",
    message: {
      from: request.from,
      to: request.to,
      value: request.value,
      gas: request.gas,
      nonce: request.nonce,
      deadline: request.deadline,
      data: request.data,
    },
  });

  return signature;
}

/**
 * Read the forwarder's EIP-712 domain (name + version).
 * Cached after first call.
 */
let domainCache: { name: string; version: string } | null = null;

async function readForwarderDomain(): Promise<{ name: string; version: string }> {
  if (domainCache) return domainCache;
  const { createPublicClient, http } = await import("viem");
  const { monadTestnetChain, monadMainnetChain, isMainnet } = await import("@/config/chain");
  const chain = isMainnet ? monadMainnetChain : monadTestnetChain;
  const client = createPublicClient({ chain, transport: http() });
  const result = (await client.readContract({
    address: GAS_FORWARDER_ADDRESS,
    abi: [
      {
        type: "function",
        name: "eip712Domain",
        inputs: [],
        outputs: [
          { name: "fields", type: "bytes1" },
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
          { name: "salt", type: "bytes32" },
          { name: "extensions", type: "uint256[]" },
        ],
        stateMutability: "view",
      },
    ] as const,
    functionName: "eip712Domain",
    args: [],
  })) as readonly [unknown, string, string, bigint, Address, Hex, bigint[]];
  domainCache = { name: result[1], version: result[2] };
  return domainCache;
}

/** Test-only: clear the domain cache. */
export function _clearDomainCache(): void {
  domainCache = null;
}

/**
 * Get the active chain ID. Mirrors chain.ts logic without importing the
 * whole module (which has tree-shaking issues with `defineChain`).
 */
function getChainId(): number {
  // Lazy import to avoid circular dep with chain.ts
  // We read NEXT_PUBLIC_NETWORK directly to match chain.ts behavior.
  const isMain = process.env.NEXT_PUBLIC_NETWORK === "mainnet";
  return isMain ? 143 : 10143;
}

/**
 * Convert ForwardRequestData (with bigint fields) to the JSON-serializable
 * form (with string fields). BigInts are not directly JSON-serializable.
 */
export function serializeRequest(req: ForwardRequestData): ForwardRequestDataJson {
  return {
    from: req.from,
    to: req.to,
    value: req.value.toString(),
    gas: req.gas.toString(),
    nonce: req.nonce.toString(),
    deadline: req.deadline,
    data: req.data,
    signature: req.signature,
  };
}

