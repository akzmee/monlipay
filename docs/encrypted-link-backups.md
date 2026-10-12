# Encrypted Payment Link backups

MonliPay can reopen a saved Payment Link from My Links after a refresh or on another compatible device. Wallet authentication controls access to stored ciphertext; the sender's passkey unlocks the encryption key on their device. Earlier profiles retain their existing recovery-key fallback. Lucky Links use their existing public ID and wallet eligibility and do not need bearer-secret storage.

## Sender flow (passkey MVP)

1. Connect the correct wallet and choose **Continue with wallet**. A wallet signature establishes the existing expiring SIWE session; it does not authorize a transfer or derive an encryption key.
2. Choose **Use passkey**. The browser creates a credential in a compatible password manager or authenticator, then reads it back with device verification before anything is persisted. No recovery string is shown or downloaded for a new profile.
3. While links are unlocked, the payment success screen encrypts and saves a new claim secret after the onchain receipt. **Saved to My Links** appears only after acknowledgement. Keep the original until then.
4. Returning users choose **Unlock with passkey**, then **Open link**, copy or QR. **All saved links** works independently of the transaction indexer. **Add an existing link** accepts an original URL after checking its sender and claim address.
5. Earlier recovery-key profiles can migrate by entering the existing key once. The profile and all encrypted link records remain byte-for-byte unchanged. Only a passkey-wrapped copy of the existing random root is added. The old recovery key remains usable for these migrated profiles; it is not requested from new users.

The device may ask for a PIN, biometric verification or security-key touch. WebAuthn PRF support depends on both browser and provider; ordinary passkey support alone is insufficient. Missing PRF, cancelled registration/readback and failed device verification do not create an unusable profile. Users can still create/share links without saved-link access, keeping the original URL themselves. A synced passkey must be available from the same provider on another device; universal cross-platform sync is not promised.

Refresh, wallet/network change, pagehide, manual lock, an expired API session or 15 minutes of inactivity removes access to the in-memory decryption key. Locking aborts an active passkey ceremony and invalidates late asynchronous results. Recovery/import fields and URLs opened from saved links are unmounted. Independently copied URLs and legacy recovery files remain under the user's control.

## Passkey wrapping

The existing version-1 link encryption format below remains unchanged. A new user's random 256-bit root is generated in the browser and never presented as a recovery task. A WebAuthn credential with required user verification and a per-profile random 32-byte PRF input produces the local wrapping material. HKDF-SHA-256 derives a non-extractable AES-GCM-256 wrapping key. The encrypted 32-byte root uses a fresh 96-bit IV and 128-bit authentication tag.

Wrapping AAD and derivation context bind the application namespace/version, exact origin, owner wallet, chain, LinkVault, profile ID and credential ID. The public envelope contains only the credential ID, PRF input salt, IV and ciphertext. PRF results and plaintext roots are never sent to the API or written into persistent browser storage. The API continues to authenticate using SIWE: WebAuthn is used for client-side encryption, not as an additional server login protocol, and its assertion/signature is not a KDF input.

Initial profile and passkey envelope are stored in one SQLite transaction. Identical retries succeed; replacing either a profile or attached passkey is rejected. Legacy migration adds an envelope to the original profile without rewriting link ciphertext. A lost HTTP response can be retried with the same prepared envelope; a reload retrieves any committed envelope and requires the original passkey. Registration is read back and used to decrypt the wrapped root before the server save, preventing an unsupported authenticator or cancelled readback from stranding a newly generated root.

