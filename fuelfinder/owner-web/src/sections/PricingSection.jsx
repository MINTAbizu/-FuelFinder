import React from "react";
import SectionHeader from "../components/SectionHeader.jsx";

const tiers = [
  {
    name: "Launch",
    price: "ETB 12,500",
    note: "per station / month",
    points: ["Queue + inventory", "2 manager seats", "Weekly insights"],
  },
  {
    name: "Scale",
    price: "ETB 24,000",
    note: "per station / month",
    points: ["Live pricing", "8 manager seats", "Payments analytics", "Priority support"],
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    note: "multi-city operations",
    points: ["Dedicated success lead", "Custom integrations", "Advanced compliance pack"],
  },
];

export default function PricingSection() {
  return (
    <section className="section pricing" id="pricing">
      <SectionHeader
        eyebrow="Pricing"
        title="Plans that scale from one station to a nationwide network"
        subtitle="Transparent pricing with no setup fees. Upgrade anytime as your network grows."
      />
      <div className="pricing-grid">
        {tiers.map((tier) => (
          <article key={tier.name} className={tier.featured ? "price-card featured" : "price-card"}>
            <div>
              <h3>{tier.name}</h3>
              <p className="price">{tier.price}</p>
              <span className="price-note">{tier.note}</span>
            </div>
            <ul>
              {tier.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <a className={tier.featured ? "primary-btn" : "secondary-btn"} href="#contact">
              {tier.featured ? "Book onboarding" : "Talk to sales"}
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
