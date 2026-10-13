"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowIcon } from "@/components/ArrowIcon";
import { useAccount } from "wagmi";
import { useConnectModal } from "@/components/WalletEntryContext";
import { getAddress, isAddress, zeroAddress } from "viem";
import { useContacts } from "@/hooks/useContacts";
import { shortAddress } from "@/lib/lucky";

export default function ContactsPage() {
  const { address } = useAccount();
  return <ContactsWorkspace key={address || "disconnected"} />;
}

function ContactsWorkspace() {
  const { address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const book = useContacts();
  const [name, setName] = useState("");
  const [wallet, setWallet] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [remove, setRemove] = useState<string>();
  const [notice, setNotice] = useState("");
  const filtered = book.contacts.filter((c) =>
    `${c.name} ${c.address}`.toLowerCase().includes(search.toLowerCase()),
  );
  const save = async () => {
    setError("");
    setNotice("");
    setSaving(true);
    try {
      if (
        !isAddress(wallet.trim()) ||
        wallet.trim().toLowerCase() === zeroAddress
      )
        throw new Error("Enter a valid wallet address.");
      await book.save({ name, address: getAddress(wallet.trim()) });
      setName("");
      setWallet("");
      setNotice("Contact saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save contact.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="mp-workspace">
      <div className="mp-page-heading">
        <div>
          <h1>Your people.</h1>
          <p>A private address book for the wallets you send to.</p>
        </div>
        <Link href="/create" className="mp-text-link">
          Create a link <ArrowIcon direction="up-right" />
        </Link>
      </div>
      {!book.unlocked ? (
        <section className="contacts-gate mp-panel">
          <div>
            <h2>Keep addresses. Remember names.</h2>
            <p>
              Save a wallet once, then choose it when you create a group payment link.
              Only you can access your contacts.
            </p>
            <button
              className="mp-button"
              disabled={book.busy}
              onClick={() =>
                address ? void book.unlock() : openConnectModal?.()
              }
            >
              {book.busy
                ? "Check your wallet…"
                : address
                  ? "Unlock my contacts"
                  : "Connect wallet"}
            </button>
            <p className="mp-hint">
              Unlock with a wallet signature. No transaction or gas fee.
            </p>
          </div>
          <div className="contacts-gate-art" aria-hidden="true">
            <div className="contact-stub">
              <span>A</span>
              <div>
                <i />
                <i />
              </div>
            </div>
            <div className="contact-stub">
              <span>M</span>
              <div>
                <i />
                <i />
              </div>
            </div>
            <div className="contact-stub">
              <span>J</span>
              <div>
                <i />
                <i />
              </div>
            </div>
          </div>
        </section>
      ) : (
        <div className="contacts-layout">
          <section className="mp-panel contacts-book">
            <div className="mp-section-title">
              <h2>Saved contacts</h2>
              <span className="mp-count">{book.contacts.length}</span>
            </div>
            <label className="sr-only" htmlFor="contact-search">
              Search contacts
            </label>
            <input
              id="contact-search"
              className="mp-input"
              type="search"
              placeholder="Search by name or address"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {book.loading ? (
              <div className="mp-skeleton" aria-label="Loading contacts" />
            ) : filtered.length ? (
              <ul className="contacts-rows">
                {filtered.map((contact) => (
                  <li key={contact.address}>
                    <span className="contact-initial" aria-hidden="true">
                      {contact.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="contact-identity">
                      <strong>{contact.name}</strong>
                      <span title={contact.address}>{contact.address}</span>
                    </div>
                    <div className="contact-row-actions">
                      {remove === contact.address ? (
                        <>
                          <button
                            className="mp-text-button"
                            disabled={saving}
                            onClick={async () => {
                              setSaving(true);
                              setError("");
                              try {
                                await book.remove(contact.address);
                                setRemove(undefined);
                                setNotice("Contact removed.");
                              } catch (err) {
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : "Could not remove contact.",
                                );
                              } finally {
                                setSaving(false);
                              }
                            }}
                          >
                            Confirm removal
                          </button>
                          <button
                            className="mp-text-button"
                            onClick={() => setRemove(undefined)}
                            disabled={saving}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="mp-text-button"
                            onClick={() => {
                              setName(contact.name);
                              setWallet(contact.address);
                              setNotice("");
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="mp-text-button"
                            aria-label={`Remove ${contact.name}`}
                            onClick={() => setRemove(contact.address)}
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="contacts-empty">
                <h3>
                  {search
                    ? "No matching contacts"
                    : "Start with someone you know."}
                </h3>
                <p>
                  {search
                    ? "Try a different name or wallet address."
                    : "Add a name and wallet address. You can also save new contacts while creating a group payment link."}
                </p>
              </div>
            )}
            <p className="mp-hint">
              Signed in as {address && shortAddress(address)}. Contacts are
              saved across your devices.
            </p>
          </section>
          <form
            className="mp-panel contact-add"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <h2>
              {book.contacts.some(
                (c) => c.address.toLowerCase() === wallet.toLowerCase(),
              )
                ? "Edit contact"
                : "Add a contact"}
            </h2>
            <div className="mp-field">
              <label className="mp-label" htmlFor="contact-name">
                Name
              </label>
              <input
                id="contact-name"
                className="mp-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex"
                maxLength={60}
                required
                disabled={saving}
              />
            </div>
            <div className="mp-field">
              <label className="mp-label" htmlFor="contact-address">
                Wallet address
              </label>
              <input
                id="contact-address"
                className="mp-input"
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
                required
                disabled={saving}
              />
            </div>
            <button className="mp-button mp-button-wide" disabled={saving}>
              {saving ? "Saving…" : "Save contact"}
            </button>
            <p className="mp-hint">
              Saving a contact doesn’t send funds or give them permission to
              access your wallet.
            </p>
          </form>
        </div>
      )}
      {(error || book.error) && (
        <p className="mp-error" role="alert">
          {error || book.error}
        </p>
      )}
      {notice && (
        <p className="mp-feedback" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
