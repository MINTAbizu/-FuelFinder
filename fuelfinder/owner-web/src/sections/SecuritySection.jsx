import React from "react";
import SectionHeader from "../components/SectionHeader.jsx";

const safeguards = [
  "Role-based access with audit trails",
  "Shift-level OTP verification",
  "Data residency-ready exports",
  "24/7 monitoring with incident playbooks",
];

export default function SecuritySection() {
  return (
    <section className="section security" id="security">
      <SectionHeader
        eyebrow="Security"
        title="Operate confidently with compliance-grade safeguards"
        subtitle="Protect revenue, staff, and customers with layered controls and tamper-proof logs."
      />
      <div className="security-grid">
        {safeguards.map((item) => (
          <div key={item} className="security-card">
            <span>Secure</span>
            <p>{item}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
