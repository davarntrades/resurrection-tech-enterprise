import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { PricingDisclaimer } from "@/components/PricingDisclaimer";
import { DeploymentModels } from "@/components/DeploymentModels";

export const metadata: Metadata = {
  title: "Embedded Runtime Governance Licensing™",
  description:
    "License Resurrection Tech's pre-execution Runtime Governance to embed it directly into your platform, product, or customer-facing AI infrastructure. For AI platforms, infrastructure companies, cybersecurity vendors, and enterprise software providers. OEM, white-label, and territory terms by commercial review.",
  alternates: { canonical: "/embedded-runtime-governance-licensing" },
};

const Check = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 8.5 L6.5 12 L13 4" stroke="#e0a93f" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const WHO = [
  ["AI agent platforms", "Make pre-execution governance a native capability of your agent platform."],
  ["AI infrastructure companies", "Add reachability-based safety to the infrastructure others build on."],
  ["Cybersecurity vendors", "Embed runtime AI control into your security product line."],
  ["Enterprise software providers", "Ship governed AI features inside the software your customers already run."],
  ["Automation / workflow platforms", "Govern what automated agents can do before actions execute."],
  ["Data platforms", "Constrain agent access and actions across sensitive data products."],
];

const JOURNEY = [
  ["Discovery call", "We confirm product fit and how governance would be embedded."],
  ["Technical & licensing fit", "Scope the integration surface, usage boundaries, and support terms."],
  ["Architecture review", "Review deployment architecture, limits, and self-hosted/embedded model."],
  ["Licensing agreement", "Annual licence + minimum guarantee; white-label / territory as required."],
  ["Embedded integration", "Integrate the Runtime Governance engine via API / SDK."],
  ["Product launch", "Ship governed agents inside your own product or platform."],
  ["Ongoing licensing & support", "Governance updates, support, and usage-based scaling."],
];

const RT_PROVIDES = [
  "Runtime Governance engine / API",
  "Embedded integration support",
  "Deployment architecture review",
  "Licensing terms & usage boundaries",
  "Governance updates",
  "Attribution / white-label terms",
];

const PARTNER_PROVIDES = [
  "Product / platform",
  "Integration engineering",
  "Productization",
  "Customer base",
  "Customer support",
];

const STORY: { t: string; k?: string; tone?: "key" | "gov" }[] = [
  { t: "AI platform vendor", k: "Partner" },
  { t: "Wants governance native to its product." },
  { t: "Licenses Embedded Runtime Governance.", tone: "key" },
  { t: "Integrates the governance engine via API / SDK." },
  { t: "Ships governed agents inside its own product." },
  { t: "Its customers get pre-execution AI safety natively.", tone: "gov" },
  { t: "The vendor pays an annual licence + guarantee." },
  { t: "Resurrection Tech maintains the governance engine.", tone: "key" },
];

const COMMERCIAL = [
  ["Annual licence", "Embedded Runtime Governance in your product.", "£100K+ / yr"],
  ["Minimum annual guarantee", "Baseline annual commitment.", "By commercial review"],
  ["Usage scaling", "Self-hosted / embedded deployments scale above hosted.", "Usage-based"],
  ["White-label / exclusivity / territory", "Determined during partnership discovery.", "By commercial review"],
];

