# Why I Built MonliPay

A lot of hackathon projects start with a hot narrative — "AI × Web3", "the next L2", "tokenize X". MonliPay starts with something simpler: a frustration I keep running into.

## The actual problem

I live in Indonesia. Crypto adoption here is real — we have the [7th largest crypto-owning population in the world](https://triple-a.io/cryptocurrency-ownership-data/) — but it lives in a weird parallel universe next to how people actually move money day-to-day.

The day-to-day reality is WhatsApp. You pay back a friend for lunch, split a bill, send money to your little brother at college — it happens on WhatsApp. GoPay, OVO, DANA, bank transfer, e-wallet QR codes. All of it wrapped in a chat thread.

Try to do the same with crypto, and the UX collapses:

> "Tolong kirim 0.5 MON ke 0x7F3a...4C2b" — **my friend, 2026**

That message is where it falls apart. The recipient has to:
1. Open their wallet
2. Navigate to "send"
3. Copy that string of hex characters carefully
4. Visually verify the first 4 and last 4 digits (because if you miss one digit, the money is gone forever)
5. Hope they're on the right chain (send it on Ethereum mainnet and the recipient on Monad sees nothing)
6. Hope they pasted it into the right field

And if the friend **doesn't have a wallet yet** — which is most people — the conversation just dies. There's no way to onboard them mid-conversation.

This is the same friction Venmo solved for fiat in the US, and what GoPay solved for bank transfers in Indonesia. Nobody asks for your bank routing number on WhatsApp — they ask for your phone number, or they just send you a payment link.

Crypto never had that.

## What I actually wanted

A flow that looks like this:

> **Me**: sends 0.5 MON → gets a link → pastes it in WhatsApp
>
> **Friend**: taps the link → wallet prompt → done

No address sharing. No chain confusion. No "what's your address again?" back-and-forth. No risk of fat-fingering a hex string. And if the friend is crypto-curious but not crypto-set-up yet, the link itself is the onboarding — the claim flow walks them through MetaMask install on the spot.

If they don't claim it within a day, the money comes back. That's the safety net that makes me willing to actually use this for real payments rather than just demo it once.

## Why Monad specifically

Two reasons:

1. **The block time is 400ms.** Claiming a payment link on Ethereum mainnet means waiting 12 seconds plus a confirmation or two. That's *fine* for a Defi vault, but it feels bad when your friend is staring at their phone waiting. On Monad the claim is effectively instant — it feels like a Venmo transfer, which is the bar I wanted to hit.

2. **Gas is cheap.** A payment link system has three on-chain transactions per flow (create, claim, or refund). On Ethereum mainnet at 30 gwei, that's $4-6 in gas per flow — more than the value of most peer-to-peer payments. On Monad it's effectively free, which makes the system viable for small payments (the actual use case).

## What I deliberately did NOT build

- **No governance token.** It's a payment tool, not a protocol.
- **No yield farming on idle deposits.** The vault holds funds for at most the expiry window (default 24 hours). The complexity of yield integration isn't worth the worst-case failure mode.
- **No cross-chain link claiming.** A link created on Monad can only be claimed on Monad. Cross-chain would require a bridge + relayer and adds 3-4 new ways to lose money. Maybe later; not now.
- **No backend server holding secrets.** The link secret lives in the URL fragment. No database, no relayer, no "trusted intermediary". If my server gets hit by a bus, your existing links still work because the contract is self-contained.

## The 4:00 AM moment

The thing that pushed me over the edge to actually build this: I tried to send a friend some USDC on a chain he hadn't used before. It took us **twenty minutes** to get him set up — install MetaMask, add the network, find his address, copy it without typos, switch tokens for gas, then send. Twenty minutes for what should have been a one-tap action.

That entire 20-minute flow is what MonliPay compresses into "open this link".

## What's next

- **Mainnet deployment** — pending gas funding, scheduled within the hackathon window
- **Gasless claim** — the recipient shouldn't need MON to claim; a relayer can pay gas in exchange for a small fee paid by the sender
- **Sender-side link preview** — show a small OG preview card in WhatsApp/Telegram so the link looks less scary
- **Mobile-first claim flow** — the current flow works on mobile but isn't optimized for it

## The boring truth

MonliPay isn't a paradigm shift. It's not the next L2, it doesn't tokenize anything, and there's no AI in it. It's a small, working tool that solves a real annoyance in the most boring way possible: a link, a signature, a transfer.

I built it because I wanted to use it. If anyone else finds it useful, that's a bonus.

— ade
