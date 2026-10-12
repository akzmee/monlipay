"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import type { Contact } from "@/lib/contacts-store";

export function useContacts() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const activeAddress = useRef(address);
  useEffect(() => {
    activeAddress.current = address;
  }, [address]);
  const generation = useRef(0);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const version = ++generation.current;
    if (!address) {
      setContacts([]);
      setUnlocked(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/contacts", {
        headers: { "x-wallet-address": address },
        cache: "no-store",
      });
      if (version !== generation.current || activeAddress.current !== address)
        return;
      if (response.status === 401) {
        setUnlocked(false);
        setContacts([]);
        return;
      }
      const result = await response.json();
      if (version !== generation.current || activeAddress.current !== address)
        return;
      if (!response.ok)
        throw new Error(result.error || "Could not load contacts.");
      setContacts(result.contacts);
      setUnlocked(true);
    } catch (err) {
      if (version === generation.current && activeAddress.current === address)
        setError(
          err instanceof Error ? err.message : "Could not load contacts.",
        );
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }, [address]);

  const [stateWallet, setStateWallet] = useState(address);
  if (stateWallet !== address) {
    setStateWallet(address);
    setContacts([]);
    setUnlocked(false);
    setError("");
    setBusy(false);
  }

  useEffect(() => {
    // Start external I/O after this commit; cancel obsolete account refreshes.
    const task = setTimeout(() => {
      void refresh();
    }, 0);
    return () => {
      clearTimeout(task);
      activeAddress.current = undefined;
    };
  }, [refresh]);

  const unlock = async () => {
    if (!address || busy) return;
    const wallet = address;
    setBusy(true);
    setError("");
    try {
      const challenge = await fetch("/api/contacts/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "challenge", address: wallet }),
      });
      const data = await challenge.json();
      if (!challenge.ok) throw new Error(data.error);
      if (activeAddress.current !== wallet) return;
      const signature = await signMessageAsync({
        message: data.message,
        account: wallet,
      });
      if (activeAddress.current !== wallet) return;
      const verification = await fetch("/api/contacts/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", signature }),
      });
      if (!verification.ok) throw new Error((await verification.json()).error);
      if (activeAddress.current === wallet) await refresh();
    } catch (err) {
      if (activeAddress.current === wallet)
        setError(err instanceof Error ? err.message : "Sign-in was cancelled.");
    } finally {
      if (activeAddress.current === wallet) setBusy(false);
    }
  };

  const mutate = async (method: "POST" | "DELETE", data: unknown) => {
    if (!address || !unlocked) throw new Error("Unlock contacts first.");
    const wallet = address;
    const response = await fetch("/api/contacts", {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-wallet-address": wallet,
      },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401 && activeAddress.current === wallet)
        setUnlocked(false);
      throw new Error(result.error || "Could not update contacts.");
    }
    if (activeAddress.current === wallet) await refresh();
  };
  return {
    contacts,
    unlocked,
    busy,
    loading,
    error,
    unlock,
    refresh,
    save: (contact: Contact) => mutate("POST", contact),
    remove: (wallet: string) => mutate("DELETE", { address: wallet }),
  };
}
