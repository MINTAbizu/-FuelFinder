import React from "react";
import SectionHeader from "../components/SectionHeader.jsx";

const integrations = [
  "Telebirr",
  "Chapa",
  "Stripe",
  "Ethiopian Road Fund",
  "Fleet Cards",
  "SMS Gateway",
  "Sentry",
  "Google Maps",
];

export default function IntegrationsSection() {
  return (
    <section className="section integrations" id="integrations">
      <SectionHeader
        eyebrow="Integrations"
        title="Connect every payment, sensor, and finance system"
        subtitle="Plug FuelFinder into the tools you already trust without replacing your accounting stack."
      />
      <div className="chip-grid">
        {integrations.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </section>
  );
}
