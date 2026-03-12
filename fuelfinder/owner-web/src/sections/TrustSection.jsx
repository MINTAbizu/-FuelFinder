import React from "react";

const logos = ["NOC", "TotalEnergies", "Oilibya", "Han Gas", "Sheger Fuel", "Nyala Energy"];

export default function TrustSection() {
  return (
    <section className="trust" aria-label="Trusted by operators">
      <p>Trusted by multi-site fuel operators across East Africa</p>
      <div className="logo-row">
        {logos.map((logo) => (
          <span key={logo}>{logo}</span>
        ))}
      </div>
    </section>
  );
}
