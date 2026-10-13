export function DemoVideo() {
  return (
    <section id="demo" className="mp-demo" aria-labelledby="demo-title">
      <div className="mp-demo-heading">
        <h2 id="demo-title">See a link become a payment.</h2>
        <p>
          Payment links, Lucky Links, and an introduction to private payments.
        </p>
      </div>
      <video
        controls
        playsInline
        preload="none"
        poster="/demo/monlipay-poster.jpg?v=monlipay-mark"
        width="1440"
        height="900"
        aria-label="MonliPay product demo with English captions"
      >
        <source src="/demo/monlipay-demo.mp4" type="video/mp4" />
        <track
          kind="captions"
          src="/demo/monlipay-en.vtt"
          srcLang="en"
          label="English"
        />
        Your browser does not support embedded video.{" "}
        <a href="/demo/monlipay-demo.mp4">Download the demo</a>.
      </video>
      <div className="mp-demo-actions">
        <a className="mp-text-link" href="/demo/monlipay-demo.mp4" download>
          Download video
        </a>
      </div>
      <details className="mp-demo-transcript">
        <summary>Read the walkthrough</summary>
        <ol>
          <li>
            Create a payment link: choose a token, amount, and expiry.
          </li>
          <li>
            Fund the link in your wallet, then copy it into a private chat.
            Anyone holding this payment link can claim it.
          </li>
          <li>
            The recipient opens the link, connects a wallet, and claims. The
            transaction receipt confirms the transfer.
          </li>
          <li>
            For a group, choose Lucky Link. Set a pool, recipient slots, and
            eligible wallets. Contacts let you save wallets for next time.
          </li>
          <li>
            A Lucky Link recipient requests a random draw and collects their
            share after it settles. Draw fees and network gas are paid in MON.
          </li>
          <li>
            Find your links in My Links. Expired, unallocated funds
            can be refunded with wallet confirmation.
          </li>
          <li>
            Open saved links with your passkey. To send a private payment,
            choose Private when creating a link on Monad mainnet.
          </li>
        </ol>
      </details>
    </section>
  );
}
