import type { Metadata } from "next";
import Link from "next/link";
import { ArrowIcon } from "@/components/ArrowIcon";

export const metadata: Metadata = {
  title: "Privacy at MonliPay",
  description:
    "How MonliPay protects saved claim links, what stays public on Monad, and how passkeys work.",
};

export default function PrivacyPage() {
  return (
    <article className="mp-workspace mp-privacy-page">
      <header className="mp-page-heading">
        <div>
          <h1>Privacy at MonliPay</h1>
          <p>Protecting your claim links starts on your device.</p>
        </div>
      </header>
      <section aria-labelledby="private-links">
        <h2 id="private-links">Your saved links are encrypted</h2>
        <p>
          A payment link contains a secret that allows its holder to claim the
          available funds. When you save a link, your browser encrypts that
          secret before sending it to MonliPay.
        </p>
        <p>
          Your passkey protects the key used to open saved links. The decryption
          secret stays on your device during use. The server stores encrypted
          data and the wallet, network, and link identifiers needed to find it.
        </p>
        <p>
          Anyone you share the complete claim link with can use it. Share
          privately and keep the original until My Links confirms it was saved.
        </p>
      </section>
      <section aria-labelledby="passkey-access">
        <h2 id="passkey-access">Open with your passkey</h2>
        <p>
          Verify your wallet, then use a passkey from your password manager or
          security key. There is no recovery file for new users to download.
          Your device may ask for its PIN, fingerprint, or face recognition.
        </p>
        <p>
          Opening encrypted links requires passkey encryption support (WebAuthn
          PRF). Browser and provider support varies. On another device, use the
          same passkey provider and MonliPay site. Mainnet and testnet keep
          separate saved links.
        </p>
        <p>
          Links lock on refresh, wallet change, or after 15 minutes of
          inactivity. MonliPay cannot reset a lost passkey. Independently saved
          original links remain usable, and eligible expired payments can be
          refunded using your wallet.
        </p>
        <p>
          Links saved with the earlier recovery-key system can switch to a
          passkey after entering that existing key once. Their encryption and
          claim URLs are preserved.
        </p>
      </section>
      <section aria-labelledby="public-chain">
        <h2 id="public-chain">What remains public</h2>
        <p>
          Standard Payment Links record wallet addresses, token amounts, deposit
          and claim activity, and timing on Monad. Lucky Link eligibility is
          also onchain. Encrypting a saved link does not hide its sender or
          recipient.
        </p>
      </section>
      <section aria-labelledby="private-payments">
        <h2 id="private-payments">Optional private payments</h2>
        <p>
          Private payment is a beta option on Monad mainnet using AnomaPay.
          Deposit into a private balance, then create a link through a shielded
          transfer to a separate claim account. The recipient withdraws to their
          wallet. Supported pool assets are USDC, USDT0, WETH and WMON; adding
          MON wraps it to WMON, and recipients receive WMON.
        </p>
        <p>
          Transfers inside the pool hide their parties and amounts from public
          chain observers. Deposits and withdrawals remain public. Timing and
          amounts can still be correlated. AnomaPay&apos;s proving operator and
          proving infrastructure receive unencrypted transaction details;
          Galileo receives the account&apos;s discovery key. Spending authority
          and encryption private keys stay in the browser. This is not complete
          anonymity.{" "}
          <a
            href="https://docs.anoma.net/anoma-pay-privacy-guarantees"
            target="_blank"
            rel="noreferrer"
          >
            Read AnomaPay&apos;s privacy model
          </a>
          .
        </p>
        <p>
          Your private account and sender-side link records are encrypted with
          the same passkey-protected key as saved Payment Links. The server sees
          your wallet, record identifiers, revision numbers, sizes and timing.
          Claim progress is encrypted on the recipient&apos;s device using the
          secret in the link. Keep the original link until the claim completes.
        </p>
        <p>
          Private links have no expiry or automatic refund. Anyone holding the
          complete link, including its sender, can withdraw the unspent balance;
          the first successful spend wins. Protocol fees are shown before a
          transfer or withdrawal and deducted from the private balance. A lost
          passkey can make the sender&apos;s private balance inaccessible; a
          lost bearer link cannot be reset by MonliPay.
        </p>
        <p>
          The WMON deposit, private transfer, claim and sender-recovery flow has
          been tested on Monad mainnet. Other supported assets have not each
          undergone a funded end-to-end test. The provider is an additional
          availability and trust dependency.
        </p>
      </section>
      <section aria-labelledby="service-data">
        <h2 id="service-data">What the service can see</h2>
        <p>
          Wallet sign-in identifies the wallet accessing saved links. The
          service processes public link metadata and request information.
          Contact names and addresses are stored in your wallet-scoped address
          book on the server; contacts do not use the claim-link encryption
          described above.
        </p>
        <p>
          Wallet providers, RPC services, hosting providers, and other services
          used by the app can receive network requests. This page does not claim
          anonymous browsing or zero metadata collection.
        </p>
      </section>
      <section aria-labelledby="limits">
        <h2 id="limits">The limits of this protection</h2>
        <p>
          Encryption helps protect claim secrets in stored data. It cannot
          protect an unlocked browser against malicious extensions, compromised
          frontend code, or someone with access to your device and passkey. This
          implementation has not undergone an independent security audit.
        </p>
      </section>
      <Link className="mp-text-button" href="/my-links">
        Go to My Links <ArrowIcon direction="up-right" />
      </Link>
    </article>
  );
}
