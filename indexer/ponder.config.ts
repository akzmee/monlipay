import { createConfig } from "ponder";
import { http } from "viem";
import { linkVaultAbi } from "./abis/LinkVaultAbi";

const MAINNET_VAULT =
  process.env.PONDER_MONAD_MAINNET_VAULT ||
  "0xf7B6aE721d5C851A2269A675Ee43D60c3E34F9c9";
const TESTNET_VAULT =
  process.env.PONDER_MONAD_TESTNET_VAULT || "";

const MAINNET_RPC =
  process.env.PONDER_RPC_MAINNET || "https://rpc.monad.xyz";
const TESTNET_RPC =
  process.env.PONDER_RPC_TESTNET || "https://testnet-rpc.monad.xyz";

function buildConfig() {
  const chains: Record<
    string,
    { id: number; rpc: ReturnType<typeof http>; ethGetLogsBlockRange: number }
  > = {};
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
