"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useConnectOrCreateWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { useAccount, useBalance, useDisconnect } from "wagmi";
import { monadChain } from "@/config/chain";
import { WalletEntryContext } from "./WalletEntryContext";

export function PrivyWalletEntry({ children }: { children: ReactNode }) {
  const { ready, logout, exportWallet } = usePrivy();
  const { connectOrCreateWallet } = useConnectOrCreateWallet();
  const { wallets } = useWallets();
  const { address } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const embedded = wallets.some((w) => w.address.toLowerCase() === address?.toLowerCase() && w.walletClientType === "privy");
  const balance = useBalance({ address, chainId: monadChain.id, query: { enabled: open && !!address } });

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  return (
    <WalletEntryContext.Provider value={{
      open: () => { if (ready) connectOrCreateWallet(); },
      openAccount: () => { setMessage(""); setOpen(true); },
      ready,
    }}>
      {children}
      <dialog ref={dialog} className="mp-account-dialog" onClose={() => setOpen(false)} aria-labelledby="wallet-dialog-title">
        <div className="mp-account-heading">
          <h2 id="wallet-dialog-title">Your wallet</h2>
          <button type="button" className="mp-text-button" onClick={() => setOpen(false)}>Close</button>
        </div>
        <p className="mp-hint">{embedded ? "Your MonliPay wallet" : "Connected wallet"} · {monadChain.name}</p>
        <p className="mp-account-address">{address}</p>
        <p className="mp-hint">{balance.data ? `${balance.data.formatted} MON for payments and network fees` : balance.isError ? "Could not load your MON balance." : "Loading balance…"}</p>
        <div className="mp-account-actions">
          <button type="button" className="mp-button" onClick={async () => {
            try { await navigator.clipboard.writeText(address ?? ""); setMessage("Address copied."); }
            catch { setMessage("Copy the address shown above."); }
          }}>Copy receiving address</button>
          <Link className="mp-text-link" href="/bridge" onClick={() => setOpen(false)}>Add funds from another network</Link>
          <Link className="mp-text-link" href="/my-links" onClick={() => setOpen(false)}>View my payments</Link>
          {embedded && <button type="button" className="mp-text-button" disabled={busy} onClick={async () => {
            setBusy(true);
            setOpen(false);
            try { if (address) await exportWallet({ address }); }
            catch { setMessage("Wallet export was not completed. Try again when ready."); setOpen(true); }
            finally { setBusy(false); }
          }}>Export wallet</button>}
          <button type="button" className="mp-text-button" disabled={busy} onClick={async () => {
            setBusy(true);
            try { await disconnectAsync(); await logout(); setOpen(false); }
            catch { setMessage("Could not sign out. Please try again."); }
            finally { setBusy(false); }
          }}>{busy ? "Please wait…" : "Disconnect"}</button>
        </div>
        <p className="mp-hint" role="status">{message}</p>
      </dialog>
    </WalletEntryContext.Provider>
  );
}
