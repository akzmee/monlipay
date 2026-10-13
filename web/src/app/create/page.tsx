"use client";

import { useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { useConnectModal } from "@/components/WalletEntryContext";
import { useCreateLink } from "@/hooks/useLinkVault";
import {
  SUPPORTED_TOKENS,
  EXPIRY_PRESETS,
  isContractDeployed,
  monadChain,
  type TokenInfo,
} from "@/config/chain";
import { CreateForm } from "@/components/CreateForm";
import { ShareLink } from "@/components/ShareLink";
import { LinkTypePicker } from "@/components/LinkTypePicker";
import { LuckyArtwork } from "@/components/LuckyArtwork";
import {
  CreatedLinkBackup,
  LinkBackupPanel,
} from "@/components/LinkBackupPanel";

export default function CreatePage() {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { create, result, error, isSending, isConfirming, txHash, reset } =
    useCreateLink();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState<TokenInfo>(
    SUPPORTED_TOKENS[0],
  );
  const [expirySeconds, setExpirySeconds] = useState<number>(
    EXPIRY_PRESETS[2].value,
  );
  const isBusy = isSending || isConfirming;
  const isWrongChain = isConnected && chainId !== monadChain.id;

  if (result) {
    return (
      <div className="mp-workspace mp-share-workspace">
        <ShareLink
          url={result.shareableUrl}
          txHash={txHash ?? undefined}
          onReset={reset}
          backup={
            <CreatedLinkBackup
              key={result.depositId.toString()}
              url={result.shareableUrl}
            />
          }
        />
      </div>
    );
  }

  return (
    <div className="mp-workspace">
      <div className="mp-page-heading">
        <div>
          <h1>Create a link</h1>
          <p>Send MON or tokens with a link. Choose how you want to share.</p>
        </div>
      </div>
      <LinkTypePicker active="payment" />
      {!isContractDeployed && (
        <p className="mp-notice" role="status">
          Payment links are not yet available on {monadChain.name}. Funding will
          open when this network is ready.
        </p>
      )}
      <div className="lucky-layout">
        <section
          className="mp-panel lucky-form"
          aria-labelledby="payment-details-title"
        >
          <div className="mp-section-title">
            <h2 id="payment-details-title">Payment details</h2>
            <span className="mp-network">{monadChain.name}</span>
          </div>
          {!isConnected ? (
            <div className="mp-payment-gate">
              <h3>Get ready to send</h3>
              <p>Choose a token and amount, then create a link to send.</p>
              <button
                type="button"
                className="mp-button"
                onClick={openConnectModal}
              >
                Get started
              </button>
            </div>
          ) : !isContractDeployed ? (
            <div className="mp-payment-gate">
              <h3>Funding is not available yet</h3>
              <p>
                Payment links will be available here when this network is ready.
              </p>
            </div>
          ) : isWrongChain ? (
            <div className="mp-payment-gate">
              <h3>Switch to {monadChain.name}</h3>
              <p>Your payment link will be created on this network.</p>
              <button
                type="button"
                className="mp-button"
                onClick={async () => {
                  try {
                    await switchChainAsync({ chainId: monadChain.id });
                  } catch {
                    // The wallet handles the cancellation; the action remains available.
                  }
                }}
              >
                Switch network
              </button>
            </div>
          ) : (
            <CreateForm
              amount={amount}
              setAmount={setAmount}
              selectedToken={selectedToken}
              setSelectedToken={setSelectedToken}
              expirySeconds={expirySeconds}
              setExpirySeconds={setExpirySeconds}
              onCreate={() =>
                create({
                  token: selectedToken.address,
                  amount,
                  expirySeconds,
                  isNative: selectedToken.isNative,
                  decimals: selectedToken.decimals,
                  baseUrl:
                    typeof window !== "undefined" ? window.location.origin : "",
                })
              }
              isBusy={isBusy}
              error={error}
            />
          )}
          <p className="mp-payment-note mp-hint">
            Keep your payment link private. Anyone with the link can claim it
            once. After expiry, unclaimed funds can be refunded.
          </p>
          {isConnected && !isWrongChain && <LinkBackupPanel compact />}
        </section>
        <aside className="lucky-preview" aria-label="Payment link summary">
          <div className="lucky-preview-art">
            <LuckyArtwork />
          </div>
          <h2>
            Ready to send.
            <br />
            Easy to share.
          </h2>
          <p className="lucky-preview-copy">
            One amount for one recipient. Send the link through any chat.
          </p>
          <dl className="lucky-summary">
            <div>
              <dt>Amount to send</dt>
              <dd>
                {amount || "0.00"} {selectedToken.symbol}
              </dd>
            </div>
            <div>
              <dt>Recipient</dt>
              <dd>One person</dd>
            </div>
            <div>
              <dt>Expires in</dt>
              <dd>
                {
                  EXPIRY_PRESETS.find(
                    (preset) => preset.value === expirySeconds,
                  )?.label
                }
              </dd>
            </div>
          </dl>
          <p className="mp-hint">
            Your recipient opens the link and connects a wallet to claim on
            Monad.
          </p>
        </aside>
      </div>
    </div>
  );
}
