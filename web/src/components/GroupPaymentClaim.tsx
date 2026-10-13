"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowIcon } from "@/components/ArrowIcon";
import { useSearchParams } from "next/navigation";
import { useAccount, useReadContract } from "wagmi";
import { useConnectModal } from "@/components/WalletEntryContext";
import {
  bytesToHex,
  erc20Abi,
  formatEther,
  formatUnits,
  zeroAddress,
} from "viem";
import { monadChain } from "@/config/chain";
import { resolveGroupVault, supportsOpenGroupLinks, isEqualGroupVault } from "@/config/group";
import { groupVaultAbi } from "@/lib/group-abi";
import { luckyVaultAbi } from "@/lib/lucky-abi";
import { shortAddress } from "@/lib/lucky";
import { useLuckyTransaction } from "@/hooks/useLuckyTransaction";
import { LuckyArtwork } from "@/components/LuckyArtwork";
import { GroupPaymentActivity } from "@/components/GroupPaymentActivity";

function ClaimGroupLink({ legacy }: { legacy: boolean }) {
  const search = useSearchParams();
  const rawId = search.get("id") || "";
  const network = search.get("chain");
  const vault = resolveGroupVault(search.get("vault"), legacy);
  const supportsOpen = Boolean(vault && supportsOpenGroupLinks(vault));
  const equal = Boolean(vault && isEqualGroupVault(vault));
  const validId = /^[1-9]\d{0,76}$/.test(rawId);
  const id = validId ? BigInt(rawId) : 0n;
  const correctNetwork = !network || network === String(monadChain.id);
  const destination = network === "143"
    ? { origin: "https://monlipay.xyz", label: "Monad mainnet" }
    : network === "10143" ? { origin: "https://testnet.monlipay.xyz", label: "Monad testnet" } : null;
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
  const enabled = validId && correctNetwork && Boolean(vault);
  const base = {
    address: vault || zeroAddress,
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
  const accessQuery = useReadContract({
    ...base,
    functionName: "openPackets",
    args: [id],
    query: { enabled: enabled && supportsOpen },
  });
  const openAccess = supportsOpen && accessQuery.data === true;
  const accessReady = !supportsOpen || accessQuery.isSuccess;
  const accessError = supportsOpen && accessQuery.isError;
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
    query: { enabled: enabled && !equal, refetchInterval: 15_000 },
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
  const canClaim = Boolean(
    p &&
    !p.closed &&
    !expired &&
    !requested &&
    claimQuery.isSuccess &&
    p.requested < p.slots &&
    accessReady && (openAccess || eligibility.data),
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
      "This group payment link is incomplete. Ask the sender for the full link.";
  else if (!correctNetwork)
    unavailable = destination
      ? `This payment is on ${destination.label}. Open the link there to continue.`
      : "This payment uses an unsupported network. Ask the sender for the correct link.";
  else if (!vault)
    unavailable = "This group payment link uses an unrecognized contract. Ask the sender for the correct link.";
  else if (packetQuery.isError)
    unavailable =
      "We couldn’t load this link. Check your connection and try again.";
  else if (p?.sender === zeroAddress)
    unavailable =
      "This group payment link doesn’t exist. Check the link with its sender.";

  return (
    <div className="mp-workspace lucky-claim-workspace">
      <Link href="/create" className="mp-text-link">
        <ArrowIcon direction="left" /> Create a link
      </Link>
      {unavailable ? (
        <section className="mp-panel lucky-unavailable">
          <h1>Unable to open link</h1>
          <p>{unavailable}</p>
          {!correctNetwork && destination && validId && (
            <a className="mp-button" href={`${destination.origin}/${legacy ? "lucky" : "group"}/claim?${search.toString()}`}>
              Open on {destination.label}
            </a>
          )}
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
          Loading your group payment link…
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
                    ? "Your payment is complete."
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
                  {equal && p.requested >= p.slots
                    ? "All payments have been claimed."
                    : p.closed || expired
                      ? "This group payment link has ended."
                      : p.requested >= p.slots
                        ? "All shares are reserved."
                        : equal ? "Your group payment" : "Your random share"}
                </h2>
                <p>
                  {requested && timedOut && !ready
                    ? "Your draw could not finish in time. Unallocated funds can be returned to the sender."
                    : p.closed || expired ? "New claims are closed. Contact the sender if you expected a payment."
                    : p.requested >= p.slots ? "Every share has already been reserved."
                    : !accessReady ? "Checking who can claim…"
                      : openAccess
                        ? "Open to anyone. The first successful claims fill the available slots. One share per wallet."
                        : "Only selected wallets can claim. One share per wallet."}
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
                <dt>{equal ? "Payments claimed" : "Shares reserved"}</dt>
                <dd>
                  {p.requested} / {p.slots}
                </dd>
              </div>
              {equal && (
                <>
                  <div><dt>Per recipient</dt><dd>{format(p.total / BigInt(p.slots))} {symbol}</dd></div>
                  <div><dt>Remaining pool</dt><dd>{format(p.remaining)} {symbol}</dd></div>
                </>
              )}
              <div><dt>Distribution</dt><dd>{equal ? "Equal amount" : "Random amount"}</dd></div>
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
                {p.closed || expired || p.requested >= p.slots
                  ? "Continue to view details"
                  : "Continue to claim"}
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
                {accessError ? (
                  <p className="mp-error">
                    Could not check who can claim.{" "}
                    <button className="mp-text-button" onClick={() => void accessQuery.refetch()}>Retry</button>
                  </p>
                ) : claimQuery.isError ? (
                  <p className="mp-error">
                    Could not check your claim.{" "}
                    <button
                      className="mp-text-button"
                      onClick={() => void claimQuery.refetch()}
                    >
                      Retry
                    </button>
                  </p>
                ) : claimQuery.isPending || !accessReady || (!openAccess && eligibility.isPending) ? (
                  <p role="status">Checking your wallet…</p>
                ) : !openAccess && eligibility.isError ? (
                  <p className="mp-error">
                    Could not check eligibility.{" "}
                    <button
                      className="mp-text-button"
                      onClick={() => void eligibility.refetch()}
                    >
                      Retry
                    </button>
                  </p>
                ) : !openAccess && !eligibility.data ? (
                  <p className="mp-notice">
                    This wallet isn’t on the recipient list. Connect the wallet
                    your sender selected.
                  </p>
                ) : (
                  <>
                    <button
                      className="mp-button mp-button-wide"
                      disabled={
                        tx.busy || !canClaim || (!equal && feeQuery.data === undefined)
                      }
                      onClick={() =>
                        void tx.run(
                          async ({ wallet, client, write, wait, stage }) => {
                            if (equal) {
                              stage("Confirm your payment in your wallet");
                              await wait(await write({ ...base, abi: groupVaultAbi, functionName: "claimShare", args: [id, wallet], account: wallet }));
                              refresh();
                              return;
                            }
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
                      {tx.busy ? tx.stage : equal ? "Claim my payment" : "Reveal my share"}
                    </button>
                    {equal ? <p className="mp-hint">One claim sends your payment to your wallet. Network gas is separate.</p> : <p className="mp-hint">
                      Draw fee:{" "}
                      {feeQuery.data !== undefined
                        ? `${formatEther(feeQuery.data)} MON`
                        : "loading…"}
                      , plus network gas. Collecting your share requires a
                      second transaction.
                    </p>}
                    {!equal && feeQuery.isError && (
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
      {!unavailable && p && vault && now > 0 && (
        <GroupPaymentActivity key={`${vault}:${id}`} id={id} vault={vault} decimals={decimals} symbol={symbol} refreshKey={tx.hash} />
      )}
      <p className="lucky-claim-footnote">
        A Group Payment Link from MonliPay. One share per wallet.
      </p>
    </div>
  );
}

export default function GroupPaymentClaim({ legacy = false }: { legacy?: boolean }) {
  return (
    <Suspense
      fallback={
        <div className="mp-workspace">
          <p role="status">Opening group payment link…</p>
        </div>
      }
    >
      <ClaimGroupLink legacy={legacy} />
    </Suspense>
  );
}
