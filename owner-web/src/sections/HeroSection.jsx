import React from "react";

export default function HeroSection() {
  return (
    <section className="hero" id="top">
      <div className="hero-content">
        <div className="hero-copy">
          <span className="pill">Built for station owners · Live operations control</span>
          <h1>Run every pump, queue, and payout from one live command center.</h1>
          <p>
            FuelFinder Owner gives you instant visibility into demand, payments, and fuel levels across
            every station. Reduce wait times, stop stockouts, and keep teams aligned in real time.
          </p>
          <div className="hero-actions">
            <a className="primary-btn" href="/app">Open Owner Console</a>
            <a className="secondary-btn" href="#contact">Book a live demo</a>
          </div>
          <div className="hero-meta">
            <div>
              <strong>98%</strong>
              <span>on-time queue flow</span>
            </div>
            <div>
              <strong>22%</strong>
              <span>lower driver churn</span>
            </div>
            <div>
              <strong>4.9?</strong>
              <span>operator rating</span>
            </div>
          </div>
        </div>
        <div className="hero-panel">
          <div className="panel-card">
            <div>
              <p className="panel-label">Live station pulse</p>
              <h3>Addis Ababa · Merkato</h3>
              <p className="panel-sub">Queue 42 · Avg wait 12 min · Fuel status: Healthy</p>
            </div>
            <div className="panel-grid">
              <div>
                <span>Premium</span>
                <strong>41,200 L</strong>
              </div>
              <div>
                <span>Diesel</span>
                <strong>29,700 L</strong>
              </div>
              <div>
                <span>Payments</span>
                <strong>ETB 312k</strong>
              </div>
              <div>
                <span>Staff</span>
                <strong>12 on duty</strong>
              </div>
            </div>
          </div>
          <div className="panel-note">
            <p>Automated alerts + 30s refresh keep managers ahead of queues.</p>
            <div className="pulse-row">
              <span className="pulse-dot" />
              Live sync active
            </div>
          </div>
        </div>
      </div>
      <div className="hero-blur" aria-hidden="true" />
    </section>
  );
}
