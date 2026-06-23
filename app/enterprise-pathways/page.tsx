import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { ConsultationSection } from "@/components/ConsultationSection";

export const metadata: Metadata = {
  title: "Enterprise Pathways",
  description:
    "Ways to engage Resurrection Tech: the Paid Discovery Workshop, the 48-Hour Runtime Governance Audit, the Limited Pilot, the Advisory Retainer, and Partner & Licensing pathways (Strategic Distribution, Managed Governance Partner, and Embedded Runtime Governance Licensing). Priced against the cost of Ω becoming reachable.",
  alternates: { canonical: "/enterprise-pathways" },
};

const Cross = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M3 3 L11 11 M11 3 L3 11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);
const Check = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 8.5 L6.5 12 L13 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

type Verdict = {
  id: string;
  request: string;
  state: "blocked" | "allowed";
  verdict: string;
  reason: string;
  layer: string;
};

const VERDICTS: Verdict[] = [
  {
    id: "001",
    request: "Transfer £25,000 to external account",
    state: "blocked",
    verdict: "BLOCKED",
    reason: "Reachable trajectory intersects Ω",
    layer: "V3 Reachability Projection",
  },
  {
    id: "002",
    request: "Export customer database",
    state: "blocked",
    verdict: "BLOCKED",
    reason: "Data-exfiltration path reaches forbidden state",
    layer: "V5 Runtime Governance",
  },
  {
    id: "003",
    request: "Generate monthly compliance report",
    state: "allowed",
    verdict: "ALLOWED",
    reason: "Trajectory remains within admissible set",
    layer: "A_safe",
  },
  {
    id: "004",
    request: "Read internal policy document",
    state: "allowed",
    verdict: "ALLOWED",
    reason: "No reachable path to Ω detected",
    layer: "A_safe",
  },
];

const PATHWAYS = [
  ["Paid Discovery Workshop™", "Structured scoping before an audit, pilot, or integration", "1–2 days", "£5K–£50K+"],
  ["48-Hour Runtime Governance Audit", "Catastrophic trajectory exposure assessment", "48 hours", "£40K–£75K"],
  ["Limited Pilot", "Staging deployment & operational governance integration", "4–8 weeks", "£250K–£750K+"],
  ["Advisory Retainer", "Ongoing Ω governance, threat-surface monitoring, runtime governance maintenance, incident review & model/planner revalidation", "Monthly", "£35K–£100K/mo"],
];

