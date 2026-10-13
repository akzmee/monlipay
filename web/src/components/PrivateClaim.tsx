"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { useConnectModal } from "@/components/WalletEntryContext";
import { formatUnits } from "viem";
import { LuckyArtwork } from "./LuckyArtwork";
import { PrivatePrivacyNote } from "./PrivatePaymentWorkspace";
import {
  privateEngine,
  privateResources,
  quotePrivate,
  tokenFor,
  privateError,
  operation,
  checkPrivateOperation,
  rpc,
  type PrivateEngine,
  type PrivateToken,
  type UserKeyring,
  type PrivateOperation,
} from "@/lib/private-payment";
import { claimJournal } from "@/lib/private-claim-journal";
export function PrivateClaim() {
  const { address } = useAccount(),
    chainId = useChainId();
  return <PrivateClaimSession key={`${address}:${chainId}`} />;
}
type ClaimSession = {
  engine: PrivateEngine;
  keyring: UserKeyring;
  token: PrivateToken;
  journal: Awaited<ReturnType<typeof claimJournal>>;
  guard: () => void;
};
function PrivateClaimSession() {
  const { address } = useAccount(),
    chainId = useChainId(),
    { switchChainAsync } = useSwitchChain(),
    { openConnectModal } = useConnectModal();
  const [session, setSession] = useState<ClaimSession | null>(null),
    [balance, setBalance] = useState<bigint | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState("");
  const [op, setOp] = useState<PrivateOperation | null>(null),
    [review, setReview] = useState<{
      quote: Awaited<ReturnType<typeof quotePrivate>>;
      recipient: string;
      time: number;
    } | null>(null);
  const alive = useRef(true),
    mutex = useRef(false);
  useEffect(() => {
    let active = true;
    alive.current = true;
    const guard = () => {
      if (!active) throw new Error("Open your claim link again.");
    };
    void (async () => {
      const engine = await privateEngine();
      guard();
      const decoded = engine.sdk.decodePrivateLink(window.location.href);
      const token = tokenFor(engine.chain, decoded.token),
        keyring = engine.sdk.keyringForLink(decoded.seed);
      const journal = await claimJournal(
        decoded.seed,
        token.address,
        window.location.origin,
      );
      const saved = await journal.read();
      guard();
      setOp(saved);
      await engine.client.registerDiscovery(keyring);
      guard();
      const resources = await privateResources(engine, keyring, token);
      guard();
      setBalance(resources.reduce((sum, r) => sum + r.quantity, 0n));
      setSession({ engine, keyring, token, journal, guard });
    })().catch((e) => {
      if (active) setError(privateError(e));
    });
    return () => {
      active = false;
      alive.current = false;
    };
  }, []);
  const perform = async (label: string, action: () => Promise<void>) => {
    if (mutex.current) return;
    mutex.current = true;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      if (alive.current) setError(privateError(e));
    } finally {
      mutex.current = false;
      if (alive.current) setBusy("");
    }
  };
  const refresh = async () => {
    if (!session) return;
    const resources = await privateResources(
      session.engine,
      session.keyring,
      session.token,
    );
    session.guard();
    setBalance(resources.reduce((sum, r) => sum + r.quantity, 0n));
  };
  const check = async (current: PrivateOperation) => {
    if (!session) return;
    const updated = await checkPrivateOperation(session.engine, current);
    session.guard();
    if (JSON.stringify(updated) !== JSON.stringify(current)) {
      await session.journal.save(updated);
      session.guard();
    }
    setOp(updated);
    setNotice(
      updated.status === "complete"
        ? "Payment confirmed in the receiving wallet."
        : updated.status === "failed"
          ? "The claim did not complete. Refresh the balance; another holder may have claimed or reclaimed it."
          : "Your claim is still processing. Check again shortly. It will not be submitted twice.",
    );
    if (updated.status === "complete" || updated.status === "failed")
      await refresh();
  };
  const prepare = async () => {
    if (!session || !address || chainId !== 143) return;
    const resources = await privateResources(
      session.engine,
      session.keyring,
      session.token,
    );
    session.guard();
    const quote = await quotePrivate(
      session.engine,
      session.keyring,
      resources,
      session.token,
      { recipient: address },
    );
    session.guard();
    setReview({ quote, recipient: address, time: Date.now() });
  };
  const claim = async () => {
    if (
      !session ||
      !review ||
      !address ||
      chainId !== 143 ||
      address !== review.recipient
    )
      return;
    const s = session;
    if (Date.now() - review.time > 60_000) {
      setReview(null);
      throw new Error("The fee quote expired. Review your claim again.");
    }
    const fee = await s.engine.client.estimateFee(
      review.quote.draft.parameters,
      s.token.symbol,
    );
    s.guard();
    if (fee.total > review.quote.fee) {
      setReview(null);
      throw new Error("The fee increased. Review your claim again.");
    }
    const parameters = review.quote.draft.authorize();
    const next: PrivateOperation = {
      ...operation("withdraw", s.token.address, review.quote.amount),
      fee: review.quote.fee.toString(),
      recipient: address,
      status: "submitting",
      root: s.engine.sdk.actionRoot(parameters),
      startBlock: (await rpc.getBlockNumber()).toString(),
    };
    await s.journal.save(next);
    s.guard();
    setOp(next);
    setReview(null);
    const requestId = await s.engine.client.submit(parameters);
    const pending = { ...next, requestId, status: "pending" as const };
    await s.journal.save(pending);
    s.guard();
    setOp(pending);
    await check(pending);
  };
  const pending = !!op && ["submitting", "pending"].includes(op.status);
  return (
    <div className="mp-workspace mp-private-claim">
      <header className="mp-page-heading">
        <div>
          <h1>A private payment for you</h1>
          <p>Review the amount and claim it to your wallet.</p>
        </div>
      </header>
      <div className="mp-panel lucky-claim-panel">
        <div className="lucky-claim-art">
          <LuckyArtwork />
        </div>
        <section
          className="mp-private-claim-details"
          aria-labelledby="claim-private-amount"
        >
          <h2 id="claim-private-amount">
            {op?.status === "complete"
              ? "Payment received"
              : balance === null
                ? "Opening your link…"
                : balance === 0n
                  ? "No available balance found"
                  : `${formatUnits(balance, session!.token.decimals)} ${session!.token.symbol}`}
          </h2>
          {balance === 0n && op?.status !== "complete" && (
            <p className="mp-hint">
              This link may already be claimed or reclaimed, or it may still be
              syncing. Refresh to check again.
            </p>
          )}
          {session && (
            <p className="mp-hint">Monad mainnet · Private payment</p>
          )}
          {op?.status === "complete" ? (
            <>
              <p>
                Claimed to <span className="mp-address">{op.recipient}</span>.
              </p>
              <p className="mp-hint">
                {session &&
                  `${formatUnits(BigInt(op.amount), session.token.decimals)} ${session.token.symbol}`}{" "}
                received after the protocol fee.
              </p>
              {op.hash && (
                <a
                  className="mp-button mp-button-secondary"
                  href={`https://monadscan.com/tx/${op.hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction
                </a>
              )}
            </>
          ) : pending ? (
            <>
              <p className="mp-hint">
                Your claim was submitted. This page keeps its progress encrypted
                on this device.
              </p>
              <button
                className="mp-button"
                disabled={!!busy || !session}
                onClick={() =>
                  void perform("Checking claim…", () => check(op!))
                }
              >
                Check claim status
              </button>
            </>
          ) : !address ? (
            <button className="mp-button" onClick={openConnectModal}>
              Connect receiving wallet
            </button>
          ) : chainId !== 143 ? (
            <button
              className="mp-button"
              onClick={() =>
                void perform("Switching network…", async () => {
                  await switchChainAsync({ chainId: 143 });
                })
              }
            >
              Switch to Monad mainnet
            </button>
          ) : review ? (
            <div className="mp-private-review">
              <h3>You will receive</h3>
              <dl>
                <div>
                  <dt>Amount</dt>
                  <dd>
                    {formatUnits(review.quote.amount, session!.token.decimals)}{" "}
                    {session!.token.symbol}
                  </dd>
                </div>
                <div>
                  <dt>Protocol fee</dt>
                  <dd>
                    {formatUnits(review.quote.fee, session!.token.decimals)}{" "}
                    {session!.token.symbol}
                  </dd>
                </div>
              </dl>
              <p className="mp-hint">
                To <span className="mp-address">{review.recipient}</span>. This
                withdrawal and amount will be public.
                {session?.token.symbol === "WMON"
                  ? " You receive WMON, the wrapped form of MON."
                  : ""}
              </p>
              <button
                className="mp-button"
                disabled={!!busy}
                onClick={() => void perform("Submitting your claim…", claim)}
              >
                Claim to this wallet
              </button>
              <button
                className="mp-text-button"
                disabled={!!busy}
                onClick={() => setReview(null)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="mp-button"
              disabled={!!busy || !session || !balance}
              onClick={() => void perform("Calculating claim fee…", prepare)}
            >
              Review claim
            </button>
          )}
          {!pending && op?.status !== "complete" && (
            <p className="mp-hint">
              The protocol fee comes from the link balance. Your receiving
              wallet does not need MON to pay gas.
            </p>
          )}
          {session && (
            <button
              className="mp-text-button"
              disabled={!!busy}
              onClick={() => void perform("Refreshing link…", refresh)}
            >
              Refresh balance
            </button>
          )}
          {busy && (
            <p className="mp-hint" role="status">
              {busy}
            </p>
          )}
          {notice && (
            <p className="mp-notice" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="mp-error" role="alert">
              {error}
            </p>
          )}
          {error && !session && (
            <button
              className="mp-text-button"
              onClick={() => window.location.reload()}
            >
              Retry opening link
            </button>
          )}
        </section>
      </div>
      <PrivatePrivacyNote />
      <Link className="mp-text-button" href="/create">
        Create your own link
      </Link>
    </div>
  );
}
