import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { PricingDisclaimer } from "@/components/PricingDisclaimer";

export const metadata: Metadata = {
  title: "Solutions — Admissible Operating Envelopes across critical industries",
  description:
    "The Admissible Operating Envelope changes with the environment; Morrison Runtime Governance provides independent pre-execution enforcement across critical industries.",
  alternates: { canonical: "/solutions" },
};

/** Cross-domain envelope scope — one card per governed vertical. */
const SECTORS: { name: string; omega: string; scope: string[]; scale: string }[] = [
  { name: "Finance / Banking Infrastructure", omega: "Envelope boundary · Financial authority / Ω loss", scope: ["Treasury automation", "Payment limits & counterparties", "Autonomous trading", "Settlement systems"], scale: "£1M–£5M+" },
  { name: "Healthcare / Clinical Systems", omega: "Envelope boundary · Patient safety / PHI", scope: ["PHI access & disclosure", "Discharge workflows", "Medication authorization", "Clinical AI systems"], scale: "£750K–£3M+" },
  { name: "Cybersecurity / Infrastructure", omega: "Envelope boundary · Privilege / infrastructure compromise", scope: ["Credential governance", "Shell-execution governance", "Infrastructure orchestration", "Security operations"], scale: "£750K–£3M+" },
  { name: "Data Privacy / Compliance", omega: "Envelope boundary · Regulatory breach", scope: ["GDPR runtime enforcement", "FCA compliance", "SOX governance", "Executable regulatory controls"], scale: "£1M–£4M+" },
  { name: "Enterprise Autonomous Systems", omega: "Envelope boundary · Operational integrity", scope: ["Internal workflow governance", "Autonomous operations", "Auditability", "Agent orchestration"], scale: "£500K–£2M+" },
  { name: "Insurance / Actuarial Governance", omega: "Envelope boundary · Insurability / claims", scope: ["Runtime insurability evidence", "Claims governance", "Risk verification", "Actuarial automation"], scale: "£750K–£3M+" },
  { name: "Government / Public Sector", omega: "Envelope boundary · Public-service integrity", scope: ["Citizen services", "Benefits administration", "Regulatory workflows", "Public-sector AI systems"], scale: "£1M–£10M+" },
  { name: "Supply Chain / Logistics", omega: "Envelope boundary · Procurement / fulfilment", scope: ["Procurement automation", "Vendor approval", "Inventory orchestration", "Shipping authorization"], scale: "£500K–£5M+" },
  { name: "Energy / Critical Infrastructure", omega: "Envelope boundary · Grid stability", scope: ["Grid operations", "Utility automation", "Infrastructure control systems", "Load balancing"], scale: "£1M–£10M+" },
  { name: "Telecommunications / Network Operations", omega: "Envelope boundary · Network integrity", scope: ["Network orchestration", "Service provisioning", "Infrastructure management", "Autonomous network operations"], scale: "£500K–£5M+" },
  { name: "Manufacturing / Industrial Automation", omega: "Envelope boundary · Production / physical safety", scope: ["Factory orchestration", "Robotics governance", "Production scheduling", "Quality-control automation"], scale: "£500K–£10M+" },
  { name: "Aerospace / Aviation Systems", omega: "Envelope boundary · Flight safety", scope: ["Fleet operations", "Mission planning", "Maintenance automation", "Safety-critical workflows"], scale: "£1M–£25M+" },
  { name: "Defence / Sovereign Infrastructure", omega: "Envelope boundary · National security", scope: ["Autonomous coordination", "Classified handling", "Sovereign runtime governance", "Mission-critical infrastructure"], scale: "£5M–£25M+" },
];

export default function Page() {
  return (
    <PageShell>
      <section className="section section--tight sectors" id="domains" data-screen-label="Domains">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Cross-domain capability</span>
            <h1>Admissible Operating Envelopes across critical industries.</h1>
            <p>
              The enforcement mechanism remains constant. The Admissible Operating Envelope changes with
              the deployment environment: different tools, permissions, policies, reachable states,
              and consequences. Morrison maps and enforces that boundary wherever autonomous systems
              can create financial, operational, regulatory, safety, or national-security impact.
            </p>
          </div>
          <div className="sectors-grid reveal" data-rowreveal>
            {SECTORS.map((s) => (
              <div className="sector-card" key={s.name}>
                <span className="sector-omega">{s.omega}</span>
                <h3 className="sector-name">{s.name}</h3>
                <ul className="sector-scope">
                  {s.scope.map((x) => <li key={x}>{x}</li>)}
                </ul>
                <div className="sector-scale">
                  <span className="sector-scale-k">Indicative engagement scale</span>
                  <span className="sector-scale-v">{s.scale}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="sectors-note reveal">
            An Admissible Operating Envelope is local and bounded to a specified deployment context. The examples
            above illustrate the kinds of constraints and forbidden regions that differ by sector.
            Indicative engagement scales represent target deployment categories and potential market
            scope, not claims regarding existing customers or contracts.
          </p>
          <PricingDisclaimer variant="short" />
        </div>
      </section>

      {/* ===== NEXT STEPS ===== */}
      <section className="section cta-final" aria-label="Next steps">
        <div className="wrap">
          <div className="inner reveal">
            <span className="eyebrow" style={{ justifyContent: "center" }}>Next steps</span>
            <h2 style={{ marginTop: 20 }}>Map the Admissible Operating Envelope for your environment.</h2>
            <p>
              A 48-hour Operating Envelope Assessment maps the tools, permissions, policies, authority
              boundaries, reachable states, and Ω exposure that define admissible operation for your deployment.
            </p>
            <div className="hero-actions" style={{ marginTop: 38 }}>
              <Link href="/book#assessment" className="btn btn--primary">Book an Operating Envelope Assessment <span className="arr">→</span></Link>
              <Link href="/technology#safety-envelope" className="btn btn--ghost">Explore the technology</Link>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
