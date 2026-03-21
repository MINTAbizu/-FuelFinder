import React from "react";
import SiteNav from "../components/SiteNav.jsx";
import FooterSection from "../sections/FooterSection.jsx";

export default function ContactPage() {
  return (
    <div className="landing">
      <SiteNav />
      <main>
        <section className="page-hero">
          <div>
            <span className="eyebrow">Contact</span>
            <h1>Talk with the FuelFinder owner success team.</h1>
            <p>Tell us about your stations and we will craft a rollout plan within 24 hours.</p>
          </div>
        </section>
        <section className="section contact">
          <div className="contact-grid">
            <div>
              <h2>Get a tailored rollout plan</h2>
              <p>
                Share your network size, locations, and preferred payment rails. We will build an
                onboarding schedule and pricing estimate for your team.
              </p>
              <div className="contact-list">
                <div>
                  <span>Sales</span>
                  <strong>owners@fuelfinder.app</strong>
                </div>
                <div>
                  <span>Support</span>
                  <strong>support@fuelfinder.app</strong>
                </div>
                <div>
                  <span>Hotline</span>
                  <strong>+251 11 555 5555</strong>
                </div>
              </div>
            </div>
            <form className="contact-form">
              <label>
                Full name
                <input type="text" name="name" placeholder="Your name" />
              </label>
              <label>
                Work email
                <input type="email" name="email" placeholder="name@company.com" />
              </label>
              <label>
                Network size
                <select name="size" defaultValue="1-3">
                  <option value="1-3">1-3 stations</option>
                  <option value="4-10">4-10 stations</option>
                  <option value="11-30">11-30 stations</option>
                  <option value="30+">30+ stations</option>
                </select>
              </label>
              <label>
                Message
                <textarea name="message" rows="4" placeholder="Tell us about your operations" />
              </label>
              <button type="submit" className="primary-btn">
                Request a demo
              </button>
            </form>
          </div>
        </section>
      </main>
      <FooterSection />
    </div>
  );
}
