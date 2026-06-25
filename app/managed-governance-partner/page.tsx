import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { PricingDisclaimer } from "@/components/PricingDisclaimer";

export const metadata: Metadata = {
  title: "Managed Governance Partner™",
  description:
    "A Managed Governance Partner™ integrates Resurrection Tech's pre-execution Runtime Governance into their existing cybersecurity, compliance, AI assurance, or managed services — so their customers gain runtime AI safety while continuing to work with the partner. For MSSPs, cybersecurity consultancies, compliance firms, AI assurance providers, and managed service providers.",
  alternates: { canonical: "/managed-governance-partner" },
};

const Check = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 8.5 L6.5 12 L13 4" stroke="#e0a93f" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const WHO = [
  ["MSSPs", "Add pre-execution AI governance to managed detection, response, and security operations."],
  ["Cybersecurity consultancies", "Extend advisory and assessment work into agentic-AI risk and runtime control."],
  ["Compliance firms", "Turn EU AI Act, SOC 2, and governance frameworks into enforced runtime controls."],
  ["AI assurance providers", "Back assurance claims with attested, pre-execution governance evidence."],
  ["Managed service providers", "Offer governed AI agents as a managed capability inside existing contracts."],
  ["Security operations providers", "Govern what agents can do at the tool-dispatch boundary, before execution."],
];

const JOURNEY = [
  ["Discovery call", "We confirm fit, your service model, and where Runtime Governance adds value for your customers."],
  ["Optional Partner Discovery Workshop™", "Structured scoping of integration surface, customer profiles, and deployment model where useful."],
  ["Technical validation / Limited Pilot™", "Where appropriate, validate governance against real workflows before broader rollout."],
  ["Partner onboarding", "Commercial agreement, enablement, and access to the Runtime Governance platform and documentation."],
  ["API integration", "Integrate the Runtime Governance API into your platform or your customers' agent stack."],
  ["Customer deployment", "Roll out to your customers under your brand and relationship; governance runs behind the scenes."],
  ["Ongoing support & commercial growth", "Continuous governance updates, partner support, and expansion across your customer base."],
];

const RT_PROVIDES = [
  "Runtime Governance API",
  "Technical onboarding",
  "Integration guidance",
  "Documentation",
  "Governance updates",
  "Commercial enablement",
  "Partner support",
];

const PARTNER_PROVIDES = [
  "Customer relationships",
  "Sales",
  "Deployment",
  "Customer success",
  "First-line support",
  "Managed security services",
];

const STORY: { t: string; k?: string; tone?: "key" | "gov" }[] = [
  { t: "Manufacturing company", k: "Customer" },
  { t: "Needs AI governance for autonomous agents." },
  { t: "Already works with ABC Cybersecurity (MSSP)." },
  { t: "ABC Cybersecurity becomes a Managed Governance Partner™.", tone: "key" },
  { t: "ABC integrates the Resurrection Tech Runtime Governance API." },
  { t: "The manufacturing company continues buying from ABC." },
  { t: "Runtime Governance runs invisibly behind the scenes.", tone: "gov" },
  { t: "ABC invoices the customer." },
  { t: "ABC keeps the customer relationship." },
  { t: "Resurrection Tech provides the governance platform.", tone: "key" },
];

const COMMERCIAL = [
  ["Partner onboarding", "One-time integration, enablement, and access setup.", "£10K–£35K+"],
  ["Annual platform access", "Runtime Governance API, governance updates, and partner support.", "£25K–£75K+ / yr"],
  ["Per-customer commercial bands", "Scales with each customer's reach and deployment.", "Banded by reach / volume"],
  ["Minimum annual commitment", "Baseline annual commitment for the partnership.", "By commercial review"],
];

const INTEGRATION: { h: string; desc: string; flow: string; commercial: string; bestFor: string; warn?: string }[] = [
  {
    h: "Hosted API Model",
    desc: "The partner or customer sends agent plans, tool calls, or proposed actions to the Resurrection Tech Runtime Governance API.",
    flow: "Partner / customer agent → Runtime Governance API → ALLOW / BLOCK / ESCALATE → partner / customer system executes or stops",
    commercial: "Setup + monthly / annual licence + usage / support.",
    bestFor: "Partners who want the fastest route to validation and deployment without hosting governance infrastructure themselves.",
  },
  {
    h: "Private Deployment",
    desc: "Resurrection Tech deploys the governance layer inside the customer's cloud, private environment, or approved infrastructure.",
    flow: "Customer infrastructure → Runtime Governance container / service → governed tool execution",
    commercial: "Integration fee + annual licence + support.",
    bestFor: "Regulated customers and sensitive environments — private cloud, healthcare, finance, defence, or enterprise deployments where data residency, compliance, or infrastructure control matters.",
  },
  {
    h: "Embedded / Licensing Model",
    desc: "The partner packages Runtime Governance into their own MSP / MSSP, compliance, AI assurance, or managed security service.",
    flow: "Partner product / service → embedded Runtime Governance → governed customer agents",
    commercial: "Annual licence + per-customer commercial bands + minimum annual commitment + audit rights.",
    bestFor: "MSSPs, cybersecurity companies, compliance firms, AI assurance providers, and platform vendors that want to offer Runtime Governance to customers while Resurrection Tech retains ownership of the engine.",
    warn: "This does not mean handing over unrestricted code. Resurrection Tech licenses Runtime Governance under commercial terms that preserve ownership, audit rights, usage reporting, and deployment boundaries.",
  },
];

