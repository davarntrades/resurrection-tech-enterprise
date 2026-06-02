import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Why Runtime Governance?",
  description:
    "Organisations already spend millions managing risk after the fact. Runtime Governance identifies catastrophic reachable states before execution.",
  alternates: { canonical: "/why-runtime-governance" },
};

const SPEND = [
  ["Annual cyber insurance", "Premiums rising year over year — priced on residual risk."],
  ["Regulatory penalties", "Multi-million enforcement actions across jurisdictions."],
  ["GDPR fines", "Up to £530M for a single automated-processing violation (illustrative)."],
  ["Credential breaches", "~£10.22M average cost per breach (illustrative)."],
  ["Autonomous transfer errors", "£2B+ single-event precedent for unauthorised transfers (illustrative)."],
  ["Operational outages", "Downtime, remediation, and recovery costs."],
];

export default function Page() {
  return (
    <PageShell>
      <section className="section section--tight why" aria-label="Why runtime governance">
        <div className="wrap">
          <span className="eyebrow">Why runtime governance</span>
          <h1 className="why-h1">The Cost Of Prevention Is Usually Smaller Than The Cost Of Failure</h1>
          <p className="why-lede">
            Organisations already spend millions managing risk — after the fact. The categories below
            are budgeted every year on the assumption that something will eventually go wrong.
          </p>

          <div className="why-grid reveal">
            {SPEND.map(([h, p]) => (
              <div className="why-card" key={h}>
                <span className="why-card-dot" aria-hidden="true" />
                <div>
                  <div className="why-card-h">{h}</div>
                  <div className="why-card-p">{p}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="why-illus reveal">Figures are illustrative industry references, not guarantees.</p>

          <hr className="divider" />

          <div className="why-shift reveal">
            <div className="why-shift-col is-after-the-fact">
              <span className="why-shift-k">Today — after the fact</span>
              <p>Insurance, penalties, breach response, and recovery — paid once the catastrophic outcome has already occurred.</p>
            </div>
            <div className="why-shift-arrow" aria-hidden="true">→</div>
            <div className="why-shift-col is-before">
              <span className="why-shift-k">Runtime Governance — before execution</span>
              <p>Identify the catastrophic reachable states in your system and intercept the trajectories that lead to them — before any action runs.</p>
            </div>
          </div>

          <div className="why-omega reveal">
            <span className="om" aria-hidden="true">Ω</span>
            <p className="why-omega-q">What is the cost if <span className="om">Ω</span> becomes reachable?</p>
          </div>

          <div className="why-cta reveal">
            <Link href="/book#assessment" className="btn btn--primary">Book a Runtime Safety Assessment <span className="arr">→</span></Link>
            <Link href="/case-studies" className="btn btn--ghost">See the evidence</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
