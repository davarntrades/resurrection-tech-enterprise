import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Why Runtime Governance? — From Represented Rules to Enforced Operating Boundaries",
  description:
    "Runtime Governance turns an undefined autonomous operating surface into an Admissible Operating Envelope that can be tested, enforced, and evidenced before execution.",
  alternates: { canonical: "/why-runtime-governance" },
};

const SPEND = [
  ["Annual cyber insurance", "Premiums rising year over year — priced on residual risk."],
  ["Regulatory penalties", "Multi-million enforcement actions across jurisdictions."],
  ["GDPR fines", "Up to £530M for a single automated-processing violation (illustrative)."],
  ["Credential breaches", "~£10.22M average cost per breach (illustrative)."],
  ["Autonomous transfer errors", "£2B+ single-event precedent for unauthorised transfers (illustrative)."],
  ["Operational outages", "Downtime, remediation, and recovery costs."],
  ["Reputational damage", "Public incidents that outlast the technical fix."],
  ["Customer trust erosion", "Confidence lost across the customer base after an autonomous failure."],
];

export default function Page() {
  return (
    <PageShell>
      <section className="section section--tight why" aria-label="Why runtime governance">
        <div className="wrap">
          <span className="eyebrow">Why runtime governance</span>
          <h1 className="why-h1">You Cannot Govern An Autonomous System If You Cannot Show Where Safe Operation Ends</h1>
          <p className="why-lede">
            The central problem is not only whether a model can produce a bad output. It is whether,
            in your actual environment, an autonomous system can reach states, tools, data, or actions
            that fall outside the limits you are prepared to accept.
          </p>

          <div className="why-shift reveal">
            <div className="why-shift-col is-after-the-fact">
              <span className="why-shift-k">Without a defined envelope</span>
              <p>Your agents have tools and permissions, but the exact boundary of locally safe operation is implicit, fragmented, or discovered only after something goes wrong.</p>
            </div>
            <div className="why-shift-arrow" aria-hidden="true">→</div>
            <div className="why-shift-col is-before">
              <span className="why-shift-k">With Morrison Runtime Governance</span>
              <p>Map the environment, define the Admissible Operating Envelope, evaluate proposed transitions before execution, and preserve evidence of every ALLOW, ESCALATE, and BLOCK decision.</p>
            </div>
          </div>

          <div className="why-omega reveal">
            <span className="om" aria-hidden="true">Ω</span>
            <div>
              <p className="why-omega-q">The Admissible Operating Envelope is broader than catastrophic-state prevention.</p>
              <p className="why-omega-note">
                The Admissible Operating Envelope defines the validated operating region. <span className="om">Ω</span> remains the explicitly prohibited region inside that geometry — the states the system must not reach within the defined environment.
              </p>
            </div>
          </div>

          <hr className="divider" />

          <div className="section-head reveal">
            <span className="eyebrow">Why the boundary matters financially</span>
            <h2>The cost of prevention is usually smaller than the cost of a boundary violation.</h2>
            <p>
              Organisations already spend heavily managing residual risk after the fact. A locally
              defined and enforceable operating envelope moves part of that control upstream — before
              an autonomous action becomes an incident.
            </p>
          </div>

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

          <div className="why-cta reveal">
            <Link href="/book#assessment" className="btn btn--primary">Book an Operating Envelope Assessment <span className="arr">→</span></Link>
            <Link href="/technology#safety-envelope" className="btn btn--ghost">See how the envelope works</Link>
            <Link href="/case-studies" className="btn btn--ghost">See the evidence</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