const OWNERSHIP_NOTE =
  "Resurrection Tech retains ownership of the Runtime Governance engine, governance logic, intellectual property, updates, and core infrastructure. Partners receive commercial rights to use, deploy, package, or integrate Runtime Governance only under agreed terms. Usage reporting, audit rights, and deployment boundaries are retained.";

export default function Page() {
  return (
    <PageShell>
      <div className="mgp-page">
      {/* ===== HERO ===== */}
      <section className="section mgp" id="managed-governance-partner">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Partner programme</span>
            <h1>Managed Governance Partner™</h1>
            <p className="mgp-lede">
              Deliver pre-execution AI Runtime Governance to your customers as part of your existing
              cybersecurity, compliance, AI assurance, or managed services — without building the
              technology yourself.
            </p>
          </div>
          <div className="hero-actions reveal" data-d="1" style={{ marginTop: 28 }}>
            <Link href="/contact" className="btn btn--primary">Discuss Partnership <span className="arr">→</span></Link>
            <Link href="/book#strategy" className="btn btn--ghost">Book a call <span className="arr">→</span></Link>
          </div>
        </div>
      </section>

      {/* ===== WHAT IS IT ===== */}
      <section className="section section--tight" id="what">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">What it is</span>
            <h2>What is a Managed Governance Partner™?</h2>
          </div>
          <div className="scale-grid">
            <div className="mgp-prose reveal">
              <p>
                A Managed Governance Partner™ integrates Resurrection Tech&rsquo;s Runtime Governance
                into their existing cybersecurity, compliance, or managed AI services. You extend what
                you already deliver — detection, response, assurance, compliance, managed operations —
                with pre-execution governance for autonomous and agentic AI.
              </p>
              <p>
                Your customers continue working primarily with you. Runtime Governance operates behind
                the scenes: every agent action is evaluated <b>before</b> execution and resolved to
                allow, block, or escalate. The partner owns the relationship; Resurrection Tech
                provides the governance engine, integration, and ongoing updates.
              </p>
            </div>
            <div className="mgp-flow reveal" data-d="1" aria-label="How Runtime Governance sits in the partner delivery path">
              <div className="mgp-flow-node">Customer AI Agent</div>
              <div className="mgp-flow-arrow" aria-hidden="true">↓</div>
              <div className="mgp-flow-node">Partner Platform</div>
              <div className="mgp-flow-arrow" aria-hidden="true">↓</div>
              <div className="mgp-flow-node mgp-flow-node--gov"><b>Resurrection Tech Runtime Governance</b></div>
              <div className="mgp-flow-verdict" aria-hidden="true">
                <span className="v-allow">ALLOW</span>
                <span className="v-block">BLOCK</span>
                <span className="v-esc">ESCALATE</span>
              </div>
              <div className="mgp-flow-arrow" aria-hidden="true">↓</div>
              <div className="mgp-flow-node">Tool Execution</div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== EXAMPLE CUSTOMER JOURNEY ===== */}
      <section className="section section--tight" id="example">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Worked example</span>
            <h2>Example customer journey</h2>
            <p>How the partnership looks in practice — the partner keeps the customer; Resurrection Tech provides the governance.</p>
          </div>
          <div className="mgp-story reveal" data-d="1" aria-label="Example customer journey">
            {STORY.map((s, i) => (
              <Fragment key={s.t}>
                {i > 0 && <div className="mgp-flow-arrow" aria-hidden="true">↓</div>}
                <div
                  className={`mgp-flow-node${
                    s.tone === "key" ? " mgp-flow-node--key" : s.tone === "gov" ? " mgp-flow-node--gov" : ""
                  }`}
                >
                  {s.k && <span className="mgp-story-k">{s.k}</span>}
                  {s.tone ? <b>{s.t}</b> : s.t}
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* ===== WHO IT'S FOR ===== */}
      <section className="section section--tight" id="who">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Who it&rsquo;s for</span>
            <h2>Who is this designed for?</h2>
            <p>Organisations that already hold the customer relationship and want to add governed AI to their service.</p>
          </div>
          <div className="mgp-who reveal" data-d="1">
            {WHO.map(([h, p]) => (
              <div className="mgp-who-card" key={h}>
                <h3 className="mgp-who-h">{h}</h3>
                <p className="mgp-who-p">{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== ENGAGEMENT JOURNEY ===== */}
      <section className="section section--tight" id="journey">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">How it works</span>
            <h2>Typical engagement journey</h2>
            <p>From first contact through production deployment and ongoing growth.</p>
          </div>
          <ol className="mgp-journey reveal" data-d="1">
            {JOURNEY.map(([h, p]) => (
              <li key={h}>
                <div>
                  <span className="mgp-journey-h">{h}</span>
                  <span className="mgp-journey-p">{p}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ===== RESPONSIBILITIES ===== */}
      <section className="section section--tight" id="responsibilities">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Division of responsibility</span>
            <h2>Who provides what.</h2>
          </div>
          <div className="scale-grid">
            <div className="scale-col is reveal">
              <h3>Resurrection Tech provides</h3>
              {RT_PROVIDES.map((t) => (
                <div className="scale-li" key={t}>
                  <span className="ic"><Check /></span>
                  <span className="txt">{t}</span>
                </div>
              ))}
            </div>
            <div className="scale-col is reveal" data-d="1">
              <h3>The partner provides</h3>
              {PARTNER_PROVIDES.map((t) => (
                <div className="scale-li" key={t}>
                  <span className="ic"><Check /></span>
                  <span className="txt">{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== COMMERCIAL MODEL ===== */}
      <section className="section section--tight" id="commercial">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Commercial model</span>
            <h2>How the commercials work.</h2>
            <p>
              The partnership combines a one-time onboarding, annual platform access, and per-customer
              commercial bands, with a minimum annual commitment.
            </p>
          </div>
          <div className="tbl-wrap reveal" data-rowreveal>
            <table className="tbl">
              <thead>
                <tr><th>Component</th><th>What it covers</th><th>Indicative scale</th></tr>
              </thead>
              <tbody>
                {COMMERCIAL.map(([c, d, v]) => (
                  <tr key={c}>
                    <td data-l="Component" className="t-main">{c}</td>
                    <td data-l="What it covers">{d}</td>
                    <td data-l="Indicative scale" className="t-price">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PricingDisclaimer variant="full" />
        </div>
      </section>

      {/* ===== WHAT PARTNERS LICENSE ===== */}
      <section className="section section--tight" id="licensing">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">What you license</span>
            <h2>What partners are actually licensing.</h2>
          </div>
          <div className="mgp-prose reveal">
            <p>
              Resurrection Tech does not simply hand over unrestricted raw code. Partners license access
              to Runtime Governance infrastructure, evidence generation, deployment support, monitoring,
              updates, and commercial rights to use Runtime Governance within approved customer
              deployments.
            </p>
            <p>
              Integration can be delivered through different models depending on the partner&rsquo;s
              environment, customer requirements, compliance burden, and deployment model.
            </p>
          </div>
        </div>
      </section>

      {/* ===== INTEGRATION MODELS ===== */}
      <section className="section section--tight" id="integration-models">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Integration models</span>
            <h2>Three ways to deliver it.</h2>
            <p>Hosted is the simple default; private deployment suits sensitive environments; embedded licensing packages governance into your own service.</p>
          </div>
          <div className="mgp-int-grid reveal" data-d="1">
            {INTEGRATION.map((m) => (
              <div className="mgp-int-card" key={m.h}>
                <h3 className="mgp-int-h">{m.h}</h3>
                <p className="mgp-int-desc">{m.desc}</p>
                <div className="mgp-int-flow"><span className="mgp-int-k">Flow</span>{m.flow}</div>
                {m.warn && <p className="mgp-int-warn"><b>Important:</b> {m.warn}</p>}
                <div className="mgp-int-meta">
                  <p><span className="mgp-int-k">Commercial structure</span>{m.commercial}</p>
                  <p><span className="mgp-int-k">Best for</span>{m.bestFor}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mgp-note reveal" data-d="1" role="note">
            <span className="mgp-note-k">Ownership &amp; control</span>
            <p>{OWNERSHIP_NOTE}</p>
          </div>
        </div>
      </section>

      {/* ===== WHY ===== */}
      <section className="section section--tight" id="why">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Why partner</span>
            <h2>Why become a Managed Governance Partner™?</h2>
          </div>
          <div className="mgp-prose reveal" data-d="1">
            <p>
              Agentic AI is moving into the environments you already secure and assure — and your
              customers are asking who governs what those agents can do. A Managed Governance
              Partnership lets you answer that question with an enforced, pre-execution control, rather
              than a policy document.
            </p>
            <p>
              You extend your existing cybersecurity and compliance services into AI Runtime Governance
              without inventing the technology yourself. Resurrection Tech maintains the governance
              engine, the reachability analysis, and the updates as models, tools, and regulations
              change; you keep the customer relationship, the deployment, and the commercial growth.
            </p>
          </div>
          <div className="hero-actions reveal" data-d="1" style={{ marginTop: 36 }}>
            <Link href="/contact" className="btn btn--primary">Discuss Partnership <span className="arr">→</span></Link>
            <Link href="/enterprise-pathways#partner-licensing" className="btn btn--ghost">See all partner pathways <span className="arr">→</span></Link>
          </div>
        </div>
      </section>
      </div>
    </PageShell>
  );
}
