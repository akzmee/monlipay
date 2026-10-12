"use client";

import { useState } from "react";
import Link from "next/link";
import { useReadContract } from "wagmi";
import type { Address } from "viem";
import { monadChain, SUPPORTED_TOKENS } from "@/config/chain";
import { isLuckyConfigured, LUCKY_VAULT_ADDRESS } from "@/config/lucky";
import { luckyVaultAbi } from "@/lib/lucky-abi";
import { historyAmount, luckyStatus } from "@/lib/link-history";
import { ArrowIcon } from "./ArrowIcon";

function LuckyRow({
  id,
  now,
  owner,
}: {
  id: bigint;
  now: number;
  owner: Address;
}) {
  const query = useReadContract({
    address: LUCKY_VAULT_ADDRESS,
    abi: luckyVaultAbi,
    functionName: "getPacket",
    args: [id],
    chainId: monadChain.id,
    query: { refetchInterval: 15_000 },
  });
  if (query.isError)
    return (
      <li className="mp-history-row">
        <p className="mp-error">Could not load Lucky Link #{id.toString()}.</p>
        <button className="mp-text-button" onClick={() => void query.refetch()}>
          Retry
        </button>
      </li>
    );
  if (!query.data)
    return <li className="mp-skeleton" aria-label="Loading Lucky Link" />;
  const p = query.data;
  if (p.sender.toLowerCase() !== owner.toLowerCase()) return null;
  const token = SUPPORTED_TOKENS.find(
    (t) => t.address.toLowerCase() === p.token.toLowerCase(),
  );
  const status = luckyStatus(p, now);
  return (
    <li className="mp-history-row">
      <div className="mp-history-info">
        <h3>{p.title}</h3>
        <p>
          {historyAmount(p.total, token?.decimals, token?.symbol)} ·{" "}
          {p.requested} of {p.slots} shares reserved
        </p>
        <small>
          Lucky Link #{id.toString()} · {status}
        </small>
      </div>
      <Link
        className="mp-text-link"
        href={`/lucky/claim?id=${id}&chain=${monadChain.id}`}
      >
        {status === "Refund available" ? "View refund" : "View link"}
        <ArrowIcon />
      </Link>
    </li>
  );
}

// Parent keys this component by wallet, so pagination never crosses accounts.
export function LuckyLinkHistory({
  address,
  now,
}: {
  address: Address;
  now: number;
}) {
  const [offset, setOffset] = useState(0);
  const history = useReadContract({
    address: LUCKY_VAULT_ADDRESS,
    abi: luckyVaultAbi,
    functionName: "getCreatedPackets",
    args: [address, BigInt(offset), 10n],
    chainId: monadChain.id,
    query: { enabled: isLuckyConfigured, refetchInterval: 15_000 },
  });
  return (
    <section
      className="mp-history-section"
      aria-labelledby="lucky-history-title"
    >
      <div className="mp-history-heading">
        <h2 id="lucky-history-title">Lucky Links</h2>
        <Link className="mp-text-link" href="/create/lucky">
          Create Lucky Link <ArrowIcon direction="up-right" />
        </Link>
      </div>
      {!isLuckyConfigured ? (
        <p className="mp-hint">
          Lucky Links are not available on this network yet.
        </p>
      ) : history.isError ? (
        <p className="mp-error" role="alert">
          Could not load Lucky Links.{" "}
          <button
            className="mp-text-button"
            onClick={() => void history.refetch()}
          >
            Retry
          </button>
        </p>
      ) : history.isPending ? (
        <p className="mp-hint" role="status">
          Loading Lucky Links…
        </p>
      ) : !history.data?.length ? (
        <p className="mp-hint">
          {offset
            ? "No older Lucky Links."
            : "Share a pool with selected wallets. Your funded Lucky Links will appear here."}
        </p>
      ) : (
        <ul>
          {history.data.map((id) => (
            <LuckyRow key={id.toString()} id={id} now={now} owner={address} />
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
        {history.data?.length === 10 && (
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
