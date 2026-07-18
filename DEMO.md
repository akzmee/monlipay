# 3-Minute Demo Script — MonliPay

Use this script to record a demo video for the hackathon submission. The flow below takes about **2 minutes 40 seconds** when recorded in one take — leave a 20-second buffer for intro/outro.

## Setup before recording

1. **Two devices**:
   - Device A (laptop) = sender, has MetaMask with testnet MON
   - Device B (phone or second browser profile) = recipient, has MetaMask with **zero** MON
2. **Open these tabs on Device A**:
   - https://testnet.monlipay.xyz (the app)
   - https://testnet.monadscan.com/address/0xEB9a0BC1c7518F839B8F249E407A1AfC011E0aB3 (the contract)
3. **Device B**: have WhatsApp Web or Telegram open and logged in
4. **Screen recording**: 1280×720 minimum, system audio off, mic on (narrate in English or Bahasa Indonesia)

---

## Script (word-for-word)

### 0:00 — Intro (10 seconds)

> "This is MonliPay — send MON to anyone via a link, even if they don't have a wallet address yet. Let me show you the full flow."

### 0:10 — Create the link (40 seconds)

**Action**: On Device A, click **"Create Link"**, select **MON**, enter **0.5**, expiry **24 hours**, click **Create**.

**Narration**:
> "I deposit half a MON into the LinkVault contract. The browser generates an ephemeral keypair — the public key goes on-chain, the private key goes into the URL fragment. Watch the URL bar after this transaction confirms."

**Wait** for the transaction to confirm (testnet ~1 second).

### 0:50 — Share via WhatsApp (30 seconds)

**Action**: Click the green **WhatsApp** button → WhatsApp Web opens with a pre-filled message and link → send to your own number (or Device B's contact).

**Narration**:
> "Now I share the link. Notice the `#` in the URL — everything after it stays in the browser, never hits a server. That's what makes the claim front-run resistant."

### 1:20 — Recipient claims (50 seconds)

**Action**: Open WhatsApp on Device B → tap the link → MonliPay opens → MetaMask prompts → connect wallet → click **Claim** → MetaMask asks for signature → approve.

**Narration**:
> "On a totally different device, my friend opens the link. Their wallet signs an EIP-712 message — not a transaction that moves funds directly. The contract verifies the signature with ecrecover and releases the MON."

**Wait** for claim transaction to confirm.

### 2:10 — Show balance received (20 seconds)

**Action**: Show Device B's MetaMask — balance increased by ~0.5 MON.

**Narration**:
> "Done. The recipient never had to share an address. The link was the address."

### 2:20 — Bonus: Auto-refund on expiry (40 seconds)

**Action**: On Device A, create a second link with **1 minute expiry** → wait 70 seconds → open **"My Links"** page.

**Narration**:
> "What if no one claims? Watch — I create a link with a 1-minute expiry, wait, open My Links. The contract auto-refunds the sender. Permissionless — anyone can trigger it, not just the sender."

**Wait** for auto-refund toast to appear.

### 3:00 — Outro (10 seconds)

> "MonliPay — payment links for Monad. Live on testnet at testnet.monlipay.xyz. Open source, MIT licensed. Link in the description."

---

## Recording checklist

- [ ] Lighting good, screen clearly readable
- [ ] Both MetaMask wallets funded/prepared
- [ ] WhatsApp/Telegram tested
- [ ] No notifications/email popups during recording
- [ ] Narration clear, no "um"s (or edit them out)
- [ ] Final video exported at 720p or higher
- [ ] Upload to YouTube as **unlisted** (judges can view but it's not public)
- [ ] Paste the YouTube URL into the submission form

## Common recording mistakes to avoid

1. **Don't show real mainnet wallets** with significant funds — use a fresh test wallet
2. **Don't cut the middle of transactions** — judges want to see confirmations are real
3. **Don't skip the URL bar shot** — it's the key proof the secret is in the fragment
4. **Don't talk about features you didn't ship** — bridge, 3D scene, etc. are nice but stick to the core flow
5. **Don't exceed 3:00** — judges WILL stop watching
