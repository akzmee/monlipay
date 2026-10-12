"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useLinkBackups } from "./LinkBackupProvider";
import { supportsLinkPasskeys } from "@/lib/link-passkey";

const subscribe = () => () => {};
export function LinkBackupPanel({ compact = false }: { compact?: boolean }) {
  const vault = useLinkBackups();
  return <SavedLinksPanel key={vault.status} compact={compact} />;
}
function SavedLinksPanel({ compact }: { compact: boolean }) {
  const vault = useLinkBackups();
  const id = useId();
  const supported = useSyncExternalStore(
    subscribe,
    supportsLinkPasskeys,
    () => false,
  );
  const [previousKey, setPreviousKey] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [limit, setLimit] = useState(10);
  const perform = async (fn: () => Promise<void>) => {
    setError("");
    setNotice("");
    try {
      await fn();
    } catch {
      /* Provider displays the error. */
    }
  };
  if (!vault.scope.owner) return null;
  const legacy = !!vault.profile && !vault.passkey;
  return (
    <section
      id="link-backups"
      className={
        compact ? "mp-backup mp-backup-inline" : "mp-backup mp-saved-access"
      }
      aria-labelledby={`${id}-title`}
    >
      <div className="mp-backup-heading">
        <div>
          <h2 id={`${id}-title`}>
            {vault.status === "unlocked"
              ? "Your links are ready"
              : vault.status === "locked"
                ? "Open your saved links"
                : "Keep your links within reach"}
          </h2>
          <p className="mp-hint">
            {vault.status === "unlocked"
              ? "New links save automatically while this session is open."
              : "Save links encrypted. Open them again from My Links."}
          </p>
        </div>
        {vault.status === "unlocked" && (
          <button type="button" className="mp-text-button" onClick={vault.lock}>
            Lock links
          </button>
        )}
      </div>
      {vault.status === "loading" && (
        <p className="mp-hint" role="status">
          Loading saved links…
        </p>
      )}
      {vault.status === "signin" && (
        <div className="mp-backup-actions">
          <button
            type="button"
            className="mp-button mp-button-secondary"
            disabled={vault.busy}
            onClick={() => void perform(vault.signIn)}
          >
            {vault.busy ? "Check your wallet…" : "Continue with wallet"}
          </button>
          <p className="mp-hint">
            Verify ownership with a signature. No payment or gas fee.
          </p>
        </div>
      )}
      {vault.status === "error" && (
        <button
          className="mp-button mp-button-secondary"
          onClick={() => void vault.refresh()}
        >
          Retry loading links
        </button>
      )}
      {vault.status === "setup" && (
        <>
          <p className="mp-hint">
            Use a passkey from your password manager or security key. No
            recovery file to keep.
          </p>
          {supported ? (
            <button
              className="mp-button mp-button-primary"
              disabled={vault.busy}
              onClick={() => void perform(() => vault.enablePasskey())}
            >
              {vault.busy ? "Follow your device prompts…" : "Use passkey"}
            </button>
          ) : (
            <p className="mp-hint">
              This browser cannot use passkeys. Open MonliPay in a supported
              browser to save links. You can still create and share a link; keep
              its original URL.
            </p>
          )}
        </>
      )}
      {vault.status === "locked" && vault.passkey && (
        <>
          <button
            className="mp-button mp-button-primary"
            disabled={vault.busy || !supported}
            onClick={() => void perform(vault.unlockPasskey)}
          >
            {vault.busy ? "Check your device…" : "Unlock with passkey"}
          </button>
          {!supported && (
            <p className="mp-hint">
              Open this site in a browser that supports your passkey.
            </p>
          )}
        </>
      )}
      {legacy && ["locked", "unlocked"].includes(vault.status) && (
        <details className="mp-backup-help" open={vault.status === "locked"}>
          <summary>Switch your existing links to a passkey</summary>
          <p className="mp-hint">
            These links use the earlier recovery key. Enter it once to switch.
            Your existing links stay intact.
          </p>
          <form
            className="mp-backup-form"
            onSubmit={(e) => {
              e.preventDefault();
              void perform(async () => {
                await vault.enablePasskey(previousKey);
                setPreviousKey("");
              });
            }}
          >
            <label className="mp-label" htmlFor={`${id}-previous`}>
              Previous recovery key
            </label>
            <input
              id={`${id}-previous`}
              className="mp-input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              required
              value={previousKey}
              onChange={(e) => setPreviousKey(e.target.value)}
              placeholder="MLP1-…"
            />
            <div className="mp-backup-actions">
              <button
                className="mp-button mp-button-primary"
                disabled={vault.busy || !supported || !previousKey}
              >
                {vault.busy
                  ? "Follow your device prompts…"
                  : "Switch to passkey"}
              </button>
              <button
                type="button"
                className="mp-text-button"
                disabled={vault.busy || !previousKey}
                onClick={() => void perform(() => vault.unlock(previousKey))}
              >
                Open with previous key
              </button>
            </div>
            <p className="mp-hint">
              Use your MonliPay key, never your wallet seed phrase. A lost key
              cannot be reset.
            </p>
          </form>
        </details>
      )}
      {vault.passkey && vault.legacyRecovery && vault.status === "locked" && (
        <details className="mp-backup-help">
          <summary>Use your previous recovery key</summary>
          <form
            className="mp-backup-form"
            onSubmit={(e) => {
              e.preventDefault();
              void perform(() => vault.unlock(previousKey));
            }}
          >
            <label className="mp-label" htmlFor={`${id}-fallback`}>
              Previous recovery key
            </label>
            <input
              id={`${id}-fallback`}
              className="mp-input"
              type="password"
              required
              autoComplete="off"
              spellCheck={false}
              value={previousKey}
              onChange={(e) => setPreviousKey(e.target.value)}
              placeholder="MLP1-…"
            />
            <p className="mp-hint">
              The MonliPay key you saved before switching still works. Never
              enter your wallet seed phrase.
            </p>
            <button
              className="mp-button mp-button-secondary"
              disabled={vault.busy || !previousKey}
            >
              Open with previous key
            </button>
          </form>
        </details>
      )}
      {vault.status === "unlocked" && (
        <>
          <p className="mp-hint" role="status">
            {vault.links.length} saved Payment{" "}
            {vault.links.length === 1 ? "link" : "links"} · locks on refresh or
            after 15 minutes of inactivity.
          </p>
          {vault.pending > 0 && (
            <div className="mp-backup-actions">
              <p className="mp-hint" role="status">
                {vault.pending} encrypted{" "}
                {vault.pending === 1 ? "link is" : "links are"} waiting to sync
                from this device.
              </p>
              <button
                className="mp-button mp-button-secondary"
                disabled={vault.busy}
                onClick={() => void perform(vault.sync)}
              >
                {vault.busy ? "Syncing…" : "Retry sync"}
              </button>
            </div>
          )}
          {!compact && (
            <>
              <details className="mp-backup-help">
                <summary>Add an existing link</summary>
                <form
                  className="mp-backup-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (importing) return;
                    setImporting(true);
                    setError("");
                    setNotice("");
                    try {
                      await vault.saveLink(importUrl);
                      setImportUrl("");
                      setNotice("Saved. You can open this link again below.");
                    } catch (error) {
                      setError(
                        error instanceof Error
                          ? error.message
                          : "Could not save this link. Please retry.",
                      );
                    } finally {
                      setImporting(false);
                    }
                  }}
                >
                  <label htmlFor={`${id}-import`} className="mp-label">
                    Original Payment Link
                  </label>
                  <input
                    id={`${id}-import`}
                    className="mp-input"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    required
                    maxLength={1024}
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    placeholder="https://monlipay.xyz/claim#…"
                  />
                  <p className="mp-hint">
                    Use an original link you created on this network. History
                    alone cannot recreate a lost link.
                  </p>
                  <button
                    className="mp-button mp-button-secondary"
                    disabled={importing || !importUrl}
                  >
                    {importing ? "Saving…" : "Save link"}
                  </button>
                </form>
              </details>
              {!!vault.links.length && (
                <details className="mp-backup-help">
                  <summary>All saved links ({vault.links.length})</summary>
                  <p className="mp-hint">
                    Available even when transaction history is loading. A saved
                    link may already be claimed, expired, or refunded.
                  </p>
                  <ul className="mp-backup-library">
                    {vault.links.slice(0, limit).map((link) => (
                      <li key={link.depositId}>
                        <span>Payment Link #{link.depositId}</span>
                        <SavedLinkActions depositId={link.depositId} />
                      </li>
                    ))}
                  </ul>
                  {vault.links.length > limit && (
                    <button
                      className="mp-text-button"
                      onClick={() => setLimit((n) => n + 10)}
                    >
                      Show more links
                    </button>
                  )}
                </details>
              )}
            </>
          )}
        </>
      )}
      {(error || vault.error) && (
        <p className="mp-error" role="alert">
          {error || vault.error}
        </p>
      )}
      {notice && (
        <p className="mp-hint" role="status">
          {notice}
        </p>
      )}
      <details className="mp-backup-help">
        <summary>How your links stay private</summary>
        <p className="mp-hint">
          Saved claim secrets are encrypted in your browser. Your passkey opens
          them; MonliPay does not receive its decryption secret. Use the same
          passkey provider on another device. Support depends on your browser
          and provider.
        </p>
        <p className="mp-hint">
          Keep access to your passkey. MonliPay cannot replace a lost one.
          Original links still work, and you can refund eligible expired
          payments from your wallet.
        </p>
        <p className="mp-hint">
          Wallet addresses and transactions remain public onchain.{" "}
          <Link href="/privacy">Read our privacy approach</Link>.
        </p>
      </details>
    </section>
  );
}

