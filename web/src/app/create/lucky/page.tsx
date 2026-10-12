"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowIcon } from "@/components/ArrowIcon";
import { useAccount, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { decodeEventLog, erc20Abi, formatEther, type Address } from "viem";
import { QRCodeSVG } from "qrcode.react";
import { monadChain, SUPPORTED_TOKENS, EXPIRY_PRESETS } from "@/config/chain";
import { LUCKY_VAULT_ADDRESS, isLuckyConfigured } from "@/config/lucky";
import { luckyVaultAbi } from "@/lib/lucky-abi";
import { validateLuckyInput } from "@/lib/lucky";
import { useLuckyTransaction } from "@/hooks/useLuckyTransaction";
import { ContactsPicker } from "@/components/ContactsPicker";
import { LuckyArtwork } from "@/components/LuckyArtwork";
import { LinkTypePicker } from "@/components/LinkTypePicker";

const assets = SUPPORTED_TOKENS.filter((token) =>
  ["MON", "USDC", "USDT0", "AUSD"].includes(token.symbol),
);

export default function LuckyPage() {
  const { address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const tx = useLuckyTransaction();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [asset, setAsset] = useState(assets[0]);
  const [slots, setSlots] = useState(5);
  const [expiry, setExpiry] = useState(86400);
  const [wallets, setWallets] = useState<Address[]>([]);
  const [result, setResult] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const drawFee = useReadContract({
    address: LUCKY_VAULT_ADDRESS,
    abi: luckyVaultAbi,
    functionName: "claimFee",
    chainId: monadChain.id,
    query: { enabled: isLuckyConfigured, refetchInterval: 30_000 },
  });

  const create = async () => {
    if (!address) {
      openConnectModal?.();
      return;
    }
    await tx.run(async ({ wallet, client, write, wait, stage }) => {
      const total = validateLuckyInput(
        amount,
        asset.decimals,
        slots,
        wallets,
        title,
      );
      if (!isLuckyConfigured)
        throw new Error("Lucky Links is not yet available on this network.");
      if (!asset.isNative) {
        const allowance = await client.readContract({
          address: asset.address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [wallet, LUCKY_VAULT_ADDRESS],
        });
        if (allowance < total) {
          // Reset first for tokens that reject changing a non-zero allowance.
          if (allowance > 0n) {
            stage("Reset token allowance in your wallet");
            await wait(
              await write({
                address: asset.address,
                abi: erc20Abi,
                functionName: "approve",
                args: [LUCKY_VAULT_ADDRESS, 0n],
                account: wallet,
                chainId: monadChain.id,
              }),
            );
          }
          stage(`Approve ${asset.symbol} in your wallet`);
          await wait(
            await write({
              address: asset.address,
              abi: erc20Abi,
              functionName: "approve",
              args: [LUCKY_VAULT_ADDRESS, total],
              account: wallet,
              chainId: monadChain.id,
            }),
          );
        }
      }
      stage("Confirm your Lucky Link in your wallet");
      const expiresAt = Number((await client.getBlock()).timestamp) + expiry;
      const receipt = await wait(
        await write({
          address: LUCKY_VAULT_ADDRESS,
          abi: luckyVaultAbi,
          functionName: "createPacket",
          args: [asset.address, total, slots, expiresAt, title.trim(), wallets],
          value: asset.isNative ? total : 0n,
          account: wallet,
          chainId: monadChain.id,
        }),
      );
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== LUCKY_VAULT_ADDRESS.toLowerCase())
          continue;
        try {
          const decoded = decodeEventLog({
            abi: luckyVaultAbi,
            eventName: "PacketCreated",
            data: log.data,
            topics: log.topics,
          });
          setResult(
            `${window.location.origin}/lucky/claim?id=${decoded.args.packetId}&chain=${monadChain.id}`,
          );
          setCopied(false);
          setCopyError("");

          return;
        } catch {
          /* The receipt may contain other vault events. */
        }
      }
      throw new Error(
        "Pool confirmed. Open Your Lucky Links below to retrieve its link.",
      );
    });
  };

  return (
    <div className="mp-workspace">
      <div className="mp-page-heading">
        <div>
          <h1>Create a link</h1>
          <p>Send MON or tokens with a link. Choose how you want to share.</p>
        </div>
        <Link className="mp-text-link" href="/contacts">
          Manage contacts <ArrowIcon direction="up-right" />
        </Link>
      </div>
      {!result && <LinkTypePicker active="lucky" />}
      {!isLuckyConfigured && (
        <p className="mp-notice" role="status">
          You can explore this form. Funding Lucky Links is not yet available on{" "}
          {monadChain.name}.
        </p>
      )}
      {result ? (
        <section className="lucky-success" aria-labelledby="success-title">
          <LuckyArtwork open />
          <div>
            <h2 id="success-title">Your Lucky Link is ready.</h2>
            <p>
              Send this link to your selected recipients. Only their wallets can
              claim.
            </p>
            <label className="mp-label" htmlFor="lucky-share-url">
              Share link
            </label>
            <input
              id="lucky-share-url"
              className="mp-input"
              value={result}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="mp-actions">
              <button
                className="mp-button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(result);
                    setCopied(true);
                  } catch {
                    setCopyError("Select and copy the link above.");
                  }
                }}
              >
                {copied ? "Copied" : "Copy link"}
              </button>
              <a className="mp-button mp-button-secondary" href={result}>
                Open link
              </a>
              <button className="mp-text-button" onClick={() => setResult("")}>
                Create another
              </button>
            </div>
            {copyError && <p role="status">{copyError}</p>}
            <div className="lucky-qr">
              <QRCodeSVG value={result} size={128} marginSize={2} />
              <span>
                Scan to open
                <br />
                the same Lucky Link.
              </span>
            </div>
          </div>
        </section>
      ) : (
        <div className="lucky-layout">
          <form
            className="mp-panel lucky-form"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <div className="mp-section-title">
              <h2>Group details</h2>
              <span className="mp-network">{monadChain.name}</span>
            </div>
            <div className="mp-field">
              <label className="mp-label" htmlFor="lucky-title">
                What’s the occasion?
              </label>
              <input
                id="lucky-title"
                className="mp-input"
                placeholder="A little something for the group"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                required
                disabled={tx.busy}
              />
            </div>
            <div className="mp-field">
              <label className="mp-label" htmlFor="lucky-amount">
                Total pool
              </label>
              <div className="amount-control">
                <input
                  id="lucky-amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  disabled={tx.busy}
                />
                <label className="sr-only" htmlFor="lucky-token">
                  Token
                </label>
                <select
                  id="lucky-token"
                  value={asset.address}
                  onChange={(e) =>
                    setAsset(assets.find((t) => t.address === e.target.value)!)
                  }
                  disabled={tx.busy}
                >
                  {assets.map((token) => (
                    <option key={token.address} value={token.address}>
                      {token.symbol}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mp-hint">
                This total is split into random amounts. Transaction fees are
                separate.
              </p>
            </div>
            <div className="mp-fields-row">
              <div className="mp-field">
                <label className="mp-label" htmlFor="lucky-slots">
                  Number of recipients
                </label>
                <input
                  id="lucky-slots"
                  className="mp-input"
                  type="number"
                  min={1}
                  max={100}
                  value={Number.isNaN(slots) ? "" : slots}
                  onChange={(e) => setSlots(e.target.valueAsNumber)}
                  required
                  disabled={tx.busy}
                />
              </div>
              <div className="mp-field">
                <label className="mp-label" htmlFor="lucky-expiry">
                  Claim window
                </label>
                <select
                  id="lucky-expiry"
                  className="mp-input"
                  value={expiry}
                  onChange={(e) => setExpiry(Number(e.target.value))}
                  disabled={tx.busy}
                >
                  {EXPIRY_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <ContactsPicker
              wallets={wallets}
              onChange={setWallets}
              disabled={tx.busy}
            />
            <div className="lucky-form-footer">
              <p className="mp-hint">
                {wallets.length > slots
                  ? `The first ${slots} of your ${wallets.length} selected wallets can claim.`
                  : "Select at least one eligible wallet for each recipient slot."}{" "}
                After expiry, you can reclaim any unallocated funds.
              </p>
              {tx.error && (
                <p className="mp-error" role="alert">
                  {tx.error}
                </p>
              )}
              <button
                className="mp-button mp-button-wide"
                type="submit"
                disabled={tx.busy || !isLuckyConfigured}
              >
                {tx.busy
                  ? tx.stage || "Working…"
                  : !isLuckyConfigured
                    ? "Funding coming soon"
                    : !address
                      ? "Connect wallet to create"
                      : "Fund & create link"}
                <ArrowIcon />
              </button>
            </div>
          </form>
          <aside className="lucky-preview">
            <div className="lucky-preview-art">
              <LuckyArtwork />
            </div>
            <h2>{title.trim() || "A little luck goes a long way."}</h2>
            <p className="lucky-preview-copy">
              Share a pool with your people.
              <br />
              Let the surprise be how much.
            </p>
            <dl className="lucky-summary">
              <div>
                <dt>Total to share</dt>
                <dd>
                  {amount || "0.00"} <span>{asset.symbol}</span>
                </dd>
              </div>
              <div>
                <dt>Recipient slots</dt>
                <dd>{Number.isFinite(slots) ? slots : "—"}</dd>
              </div>
              <div>
                <dt>Distribution</dt>
                <dd>Random amounts</dd>
              </div>
            </dl>
            {drawFee.data !== undefined && (
              <p className="mp-hint">
                Each recipient pays a draw fee of {formatEther(drawFee.data)}{" "}
                MON, plus network gas. Fees can change before claiming.
              </p>
            )}
            <p className="mp-hint">
              Only selected wallets can claim. Each gets one draw, then collects
              their share.
            </p>
            <Link href="/create" className="mp-text-link">
              Sending to just one person? Use a payment link{" "}
              <ArrowIcon direction="up-right" />
            </Link>
          </aside>
        </div>
      )}
      {tx.hash && (
        <a
          className="mp-receipt"
          href={`${monadChain.blockExplorers.default.url}/tx/${tx.hash}`}
          target="_blank"
          rel="noreferrer"
        >
          View transaction on explorer <ArrowIcon direction="up-right" />
        </a>
      )}
      <p className="mp-hint lucky-history">
        Find your payment links and Lucky Links in{" "}
        <Link className="mp-text-link" href="/my-links">
          My Links <ArrowIcon />
        </Link>
        .
      </p>
    </div>
  );
}
