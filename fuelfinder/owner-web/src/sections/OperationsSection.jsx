import React from "react";
import SectionHeader from "../components/SectionHeader.jsx";

const steps = [
  {
    title: "Morning prep",
    copy: "Auto-assign staffing levels, sync fuel deliveries, and publish opening inventory.",
  },
  {
    title: "Peak-hour control",
    copy: "Trigger queue throttling, lane rebalancing, and SMS updates to drivers.",
  },
  {
    title: "Payments + settlement",
    copy: "Instant visibility into cash, telebirr, and card transactions by shift.",
  },
  {
    title: "End-of-day close",
    copy: "Audit stock variance, approve payouts, and export compliance reports.",
  },
];

export default function OperationsSection() {
  return (
    <section className="section ops" id="operations">
      <SectionHeader
        eyebrow="Operations suite"
        title="A playbook for every shift, built into the console"
        subtitle="Guided workflows keep teams aligned, even during high-demand surges and fuel shortages."
      />
      <div className="ops-grid">
        <div className="ops-panel">
          <h3>Shift command timeline</h3>
          <p>
            The owner console turns every station into a predictable operating system. Managers see
            only the actions that matter for the current hour.
          </p>
          <ul>
            <li>Queue capacity control with auto-call thresholds</li>
            <li>Automated SMS alerts for reserve tickets</li>
            <li>Fuel variance flags before close-out</li>
          </ul>
        </div>
        <div className="ops-steps">
          {steps.map((step, index) => (
            <div key={step.title} className="ops-step">
              <span>0{index + 1}</span>
              <div>
                <h4>{step.title}</h4>
                <p>{step.copy}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
