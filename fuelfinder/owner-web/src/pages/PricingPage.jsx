import React from "react";
import SiteNav from "../components/SiteNav.jsx";
import PricingSection from "../sections/PricingSection.jsx";
import FAQSection from "../sections/FAQSection.jsx";
import CTASection from "../sections/CTASection.jsx";
import FooterSection from "../sections/FooterSection.jsx";

export default function PricingPage() {
  return (
    <div className="landing">
      <SiteNav />
      <main>
        <section className="page-hero">
          <div>
            <span className="eyebrow">Pricing</span>
            <h1>Flexible plans designed for single sites and national networks.</h1>
            <p>Start with one station, then scale to every location as your network grows.</p>
          </div>
        </section>
        <PricingSection />
        <FAQSection />
        <CTASection />
      </main>
      <FooterSection />
    </div>
  );
}
