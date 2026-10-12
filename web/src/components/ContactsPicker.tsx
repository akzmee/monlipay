"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import type { Address } from "viem";
import { useContacts } from "@/hooks/useContacts";
import { parseRecipients, shortAddress } from "@/lib/lucky";

export function ContactsPicker({
  wallets,
  onChange,
  disabled,
}: {
  wallets: Address[];
  onChange: (wallets: Address[]) => void;
  disabled: boolean;
}) {
  const { address } = useAccount();
  const book = useContacts();
  const [entry, setEntry] = useState("");
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [saveContact, setSaveContact] = useState(false);
  const [saving, setSaving] = useState(false);
  const add = async () => {
    setError("");
    try {
      const additions = parseRecipients(entry);
      if (!additions.length)
        throw new Error("Enter at least one wallet address.");
      const all = parseRecipients([...wallets, ...additions].join(" "));
      if (saveContact && book.unlocked) {
        if (additions.length !== 1)
          throw new Error("Add one wallet at a time when saving a contact.");
        if (!name.trim()) throw new Error("Enter a name for this contact.");
        setSaving(true);
        await book.save({ address: additions[0], name: name.trim() });
      }
      onChange(all);
      setEntry("");
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add wallet.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="recipient-picker">
      <div className="mp-section-title">
        <h2>Who can claim?</h2>
        <span className="mp-count">{wallets.length} selected</span>
      </div>
      <p className="mp-hint">
        Choose contacts or add wallet addresses. Each wallet can claim once.
      </p>
      {!book.unlocked ? (
        <div className="contact-unlock">
          <span>
            {address
              ? "Your saved contacts are private."
              : "Connect a wallet to use saved contacts."}
          </span>
          <button
            type="button"
            className="mp-text-button"
            onClick={() => void book.unlock()}
            disabled={!address || book.busy || disabled}
          >
            {book.busy ? "Check your wallet…" : "Unlock contacts"}
          </button>
        </div>
      ) : (
        <div className="contact-options" aria-label="Saved contacts">
          {book.contacts.length === 0 ? (
            <p className="mp-hint">
              No saved contacts yet. Add a wallet below and save it for next
              time.
            </p>
          ) : (
            book.contacts.map((contact) => {
              const checked = wallets.some(
                (w) => w.toLowerCase() === contact.address.toLowerCase(),
              );
              return (
                <label key={contact.address} className="contact-option">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled || saving}
                    onChange={() => {
                      setError("");
                      try {
                        onChange(
                          checked
                            ? wallets.filter(
                                (w) =>
                                  w.toLowerCase() !==
                                  contact.address.toLowerCase(),
                              )
                            : parseRecipients(
                                [...wallets, contact.address].join(" "),
                              ),
                        );
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : "Too many wallets.",
                        );
                      }
                    }}
                  />
                  <span>
                    {contact.name}
                    <small>{shortAddress(contact.address)}</small>
                  </span>
                </label>
              );
            })
          )}
        </div>
      )}
      {book.error && (
        <p className="mp-error" role="alert">
          {book.error}
        </p>
      )}
      <label className="mp-label" htmlFor="recipient-wallets">
        Add wallet addresses
      </label>
      <textarea
        id="recipient-wallets"
        className="mp-input wallet-entry"
        rows={2}
        value={entry}
        onChange={(e) => setEntry(e.target.value)}
        placeholder="0x… (separate multiple addresses with commas)"
        disabled={disabled || saving}
        spellCheck={false}
      />
      <div className="recipient-add-row">
        {book.unlocked && (
          <label className="mp-check">
            <input
              type="checkbox"
              checked={saveContact}
              onChange={(e) => setSaveContact(e.target.checked)}
              disabled={disabled || saving}
            />
            Save to contacts
          </label>
        )}
        <button
          type="button"
          className="mp-button mp-button-secondary"
          onClick={() => void add()}
          disabled={disabled || saving || !entry.trim()}
        >
          {saving ? "Saving…" : "Add wallet"}
        </button>
      </div>
      {saveContact && book.unlocked && (
        <label className="mp-label">
          Contact name
          <input
            className="mp-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="e.g. Alex"
            disabled={disabled || saving}
          />
        </label>
      )}
      {error && (
        <p className="mp-error" role="alert">
          {error}
        </p>
      )}
      {wallets.length > 0 && (
        <ul className="recipient-list" aria-label="Eligible wallets">
          {wallets.map((wallet) => (
            <li key={wallet}>
              <span title={wallet}>
                {book.contacts.find(
                  (c) => c.address.toLowerCase() === wallet.toLowerCase(),
                )?.name || shortAddress(wallet)}
              </span>
              <button
                className="recipient-remove"
                type="button"
                aria-label={`Remove ${wallet}`}
                onClick={() => onChange(wallets.filter((w) => w !== wallet))}
                disabled={disabled || saving}
              >
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="m6 6 8 8m0-8-8 8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mp-hint">
        Contact names stay private. Selected wallet addresses will be visible
        on-chain.
      </p>
    </div>
  );
}
