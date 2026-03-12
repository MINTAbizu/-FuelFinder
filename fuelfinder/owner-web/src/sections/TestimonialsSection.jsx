import React from "react";
import SectionHeader from "../components/SectionHeader.jsx";

const testimonials = [
  {
    quote:
      "We reduced queue chaos in three days. Managers finally see the whole picture before peak hours hit.",
    name: "Selam B.",
    role: "Regional Operations Lead",
  },
  {
    quote:
      "The fuel variance alerts pay for themselves. We caught two leak issues in the first month.",
    name: "Abel K.",
    role: "Station Owner",
  },
  {
    quote:
      "We now publish price changes to 14 stations in minutes, not hours.",
    name: "Marta G.",
    role: "Commercial Director",
  },
];

export default function TestimonialsSection() {
  return (
    <section className="section testimonials" id="testimonials">
      <SectionHeader
        eyebrow="Operator feedback"
        title="Built with high-volume stations in mind"
        subtitle="Owners and managers rely on FuelFinder to stay ahead of demand spikes."
      />
      <div className="testimonial-grid">
        {testimonials.map((item) => (
          <article key={item.name}>
            <p>"{item.quote}"</p>
            <div>
              <strong>{item.name}</strong>
              <span>{item.role}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

