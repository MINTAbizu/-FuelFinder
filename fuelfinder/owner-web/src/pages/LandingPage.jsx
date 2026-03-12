import React from "react";
import SiteNav from "../components/SiteNav.jsx";
import HeroSection from "../sections/HeroSection.jsx";
import TrustSection from "../sections/TrustSection.jsx";
import FeaturesSection from "../sections/FeaturesSection.jsx";
import OperationsSection from "../sections/OperationsSection.jsx";
import InsightsSection from "../sections/InsightsSection.jsx";
import IntegrationsSection from "../sections/IntegrationsSection.jsx";
import SecuritySection from "../sections/SecuritySection.jsx";
import TestimonialsSection from "../sections/TestimonialsSection.jsx";
import PricingSection from "../sections/PricingSection.jsx";
import FAQSection from "../sections/FAQSection.jsx";
import CTASection from "../sections/CTASection.jsx";
import FooterSection from "../sections/FooterSection.jsx";

export default function LandingPage() {
  return (
    <div className="landing">
      <SiteNav />
      <main>
        <HeroSection />
        <TrustSection />
        <FeaturesSection />
        <OperationsSection />
        <InsightsSection />
        <IntegrationsSection />
        <SecuritySection />
        <TestimonialsSection />
        <PricingSection />
        <FAQSection />
        <CTASection />
      </main>
      <FooterSection />
    </div>
  );
}
