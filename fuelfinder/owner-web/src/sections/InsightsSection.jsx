import React from "react";
import SectionHeader from "../components/SectionHeader.jsx";

const metrics = [
  { label: "Average wait time", value: "11.4 min", trend: "-18%" },
  { label: "Daily throughput", value: "3,820 vehicles", trend: "+12%" },
  { label: "Inventory accuracy", value: "98.7%", trend: "+4%" },
];

export default function InsightsSection() {
  return (
    <section className="section insights" id="insights">
      <SectionHeader
        eyebrow="Insights"
        title="See queue health, revenue, and compliance in one place"
        subtitle="Interactive dashboards highlight anomalies before they disrupt station flow."
      />
      <div className="insight-grid">
        <div className="insight-panel">
          <h3>Live performance board</h3>
          <div className="metric-list">
            {metrics.map((metric) => (
              <div key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <em>{metric.trend}</em>
              </div>
            ))}
          </div>
          <div className="bars" aria-hidden="true">
            <span style={{ height: "64%" }} />
            <span style={{ height: "90%" }} />
            <span style={{ height: "72%" }} />
            <span style={{ height: "52%" }} />
            <span style={{ height: "78%" }} />
          </div>
        </div>
        <div className="insight-cards">
          <article>
            <h4>Exception alerts</h4>
            <p>Instantly flag out-of-pattern ticketing, no-show payments, or inventory mismatches.</p>
          </article>
          <article>
            <h4>Board-ready reports</h4>
            <p>Export KPI packs in PDF or CSV for regulators, partners, and finance teams.</p>
          </article>
          <article>
            <h4>Demand forecasting</h4>
            <p>Project the next 72 hours of volume with weather and local event overlays.</p>
          </article>
        </div>
      </div>
    </section>
  );
}
