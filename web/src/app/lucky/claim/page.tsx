"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowIcon } from "@/components/ArrowIcon";
import { useSearchParams } from "next/navigation";
import { useAccount, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  bytesToHex,
  erc20Abi,
  formatEther,
  formatUnits,
  zeroAddress,
} from "viem";
import { monadChain } from "@/config/chain";
import { isLuckyConfigured, LUCKY_VAULT_ADDRESS } from "@/config/lucky";
import { luckyVaultAbi } from "@/lib/lucky-abi";
import { shortAddress } from "@/lib/lucky";
import { useLuckyTransaction } from "@/hooks/useLuckyTransaction";
import { LuckyArtwork } from "@/components/LuckyArtwork";

function ClaimLuckyLink() {
  const search = useSearchParams();
  const rawId = search.get("id") || "";
  const network = search.get("chain");
  const validId = /^[1-9]\d{0,76}$/.test(rawId);
  const id = validId ? BigInt(rawId) : 0n;
  const correctNetwork = !network || network === String(monadChain.id);
  const { address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const tx = useLuckyTransaction();
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  const enabled = validId && correctNetwork && isLuckyConfigured;
  const base = {
    address: LUCKY_VAULT_ADDRESS,
    abi: luckyVaultAbi,
    chainId: monadChain.id,
  } as const;
  const packetQuery = useReadContract({
    ...base,
    functionName: "getPacket",
    args: [id],
    query: { enabled, refetchInterval: 5000 },
  });
  const p = packetQuery.data;
  const claimQuery = useReadContract({
    ...base,
    functionName: "claims",
    args: [id, address || zeroAddress],
    query: { enabled: enabled && Boolean(address), refetchInterval: 3000 },
  });
  const eligibility = useReadContract({
    ...base,
    functionName: "eligible",
    args: [id, address || zeroAddress],
    query: { enabled: enabled && Boolean(address) },
  });
  const feeQuery = useReadContract({
    ...base,
    functionName: "claimFee",
    query: { enabled, refetchInterval: 15_000 },
  });
  const isNative = p?.token === zeroAddress;
  const decimalsQuery = useReadContract({
    address: p?.token || zeroAddress,
    abi: erc20Abi,
    functionName: "decimals",
    chainId: monadChain.id,
    query: { enabled: Boolean(p && !isNative && p.token !== zeroAddress) },
  });
  const symbolQuery = useReadContract({
    address: p?.token || zeroAddress,
    abi: erc20Abi,
    functionName: "symbol",
    chainId: monadChain.id,
    query: { enabled: Boolean(p && !isNative && p.token !== zeroAddress) },
  });
  const decimals = isNative ? 18 : decimalsQuery.data;
  const symbol = isNative ? "MON" : symbolQuery.data || "tokens";
  const format = (value: bigint) =>
    decimals === undefined ? "…" : formatUnits(value, decimals);
  const displayShare = (value: bigint) => {
    const exact = format(value);
    const [whole, fraction = ""] = exact.split(".");
    if (fraction.length <= 6) return exact;
    if (whole === "0" && !/[1-9]/.test(fraction.slice(0, 6)))
      return "< 0.000001";
    return `≈ ${whole}.${fraction.slice(0, 6).replace(/0+$/, "") || "0"}`;
  };
  const [requested, , amount = 0n, withdrawn] = claimQuery.data || [];
  const ready = amount > 0n;
  const expired = Boolean(p && now >= p.expiry);
  const timedOut = Boolean(p && now > p.expiry + 3600);
  const pending = Boolean(requested && !ready && !timedOut && !p?.closed);
  const canDraw = Boolean(
    p &&
    !p.closed &&
    !expired &&
    !requested &&
    claimQuery.isSuccess &&
    p.requested < p.slots &&
    eligibility.data,
  );
  const owner = Boolean(p && address?.toLowerCase() === p.sender.toLowerCase());
  const refundReady = Boolean(
    owner &&
    expired &&
    !p?.closed &&
    p &&
    (p.requested === p.settled || timedOut),
  );
  const refresh = () => {
    void packetQuery.refetch();
    void claimQuery.refetch();
  };

  let unavailable = "";
  if (!validId)
    unavailable =
      "This Lucky Link is incomplete. Ask the sender for the full link.";
  else if (!correctNetwork)
    unavailable = `This link belongs to another network. Open it on the matching MonliPay site.`;
  else if (!isLuckyConfigured)
    unavailable = `Lucky Links is not yet available on ${monadChain.name}.`;
  else if (packetQuery.isError)
    unavailable =
      "We couldn’t load this link. Check your connection and try again.";
  else if (p?.sender === zeroAddress)
    unavailable =
      "This Lucky Link doesn’t exist. Check the link with its sender.";

  return (
    <div className="mp-workspace lucky-claim-workspace">
      <Link href="/create" className="mp-text-link">
        <ArrowIcon direction="left" /> Create a link
      </Link>
      {unavailable ? (
        <section className="mp-panel lucky-unavailable">
          <h1>Unable to open link</h1>
          <p>{unavailable}</p>
          {packetQuery.isError && (
            <button
              className="mp-button"
              onClick={() => void packetQuery.refetch()}
            >
              Try again
            </button>
          )}
        </section>
      ) : !p || now === 0 ? (
        <div className="mp-skeleton lucky-claim-loading" role="status">
          Loading your Lucky Link…
        </div>
      ) : (
        <section className="mp-panel lucky-claim-panel">
          <div className="lucky-claim-art">
            <LuckyArtwork open={ready} />
            <span className="mp-network">{monadChain.name}</span>
          </div>
          <div className="lucky-claim-content">
            <h1>{p.title}</h1>
            <p className="mp-hint">
              From <span title={p.sender}>{shortAddress(p.sender)}</span>
            </p>
            {ready ? (
              <div className="lucky-reveal" aria-live="polite">
                <p>{withdrawn ? "You collected" : "Your share is ready"}</p>
                <strong>
                  {displayShare(amount)} <span>{symbol}</span>
                </strong>
                {displayShare(amount) !== format(amount) && (
                  <p className="lucky-exact-amount">
                    Exact amount: {format(amount)} {symbol}
                  </p>
                )}
                <p>
                  {withdrawn
                    ? "It’s in your wallet. Enjoy the surprise."
                    : "This amount is reserved for your wallet. Collect it below."}
                </p>
              </div>
            ) : pending ? (
              <div className="lucky-reveal" role="status">
                <h2>Your spot is reserved.</h2>
                <p>
                  We’re waiting for your random share. You can leave and reopen
                  this link with the same wallet.
                </p>
                <div className="draw-waiting" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            ) : (
              <div className="lucky-claim-intro">
                <h2>
                  {p.closed || expired
                    ? "This Lucky Link has ended."
                    : p.requested >= p.slots
                      ? "All shares are reserved."
                      : "There’s a surprise inside."}
                </h2>
                <p>
                  {requested && timedOut && !ready
                    ? "Your draw could not finish in time. Unallocated funds can be returned to the sender."
                    : "The sender chose the people. Each eligible wallet gets one random share."}
                </p>
              </div>
            )}
            <dl className="lucky-summary">
              <div>
                <dt>Total pool</dt>
                <dd>
                  {format(p.total)} {symbol}
                </dd>
              </div>
              <div>
                <dt>Shares reserved</dt>
                <dd>
                  {p.requested} / {p.slots}
                </dd>
              </div>
              <div>
                <dt>Claim deadline</dt>
                <dd>
                  {new Date(p.expiry * 1000).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </dd>
              </div>
            </dl>
            {!address ? (
              <button
                className="mp-button mp-button-wide"
                onClick={openConnectModal}
              >
                Connect wallet to check eligibility
              </button>
            ) : ready && !withdrawn ? (
              <button
                className="mp-button mp-button-wide"
                disabled={tx.busy}
                onClick={() =>
                  void tx.run(async ({ wallet, write, wait, stage }) => {
                    stage("Confirm collection in your wallet");
                    await wait(
                      await write({
                        ...base,
                        functionName: "withdrawShare",
                        args: [id, wallet],
                        account: wallet,
                      }),
                    );
                    refresh();
                  })
                }
              >
                {tx.busy ? tx.stage : "Collect my share"}
              </button>
            ) : !ready &&
              !requested &&
              !expired &&
              !p.closed &&
              p.requested < p.slots ? (
              <>
                {claimQuery.isError ? (
                  <p className="mp-error">
                    Could not check your claim.{" "}
                    <button
                      className="mp-text-button"
                      onClick={() => void claimQuery.refetch()}
                    >
                      Retry
                    </button>
                  </p>
                ) : claimQuery.isPending || eligibility.isPending ? (
                  <p role="status">Checking your wallet…</p>
                ) : eligibility.isError ? (
                  <p className="mp-error">
                    Could not check eligibility.{" "}
                    <button
                      className="mp-text-button"
                      onClick={() => void eligibility.refetch()}
                    >
                      Retry
                    </button>
                  </p>
                ) : !eligibility.data ? (
                  <p className="mp-notice">
                    This wallet isn’t on the recipient list. Connect the wallet
                    your sender selected.
                  </p>
                ) : (
                  <>
                    <button
                      className="mp-button mp-button-wide"
                      disabled={
                        tx.busy || !canDraw || feeQuery.data === undefined
                      }
                      onClick={() =>
                        void tx.run(
                          async ({ wallet, client, write, wait, stage }) => {
                            const fee = await client.readContract({
                              ...base,
                              functionName: "claimFee",
                            });
                            const seed = bytesToHex(
                              crypto.getRandomValues(new Uint8Array(32)),
                            );
                            stage("Confirm your draw in your wallet");
                            await wait(
                              await write({
                                ...base,
                                functionName: "requestClaim",
                                args: [id, seed],
                                value: fee,
                                account: wallet,
                              }),
                            );
                            refresh();
                          },
                        )
                      }
                    >
                      {tx.busy ? tx.stage : "Reveal my share"}
                    </button>
                    <p className="mp-hint">
                      Draw fee:{" "}
                      {feeQuery.data !== undefined
                        ? `${formatEther(feeQuery.data)} MON`
                        : "loading…"}
                      , plus network gas. Collecting your share requires a
                      second transaction.
                    </p>
                    {feeQuery.isError && (
                      <p className="mp-error">
                        Could not load the draw fee.{" "}
                        <button
                          className="mp-text-button"
                          onClick={() => void feeQuery.refetch()}
                        >
                          Retry
                        </button>
                      </p>
                    )}
                  </>
                )}
              </>
            ) : null}
            {tx.error && (
              <p className="mp-error" role="alert">
                {tx.error}
              </p>
            )}
            {tx.hash && (
              <a
                className="mp-receipt"
                href={`${monadChain.blockExplorers.default.url}/tx/${tx.hash}`}
                target="_blank"
                rel="noreferrer"
              >
                View transaction <ArrowIcon direction="up-right" />
              </a>
            )}
            {owner && !p.closed && (
              <div className="lucky-refund">
                <h2>Sender controls</h2>
                <p className="mp-hint">
                  {format(p.remaining)} {symbol} remains unallocated.{" "}
                  {expired && !refundReady
                    ? "Pending draws can finish for one hour after the deadline."
                    : "Unallocated funds can be reclaimed after the deadline."}
                </p>
                <button
                  className="mp-button mp-button-secondary"
                  disabled={!refundReady || tx.busy || p.remaining === 0n}
                  onClick={() =>
                    void tx.run(async ({ wallet, write, wait, stage }) => {
                      stage("Confirm refund in your wallet");
                      await wait(
                        await write({
                          ...base,
                          functionName: "refund",
                          args: [id, wallet],
                          account: wallet,
                        }),
                      );
                      refresh();
                    })
                  }
                >
                  {tx.busy ? tx.stage : "Reclaim unallocated funds"}
                </button>
              </div>
            )}
          </div>
        </section>
      )}
      <p className="lucky-claim-footnote">
        A Lucky Link from MonliPay. One draw per eligible wallet.
      </p>
    </div>
  );
}

export default function LuckyClaimPage() {
  return (
    <Suspense
      fallback={
        <div className="mp-workspace">
          <p role="status">Opening Lucky Link…</p>
        </div>
      }
    >
      <ClaimLuckyLink />
    </Suspense>
  );
}