export default function Page() {
  return (
    <PageShell>
      <div className="mgp-page">
      {/* ===== HERO ===== */}
      <section className="section mgp" id="embedded-runtime-governance-licensing">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Licensing programme</span>
            <h1>Embedded Runtime Governance Licensing™</h1>
            <p className="mgp-lede">
              Embed pre-execution Runtime Governance directly into your platform, product, or
              customer-facing AI infrastructure — and ship enforced AI safety as a native capability of
              your own offering.
            </p>
          </div>
          <div className="hero-actions reveal" data-d="1" style={{ marginTop: 28 }}>
            <Link href="/contact" className="btn btn--primary">Discuss Licensing <span className="arr">→</span></Link>
            <Link href="/book#strategy" className="btn btn--ghost">Book a call <span className="arr">→</span></Link>
          </div>
        </div>
      </section>

      {/* ===== WHAT IS IT ===== */}
      <section className="section section--tight" id="what">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">What it is</span>
            <h2>What is Embedded Runtime Governance Licensing™?</h2>
          </div>
          <div className="scale-grid">
            <div className="mgp-prose reveal">
              <p>
                Embedded Runtime Governance Licensing lets platforms and vendors build Resurrection
                Tech&rsquo;s pre-execution governance into their own product. Rather than referring or
                reselling, you integrate the governance engine and ship it as a native feature your
                customers experience inside your platform.
              </p>
              <p>
                Licensing covers usage boundaries, support terms, and deployment architecture.
                White-label, exclusivity, and territory rights are determined during partnership
                discovery; &ldquo;Powered by Resurrection Tech&trade;&rdquo; attribution applies unless
                white-label rights are separately licensed. Resurrection Tech maintains the engine,
                reachability analysis, and updates.
              </p>
              <p>
                Licensing does not require customers to use Resurrection Tech hosting. Organisations may
                choose a fully managed Runtime Governance API or deploy approved Runtime Governance
                infrastructure within their own cloud environment where appropriate.
              </p>
            </div>
            <div className="mgp-flow reveal" data-d="1" aria-label="How embedded governance sits inside a partner product">
              <div className="mgp-flow-node">Your Product / Platform</div>
              <div className="mgp-flow-arrow" aria-hidden="true">↓</div>
              <div className="mgp-flow-node mgp-flow-node--gov"><b>Embedded Runtime Governance</b></div>
              <div className="mgp-flow-verdict" aria-hidden="true">
                <span className="v-allow">ALLOW</span>
                <span className="v-block">BLOCK</span>
                <span className="v-esc">ESCALATE</span>
              </div>
              <div className="mgp-flow-arrow" aria-hidden="true">↓</div>
              <div className="mgp-flow-node">Your Customers&rsquo; Agents</div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== EXAMPLE JOURNEY ===== */}
      <section className="section section--tight" id="example">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Worked example</span>
            <h2>Example licensing journey</h2>
            <p>How embedding works in practice — your product, our governance engine.</p>
          </div>
          <div className="mgp-story reveal" data-d="1" aria-label="Example licensing journey">
            {STORY.map((s, i) => (
              <Fragment key={s.t}>
                {i > 0 && <div className="mgp-flow-arrow" aria-hidden="true">↓</div>}
                <div className={`mgp-flow-node${s.tone === "key" ? " mgp-flow-node--key" : s.tone === "gov" ? " mgp-flow-node--gov" : ""}`}>
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
            <p>Companies that build products others rely on, and want governance native to them.</p>
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
            <p>From first contact through embedded production deployment.</p>
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
                <div className="scale-li" key={t}><span className="ic"><Check /></span><span className="txt">{t}</span></div>
              ))}
            </div>
            <div className="scale-col is reveal" data-d="1">
              <h3>The partner provides</h3>
              {PARTNER_PROVIDES.map((t) => (
                <div className="scale-li" key={t}><span className="ic"><Check /></span><span className="txt">{t}</span></div>
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
              An annual licence with a minimum guarantee, scaling with usage. Embedded and OEM terms —
              including white-label, exclusivity, and territory — are set during partnership discovery.
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
          <div className="mgp-note reveal" data-d="1" role="note">
            <span className="mgp-note-k">Not raw code · ownership retained</span>
            <p>
              Embedded licensing is not a transfer of unrestricted code. Resurrection Tech retains
              ownership of the Runtime Governance engine, governance logic, intellectual property,
              updates, and core infrastructure. Partners receive commercial rights to use, deploy,
              package, or integrate Runtime Governance only under agreed terms — with usage reporting,
              audit rights, and deployment boundaries retained.{" "}
              <Link href="/managed-governance-partner#integration-models">Compare integration models →</Link>
            </p>
          </div>
        </div>
      </section>

      {/* ===== DEPLOYMENT FLEXIBILITY ===== */}
      <DeploymentModels />

      {/* ===== WHY ===== */}
      <section className="section section--tight" id="why">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Why license</span>
            <h2>Why license Embedded Runtime Governance™?</h2>
          </div>
          <div className="mgp-prose reveal" data-d="1">
            <p>
              Your customers are deploying autonomous agents on your platform, and pre-execution safety
              is becoming a requirement rather than a feature. Embedded licensing lets you offer it as a
              native part of your product — without building reachability-based governance yourself.
            </p>
            <p>
              Resurrection Tech maintains the governance engine, the reachability analysis, and the
              updates as models, tools, and regulations change. You own the product, the integration,
              and the customer relationship, and differentiate on governed-by-design AI.
            </p>
          </div>
          <div className="hero-actions reveal" data-d="1" style={{ marginTop: 36 }}>
            <Link href="/contact" className="btn btn--primary">Discuss Licensing <span className="arr">→</span></Link>
            <Link href="/enterprise-pathways#partner-licensing" className="btn btn--ghost">See all partner pathways <span className="arr">→</span></Link>
          </div>
        </div>
      </section>
      </div>
    </PageShell>
  );
}
