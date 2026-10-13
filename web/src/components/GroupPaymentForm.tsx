"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowIcon } from "@/components/ArrowIcon";
import { useAccount, useReadContract } from "wagmi";
import { useConnectModal } from "@/components/WalletEntryContext";
import { decodeEventLog, erc20Abi, formatEther, formatUnits, type Address } from "viem";
import { QRCodeSVG } from "qrcode.react";
import { monadChain, SUPPORTED_TOKENS, EXPIRY_PRESETS, type TokenInfo } from "@/config/chain";
import { LUCKY_VAULT_ADDRESS, isLuckyConfigured } from "@/config/lucky";
import { GROUP_VAULT_ADDRESS, groupClaimPath, isGroupConfigured, supportsOpenGroupLinks } from "@/config/group";
import { validateGroupInput, type GroupDistribution } from "@/lib/group";
import { luckyVaultAbi } from "@/lib/lucky-abi";
import { shortAddress, type LuckyAccess } from "@/lib/lucky";
import { useLuckyTransaction } from "@/hooks/useLuckyTransaction";
import { ContactsPicker } from "@/components/ContactsPicker";
import { LuckyArtwork } from "@/components/LuckyArtwork";
import { LinkTypePicker } from "@/components/LinkTypePicker";

import { TokenAvatar } from "@/components/TokenAvatar";
import { TokenSelectModal } from "@/components/TokenSelectModal";
import { useTokenRegistry } from "@/hooks/useTokenRegistry";

