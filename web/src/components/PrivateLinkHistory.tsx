"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { hexToBytes, formatUnits } from "viem";
import { useLinkBackups } from "./LinkBackupProvider";
import { PrivateStorage } from "@/lib/private-storage";
import {
  privateEngine,
  parsePrivateOperation,
  privateError,
} from "@/lib/private-payment";
export function PrivateLinkHistory() {
  const vault = useLinkBackups();
  if (vault.scope.chainId !== 143) return null;
  return (
    <section className="mp-private-activity">
      <div className="mp-section-title">
        <h2>Private links</h2>
        <Link className="mp-text-button" href="/create/private">
          Private balance and activity
        </Link>
      </div>
      {vault.status !== "unlocked" ? (
        <p className="mp-hint">
          Open your passkey above to view private links.
        </p>
      ) : (
        <PrivateHistorySession
          key={`${vault.scope.owner}:${vault.profile?.vaultId}`}
        />
      )}
    </section>
  );
}
function PrivateHistorySession() {
  const vault = useLinkBackups();
  const [rows, setRows] = useState<
      { id: string; label: string; status: string; url?: string }[]
    >([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const guard = vault.sessionGuard();
    void (async () => {
      const storage = new PrivateStorage(vault, guard),
        records = await storage.list();
      guard();
      const links = records
        .filter((r) => r.id !== "sender-v1")
        .map((r) => parsePrivateOperation(r.value, r.id))
        .filter((o) => o.kind === "link");
      if (!links.length) {
        if (active) setLoading(false);
        return;
      }
      const engine = await privateEngine();
      guard();
      if (active)
        setRows(
          links.map((op) => {
            const token = engine.chain.tokens.find(
              (t) => t.address.toLowerCase() === op.token.toLowerCase(),
            );
            return {
              id: op.id,
              label: token
                ? `${formatUnits(BigInt(op.amount), token.decimals)} ${token.symbol}`
                : "Private link",
              status: op.status,
              url:
                op.status === "complete"
                  ? engine.sdk.encodePrivateLink(hexToBytes(op.seed!), op.token)
                  : undefined,
            };
          }),
        );
      if (active) setLoading(false);
    })().catch((e) => {
      if (active) {
        setError(privateError(e));
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
    // The parent remounts this session when wallet/passkey access changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      {loading ? (
        <p role="status" className="mp-hint">
          Opening encrypted private links…
        </p>
      ) : !rows.length && !error ? (
        <p className="mp-hint">
          Your private links will appear here after you create one.
        </p>
      ) : (
        <ul className="mp-history-list">
          {rows.map((r) => (
            <li key={r.id} className="mp-history-row">
              <div className="mp-history-info">
                <h3>{r.label}</h3>
                <p>
                  Private link ·{" "}
                  {r.status === "complete"
                    ? "Created · open to check claim status"
                    : r.status === "failed"
                      ? "Not completed"
                      : "In progress"}
                </p>
              </div>
              <div className="mp-history-actions">
                {r.url ? (
                  <>
                    <button
                      className="mp-text-button"
                      onClick={() => {
                        void navigator.clipboard.writeText(r.url!).then(
                          () => setNotice("Private link copied."),
                          () =>
                            setError(
                              "Open the link and copy its address from the browser.",
                            ),
                        );
                      }}
                    >
                      Copy link
                    </button>
                    <a
                      className="mp-text-button"
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open or reclaim
                    </a>
                  </>
                ) : (
                  <Link className="mp-text-button" href="/create/private">
                    Check activity
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {notice && (
        <p role="status" className="mp-hint">
          {notice}
        </p>
      )}
      {error && (
        <p className="mp-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
