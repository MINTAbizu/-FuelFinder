import React from "react";
import SectionHeader from "../components/SectionHeader.jsx";

const features = [
  {
    title: "Queue orchestration",
    copy: "Predictive wait times, smart ticket calling, and lane balancing that reduce idle time.",
  },
  {
    title: "Live inventory map",
    copy: "See fuel levels by station, tank, and shift with automatic variance alerts.",
  },
  {
    title: "Instant price pushes",
    copy: "Deploy price updates and promos to every pump in under 30 seconds.",
  },
  {
    title: "Multi-role access",
    copy: "Delegate permissions for cashiers, supervisors, and regional managers.",
  },
  {
    title: "Fraud protection",
    copy: "Detect duplicate tickets and prevent unauthorized fueling with OTP checks.",
  },
  {
    title: "Smart reporting",
    copy: "Automated daily summaries and board-ready KPI exports.",
  },
];

export default function FeaturesSection() {
  return (
    <section className="section" id="features">
      <SectionHeader
        eyebrow="Core platform"
        title="Everything owners need to run a high-volume station"
        subtitle="Replace manual logs with a single live system that keeps your teams, queues, and revenue synchronized."
      />
      <div className="feature-grid">
        {features.map((feature) => (
          <article key={feature.title} className="feature-card">
            <h3>{feature.title}</h3>
            <p>{feature.copy}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
