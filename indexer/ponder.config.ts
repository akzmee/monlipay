import { createConfig } from "ponder";
import { http } from "viem";
import { linkVaultAbi } from "./abis/LinkVaultAbi";

/**
 * Ponder configuration for MonliPay LinkVault.
 *
 * Indexes all 4 events emitted by LinkVault:
 *   - LinkCreated   (new payment link)
 *   - LinkClaimed   (recipient claimed funds)
 *   - LinkRefunded  (sender / keeper refunded expired link)
 *   - RefundFailed  (push-transfer to sender failed; recoverable via
 *                    claimFailedRefund pull pattern)
 *
 * The indexer is wired for BOTH mainnet (chain 143) and testnet (chain 10143).
 * Both are defined here so the same codebase can index either network — at
 * runtime only the chains you set addresses for will actually be indexed.
 *
 * To switch which chain is active, set the per-chain `address` via env vars
 * (see below). If a chain has address `""`, it is skipped.
 *
 * Env vars (read at startup):
 *   PONDER_MONAD_MAINNET_VAULT    — mainnet LinkVault address (or empty to skip)
 *   PONDER_MONAD_TESTNET_VAULT    — testnet LinkVault address (or empty to skip)
 *   PONDER_RPC_MAINNET            — override mainnet RPC URL
 *   PONDER_RPC_TESTNET            — override testnet RPC URL
 *   DATABASE_URL                  — Postgres URL in production (optional;
 *                                    Ponder uses SQLite in dev by default)
 */

const MAINNET_VAULT =
  process.env.PONDER_MONAD_MAINNET_VAULT ||
  "0xd7846DC6Fd8c159cF59957c532173d828f7B5BBC";
const TESTNET_VAULT =
  process.env.PONDER_MONAD_TESTNET_VAULT ||
  "0xEB9a0BC1c7518F839B8F249E407A1AfC011E0aB3";

const MAINNET_RPC =
  process.env.PONDER_RPC_MAINNET || "https://rpc.monad.xyz";
const TESTNET_RPC =
  process.env.PONDER_RPC_TESTNET || "https://testnet-rpc.monad.xyz";

/**
 * Build the chains + per-chain contract config, skipping chains the user
 * has explicitly disabled by setting their env var to "" (empty string).
 */
function buildConfig() {
  const chains: Record<string, { id: number; rpc: ReturnType<typeof http> }> =
    {};
  // Per-chain address map — Ponder's API expects this under `contract.chain`,
  // NOT `contract.address`. The top-level `address` is only for contracts
  // deployed at the same address on every chain.
  const chainAddresses: Record<
    string,
    { address: `0x${string}`; startBlock?: number }
  > = {};

  if (MAINNET_VAULT !== "") {
    chains.monadMainnet = { id: 143, rpc: http(MAINNET_RPC) };
    chainAddresses.monadMainnet = {
      address: MAINNET_VAULT as `0x${string}`,
    };
  }
  if (TESTNET_VAULT !== "") {
    chains.monadTestnet = { id: 10143, rpc: http(TESTNET_RPC) };
    chainAddresses.monadTestnet = {
      address: TESTNET_VAULT as `0x${string}`,
    };
  }

  return { chains, chainAddresses };
}

const { chains, chainAddresses } = buildConfig();

if (Object.keys(chains).length === 0) {
  throw new Error(
    "[ponder.config] No chains configured. Set PONDER_MONAD_MAINNET_VAULT or " +
      "PONDER_MONAD_TESTNET_VAULT to a non-empty address.",
  );
}

export default createConfig({
  chains,
  contracts: {
    LinkVault: {
      abi: linkVaultAbi,
      chain: chainAddresses,
      // Use the earliest possible block so we don't miss historical links.
      // For a fresh deploy, this is fine. For long-running chains, set this
      // to the deployment block to speed up initial sync.
      startBlock: 0,
    },
  },
});
