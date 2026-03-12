import React from "react";
import SiteNav from "../components/SiteNav.jsx";
import FeaturesSection from "../sections/FeaturesSection.jsx";
import OperationsSection from "../sections/OperationsSection.jsx";
import IntegrationsSection from "../sections/IntegrationsSection.jsx";
import SecuritySection from "../sections/SecuritySection.jsx";
import TestimonialsSection from "../sections/TestimonialsSection.jsx";
import CTASection from "../sections/CTASection.jsx";
import FooterSection from "../sections/FooterSection.jsx";

export default function FeaturesPage() {
  return (
    <div className="landing">
      <SiteNav />
      <main>
        <section className="page-hero">
          <div>
            <span className="eyebrow">Platform overview</span>
            <h1>Every workflow a station needs, without the chaos.</h1>
            <p>
              FuelFinder brings queues, inventory, payments, and staff oversight into one operational
              view built for large daily demand swings.
            </p>
          </div>
        </section>
        <FeaturesSection />
        <OperationsSection />
        <IntegrationsSection />
        <SecuritySection />
        <TestimonialsSection />
        <CTASection />
      </main>
      <FooterSection />
    </div>
  );
}
