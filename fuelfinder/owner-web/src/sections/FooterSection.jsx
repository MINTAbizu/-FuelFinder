import React from "react";
import { Link } from "react-router-dom";

export default function FooterSection() {
  return (
    <footer className="footer">
      <div>
        <h3>FuelFinder Owner</h3>
        <p>Operations intelligence for fuel networks.</p>
      </div>
      <div className="footer-links">
        <Link to="/features">Platform</Link>
        <Link to="/pricing">Pricing</Link>
        <Link to="/contact">Contact</Link>
        <a href="mailto:support@fuelfinder.app">Support</a>
      </div>
      <div className="footer-meta">
        <span>© 2026 FuelFinder</span>
        <span>Built for station teams</span>
      </div>
    </footer>
  );
}
