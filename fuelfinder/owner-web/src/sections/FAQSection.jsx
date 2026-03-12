import React from "react";
import SectionHeader from "../components/SectionHeader.jsx";

const faqs = [
  {
    q: "How fast can we go live?",
    a: "Most stations go live in 7 days. We configure roles, import inventory baselines, and train staff in a single week.",
  },
  {
    q: "Do drivers need the FuelFinder app?",
    a: "Yes, drivers use the FuelFinder app for queue tickets and payment flow. Owners stay in the console.",
  },
  {
    q: "Can we integrate with our accounting system?",
    a: "We support exports and custom API hooks. Our team can map FuelFinder data to your ERP or finance tools.",
  },
  {
    q: "Is offline mode supported?",
    a: "Stations can continue to issue tickets offline and auto-sync once connectivity resumes.",
  },
];

export default function FAQSection() {
  return (
    <section className="section faq" id="faq">
      <SectionHeader
        eyebrow="FAQ"
        title="Everything owners ask before rollout"
        subtitle="If you have more questions, the team is ready to help." 
      />
      <div className="faq-list">
        {faqs.map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
