import { createConfig } from "ponder";
import { http } from "viem";
import { linkVaultAbi } from "./abis/LinkVaultAbi";

const MAINNET_VAULT =
  process.env.PONDER_MONAD_MAINNET_VAULT ||
  "0xd7846DC6Fd8c159cF59957c532173d828f7B5BBC";
const TESTNET_VAULT =
  process.env.PONDER_MONAD_TESTNET_VAULT || "";

const MAINNET_RPC =
  process.env.PONDER_RPC_MAINNET || "https://monad-mainnet.g.alchemy.com/v2/DVb0FpBDpZEmThk4Ut1Rp";
const TESTNET_RPC =
  process.env.PONDER_RPC_TESTNET || "https://testnet-rpc.monad.xyz";

function buildConfig() {
  const chains: Record<string, { id: number; rpc: ReturnType<typeof http> }> = {};
  const chainAddresses: Record<
    string,
    { address: `0x${string}`; startBlock?: number }
  > = {};

  if (MAINNET_VAULT !== "") {
    chains.monadMainnet = { id: 143, rpc: http(MAINNET_RPC), ethGetLogsBlockRange: 100 };
    chainAddresses.monadMainnet = {
      address: MAINNET_VAULT as `0x${string}`,
    };
  }
  if (TESTNET_VAULT !== "") {
    chains.monadTestnet = { id: 10143, rpc: http(TESTNET_RPC), ethGetLogsBlockRange: 100 };
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
  database: { kind: "pglite" },
  ordering: "multichain",
  chains,
  contracts: {
    LinkVault: {
      abi: linkVaultAbi,
      chain: chainAddresses,
      startBlock: "latest",
    },
  },
});
