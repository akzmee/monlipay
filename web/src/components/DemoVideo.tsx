export function DemoVideo() {
  return (
    <section id="demo" className="mp-demo" aria-labelledby="demo-title">
      <div className="mp-demo-heading">
        <h2 id="demo-title">See a link become a payment.</h2>
        <p>
          One link, ten recipients. Watch a group payment from creation to claim.
        </p>
      </div>
      <video
        controls
        playsInline
        preload="none"
        poster="/demo/monlipay-poster.jpg?v=monlipay-mark"
        width="1440"
        height="900"
        aria-label="MonliPay product demo with English narration and captions"
      >
        <source src="/demo/monlipay-demo.mp4?v=group-voice-20261013" type="video/mp4" />
        <track
          kind="captions"
          src="/demo/monlipay-en.vtt?v=group-voice-20261013"
          srcLang="en"
          label="English"
        />
        Your browser does not support embedded video.{" "}
        <a href="/demo/monlipay-demo.mp4?v=group-voice-20261013">Download the demo</a>.
      </video>
      <div className="mp-demo-actions">
        <a className="mp-text-link" href="/demo/monlipay-demo.mp4?v=group-voice-20261013" download>
          Download video
        </a>
      </div>
      <details className="mp-demo-transcript">
        <summary>Read the walkthrough</summary>
        <ol>
          <li>
            Choose Group Payment, pick a token, and set a pool of 100 for 10
            recipients. Equal amount gives each wallet 10 tokens.
          </li>
          <li>
            Choose Anyone or Selected wallets. Approve the token, fund the pool,
            and share the link in your group chat.
          </li>
          <li>
            Each recipient opens the link, connects a wallet, and claims their
            share. Each wallet can claim once, until the slots are filled.
            A wallet and network gas are needed.
          </li>
          <li>
            My Links shows the claimed payments and remaining pool. Unclaimed
            funds can be refunded after the deadline.
          </li>
          <li>
            Switch to Random amount for a giveaway, or Payment Link for one
            recipient. Saved contacts make repeat payments easier.
          </li>
          <li>
            Private Payment is available on Monad mainnet. A passkey protects
            saved payment records. AnomaPay shields transfers inside its pool;
            deposits and withdrawals remain public.
          </li>
        </ol>
      </details>
    </section>
  );
}
