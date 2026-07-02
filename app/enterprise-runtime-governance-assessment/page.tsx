import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { PricingDisclaimer } from "@/components/PricingDisclaimer";

export const metadata: Metadata = {
  title: "Enterprise Runtime Governance Assessment™",
  description:
    "The Enterprise Runtime Governance Assessment™ is Resurrection Tech's premium pre-deployment engagement for multi-agent, cross-system organisations. We reduce uncertainty before deployment by identifying catastrophic trajectories, producing board-ready executive evidence, and recommending governance actions — multi-agent architecture review, enterprise Ω mapping, cross-system reachability analysis, replay evidence, governance roadmap, integration blueprint, ROI analysis, and a live executive read-out. From £100K+.",
  alternates: { canonical: "/enterprise-runtime-governance-assessment" },
};

const Check = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 8.5 L6.5 12 L13 4" stroke="#e0a93f" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const WHO = [
  ["Multi-agent enterprises", "Organisations running several autonomous or agentic systems across connected platforms."],
  ["Regulated industries", "Finance, healthcare, insurance, energy, and public sector where Ω carries real consequence."],
  ["Boards & risk committees", "Leadership that needs defensible, evidence-backed assurance before deployment is approved."],
  ["Pre-deployment programmes", "Teams expanding agent autonomy who must quantify exposure before broader rollout."],
  ["Post-incident reviews", "Organisations that need an independent, reproducible read of what is actually reachable."],
  ["Cross-system estates", "Environments where agents, tools, and data flows span multiple systems and trust boundaries."],
];

const REVIEW = [
  "Multi-agent architecture review",
  "Enterprise Ω mapping",
  "Cross-system reachability analysis",
  "Replay evidence",
  "ROI analysis",
];

const DELIVERABLES = [
  "Executive workshop",
  "Technical workshop",
  "Governance roadmap",
  "Integration blueprint",
  "Board-ready executive pack",
  "Live presentation of findings to stakeholders",
  "Post-assessment Q&A and implementation planning",
];

const JOURNEY = [
  ["Scoping", "We confirm the multi-agent estate, connected systems, critical assets, and the Ω that matters for your environment."],
  ["Architecture review", "We map every agent, tool, and data flow across systems — and where autonomy can reach forbidden states."],
  ["Enterprise Ω mapping & reachability", "Reachable-state analysis across the estate, grounded in the live Runtime Governance engine."],
  ["Replay evidence", "Representative trajectories replayed through the engine to prove what would be blocked, deterministically."],
  ["Executive & technical workshops", "Findings worked through with leadership and engineering — not handed over as a static document."],
  ["Roadmap, blueprint & ROI", "A concrete governance roadmap, an integration blueprint, and an ROI analysis tailored to your estate."],
  ["Board-ready read-out", "A live presentation to stakeholders, a board-ready executive pack, and post-assessment implementation planning."],
];

const OUTCOMES = [
  ["Reduced deployment uncertainty", "Quantified, reachable Ω exposure across the estate — not opinion, evidence."],
  ["Board-defensible assurance", "Executive evidence leadership and regulators can stand behind."],
  ["A concrete path forward", "A governance roadmap and integration blueprint your teams can execute."],
  ["Proven, not promised", "Catastrophic trajectories demonstrated as blocked through deterministic replay."],
];

