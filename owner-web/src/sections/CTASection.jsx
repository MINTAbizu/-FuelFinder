import React from "react";

export default function CTASection() {
  return (
    <section className="section cta" id="contact">
      <div className="cta-card">
        <div>
          <h2>Ready to bring order to your stations?</h2>
          <p>
            Launch the owner console with your team, or schedule a live walkthrough with our
            deployment specialists.
          </p>
        </div>
        <div className="cta-actions">
          <a className="primary-btn" href="/app">Open Owner Console</a>
          <a className="secondary-btn" href="mailto:owners@fuelfinder.app">Email sales</a>
        </div>
      </div>
    </section>
  );
}
