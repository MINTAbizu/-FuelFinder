import React from "react";
import { Link, NavLink } from "react-router-dom";

const navItems = [
  { label: "Platform", to: "/features" },
  { label: "Pricing", to: "/pricing" },
  { label: "Contact", to: "/contact" },
];

export default function SiteNav({ ctaLabel = "Open Console", ctaHref = "/app" }) {
  return (
    <header className="site-nav">
      <div className="nav-inner">
        <Link to="/" className="brand-mark">
          <span className="brand-dot" />
          <div>
            <p className="brand-title">FuelFinder Owner</p>
            <span className="brand-sub">Operations Command Center</span>
          </div>
        </Link>
        <nav className="nav-links">
          <a href="/#features">Features</a>
          <a href="/#operations">Operations</a>
          <a href="/#insights">Insights</a>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="nav-actions">
          <a className="ghost-link" href="/#contact">
            Talk to us
          </a>
          <Link className="primary-btn" to={ctaHref}>
            {ctaLabel}
          </Link>
        </div>
        <details className="nav-drawer">
          <summary>Menu</summary>
          <div className="drawer-panel">
            <a href="/#features">Features</a>
            <a href="/#operations">Operations</a>
            <a href="/#insights">Insights</a>
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to}>
                {item.label}
              </NavLink>
            ))}
            <Link className="primary-btn" to={ctaHref}>
              {ctaLabel}
            </Link>
          </div>
        </details>
      </div>
    </header>
  );
}
