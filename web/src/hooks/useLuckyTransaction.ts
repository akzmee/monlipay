"use client";

import { useRef, useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { monadChain } from "@/config/chain";
import type { Hash } from "viem";

export function useLuckyTransaction() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const client = usePublicClient({ chainId: monadChain.id });
  const { writeContractAsync } = useWriteContract();
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState("");
  const [hash, setHash] = useState<Hash>();

  const run = async (
    work: (ctx: {
      wallet: NonNullable<typeof address>;
      client: NonNullable<typeof client>;
      write: typeof writeContractAsync;
      wait: (
        hash: Hash,
      ) => ReturnType<NonNullable<typeof client>["waitForTransactionReceipt"]>;
      stage: (text: string) => void;
    }) => Promise<void>,
  ) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setHash(undefined);
    try {
      if (!address || !client)
        throw new Error("Connect your wallet to continue.");
      if (chainId !== monadChain.id) {
        setStage(`Switch to ${monadChain.name}`);
        await switchChainAsync({ chainId: monadChain.id });
      }
      const wait = async (tx: Hash) => {
        setHash(tx);
        setStage("Waiting for confirmation…");
        const receipt = await client.waitForTransactionReceipt({ hash: tx });
        if (receipt.status !== "success")
          throw new Error(
            "The transaction reverted. Your funds were not moved.",
          );
        return receipt;
      };
      await work({
        wallet: address,
        client,
        write: writeContractAsync,
        wait,
        stage: setStage,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Transaction failed. Please try again.";
      setError(
        /rejected|denied/i.test(message)
          ? "You cancelled the wallet request. You can try again."
          : message.split("\n")[0],
      );
    } finally {
      running.current = false;
      setBusy(false);
      setStage("");
    }
  };
  return { run, busy, error, stage, hash };
}