There is no server-held decryption key, key-reset endpoint or silent server fallback. Lost passkeys are not recoverable by MonliPay; independent original links and wallet-authorized expiry refunds remain available. Multiple independently enrolled passkeys, authenticated passkey replacement and key rotation are later work. The implementation follows [WebAuthn PRF](https://www.w3.org/TR/webauthn-3/#prf-extension) and the [W3C explainer](https://github.com/w3c/webauthn/wiki/Explainer:-PRF-extension).

## Cryptographic format v1

- Root key (shown as a recovery key only in the earlier UI): 32 random bytes from `crypto.getRandomValues`, displayed as `MLP1-` followed by eight groups of eight hexadecimal characters. The application generates the key; it is not a human-chosen password or a wallet signature.
- Key derivation: Web Crypto HKDF-SHA-256, random 32-byte salt, scoped context; derives a non-extractable AES-GCM-256 CryptoKey. No raw decryption key is persisted by the application or sent to the API.
- Each encryption uses a new random 96-bit IV and a 128-bit authentication tag. The plaintext is exactly the 32-byte ephemeral claim key; the result is 48 ciphertext/tag bytes. The URL is reconstructed on the current trusted origin after decryption.
- Additional authenticated data is a canonical JSON tuple containing the application namespace, format version, wallet, chain ID, vault contract, random backup-profile ID, purpose, deposit ID and public claim address. Profile key-check encryption has a separate purpose. HKDF context also binds the wallet, chain, contract and profile.
- An encrypted fixed 32-byte key-check marker verifies the recovery key before exposing the unlocked state. Profile setup and record writes are append-only and idempotent for identical envelopes. Profile replacement, mismatched versions, unknown fields, malformed ciphertext, and reuse of a profile/record IV are rejected.
- The browser authenticates a queued envelope before retry, and checks the decrypted claim key against both its envelope and the onchain deposit. Server-side writes independently check the public sender/claim address via Monad RPC.

The implementation uses the browser's standard [Web Crypto API](https://www.w3.org/TR/webcrypto/) rather than a new cipher or custom signing-based KDF. Binary fields are serialized as lowercase hexadecimal; hexadecimal is encoding, not encryption.

## Persistence and recovery

The backend SQLite database is `link-backups.sqlite` beside the configured contacts database, or `LINK_BACKUPS_DB_PATH` when explicitly set. The current Docker deployments use `/app/data/link-backups.sqlite` in each network's existing persistent volume. WAL, a busy timeout, transactions, foreign keys, restrictive file permissions, unique IVs and a 5,000-record per-wallet/network/contract quota protect ordinary persistence operations. Do not remove these volumes during deployment.

The API accepts only the versioned ciphertext schema and public metadata. It requires a matching wallet header and HttpOnly, SameSite=Strict session cookie, exact origin on writes, bounded JSON request bodies, owner rate limits, and `Cache-Control: no-store`. It does not accept a recovery key or plaintext URL field. Errors do not log request bodies or raw encryption payloads.

Once encrypted, an unacknowledged write is retained in a wallet/network/profile-scoped local retry queue. This queue contains only authenticated ciphertext and public identifiers. Retry sync sends the same envelope, so a lost success response does not duplicate or overwrite a record. A storage quota failure never produces a local-saved claim; if neither persistence target succeeds, the sender must keep the original link. Backup is initiated after the onchain receipt: refreshing during funding or before encryption completes can still lose the in-memory original, and the UI does not claim otherwise.

The original passkey opens saved links on another compatible device after wallet sign-in. Legacy recovery keys still open their original profiles. MonliPay cannot reset either credential. Losing access does not prevent use of an independently saved original URL or normal wallet-authorized refunds after expiry. There is intentionally no destructive one-click reset or silent key rotation. The operational snapshot script `scripts/backup-private-data.py` creates consistent database copies and checks their integrity; these contain ciphertext plus metadata (and separately the existing contacts database). Store snapshots privately and include them in the operator's existing off-host backup system. No off-host backup destination is assumed or configured by this feature.

## Privacy boundary and remaining assurance work

This is claim-link confidentiality against a passive database/storage disclosure. It is not onchain sender privacy. Wallets, deposits, amounts, timing and claim addresses remain public. The backup server also sees authenticated wallet identities, deposit IDs and access timing.

Encryption does not protect an unlocked session against malicious frontend code, compromised browser extensions, a stolen legacy recovery key plus ciphertext, phishing, or an attacker controlling the device. It does not prevent a malicious storage operator from withholding data or replaying an old database snapshot. Strong entropy avoids a low-entropy password recovery path, but users still must protect access to their passkey provider and any legacy recovery key. Existing CSP and frontend dependencies remain part of the application's security boundary.

The release has automated and browser verification, not an independent cryptographic/security audit or an enterprise certification. Production scaling beyond one app process needs shared rate limiting and database failover; additional passkey enrollment and key rotation with authenticated migration and a separately tested off-host restore process are later assurance work. No marketing claim of anonymous payments or guaranteed hackathon results is made.
