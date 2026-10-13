"use client";

import { useState } from "react";
import Link from "next/link";
import { useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { monadChain, SUPPORTED_TOKENS } from "@/config/chain";
import { GROUP_VAULTS, groupClaimPath, isEqualGroupVault } from "@/config/group";
import { luckyVaultAbi } from "@/lib/lucky-abi";
import { historyAmount, groupStatus } from "@/lib/link-history";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import { ArrowIcon } from "./ArrowIcon";

function GroupRow({
  id,
  vault,
  now,
  owner,
}: {
  id: bigint;
  vault: Address;
  now: number;
  owner: Address;
}) {
  const query = useReadContract({
    address: vault,
    abi: luckyVaultAbi,
    functionName: "getPacket",
    args: [id],
    chainId: monadChain.id,
    query: { refetchInterval: 15_000 },
  });
  const knownToken = SUPPORTED_TOKENS.find(
    (token) => token.address.toLowerCase() === query.data?.token.toLowerCase(),
  );
  const { metadata } = useTokenMetadata(knownToken ? null : query.data?.token ?? null);
  if (query.isError)
    return (
      <li className="mp-history-row">
        <p className="mp-error">Could not load Group Payment #{id.toString()}.</p>
        <button className="mp-text-button" onClick={() => void query.refetch()}>
          Retry
        </button>
      </li>
    );
  if (!query.data)
    return <li className="mp-skeleton" aria-label="Loading Group Payment" />;
  const p = query.data;
  if (p.sender.toLowerCase() !== owner.toLowerCase()) return null;
  const token = knownToken ?? metadata;
  const equal = isEqualGroupVault(vault);
  const status = groupStatus(p, now, equal);
  return (
    <li className="mp-history-row">
      <div className="mp-history-info">
        <h3>{p.title}</h3>
        <p>
          {historyAmount(p.total, token?.decimals, token?.symbol)} ·{" "}
          {p.requested} of {p.slots} {equal ? "payments claimed" : "shares reserved"}
        </p>
        <small>
          {equal ? "Equal" : "Random"} · #{id.toString()} · {status}
        </small>
      </div>
      <Link
        className="mp-text-link"
        href={groupClaimPath(id, vault)}
      >
        {status === "Refund available" ? "View refund" : "View link"}
        <ArrowIcon />
      </Link>
    </li>
  );
}

// Parent keys this component by wallet, so pagination never crosses accounts.
export function GroupLinkHistory({
  address,
  now,
}: {
  address: Address;
  now: number;
}) {
  const [offset, setOffset] = useState(0);
  const history = useReadContracts({
    contracts: GROUP_VAULTS.map((vault) => ({
      address: vault,
      abi: luckyVaultAbi,
      functionName: "getCreatedPackets" as const,
      args: [address, BigInt(offset), 10n] as const,
      chainId: monadChain.id,
    })),
    query: { enabled: GROUP_VAULTS.length > 0, refetchInterval: 15_000 },
  });
  const records = (history.data ?? []).flatMap((result, index) =>
    result.status === "success"
      ? result.result.map((id) => ({ id, vault: GROUP_VAULTS[index] }))
      : [],
  );
  const failed = history.isError || history.data?.some((result) => result.status === "failure");
  const hasOlder = history.data?.some((result) => result.status === "success" && result.result.length === 10);
  return (
    <section
      className="mp-history-section"
      aria-labelledby="lucky-history-title"
    >
      <div className="mp-history-heading">
        <h2 id="lucky-history-title">Group Payments</h2>
        <Link className="mp-text-link" href="/create/group">
          Create Group Payment <ArrowIcon direction="up-right" />
        </Link>
      </div>
      {GROUP_VAULTS.length === 0 ? (
        <p className="mp-hint">
          Group Payments are not available on this network yet.
        </p>
      ) : failed ? (
        <p className="mp-error" role="alert">
          Some Group Payments could not be loaded.{" "}
          <button
            className="mp-text-button"
            onClick={() => void history.refetch()}
          >
            Retry
          </button>
        </p>
      ) : history.isPending ? (
        <p className="mp-hint" role="status">
          Loading Group Payments…
        </p>
      ) : !records.length ? (
        <p className="mp-hint">
          {offset
            ? "No older Group Payments."
            : "Send to anyone or selected wallets. Your funded Group Payments will appear here."}
        </p>
      ) : null}
      {records.length > 0 && (
        <ul>
          {records.map(({ id, vault }) => (
            <GroupRow key={`${vault}:${id}`} id={id} vault={vault} now={now} owner={address} />
          ))}
        </ul>
      )}
      <div className="mp-actions">
        {offset > 0 && (
          <button
            className="mp-text-button"
            onClick={() => setOffset(Math.max(0, offset - 10))}
          >
            Newer links
          </button>
        )}
        {hasOlder && (
          <button
            className="mp-text-button"
            onClick={() => setOffset(offset + 10)}
          >
            Older links
          </button>
        )}
      </div>
    </section>
  );
}
