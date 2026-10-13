"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useChainId,
  useReadContracts,
  useSwitchChain,
} from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { erc20Abi } from "viem";
import { useMyLinks } from "@/hooks/useMyLinks";
import { useRefundMultiple } from "@/hooks/useRefundMultiple";
import { GroupLinkHistory } from "@/components/GroupLinkHistory";
import { PrivateLinkHistory } from "@/components/PrivateLinkHistory";
import { ArrowIcon } from "@/components/ArrowIcon";
import {
  LinkBackupPanel,
  SavedLinkActions,
} from "@/components/LinkBackupPanel";
import { monadChain, SUPPORTED_TOKENS } from "@/config/chain";
import { historyAmount } from "@/lib/link-history";
import type { IndexedLink } from "@/lib/indexer-client";

function PaymentRow({
  link,
  now,
  busy,
  onRefund,
}: {
  link: IndexedLink;
  now: number;
  busy: boolean;
  onRefund: () => void;
}) {
  const token = SUPPORTED_TOKENS.find(
    (t) => t.address.toLowerCase() === link.token.toLowerCase(),
  );
  const metadata = useReadContracts({
    contracts: [
      {
        address: link.token,
        abi: erc20Abi,
        functionName: "decimals",
        chainId: monadChain.id,
      },
      {
        address: link.token,
        abi: erc20Abi,
        functionName: "symbol",
        chainId: monadChain.id,
      },
    ],
    query: { enabled: !token, staleTime: 300_000 },
  });
  const decimals = token?.decimals ?? metadata.data?.[0]?.result;
  const symbol = token?.symbol ?? metadata.data?.[1]?.result;
  const expired = now >= Number(link.expiry);
  const refundable = link.status === "active" && expired;
  const status =
    link.status === "refunded"
      ? "Refunded"
      : link.status === "claimed"
        ? "Claimed"
        : link.status === "refund_failed"
          ? "Refund needs retry"
          : expired
            ? "Refund available"
            : "Open";
  return (
    <li className="mp-history-row">
      <div className="mp-history-info">
        <h3>{historyAmount(link.amount, decimals, symbol)}</h3>
        <p>
          Payment Link #{link.depositId.toString()} · {status}
        </p>
        <small>
          {expired ? "Expired" : "Expires"}{" "}
          {new Date(Number(link.expiry) * 1000).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </small>
      </div>
      <div className="mp-history-actions">
        <SavedLinkActions depositId={link.depositId.toString()} />
        {refundable ? (
          <button
            className="mp-button mp-button-secondary"
            disabled={busy}
            onClick={onRefund}
          >
            {busy ? "Refunding…" : "Refund"}
          </button>
        ) : (
          <a
            className="mp-text-link"
            href={`${monadChain.blockExplorers.default.url}/address/${link.sender}`}
            target="_blank"
            rel="noreferrer"
          >
            View activity <ArrowIcon direction="up-right" />
          </a>
        )}
      </div>
    </li>
  );
}

export default function MyLinksPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const { links, isLoading, error, refresh, indexerConfigured } = useMyLinks();
  const {
    refundMultiple,
    busyDepositIds,
    error: refundError,
  } = useRefundMultiple();
  const [filter, setFilter] = useState("All links");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [switchError, setSwitchError] = useState("");
  useEffect(() => {
    const timer = setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      15_000,
    );
    return () => clearInterval(timer);
  }, []);
  const wrongChain = isConnected && chainId !== monadChain.id;
  const visible = links.filter(
    (link) =>
      link.chainId === monadChain.id &&
      link.sender.toLowerCase() === address?.toLowerCase(),
  );
  const refund = async (id: bigint) => {
    try {
      await refundMultiple(id, () => void refresh());
    } catch {
      /* Hook displays the error. */
    }
  };
  return (
    <div className="mp-workspace mp-history">
      <div className="mp-page-heading">
        <div>
          <h1>My Links</h1>
          <p>Your payment links, together.</p>
        </div>
        <Link className="mp-button mp-button-primary" href="/create">
          Create a link <ArrowIcon direction="up-right" />
        </Link>
      </div>
      {!isConnected || !address ? (
        <section className="mp-panel mp-history-empty">
          <h2>Your links live here.</h2>
          <p>
            Connect your wallet to see what you have sent and refund expired
            links.
          </p>
          <button
            className="mp-button mp-button-primary"
            onClick={openConnectModal}
          >
            Connect wallet
          </button>
        </section>
      ) : wrongChain ? (
        <section className="mp-panel mp-history-empty">
          <h2>Switch to {monadChain.name}</h2>
          <p>Your link history belongs to this network.</p>
          <button
            className="mp-button mp-button-primary"
            onClick={async () => {
              setSwitchError("");
              try {
                await switchChainAsync({ chainId: monadChain.id });
              } catch {
                setSwitchError(
                  "Network switch cancelled. Try again when you are ready.",
                );
              }
            }}
          >
            Switch network
          </button>
          {switchError && (
            <p className="mp-error" role="alert">
              {switchError}
            </p>
          )}
        </section>
      ) : (
        <>
          <LinkBackupPanel />
          <div className="mp-history-filters" aria-label="Filter links">
            {[
              "All links",
              "Payment links",
              ...(monadChain.id === 143 ? ["Private links"] : []),
              "Group Payments",
            ].map((label) => (
              <button
                key={label}
                className="mp-button mp-button-secondary"
                aria-pressed={filter === label}
                onClick={() => setFilter(label)}
              >
                {label}
              </button>
            ))}
          </div>
          {(filter === "All links" || filter === "Private links") && (
            <PrivateLinkHistory />
          )}
          {(filter === "All links" || filter === "Payment links") && (
            <section
              className="mp-history-section"
              aria-labelledby="payment-history-title"
            >
              <div className="mp-history-heading">
                <h2 id="payment-history-title">Payment links</h2>
                <button
                  className="mp-text-button"
                  disabled={isLoading}
                  onClick={() => void refresh()}
                >
                  {isLoading ? "Refreshing…" : "Refresh"}
                </button>
              </div>
              <p className="mp-hint">
                Open saved links with your passkey. Refunds require your wallet
                confirmation and network gas.
              </p>
              {refundError && (
                <p className="mp-error" role="alert">
                  {refundError}
                </p>
              )}
              {(!indexerConfigured || error) && (
                <p className="mp-error" role="alert">
                  Payment history is temporarily unavailable.{" "}
                  <button
                    className="mp-text-button"
                    onClick={() => void refresh()}
                  >
                    Retry
                  </button>
                </p>
              )}
              {isLoading && !visible.length ? (
                <p className="mp-hint" role="status">
                  Loading payment links…
                </p>
              ) : !error && indexerConfigured && !visible.length ? (
                <p className="mp-hint mp-history-empty-copy">
                  No payment links yet. Create a link to send tokens to one
                  person.
                </p>
              ) : (
                <ul>
                  {visible.map((link) => (
                    <PaymentRow
                      key={`${address}-${link.depositId}`}
                      link={link}
                      now={now}
                      busy={busyDepositIds.has(link.depositId.toString())}
                      onRefund={() => void refund(link.depositId)}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}
          {(filter === "All links" || filter === "Group Payments") && (
            <GroupLinkHistory key={address} address={address} now={now} />
          )}
        </>
      )}
    </div>
  );
}