export default function GroupPaymentForm() {
  const { address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const tx = useLuckyTransaction();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [asset, setAsset] = useState<TokenInfo>(SUPPORTED_TOKENS[0]);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const { tokens, customTokens, addToken, removeToken } = useTokenRegistry();
  const [slots, setSlots] = useState(5);
  const [expiry, setExpiry] = useState(86400);
  const [access, setAccess] = useState<LuckyAccess>("open");
  const [distribution, setDistribution] = useState<GroupDistribution>("equal");
  const vault = distribution === "equal" ? GROUP_VAULT_ADDRESS : LUCKY_VAULT_ADDRESS;
  const configured = distribution === "equal" ? isGroupConfigured : isLuckyConfigured;
  const openSupported = supportsOpenGroupLinks(vault);
  let share = "";
  let splitError = "";
  if (distribution === "equal" && amount) {
    try {
      const total = validateGroupInput(amount, asset.decimals, slots, [], "Group payment", "open", "equal");
      share = formatUnits(total / BigInt(slots), asset.decimals);
    } catch (error) {
      splitError = error instanceof Error ? error.message : "Check the pool and recipient count.";
    }
  }
  const [wallets, setWallets] = useState<Address[]>([]);
  const [result, setResult] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const drawFee = useReadContract({
    address: LUCKY_VAULT_ADDRESS,
    abi: luckyVaultAbi,
    functionName: "claimFee",
    chainId: monadChain.id,
    query: { enabled: distribution === "random" && isLuckyConfigured, refetchInterval: 30_000 },
  });

  const create = async () => {
    if (!address) {
      openConnectModal?.();
      return;
    }
    await tx.run(async ({ wallet, client, write, wait, stage }) => {
      const total = validateGroupInput(
        amount,
        asset.decimals,
        slots,
        wallets,
        title,
        access,
        distribution,
      );
      if (!configured)
        throw new Error("Group payments are not yet available on this network.");
      if (access === "open" && !openSupported)
        throw new Error("Open group payments are not available on this network yet. Choose selected wallets.");
      if (!asset.isNative) {
        const allowance = await client.readContract({
          address: asset.address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [wallet, vault],
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
                args: [vault, 0n],
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
              args: [vault, total],
              account: wallet,
              chainId: monadChain.id,
            }),
          );
        }
      }
      stage("Confirm your group payment link in your wallet");
      const expiresAt = Number((await client.getBlock()).timestamp) + expiry;
      const receipt = await wait(
        await write({
          address: vault,
          abi: luckyVaultAbi,
          ...(access === "open"
            ? { functionName: "createOpenPacket" as const, args: [asset.address, total, slots, expiresAt, title.trim()] as const }
            : { functionName: "createPacket" as const, args: [asset.address, total, slots, expiresAt, title.trim(), wallets] as const }),
          value: asset.isNative ? total : 0n,
          account: wallet,
          chainId: monadChain.id,
        }),
      );
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== vault.toLowerCase())
          continue;
        try {
          const decoded = decodeEventLog({
            abi: luckyVaultAbi,
            eventName: "PacketCreated",
            data: log.data,
            topics: log.topics,
          });
          setResult(
            `${window.location.origin}${groupClaimPath(decoded.args.packetId, vault)}`,
          );
          setCopied(false);
          setCopyError("");

          return;
        } catch {
          /* The receipt may contain other vault events. */
        }
      }
      throw new Error(
        "Pool confirmed. Open My Links to retrieve your group payment link.",
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
      {!result && <LinkTypePicker active="group" />}
      {!configured && (
        <p className="mp-notice" role="status">
          You can explore this form. Funding Group payments are not yet available on{" "}
          {monadChain.name}.
        </p>
      )}
      {result ? (
        <section className="lucky-success" aria-labelledby="success-title">
          <LuckyArtwork open />
          <div>
            <h2 id="success-title">Your group payment link is ready.</h2>
            <p>
              {access === "open"
                ? `Share it with your group. The first ${slots} wallets to claim receive a share.`
                : "Send this link to your selected recipients. Only their wallets can claim."}
            </p>
            {distribution === "equal" && <p>{slots} recipients · {share} {asset.symbol} each</p>}
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
                the same group payment link.
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
                Payment title
              </label>
              <input
                id="lucky-title"
                className="mp-input"
                placeholder="Community rewards"
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
              <div className="mp-payment-amount">
                <input
                  id="lucky-amount"
                  className="mp-payment-amount-input"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  disabled={tx.busy}
                />
                <button
                  type="button"
                  className="mp-payment-token"
                  aria-label={`Select token, ${asset.symbol}`}
                  onClick={() => setShowTokenModal(true)}
                  disabled={tx.busy}
                >
                  <TokenAvatar token={asset} size={28} />
                  <span className="max-w-20 truncate" title={asset.symbol}>{asset.symbol}</span>
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
              </div>
              <p className="mp-hint">
                {asset.isNative ? "Native MON" : (
                  <a className="mp-text-link" href={`${monadChain.blockExplorers.default.url}/address/${asset.address}`} target="_blank" rel="noreferrer" title={asset.address}>
                    {asset.name} · {shortAddress(asset.address)}
                  </a>
                )}
              </p>
              <p className="mp-hint">
                {distribution === "equal" ? "Everyone receives the same amount." : "Each recipient receives a random amount."} Transaction fees are separate.
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
            <fieldset className="mp-field lucky-access" disabled={tx.busy}>
              <legend className="mp-label">Distribution</legend>
              <div className="lucky-access-options">
                <label>
                  <input type="radio" name="group-distribution" value="equal" checked={distribution === "equal"} onChange={() => setDistribution("equal")} />
                  <span>Equal amount</span>
                </label>
                <label>
                  <input type="radio" name="group-distribution" value="random" checked={distribution === "random"} onChange={() => setDistribution("random")} />
                  <span>Random amount</span>
                </label>
              </div>
              <p className={splitError ? "mp-error" : "mp-hint"} aria-live="polite">
                {distribution === "equal"
                  ? splitError || (share ? `${slots} recipients · ${share} ${asset.symbol} each` : "Enter a pool and recipient count to see each payment.")
                  : "Amounts are assigned by a verifiable draw. Each recipient pays a draw fee."}
              </p>
            </fieldset>
            <fieldset className="mp-field lucky-access" disabled={tx.busy}>
              <legend className="mp-label">Who can claim?</legend>
              <div className="lucky-access-options">
                <label>
                  <input type="radio" name="lucky-access" value="open" checked={access === "open"} onChange={() => setAccess("open")} />
                  <span>Anyone</span>
                </label>
                <label>
                  <input type="radio" name="lucky-access" value="selected" checked={access === "selected"} onChange={() => setAccess("selected")} />
                  <span>Selected wallets</span>
                </label>
              </div>
              <p className="mp-hint">
                {access === "open"
                  ? "Open to anyone. No recipient list needed. One share per wallet."
                  : "Only the wallets you choose can claim. One share per wallet."}
              </p>
              {access === "open" && !openSupported && (
                <p className="mp-notice">Open group payments are not available on this network yet.</p>
              )}
            </fieldset>
            {access === "selected" && (
              <ContactsPicker wallets={wallets} onChange={setWallets} disabled={tx.busy} />
            )}
            <div className="lucky-form-footer">
              <p className="mp-hint">
                {access === "open"
                  ? "Slots go to the first successful claims onchain. A person can use more than one wallet."
                  : wallets.length > slots
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
                disabled={tx.busy || Boolean(splitError) || !configured || (access === "open" && !openSupported)}
              >
                {tx.busy
                  ? tx.stage || "Working…"
                  : !configured
                    ? "Funding coming soon"
                    : !address
                      ? "Continue to create"
                      : "Fund & create link"}
                <ArrowIcon />
              </button>
            </div>
          </form>
          <aside className="lucky-preview">
            <div className="lucky-preview-art">
              <LuckyArtwork />
            </div>
            <h2>{title.trim() || "One link. Multiple recipients."}</h2>
            <p className="lucky-preview-copy">
              {distribution === "equal"
                ? "Fund the pool and share your link. Each recipient collects the same amount."
                : "Fund the pool and share your link. Each recipient draws a random amount."}
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
                <dd>{Number.isFinite(slots) ? slots : "Not set"}</dd>
              </div>
              <div>
                <dt>Who can claim</dt>
                <dd>{access === "open" ? "Anyone" : "Selected wallets"}</dd>
              </div>
              <div>
                <dt>Distribution</dt>
                <dd>{distribution === "equal" ? "Equal amount" : "Random amount"}</dd>
              </div>
              {distribution === "equal" && (
                <div>
                  <dt>Per recipient</dt>
                  <dd>{share ? `${share} ${asset.symbol}` : "Not set"}</dd>
                </div>
              )}
            </dl>
            {distribution === "random" && drawFee.data !== undefined && (
              <p className="mp-hint">
                Each recipient pays a draw fee of {formatEther(drawFee.data)}{" "}
                MON, plus network gas. Fees can change before claiming.
              </p>
            )}
            <p className="mp-hint">
              {access === "open" ? "Open to anyone." : "Only selected wallets can claim."}{" "}
              {distribution === "equal" ? "One claim per wallet. Recipients pay network gas." : "Each wallet gets one draw, then collects its share."}
            </p>
            <Link href="/create" className="mp-text-link">
              Sending to just one person? Use a payment link{" "}
              <ArrowIcon direction="up-right" />
            </Link>
          </aside>
        </div>
      )}
      <TokenSelectModal
        open={showTokenModal}
        onClose={() => setShowTokenModal(false)}
        tokens={tokens}
        selectedToken={asset}
        onSelect={(token) => setAsset(token as TokenInfo)}
        onAddCustomToken={(token) => addToken(token as TokenInfo)}
        onRemoveCustomToken={removeToken}
        customTokenAddresses={new Set(customTokens.map((token) => token.address.toLowerCase()))}
      />
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
        Find your payment links and Group Payments in{" "}
        <Link className="mp-text-link" href="/my-links">
          My Links <ArrowIcon />
        </Link>
        .
      </p>
    </div>
  );
}