export default function Page() {
  return (
    <PageShell>
      <div className="mgp-page">
        {/* ===== HERO ===== */}
        <section className="section mgp" id="enterprise-runtime-governance-assessment">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Premium engagement</span>
              <h1>Enterprise Runtime Governance Assessment™</h1>
              <p className="mgp-lede">
                We reduce uncertainty before deployment by identifying catastrophic trajectories,
                producing executive evidence, and recommending governance actions — across your entire
                multi-agent, cross-system estate.
              </p>
            </div>
            <div className="hero-actions reveal" data-d="1" style={{ marginTop: 28 }}>
              <Link href="/contact#enterprise-assessment" className="btn btn--primary">Request Enterprise Assessment <span className="arr">→</span></Link>
              <Link href="/book#strategy" className="btn btn--ghost">Book a call <span className="arr">→</span></Link>
            </div>
          </div>
        </section>

        {/* ===== WHAT IS IT ===== */}
        <section className="section section--tight" id="what">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">What it is</span>
              <h2>Beyond a single environment.</h2>
            </div>
            <div className="scale-grid">
              <div className="mgp-prose reveal">
                <p>
                  The Enterprise Runtime Governance Assessment™ is the broader-scope engagement for
                  organisations running multiple agents across connected systems. Where the{" "}
                  <Link href="/request-audit">48-Hour Runtime Governance Audit</Link> measures a single
                  environment in a fixed, fast engagement, the Enterprise Assessment maps reachable Ω
                  exposure across your <b>multi-agent architecture</b> and the systems they touch.
                </p>
                <p>
                  It produces board-ready evidence, a concrete governance roadmap, and an integration
                  blueprint — delivered with your executive and technical stakeholders in the room, not
                  handed over as a static report. Every &ldquo;would-be-blocked&rdquo; claim is grounded
                  in the live Runtime Governance engine through deterministic replay.
                </p>
              </div>
              <div className="mgp-flow reveal" data-d="1" aria-label="Where the Enterprise Assessment sits">
                <div className="mgp-flow-node">Multi-agent estate</div>
                <div className="mgp-flow-arrow" aria-hidden="true">↓</div>
                <div className="mgp-flow-node">Cross-system reachability analysis</div>
                <div className="mgp-flow-arrow" aria-hidden="true">↓</div>
                <div className="mgp-flow-node mgp-flow-node--gov"><b>Enterprise Ω mapping + replay evidence</b></div>
                <div className="mgp-flow-arrow" aria-hidden="true">↓</div>
                <div className="mgp-flow-node">Roadmap · blueprint · board-ready pack</div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== WHO IT'S FOR ===== */}
        <section className="section section--tight" id="who">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Who it&rsquo;s for</span>
              <h2>Built for complex, high-consequence estates.</h2>
              <p>Where exposure spans multiple agents and systems, and the decision to deploy needs evidence.</p>
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

        {/* ===== WHAT IT INCLUDES ===== */}
        <section className="section section--tight" id="includes">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">What it includes</span>
              <h2>Review, evidence, and executive delivery.</h2>
            </div>
            <div className="scale-grid">
              <div className="scale-col is reveal">
                <h3>Review &amp; analysis</h3>
                {REVIEW.map((t) => (
                  <div className="scale-li" key={t}>
                    <span className="ic"><Check /></span>
                    <span className="txt">{t}</span>
                  </div>
                ))}
              </div>
              <div className="scale-col is reveal" data-d="1">
                <h3>Executive deliverables &amp; sessions</h3>
                {DELIVERABLES.map((t) => (
                  <div className="scale-li" key={t}>
                    <span className="ic"><Check /></span>
                    <span className="txt">{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ===== ENGAGEMENT JOURNEY ===== */}
        <section className="section section--tight" id="journey">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">How it works</span>
              <h2>The engagement, end to end.</h2>
              <p>From scoping the estate through a live board-ready read-out and implementation planning.</p>
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

        {/* ===== OUTCOMES ===== */}
        <section className="section section--tight" id="outcomes">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Why it matters</span>
              <h2>What leadership walks away with.</h2>
            </div>
            <div className="mgp-who reveal" data-d="1">
              {OUTCOMES.map(([h, p]) => (
                <div className="mgp-who-card" key={h}>
                  <h3 className="mgp-who-h">{h}</h3>
                  <p className="mgp-who-p">{p}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== INDICATIVE SCALE ===== */}
        <section className="section section--tight" id="scale">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Indicative scale</span>
              <h2>Where it sits.</h2>
              <p>The enterprise step up from the fixed 48-hour Audit, ahead of a Limited Pilot.</p>
            </div>
            <div className="tbl-wrap reveal" data-rowreveal>
              <table className="tbl">
                <thead>
                  <tr><th>Engagement</th><th>Scope</th><th>Timeline</th><th>Indicative scale</th></tr>
                </thead>
                <tbody>
                  <tr><td data-l="Engagement" className="t-main">Runtime Governance Audit</td><td data-l="Scope">Single environment, fixed engagement</td><td data-l="Timeline" className="t-time">48 hours</td><td data-l="Indicative scale" className="t-price">£40K–£75K</td></tr>
                  <tr><td data-l="Engagement" className="t-main">Enterprise Runtime Governance Assessment™</td><td data-l="Scope">Multi-agent, cross-system, executive evidence + roadmap</td><td data-l="Timeline" className="t-time">2–4 weeks</td><td data-l="Indicative scale" className="t-price">£100K+</td></tr>
                  <tr><td data-l="Engagement" className="t-main">Limited Pilot™</td><td data-l="Scope">Validation against real workflows in your environment</td><td data-l="Timeline" className="t-time">30–60 days</td><td data-l="Indicative scale" className="t-price">£250K–£750K+</td></tr>
                </tbody>
              </table>
            </div>
            <PricingDisclaimer variant="full" />
          </div>
        </section>

        {/* ===== CTA ===== */}
        <section className="section section--tight" id="engage">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Engage</span>
              <h2>Reduce the uncertainty before you deploy.</h2>
              <p>We&rsquo;ll scope your estate and confirm fit on a short call.</p>
            </div>
            <div className="hero-actions reveal" data-d="1" style={{ marginTop: 24 }}>
              <Link href="/contact#enterprise-assessment" className="btn btn--primary">Request Enterprise Assessment <span className="arr">→</span></Link>
              <Link href="/sample-audit" className="btn btn--ghost">See a sample deliverable</Link>
              <Link href="/enterprise-pathways" className="btn btn--ghost">Compare all pathways</Link>
            </div>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
