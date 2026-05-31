import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Partner Framework",
  description:
    "Integrators, consultants, sponsors, investors, and institutional references collaborate with Resurrection Tech under controlled licensing terms. Ownership of the Morrison Framework™ is retained.",
  alternates: { canonical: "/partners" },
};

const CARDS = [
  ["Integrators & consultants", "Collaborate on deployment and embedment. Compensated for delivery; no acquisition of governance IP."],
  ["Sponsors & investors", "Participate commercially under written agreement. Ownership of the Morrison Framework™ is retained by Resurrection Tech Ltd."],
  ["Institutional references", "Regulatory, actuarial, and sovereign engagement conducted under controlled licensing terms."],
];

export default function Page() {
  return (
    <PageShell>
      <section className="section" id="partners">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Partner framework</span>
            <h2>Collaboration without dilution of governance IP.</h2>
            <p>Partners extend reach and delivery capacity. Ownership of the framework, engine, and methodology remains with Resurrection Tech Ltd.</p>
          </div>
          <div className="partner-grid">
            {CARDS.map(([h, p], i) => (
              <div className="card partner-card reveal" data-d={i} key={h}>
                <span className="ptag">Partner framework</span>
                <h4>{h}</h4>
                <p>{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
