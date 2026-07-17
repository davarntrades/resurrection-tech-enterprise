import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { PricingDisclaimer } from "@/components/PricingDisclaimer";

export const metadata: Metadata = {
  title: "Solutions — Runtime Governance across critical industries",
  description:
    "The governance mechanism remains constant; the Ω domain changes. Runtime Governance applied across finance, healthcare, cybersecurity, data privacy, government, energy, telecommunications, manufacturing, aerospace, and defence.",
  alternates: { canonical: "/solutions" },
};

/** Cross-domain Ω scope — one card per governed vertical. */
const SECTORS: { name: string; omega: string; scope: string[]; scale: string }[] = [
  { name: "Finance / Banking Infrastructure", omega: "Ω · Financial loss", scope: ["Treasury automation", "Payment systems", "Autonomous trading", "Settlement systems"], scale: "£1M–£5M+" },
  { name: "Healthcare / Clinical Systems", omega: "Ω · Patient safety / PHI", scope: ["PHI governance", "Discharge workflows", "Medication authorization", "Clinical AI systems"], scale: "£750K–£3M+" },
  { name: "Cybersecurity / Infrastructure", omega: "Ω · Infrastructure compromise", scope: ["Credential governance", "Shell-execution governance", "Infrastructure orchestration", "Security operations"], scale: "£750K–£3M+" },
  { name: "Data Privacy / Compliance", omega: "Ω · Regulatory breach", scope: ["GDPR runtime enforcement", "FCA compliance", "SOX governance", "Executable regulatory controls"], scale: "£1M–£4M+" },
  { name: "Enterprise Autonomous Systems", omega: "Ω · Operational integrity", scope: ["Internal workflow governance", "Autonomous operations", "Auditability", "Agent orchestration"], scale: "£500K–£2M+" },
  { name: "Insurance / Actuarial Governance", omega: "Ω · Insurability / claims", scope: ["Runtime insurability evidence", "Claims governance", "Risk verification", "Actuarial automation"], scale: "£750K–£3M+" },
  { name: "Government / Public Sector", omega: "Ω · Public-service integrity", scope: ["Citizen services", "Benefits administration", "Regulatory workflows", "Public-sector AI systems"], scale: "£1M–£10M+" },
  { name: "Supply Chain / Logistics", omega: "Ω · Procurement / fulfilment", scope: ["Procurement automation", "Vendor approval", "Inventory orchestration", "Shipping authorization"], scale: "£500K–£5M+" },
  { name: "Energy / Critical Infrastructure", omega: "Ω · Grid stability", scope: ["Grid operations", "Utility automation", "Infrastructure control systems", "Load balancing"], scale: "£1M–£10M+" },
  { name: "Telecommunications / Network Operations", omega: "Ω · Network integrity", scope: ["Network orchestration", "Service provisioning", "Infrastructure management", "Autonomous network operations"], scale: "£500K–£5M+" },
  { name: "Manufacturing / Industrial Automation", omega: "Ω · Production / safety", scope: ["Factory orchestration", "Robotics governance", "Production scheduling", "Quality-control automation"], scale: "£500K–£10M+" },
  { name: "Aerospace / Aviation Systems", omega: "Ω · Flight safety", scope: ["Fleet operations", "Mission planning", "Maintenance automation", "Safety-critical workflows"], scale: "£1M–£25M+" },
  { name: "Defence / Sovereign Infrastructure", omega: "Ω · National security", scope: ["Autonomous coordination", "Classified handling", "Sovereign runtime governance", "Mission-critical infrastructure"], scale: "£5M–£25M+" },
];

export default function Page() {
  return (
    <PageShell>
      <section className="section section--tight sectors" id="domains" data-screen-label="Domains">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Cross-domain capability</span>
            <h1>Runtime Governance across critical industries.</h1>
            <p>
              The governance mechanism remains constant. The Ω domain changes.
              Runtime Governance applies wherever autonomous systems can create
              financial, operational, regulatory, safety, or national-security
              consequences.
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
            Indicative engagement scales represent target deployment categories
            and potential market scope. They are not claims regarding existing
            customers or contracts.
          </p>
          <PricingDisclaimer variant="short" />
        </div>
      </section>

      {/* ===== NEXT STEPS ===== */}
      <section className="section cta-final" aria-label="Next steps">
        <div className="wrap">
          <div className="inner reveal">
            <span className="eyebrow" style={{ justifyContent: "center" }}>Next steps</span>
            <h2 style={{ marginTop: 20 }}>Map your sector&rsquo;s Ω exposure.</h2>
            <p>
              A 48-hour Runtime Safety Assessment identifies which catastrophic states are
              reachable in your systems today — with a domain-specific Ω definition for your sector.
            </p>
            <div className="hero-actions" style={{ marginTop: 38 }}>
              <Link href="/book#assessment" className="btn btn--primary">Book a Runtime Safety Assessment <span className="arr">→</span></Link>
              <Link href="/technology" className="btn btn--ghost">Explore the technology</Link>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
