import React from "react";
import { Link } from "react-router-dom";

export default function FooterSection() {
  const currentYear = new Date().getFullYear();

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
        <span>Copyright (c) {currentYear} FuelFinder. All rights reserved.</span>
        <span>Protected under Ethiopian intellectual property rights.</span>
      </div>
    </footer>
  );
}
