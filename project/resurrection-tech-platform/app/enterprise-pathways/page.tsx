import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Enterprise Pathways",
  description:
    "Three ways to engage Resurrection Tech: the 48-Hour Runtime Governance Audit, the Structural Safety Pilot, and the Advisory Retainer. Priced against the cost of Ω becoming reachable.",
  alternates: { canonical: "/enterprise-pathways" },
};

const PATHWAYS = [
  ["48-Hour Runtime Governance Audit", "Catastrophic trajectory exposure assessment", "48 hours", "£40K–£75K"],
  ["Structural Safety Pilot", "Staging deployment & operational governance integration", "4–8 weeks", "£250K–£750K+"],
  ["Advisory Retainer", "Ongoing Ω evolution, threat-surface monitoring, incident review & model/planner revalidation", "Monthly", "£35K–£100K/mo"],
];

export default function Page() {
  return (
    <PageShell>
      <section className="section" id="pathways">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Enterprise pathways</span>
            <h2>Three ways to engage.</h2>
            <p>The audit is the entry point. The pilot is validation. The integration is operational embedment. The retainer is ongoing assurance.</p>
          </div>
          <div className="tbl-wrap reveal" data-rowreveal>
            <table className="tbl">
              <thead>
                <tr><th>Pathway</th><th>Positioned as</th><th>Timeline</th><th>Investment</th></tr>
              </thead>
              <tbody>
                {PATHWAYS.map(([p, pos, t, inv]) => (
                  <tr key={p}>
                    <td data-l="Pathway" className="t-main">{p}</td>
                    <td data-l="Positioned as">{pos}</td>
                    <td data-l="Timeline" className="t-time">{t}</td>
                    <td data-l="Investment" className="t-price">{inv}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section section--tight" id="pricing-logic">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Why pricing scales</span>
            <h2>Priced against the cost of Ω becoming reachable.</h2>
            <p>Not against the complexity of the software. Pricing is proportional to consequence, not to effort.</p>
          </div>
          <div className="scale-grid">
            <div className="scale-col is reveal">
              <h3>Proportional to</h3>
              {["Operational blast radius", "Regulatory exposure", "Infrastructure criticality", "Catastrophic downside", "Consequence of Ω becoming reachable"].map((t) => (
                <div className="scale-li" key={t}>
                  <span className="ic">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8.5 L6.5 12 L13 4" stroke="#6f97ff" strokeWidth="1.6" /></svg>
                  </span>
                  <span className="txt">{t}</span>
                </div>
              ))}
            </div>
            <div className="scale-col not reveal" data-d="1">
              <h3>Not</h3>
              {["Hours worked", "Dashboard complexity", "Software complexity", "Per-seat SaaS economics"].map((t) => (
                <div className="scale-li" key={t}>
                  <span className="ic">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3 L11 11 M11 3 L3 11" stroke="#474e58" strokeWidth="1.4" /></svg>
                  </span>
                  <span className="txt">{t}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="hero-actions reveal" style={{ marginTop: 44 }}>
            <Link href="/request-audit" className="btn btn--primary">Request 48-Hour Audit <span className="arr">→</span></Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
