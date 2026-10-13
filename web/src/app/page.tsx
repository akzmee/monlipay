import Link from "next/link";
import { ArrowIcon } from "@/components/ArrowIcon";
import { LuckyArtwork } from "@/components/LuckyArtwork";
import { DemoVideo } from "@/components/DemoVideo";
import { HeroMotion } from "@/components/HeroMotion";

export default function HomePage() {
  return (
    <div className="mp-home">
      <HeroMotion>
        <div className="mp-hero-grid" aria-hidden="true" />
        <div className="mp-hero-copy">
          <h1 id="home-title">
            SEND
            <br />
            TOKENS.
            <br />
            <span>BY LINK.</span>
          </h1>
          <p>
            Create a link. Send MON or tokens through any chat. Your recipient
            opens it, connects a wallet, and claims.
          </p>
          <div className="mp-hero-actions">
            <Link className="mp-button mp-button-primary" href="/create">
              Create a link <ArrowIcon direction="up-right" />
            </Link>
            <a className="mp-button mp-button-secondary" href="#demo">
              Watch demo
            </a>
          </div>
        </div>
        <div className="mp-hero-art" aria-hidden="true">
          <div className="mp-hero-flight">
            <div className="mp-hero-depth">
              <div className="mp-hero-arrival">
                <LuckyArtwork />
              </div>
            </div>
          </div>
        </div>
        <div className="mp-hero-foot">
          <span>Built for Monad</span>
          <span>From your wallet to their inbox.</span>
        </div>
      </HeroMotion>
      <section className="mp-home-guide" aria-labelledby="guide-title">
        <div>
          <h2 id="guide-title">
            Your tokens.
            <br /> One simple link.
          </h2>
          <p>
            Send to one person with a payment link. Sharing with a group? Choose
            Lucky Link when you create your link to split a pool into random
            shares.
          </p>
          <Link className="mp-text-button" href="/create">
            Choose your link type <ArrowIcon direction="up-right" />
          </Link>
        </div>
        <ol className="mp-home-steps">
          <li>
            <span aria-hidden="true">1</span>
            <div>
              <h3>Create your link</h3>
              <p>
                Choose a token, enter an amount, and set when the link expires.
              </p>
            </div>
          </li>
          <li>
            <span aria-hidden="true">2</span>
            <div>
              <h3>Send it in a chat</h3>
              <p>
                Copy your funded link and send it through the apps you already
                use. Keep payment links private: anyone with the link can claim.
              </p>
            </div>
          </li>
          <li>
            <span aria-hidden="true">3</span>
            <div>
              <h3>They open it and claim</h3>
              <p>
                Your recipient connects a wallet to receive the tokens on Monad.
                Track your payment links in My Links.
              </p>
            </div>
          </li>
        </ol>
      </section>
      <section
        className="mp-home-guide mp-home-privacy"
        aria-labelledby="privacy-title"
      >
        <div>
          <h2 id="privacy-title">
            Saved links. <br />
            Encrypted on your device.
          </h2>
          <p>
            Open your saved payment links with a passkey. No recovery file to
            manage.
          </p>
          <Link className="mp-text-button" href="/privacy">
            How we protect your links <ArrowIcon direction="up-right" />
          </Link>
        </div>
        <div className="mp-privacy-explanation">
          <h3>Your passkey opens your links</h3>
          <p>
            Claim secrets are encrypted in your browser before they are saved.
            Your passkey protects the key that opens them.
          </p>
          <h3>Choose a private payment</h3>
          <p>
            An optional mode on Monad mainnet transfers through AnomaPay.
            Transfers inside its pool are shielded. Deposits and withdrawals
            remain public, and the proving service can see transfer details.
          </p>
          <Link className="mp-text-button" href="/create/private">
            Explore private payments <ArrowIcon direction="up-right" />
          </Link>
        </div>
      </section>
      <DemoVideo />
      <section className="mp-home-details" aria-label="About payment links">
        <p>
          Payment links carry one amount for one recipient. Lucky Links add a
          selected group, a recipient limit, and random shares. Both start with
          Create a link.
        </p>
        <p>
          Creating a link requires network gas. Lucky Link recipients also pay a
          draw fee. After expiry, unclaimed or unallocated funds can be
          refunded.
        </p>
      </section>
      <footer className="mp-home-footer">
        <Link href="/">MonliPay</Link>
        <span>Tokens to go. Just share the link.</span>
        <Link href="/privacy">Privacy</Link>
        <Link href="/bridge">
          Bridge to Monad <ArrowIcon direction="up-right" />
        </Link>
      </footer>
    </div>
  );
}
