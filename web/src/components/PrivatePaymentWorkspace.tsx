"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useWriteContract,
  useSignTypedData,
} from "wagmi";
import { useConnectModal } from "@/components/WalletEntryContext";
import { bytesToHex, hexToBytes, erc20Abi, formatUnits, parseAbi } from "viem";
import { monadChain } from "@/config/chain";
import { useLinkBackups } from "./LinkBackupProvider";
import { LinkBackupPanel } from "./LinkBackupPanel";
import { LinkTypePicker } from "./LinkTypePicker";
import { LuckyArtwork } from "./LuckyArtwork";
import { ShareLink } from "./ShareLink";
import { PrivateStorage } from "@/lib/private-storage";
import {
  privateEngine,
  privateError,
  freshPrivateAccount,
  parsePrivateAccount,
  parsePrivateOperation,
  senderKeyring,
  privateResources,
  quotePrivate,
  operation,
  parsePrivateAmount,
  checkPrivateOperation,
  tokenFor,
  rpc,
  type PrivateEngine,
  type PrivateOperation,
  type PrivateToken,
  type UserKeyring,
} from "@/lib/private-payment";

export function PrivatePaymentWorkspace() {
  const { isConnected, address } = useAccount(),
    chainId = useChainId();
  const { openConnectModal } = useConnectModal(),
    { switchChainAsync } = useSwitchChain();
  const vault = useLinkBackups();
  const [networkError, setNetworkError] = useState("");
  const ready =
    monadChain.id === 143 &&
    chainId === 143 &&
    isConnected &&
    vault.status === "unlocked" &&
    !!vault.passkey;
  return (
    <div className="mp-workspace">
      <header className="mp-page-heading">
        <div>
          <h1>Create a link</h1>
          <p>Send MON or tokens with a link. Choose how you want to share.</p>
        </div>
      </header>
      <LinkTypePicker active="private" />
      {monadChain.id !== 143 ? (
        <section className="mp-panel mp-payment-gate">
          <h2>Private payments use Monad mainnet</h2>
          <p>AnomaPay does not currently support Monad testnet.</p>
          <a className="mp-button" href="https://monlipay.xyz/create/private">
            Open mainnet
          </a>
        </section>
      ) : !isConnected ? (
        <section className="mp-panel mp-payment-gate">
          <h2>Send with more privacy</h2>
          <p>
            Connect your wallet, then set up or unlock your passkey to keep your private
            balance and links within reach.
          </p>
          <button className="mp-button" onClick={openConnectModal}>
            Connect wallet
          </button>
        </section>
      ) : chainId !== 143 ? (
        <section className="mp-panel mp-payment-gate">
          <h2>Switch to Monad mainnet</h2>
          <button
            className="mp-button"
            onClick={() => {
              setNetworkError("");
              void switchChainAsync({ chainId: 143 }).catch(() =>
                setNetworkError(
                  "Switch was cancelled. Try again in your wallet.",
                ),
              );
            }}
          >
            Switch network
          </button>
          {networkError && (
            <p role="alert" className="mp-error">
              {networkError}
            </p>
          )}
        </section>
      ) : !ready ? (
        <section className="mp-panel mp-private-access">
          <h2>Protect your private payments</h2>
          <p className="mp-hint">
            Your passkey opens your encrypted payment records. Set it up before
            adding funds.
          </p>
          <LinkBackupPanel compact />
        </section>
      ) : (
        <PrivateSession key={`${address}:${vault.profile?.vaultId}`} />
      )}
      <PrivatePrivacyNote />
    </div>
  );
}
export function PrivatePrivacyNote() {
  return (
    <p className="mp-hint mp-private-disclosure">
      AnomaPay shields transfers inside its pool. Deposits and withdrawals stay
      public; its proving service can see transfer details. This is not complete
      anonymity. <Link href="/privacy">Read the privacy limits</Link>.
    </p>
  );
}
type Session = {
  engine: PrivateEngine;
  storage: PrivateStorage;
  keyring: UserKeyring;
  guard: () => void;
};
type Review = {
  op: PrivateOperation;
  quote: Awaited<ReturnType<typeof quotePrivate>>;
  token: PrivateToken;
  timestamp: number;
};
function PrivateSession() {
  const vault = useLinkBackups(),
    { address } = useAccount();
  const { writeContractAsync } = useWriteContract(),
    { signTypedDataAsync } = useSignTypedData();
  const [session, setSession] = useState<Session | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState("");
  const [tokenAddress, setTokenAddress] = useState(""),
    [balance, setBalance] = useState<bigint | null>(null);
  const [amount, setAmount] = useState(""),
    [fundAmount, setFundAmount] = useState(""),
    [showFunding, setShowFunding] = useState(false),
    [useMon, setUseMon] = useState(true);
  const [records, setRecords] = useState<PrivateOperation[]>([]),
    [review, setReview] = useState<Review | null>(null),
    [result, setResult] = useState<PrivateOperation | null>(null);
  const [reload, setReload] = useState(0);
  const revisions = useRef(new Map<string, number>()),
    alive = useRef(true),
    mutex = useRef(false);
  useEffect(() => {
    let active = true;
    alive.current = true;
    const guard = vault.sessionGuard();
    const check = () => {
      guard();
      if (!active) throw new Error("Open your private payments again.");
    };
    const storage = new PrivateStorage(vault, check);
    void (async () => {
      const engine = await privateEngine();
      check();
      let rows = await storage.list();
      check();
      let saved = rows.find((r) => r.id === "sender-v1");
      if (!saved) {
        try {
          saved = await storage.save("sender-v1", 1, freshPrivateAccount());
        } catch {
          saved = (await storage.recoverAccount()) ?? undefined;
          if (!saved)
            throw new Error(
              "Private account could not be saved. No funds were requested.",
            );
        }
        rows = [...rows.filter((r) => r.id !== "sender-v1"), saved];
      }
      const keyring = senderKeyring(engine, parsePrivateAccount(saved.value));
      await engine.client.registerDiscovery(keyring);
      check();
      revisions.current = new Map(rows.map((r) => [r.id, r.revision]));
      setRecords(
        rows
          .filter((r) => r.id !== "sender-v1")
          .map((r) => parsePrivateOperation(r.value, r.id)),
      );
      setSession({ engine, storage, keyring, guard: check });
      setTokenAddress(
        (previous) =>
          previous ||
          engine.chain.tokens.find((t) => t.symbol === "WMON")!.address,
      );
      setError("");
    })().catch((e) => {
      if (active) setError(privateError(e));
    });
    return () => {
      active = false;
      alive.current = false;
    };
    // A wallet/passkey change remounts this session; only explicit Reload restarts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);
  const token = session?.engine.chain.tokens.find(
    (t) => t.address === tokenAddress,
  );
  const updateBalance = async (s = session, t = token) => {
    if (!s || !t) return;
    const resources = await privateResources(s.engine, s.keyring, t);
    s.guard();
    setBalance(resources.reduce((sum, r) => sum + r.quantity, 0n));
  };
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setBalance(null);
    });
    if (session && token)
      void privateResources(session.engine, session.keyring, token)
        .then((resources) => {
          session.guard();
          if (active)
            setBalance(resources.reduce((sum, r) => sum + r.quantity, 0n));
        })
        .catch((e) => {
          if (active) setError(privateError(e));
        });
    return () => {
      active = false;
    };
  }, [session, token]);
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
  const save = async (s: Session, op: PrivateOperation) => {
    s.guard();
    const revision = (revisions.current.get(op.id) ?? 0) + 1;
    await s.storage.save(op.id, revision, op);
    s.guard();
    revisions.current.set(op.id, revision);
    setRecords((rows) => [op, ...rows.filter((r) => r.id !== op.id)]);
    return op;
  };
  const check = async (s: Session, op: PrivateOperation) => {
    const updated = await checkPrivateOperation(s.engine, op);
    s.guard();
    if (JSON.stringify(updated) !== JSON.stringify(op)) await save(s, updated);
    if (updated.status === "complete") {
      if (updated.kind === "link") setResult(updated);
      setNotice(
        updated.kind === "deposit"
          ? "Funds added. Refresh the balance if discovery is still catching up."
          : updated.kind === "withdraw"
            ? "Withdrawal confirmed in your wallet."
            : "Your private link is ready.",
      );
      await updateBalance(s);
    } else
      setNotice(
        updated.status === "failed"
          ? "This payment was not completed. Refresh your private balance before continuing."
          : "Your payment is still processing. Use Check status again; do not submit a second payment.",
      );
  };
  const submit = async (
    s: Session,
    input: PrivateOperation,
    parameters: ParametersType,
  ) => {
    const op = {
      ...input,
      status: "submitting" as const,
      root: s.engine.sdk.actionRoot(parameters),
      startBlock: (await rpc.getBlockNumber()).toString(),
    };
    await save(s, op);
    s.guard(); // Durable encrypted intent precedes every spend POST.
    const requestId = await s.engine.client.submit(parameters);
    const pending = { ...op, requestId, status: "pending" as const };
    await save(s, pending);
    await check(s, pending);
  };
  const fund = async (previous?: PrivateOperation) => {
    if (!session || !token || !address) return;
    const s = session,
      t = previous ? tokenFor(s.engine.chain, previous.token) : token;
    let op = previous ?? {
      ...operation(
        "deposit",
        t.address,
        parsePrivateAmount(fundAmount, t.decimals),
      ),
      native: t.symbol === "WMON" && useMon,
    };
    if (op.status !== "draft")
      throw new Error(
        "Funding already started. Check its saved activity before continuing.",
      );
    if (!previous) await save(s, op);
    const quantity = BigInt(op.amount);
    if (op.native && !op.wrapHash) {
      op = { ...op, status: "wallet", walletStep: "wrap" };
      await save(s, op);
      s.guard();
      const hash = await writeContractAsync({
        chainId: 143,
        address: t.address,
        abi: parseAbi(["function deposit() payable"]),
        functionName: "deposit",
        value: quantity,
      });
      op = { ...op, wrapHash: hash };
      await save(s, op);
      if ((await rpc.waitForTransactionReceipt({ hash })).status !== "success")
        throw new Error(
          "The wallet transaction reverted. Check wallet activity.",
        );
      op = { ...op, status: "draft", walletStep: undefined };
      await save(s, op);
    }
    const allowance = await rpc.readContract({
      address: t.address,
      abi: erc20Abi,
      functionName: "allowance",
      args: [address, s.engine.sdk.PERMIT2],
    });
    s.guard();
    if (allowance < quantity) {
      op = { ...op, status: "wallet", walletStep: "approve" };
      await save(s, op);
      s.guard();
      const hash = await writeContractAsync({
        chainId: 143,
        address: t.address,
        abi: erc20Abi,
        functionName: "approve",
        args: [s.engine.sdk.PERMIT2, quantity],
      });
      op = { ...op, approvalHash: hash };
      await save(s, op);
      if ((await rpc.waitForTransactionReceipt({ hash })).status !== "success")
        throw new Error("The wallet approval reverted. Check wallet activity.");
      op = { ...op, status: "draft", walletStep: undefined };
      await save(s, op);
    }
    const draft = await s.engine.sdk.prepareDeposit({
      keyring: s.keyring,
      chain: s.engine.chain,
      token: t,
      amount: quantity,
      owner: address,
    });
    if (
      (await s.engine.client.estimateFee(draft.parameters, t.symbol)).total !==
      0n
    )
      throw new Error(
        "Funding fees changed. No deposit was submitted; your tokens remain in your wallet.",
      );
    s.guard();
    const signature = await signTypedDataAsync({
      ...draft.typedData,
      account: address,
    });
    s.guard();
    await submit(s, op, draft.attachPermit(signature));
    setShowFunding(false);
  };
  const prepareReview = async (withdraw = false) => {
    if (!session || !token || !address) return;
    const s = session,
      resources = await privateResources(s.engine, s.keyring, token);
    s.guard();
    let op: PrivateOperation, target;
    if (withdraw) {
      target = { recipient: address };
      op = operation("withdraw", token.address, 1n);
      op.recipient = address;
    } else {
      op = operation(
        "link",
        token.address,
        parsePrivateAmount(amount, token.decimals),
      );
      const link = s.engine.sdk.newPrivateLink(token.address);
      op.seed = bytesToHex(link.seed);
      target = { payAddress: link.payAddress, amount: BigInt(op.amount) };
    }
    const quote = await quotePrivate(
      s.engine,
      s.keyring,
      resources,
      token,
      target,
    );
    s.guard();
    op.amount = quote.amount.toString();
    op.fee = quote.fee.toString();
    setReview({ op, quote, token, timestamp: Date.now() });
  };
  const confirmReview = async () => {
    if (!session || !review) return;
    const s = session;
    if (Date.now() - review.timestamp > 60_000) {
      setReview(null);
      throw new Error("The fee quote expired. Review a fresh quote.");
    }
    s.guard();
    const liveFee = await s.engine.client.estimateFee(
      review.quote.draft.parameters,
      review.token.symbol,
    );
    s.guard();
    if (liveFee.total > review.quote.fee) {
      setReview(null);
      throw new Error("The fee increased. Review a fresh quote.");
    }
    await save(s, review.op);
    s.guard();
    const parameters = review.quote.draft.authorize();
    setReview(null);
    await submit(s, review.op, parameters);
  };
  const checkWallet = async (op: PrivateOperation) => {
    if (!session) return;
    const hash = op.walletStep === "wrap" ? op.wrapHash : op.approvalHash;
    if (!hash) {
      setNotice(
        "Check your wallet's activity first. If MON was wrapped, it remains as WMON in your wallet. No automatic retry will be made.",
      );
      return;
    }
    const receipt = await rpc.getTransactionReceipt({ hash });
    session.guard();
    await save(session, {
      ...op,
      status: receipt.status === "success" ? "draft" : "failed",
      walletStep: undefined,
    });
    setNotice(
      receipt.status === "success"
        ? "Wallet transaction confirmed. Continue the saved deposit below."
        : "Wallet transaction reverted. Your private deposit was not submitted.",
    );
  };
  if (result && session)
    return (
      <div className="mp-share-workspace">
        <ShareLink
          url={session.engine.sdk.encodePrivateLink(
            hexToBytes(result.seed!),
            result.token,
          )}
          txHash={result.hash}
          onReset={() => {
            setResult(null);
            setAmount("");
          }}
          backup={
            <p className="mp-hint">
              Saved encrypted with your passkey. Anyone with this link can claim
              it; you can reclaim it while unspent. No expiry.
            </p>
          }
        />
      </div>
    );
  return (
    <>
      <div className="lucky-layout">
        <section
          className="mp-panel lucky-form"
          aria-labelledby="private-details"
        >
          <div className="mp-section-title">
            <h2 id="private-details">Private payment</h2>
            <span className="mp-network">Monad mainnet · Beta</span>
          </div>
          {!session ? (
            <p role="status" className="mp-hint">
              {error
                ? "Private payments could not open."
                : "Opening your encrypted payments…"}
            </p>
          ) : (
            <>
              <label className="mp-label" htmlFor="private-token">
                Token
              </label>
              <select
                id="private-token"
                className="mp-input"
                value={tokenAddress}
                disabled={!!busy || !!review}
                onChange={(e) => {
                  setTokenAddress(e.target.value);
                  setReview(null);
                  setAmount("");
                }}
              >
                {session.engine.chain.tokens.map((t) => (
                  <option key={t.address} value={t.address}>
                    {t.symbol}
                  </option>
                ))}
              </select>
              <div className="mp-private-balance">
                <p>
                  <span>Private balance</span>
                  <strong>
                    {balance === null
                      ? "Loading…"
                      : `${formatUnits(balance, token!.decimals)} ${token!.symbol}`}
                  </strong>
                </p>
                <div className="mp-backup-actions">
                  <button
                    className="mp-text-button"
                    disabled={!!busy || !!review}
                    onClick={() => setShowFunding((v) => !v)}
                  >
                    {showFunding ? "Close funding" : "Add funds"}
                  </button>
                  <button
                    className="mp-text-button"
                    disabled={!!busy || !!review || !balance}
                    onClick={() =>
                      void perform("Preparing withdrawal…", () =>
                        prepareReview(true),
                      )
                    }
                  >
                    Withdraw
                  </button>
                  <button
                    className="mp-text-button"
                    disabled={!!busy || !!review}
                    onClick={() =>
                      void perform("Refreshing balance…", () => updateBalance())
                    }
                  >
                    Refresh
                  </button>
                </div>
              </div>
              {showFunding && (
                <form
                  className="mp-private-funding"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void perform("Adding funds. Check your wallet…", () =>
                      fund(),
                    );
                  }}
                >
                  <label className="mp-label" htmlFor="private-funding">
                    Amount to add
                  </label>
                  <input
                    id="private-funding"
                    className="mp-input"
                    inputMode="decimal"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    required
                    disabled={!!busy}
                    placeholder="0.00"
                  />
                  {token?.symbol === "WMON" && (
                    <label className="mp-private-check">
                      <input
                        type="checkbox"
                        checked={useMon}
                        onChange={(e) => setUseMon(e.target.checked)}
                        disabled={!!busy}
                      />
                      Use MON from my wallet. Wraps to WMON at 1:1.
                    </label>
                  )}
                  <p className="mp-hint">
                    This deposit is public. Your wallet will show approval,
                    signing and gas details. Funds become available for private
                    links after confirmation.
                  </p>
                  <button
                    className="mp-button mp-button-secondary"
                    disabled={!!busy || !fundAmount}
                  >
                    Add{" "}
                    {useMon && token?.symbol === "WMON" ? "MON" : token?.symbol}
                  </button>
                </form>
              )}
              {!review ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void perform("Calculating fee…", () => prepareReview());
                  }}
                >
                  <label className="mp-label" htmlFor="private-amount">
                    Link amount
                  </label>
                  <input
                    id="private-amount"
                    className="mp-input"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    disabled={!!busy}
                  />
                  <p className="mp-hint">
                    One recipient can claim this balance. Their withdrawal fee
                    is deducted when they claim. You can reclaim the link while
                    it is unspent; it has no expiry.
                  </p>
                  <button
                    className="mp-button mp-button-primary"
                    disabled={!!busy || !amount || !balance}
                  >
                    Review private link
                  </button>
                </form>
              ) : (
                <section
                  className="mp-private-review"
                  aria-labelledby="private-review-title"
                >
                  <h3 id="private-review-title">
                    {review.op.kind === "withdraw"
                      ? "Review withdrawal"
                      : "Review your link"}
                  </h3>
                  <dl>
                    <div>
                      <dt>
                        {review.op.kind === "withdraw"
                          ? "To your wallet"
                          : "Link balance"}
                      </dt>
                      <dd>
                        {formatUnits(
                          review.quote.amount,
                          review.token.decimals,
                        )}{" "}
                        {review.token.symbol}
                      </dd>
                    </div>
                    <div>
                      <dt>Protocol fee</dt>
                      <dd>
                        {formatUnits(review.quote.fee, review.token.decimals)}{" "}
                        {review.token.symbol}
                      </dd>
                    </div>
                  </dl>
                  {review.op.kind === "withdraw" && (
                    <p className="mp-hint">
                      Your receiving wallet and amount will be public. WMON
                      arrives as WMON.
                    </p>
                  )}
                  <div className="mp-backup-actions">
                    <button
                      className="mp-button mp-button-primary"
                      disabled={!!busy}
                      onClick={() =>
                        void perform(
                          "Submitting private payment…",
                          confirmReview,
                        )
                      }
                    >
                      {review.op.kind === "withdraw"
                        ? "Withdraw to my wallet"
                        : "Create private link"}
                    </button>
                    <button
                      className="mp-text-button"
                      disabled={!!busy}
                      onClick={() => setReview(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </section>
              )}
            </>
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
          {error && (
            <button
              className="mp-text-button"
              disabled={!!busy}
              onClick={() => {
                setSession(null);
                setReload((v) => v + 1);
              }}
            >
              Reload encrypted payments
            </button>
          )}
        </section>
        <aside className="lucky-preview">
          <div className="lucky-preview-art">
            <LuckyArtwork />
          </div>
          <h2>A link, with more privacy.</h2>
          <p>
            Keep your claim key encrypted. Transfer through AnomaPay, then share
            the link in your own chat.
          </p>
          <p className="mp-hint">
            Your passkey protects saved links. It does not hide public deposits
            or withdrawals.
          </p>
        </aside>
      </div>
      {!!records.length && (
        <section className="mp-private-activity">
          <h2>Private payment activity</h2>
          <ul className="mp-history-list">
            {records.slice(0, 20).map((op) => {
              const t = session && tokenFor(session.engine.chain, op.token);
              return (
                <li className="mp-history-row" key={op.id}>
                  <div className="mp-history-info">
                    <h3>
                      {t
                        ? `${formatUnits(BigInt(op.amount), t.decimals)} ${t.symbol}`
                        : "Private payment"}
                    </h3>
                    <p>
                      {op.kind === "link"
                        ? "Private link"
                        : op.kind === "deposit"
                          ? "Deposit"
                          : "Withdrawal"}{" "}
                      ·{" "}
                      {op.status === "complete"
                        ? "Confirmed"
                        : op.status === "failed"
                          ? "Not completed"
                          : "In progress"}
                    </p>
                  </div>
                  <div className="mp-history-actions">
                    {op.status === "complete" && op.kind === "link" && (
                      <button
                        className="mp-text-button"
                        disabled={!!busy}
                        onClick={() => setResult(op)}
                      >
                        Open saved link
                      </button>
                    )}
                    {op.status === "draft" && op.kind === "deposit" && (
                      <button
                        className="mp-text-button"
                        disabled={!!busy}
                        onClick={() =>
                          void perform("Continuing deposit…", () => fund(op))
                        }
                      >
                        Continue deposit
                      </button>
                    )}
                    {op.status === "wallet" && (
                      <button
                        className="mp-text-button"
                        disabled={!!busy}
                        onClick={() =>
                          void perform("Checking wallet transaction…", () =>
                            checkWallet(op),
                          )
                        }
                      >
                        Check wallet
                      </button>
                    )}
                    {["submitting", "pending"].includes(op.status) && (
                      <button
                        className="mp-text-button"
                        disabled={!!busy}
                        onClick={() =>
                          void perform("Checking payment…", () =>
                            check(session!, op),
                          )
                        }
                      >
                        Check status
                      </button>
                    )}
                    {op.hash && (
                      <a
                        className="mp-text-button"
                        href={`https://monadscan.com/tx/${op.hash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View transaction
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
type ParametersType = import("@monlipay/anoma-integration").Parameters;