export default function Page() {
  return (
    <PageShell>
      <section className="section" id="pathways">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Enterprise pathways</span>
            <h2>Ways to engage.</h2>
            <p>The Paid Discovery Workshop defines scope. The audit measures exposure. The pilot is validation. The integration is operational embedment. The retainer is ongoing assurance.</p>
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

          <div className="retainer-note reveal" data-d="1">
            <span className="rn-k">Why the retainer exists — Ω is not static</span>
            <p className="rn-eq"><b>ℛ(t) ∩ Ω = ∅</b></p>
            <p className="rn-t">
              The objective remains unchanged. But Ω must remain aligned with the
              client&rsquo;s evolving environment — as systems, tools, models,
              regulations, and attack surfaces change. <b>Ω governance</b> is the
              continuous work of reviewing and updating the definition of forbidden
              states, validating that runtime constraints still reflect operational
              reality, and ensuring no new reachable trajectories have emerged through
              system updates, new tools, model changes, workflow changes, or regulatory
              requirements.
            </p>
          </div>
        </div>
      </section>

      {/* ===== PAID DISCOVERY WORKSHOP (new tier: scoping before audit) ===== */}
      <section className="section section--tight" id="discovery-workshop">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">New engagement tier</span>
            <h2>Paid Discovery Workshop™</h2>
            <p>For teams that need structured scoping before an audit, pilot, or integration.</p>
          </div>

          <div className="dw-intro reveal" data-d="1">
            <p>
              This workshop goes deeper than a discovery call. We review the organisation&rsquo;s
              agent architecture, tool inventory, data flows, compliance requirements, multi-agent
              interactions, existing controls, and deployment plans.
            </p>
          </div>

          <div className="scale-grid">
            <div className="scale-col is reveal">
              <h3>What we review</h3>
              {[
                "Agent architecture",
                "Tool inventories",
                "Data flows",
                "Compliance requirements",
                "Multi-agent interactions",
                "Existing controls",
                "Deployment plans",
              ].map((t) => (
                <div className="scale-li" key={t}>
                  <span className="ic">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8.5 L6.5 12 L13 4" stroke="#6f97ff" strokeWidth="1.6" /></svg>
                  </span>
                  <span className="txt">{t}</span>
                </div>
              ))}
            </div>
            <div className="scale-col is reveal" data-d="1">
              <h3>Deliverables</h3>
              {[
                "Risk summary",
                "Recommended pathway",
                "Preliminary Ω exposure analysis",
                "Commercial proposal",
              ].map((t) => (
                <div className="scale-li" key={t}>
                  <span className="ic">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8.5 L6.5 12 L13 4" stroke="#6f97ff" strokeWidth="1.6" /></svg>
                  </span>
                  <span className="txt">{t}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="dw-range reveal" data-d="1">
            <span className="dw-range-k">Typical range</span>
            <div className="tbl-wrap" data-rowreveal>
              <table className="tbl">
                <thead>
                  <tr><th>Organisation</th><th>Typical range</th></tr>
                </thead>
                <tbody>
                  <tr><td data-l="Organisation" className="t-main">Small company</td><td data-l="Typical range" className="t-price">£5K–£15K</td></tr>
                  <tr><td data-l="Organisation" className="t-main">Mid-market</td><td data-l="Typical range" className="t-price">£15K–£25K</td></tr>
                  <tr><td data-l="Organisation" className="t-main">Enterprise</td><td data-l="Typical range" className="t-price">£25K–£50K+</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="dw-ladder reveal" data-d="1">
            <span className="dw-ladder-k">Where it sits in the ladder</span>
            <ol>
              <li><b>Free discovery</b> helps determine whether there is a fit.</li>
              <li><b>The Paid Discovery Workshop</b> helps define the scope.</li>
              <li><b>The Audit</b> measures exposure.</li>
              <li><b>The Pilot</b> validates Runtime Governance in the client environment.</li>
              <li><b>Integration</b> deploys governance into production.</li>
            </ol>
          </div>

          <p className="dw-note reveal" data-d="1">
            The workshop is <b>optional and never mandatory</b>. The questionnaire remains the
            primary qualification mechanism — if sufficient information is already available, we can
            move directly into an Audit, Pilot, or Integration discussion. In some cases,
            Resurrection Tech may recommend exactly that.
          </p>

          <div className="hero-actions reveal" style={{ marginTop: 40 }}>
            <Link href="/book#workshop" className="btn btn--primary">Book Discovery Workshop <span className="arr">→</span></Link>
            <Link href="/contact" className="btn btn--ghost">Discuss Workshop Scope</Link>
          </div>
        </div>
      </section>

      {/* ===== PARTNER & LICENSING PATHWAYS (channel / OEM motion) ===== */}
      <section className="section section--tight" id="partner-licensing">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Partner &amp; licensing pathways</span>
            <h2>Bring Runtime Governance to your own customers.</h2>
            <p>
              For firms that want to package, resell, embed, or distribute Runtime Governance — not
              only deploy it internally. Commercial terms are set by assessment, not fixed public pricing.
            </p>
          </div>

          <div className="plp-grid reveal" data-d="1">
            {[
              {
                title: "Strategic Distribution Partner™",
                pos: "Qualified enterprise introductions and strategic market access.",
                terms: "Partnership-dependent",
                cta: "Discuss Partnership",
                href: "/contact",
              },
              {
                title: "Managed Governance Partner™",
                pos: "Runtime Governance packaged into MSP, MSSP, cybersecurity, compliance, or AI assurance services.",
                terms: "By assessment / commercial review",
                cta: "Discuss Partnership",
                href: "/contact",
              },
              {
                title: "Embedded Runtime Governance Licensing™",
                pos: "Runtime Governance embedded into platforms, products, or customer-facing AI infrastructure.",
                terms: "Partnership-dependent",
                cta: "Discuss Licensing",
                href: "/contact",
              },
            ].map((c) => (
              <div className="plp-card" key={c.title}>
                <h3 className="plp-title">{c.title}</h3>
                <p className="plp-pos">{c.pos}</p>
                <div className="plp-foot">
                  <span className="plp-terms"><span className="plp-terms-k">Commercial</span>{c.terms}</span>
                  <Link href={c.href} className="btn btn--ghost btn--sm">{c.cta} <span className="arr">→</span></Link>
                </div>
              </div>
            ))}
          </div>

          <p className="dw-note reveal" data-d="1">
            Selecting a partner, channel, or licensing option in the{" "}
            <Link href="/assessment">Runtime Governance Assessment</Link> routes you to the matching
            pathway. Pricing for these motions is partnership-dependent and confirmed after a
            commercial review.
          </p>
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
            <Link href="/assessment" className="btn btn--primary">Assess Your Agent <span className="arr">→</span></Link>
            <Link href="/book#assessment" className="btn btn--ghost">Book a Runtime Safety Assessment</Link>
          </div>
        </div>
      </section>

      {/* ===== RUNTIME GOVERNANCE IN ACTION (operational console) ===== */}
      <section className="section section--tight" id="governance-in-action" data-screen-label="Governance in action">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="rgc-status"><span className="d" aria-hidden="true" /> Morrison Runtime Governance · live evaluation</span>
            <span className="eyebrow">Runtime governance in action</span>
            <h2>See the decision before the action.</h2>
            <p>
              The governance layer evaluates executable trajectories before tool execution.
              Unsafe futures are blocked before they occur. Safe workflows continue uninterrupted.
            </p>
          </div>

          <div className="rgc-grid">
            {VERDICTS.map((v) => (
              <div className={`rgc-card ${v.state}`} key={v.id}>
                <div className="rgc-top">
                  <span className="rgc-dot" aria-hidden="true" />
                  <span className="rgc-tt">Runtime verdict</span>
                  <span className="rgc-id">#{v.id}</span>
                </div>
                <div className="rgc-body">
                  <div className="rgc-line reveal" data-d="1">
                    <span className="rgc-k">Request</span>
                    <span className="rgc-v">{v.request}</span>
                  </div>
                  <div className="rgc-line reveal" data-d="2">
                    <span className="rgc-k">Verdict</span>
                    <span className="rgc-verdict">
                      {v.state === "blocked" ? <Cross /> : <Check />} {v.verdict}
                    </span>
                  </div>
                  <div className="rgc-line reveal" data-d="3">
                    <span className="rgc-k">Reason</span>
                    <span className="rgc-v">{v.reason}</span>
                  </div>
                  <div className="rgc-line reveal" data-d="4">
                    <span className="rgc-k">Layer</span>
                    <span className="rgc-layer">{v.layer}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="rgc-result reveal">
            <div>
              <div className="rgc-result-k">Result</div>
              <ul className="rgc-rows">
                {[
                  "Safe workflows continue",
                  "Unsafe trajectories intercepted",
                  "Governance occurs before execution",
                ].map((r) => (
                  <li key={r}><span className="ck"><Check /></span>{r}</li>
                ))}
                <li><span className="ck"><Check /></span>Objective maintained</li>
              </ul>
            </div>
            <div className="rgc-eq" aria-label="R of t intersect Omega equals the empty set">
              <span className="lab">Invariant</span>
              ℛ(t) ∩ <b>Ω</b> = ∅
            </div>
          </div>
        </div>
      </section>

      <ConsultationSection
        eyebrow="Schedule a call"
        heading="Book a consultation."
        blurb="Move from pathways to a conversation. Pick the session that matches where you are — discovery, a runtime safety assessment, or an enterprise governance strategy session."
      />
    </PageShell>
  );
}