export function SavedLinkActions({ depositId }: { depositId: string }) {
  const vault = useLinkBackups();
  // Unmount the revealed URL as soon as the session locks.
  if (vault.status !== "unlocked")
    return vault.links.some((l) => l.depositId === depositId) ? (
      <a className="mp-text-link" href="#link-backups">
        Unlock to open
      </a>
    ) : null;
  if (!vault.links.some((l) => l.depositId === depositId))
    return <span className="mp-hint">Original link needed</span>;
  return (
    <RevealedLink
      key={`${vault.profile?.vaultId}:${depositId}`}
      depositId={depositId}
    />
  );
}
function RevealedLink({ depositId }: { depositId: string }) {
  const vault = useLinkBackups();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(false);
  const id = useId();
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const reveal = async () => {
    setBusy(true);
    setError("");
    try {
      const value = await vault.openLink(depositId);
      if (active.current) setUrl(value);
    } catch (e) {
      if (active.current)
        setError(e instanceof Error ? e.message : "Could not open this link.");
    } finally {
      if (active.current) setBusy(false);
    }
  };
  return (
    <div className="mp-saved-link">
      {!url ? (
        <button
          type="button"
          className="mp-button mp-button-secondary"
          disabled={busy}
          onClick={() => void reveal()}
        >
          {busy ? "Opening…" : "Open link"}
        </button>
      ) : (
        <>
          <label className="mp-label" htmlFor={id}>
            Payment Link #{depositId}
          </label>
          <input
            className="mp-input"
            id={id}
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
          />
          <div className="mp-backup-actions">
            <button
              type="button"
              className="mp-button mp-button-secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  setError("");
                } catch {
                  setError(
                    "Clipboard is unavailable. Select and copy the link above.",
                  );
                }
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
            <button
              type="button"
              className="mp-text-button"
              aria-expanded={qr}
              onClick={() => setQr(!qr)}
            >
              {qr ? "Hide QR" : "Show QR"}
            </button>
            <button
              type="button"
              className="mp-text-button"
              onClick={() => {
                setUrl("");
                setQr(false);
                setCopied(false);
              }}
            >
              Hide link
            </button>
          </div>
          {qr && (
            <div className="mp-backup-qr">
              <QRCodeSVG
                value={url}
                size={192}
                marginSize={4}
                title={`Claim Payment Link ${depositId}`}
              />
            </div>
          )}
          <p className="mp-hint">
            Anyone with this link can claim its available funds. Share it
            privately.
          </p>
        </>
      )}
      {error && (
        <p className="mp-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function CreatedLinkBackup({ url }: { url: string }) {
  const vault = useLinkBackups();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const attempted = useRef("");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await vault.saveLink(url);
      if (active.current) setSaved(true);
    } catch (e) {
      if (active.current)
        setError(
          e instanceof Error
            ? e.message
            : "Could not save. Keep your original link.",
        );
    } finally {
      if (active.current) setSaving(false);
    }
  };
  useEffect(() => {
    const attempt = `${url}:${vault.profile?.vaultId}`;
    if (vault.status !== "unlocked" || attempted.current === attempt) return;
    const task = setTimeout(() => {
      attempted.current = attempt;
      void save();
    }, 0);
    return () => clearTimeout(task);
    // Save once on unlock. Explicit retry handles failures without a network loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault.status, vault.profile?.vaultId, url]);
  useEffect(() => {
    if (saved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saved]);
  return (
    <div className="mp-created-backup">
      {saved ? (
        <p className="mp-notice" role="status">
          Saved to My Links. Your claim secret is encrypted.
        </p>
      ) : (
        <p className="mp-notice" role="status">
          {saving
            ? "Encrypting and saving your link…"
            : "Keep this link before leaving. Copy it or enable saving to My Links below."}
        </p>
      )}
      {error && (
        <p className="mp-error" role="alert">
          {error}
        </p>
      )}
      {!saved && !saving && vault.status === "unlocked" && (
        <button
          type="button"
          className="mp-button mp-button-secondary"
          onClick={() => void save()}
        >
          Retry saving
        </button>
      )}
      <LinkBackupPanel compact />
    </div>
  );
}
