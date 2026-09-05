import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { ConsultationSection } from "@/components/ConsultationSection";
import { FinancialComparison } from "@/components/FinancialComparison";
import { PathwayFold } from "@/components/pathways/PathwayFold";
import { PricingDisclaimer } from "@/components/PricingDisclaimer";

export const metadata: Metadata = {
  title: "Enterprise Pathways",
  description:
    "Ways to engage Resurrection Tech across the Admissible Operating Envelope lifecycle: Free Discovery, the Paid Discovery Workshop, Operating Envelope Discovery, the Enterprise Runtime Governance Assessment, the Limited Pilot, Enterprise Integration, the Annual Runtime Governance License, the Advisory Retainer, executive pathways (Executive Governance Partnership, Fractional CAIO, Frontier AI Strategic Partnership), and Partner & Licensing pathways. Priced against the cost of Ω becoming reachable.",
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
function EngageStage({ name, stage, dur, kind, recurring = false }: { name: string; stage: string; dur: string; kind: string; recurring?: boolean }) {
  return (
    <div className={`engage-stage${recurring ? " recurring" : ""}`}>
      <div className="es-top">
        <span className="es-name">{stage}</span>
        <span className={`engage-tag${recurring ? " rec" : " one"}`}>
          {recurring ? "Recurring" : "One-time"}
        </span>
      </div>
      <h3>{name}</h3>
      <div className="es-dur">{dur}</div>
      <div className="es-kind">{kind}</div>
      {recurring && (
        <span className="es-loop" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M15 9 a6 6 0 1 1 -1.8 -4.3 M13.5 1.5 V5 H10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </div>
  );
}

/* The canonical lifecycle. Each stage names the engagement that carries it, so
   the track and the DISCOVER → … → REVALIDATE strip above the page cannot drift
   apart. Both recurring stages are marked recurring — operating the enforcement
   layer and revalidating the envelope are both continuous, not one-off. */
const LIFECYCLE: { stage: string; name: string; dur: string; kind: string; recurring?: boolean }[] = [
  { stage: "Discover", name: "Envelope Discovery", dur: "48 hours", kind: "Map reachable execution risk" },
  { stage: "Define", name: "Enterprise Assessment", dur: "2–6 weeks", kind: "Define the initial AOE" },
  { stage: "Falsify", name: "Limited Pilot", dur: "4–8 weeks", kind: "Test the envelope against reality" },
  { stage: "Enforce", name: "Integration", dur: "Deployment phase", kind: "Authorize before execution" },
  { stage: "Operate", name: "Annual Governance", dur: "Annual", kind: "Operate and maintain the enforced envelope", recurring: true },
  { stage: "Revalidate", name: "Advisory Retainer", dur: "Monthly or annual", kind: "Challenge and revise the envelope", recurring: true },
];

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

type LadderCard = { name: string; pos: string; time: string; price: string; priceDim?: boolean; href: string; act: string };
type LadderTier = { label: string; core?: boolean; cards: LadderCard[] };

const LADDER: LadderTier[] = [
  {
    label: "Establish & scope",
    cards: [
      { name: "Free Discovery / Questionnaire Review", pos: "Establish fit and high-level risk context.", time: "Discovery call", price: "No charge", href: "/book", act: "Book a call" },
      { name: "Paid Discovery Workshop™", pos: "Structured scoping before envelope discovery, pilot, or integration.", time: "Short engagement", price: "£5K–£50K+", href: "/pay#discovery-workshop", act: "Reserve a slot" },
    ],
  },
  {
    label: "Discover, define, falsify, enforce — the core path",
    core: true,
    cards: [
      { name: "Operating Envelope Discovery™", pos: "Map consequential execution paths, reachable risk, and candidate operating-envelope boundaries in a bounded environment.", time: "48 hours", price: "£40K–£75K", href: "/request-audit", act: "Request discovery" },
      { name: "Enterprise Runtime Governance Assessment™", pos: "Model the operational environment and define the initial Admissible Operating Envelope across agents, systems, tools, states, transitions, controls, and evidence requirements.", time: "2–6 weeks", price: "£100K–£250K+", href: "/enterprise-runtime-governance-assessment", act: "Explore the assessment" },
      { name: "Limited Pilot™", pos: "Attempt to falsify the proposed operating envelope against real workflows, adversarial trajectories, and operational conditions before production deployment.", time: "30–60 days", price: "£250K–£750K+", href: "/pilot", act: "See pilot scope" },
      { name: "Enterprise Integration™", pos: "Deploy independent execution authority into the production path and causally enforce the validated Admissible Operating Envelope across mediated execution.", time: "Deployment dependent", price: "Commercial review following deployment assessment", priceDim: true, href: "/pay#enterprise-integration", act: "Request invoice" },
    ],
  },
  {
    label: "Operate, revalidate, lead",
    cards: [
      { name: "Annual Runtime Governance™ License™", pos: "Operate and maintain the enforced envelope in production: support, monitoring, enforcement updates, governance evidence, and scheduled revalidation.", time: "Annual", price: "£75K–£500K+ / yr", href: "/pay#annual-governance-license", act: "Request invoice" },
      { name: "Advisory Retainer™", pos: "Continuous AOE governance, adversarial falsification, revalidation, and execution assurance as the operational environment changes.", time: "Monthly", price: "£35K–£100K+ / mo", href: "/pay#advisory-retainer", act: "Request invoice" },
      { name: "Executive Governance Partnership™", pos: "Executive-level governance leadership beyond operational support.", time: "Annual", price: "£150K–£500K+ / yr", href: "/contact", act: "Start a conversation" },
      { name: "Fractional Chief AI Officer (CAIO) / Executive AI Governance Lead™", pos: "Executive AI strategy, deployment governance, operational assurance, and executive risk oversight.", time: "Annual", price: "£250K–£1M+ / yr", href: "/pay#fractional-caio", act: "Request invoice" },
      { name: "Frontier AI Strategic Partnership™", pos: "Strategic governance for frontier, foundation-model, infrastructure, and sovereign AI programmes.", time: "Annual / multi-year", price: "Commercial review · minimum annual commitment", priceDim: true, href: "/pay#frontier-partnership", act: "Request commercial review" },
    ],
  },
];

const CHOOSE: { sit: string; path: string; href?: string }[] = [
  { sit: "Exploring; need to establish fit", path: "Free Discovery / Questionnaire Review", href: "/book" },
  { sit: "Need structured scoping before committing", path: "Paid Discovery Workshop™", href: "#discovery-workshop" },
  { sit: "Need a rapid fixed-scope view of reachable execution risk", path: "Operating Envelope Discovery™", href: "/request-audit" },
  { sit: "Need the envelope defined across the estate before pilot", path: "Enterprise Runtime Governance Assessment™", href: "#enterprise-assessment" },
  { sit: "Envelope defined, need it tested against reality", path: "Limited Pilot™", href: "/pilot" },
  { sit: "Approved for enterprise deployment", path: "Enterprise Integration™" },
  { sit: "In production; need the enforced envelope operated", path: "Annual Runtime Governance™ License™" },
  { sit: "Deployed envelope needs continuous revalidation", path: "Advisory Retainer™" },
  { sit: "Executive governance leadership required", path: "Executive Governance Partnership™", href: "#executive-leadership" },
  { sit: "Part-time executive AI leadership required", path: "Fractional CAIO / Executive AI Governance Lead™", href: "#executive-leadership" },
  { sit: "Frontier, foundation-model, infrastructure, or sovereign programme", path: "Frontier AI Strategic Partnership™", href: "#executive-leadership" },
  { sit: "Partner, MSSP, or platform vendor", path: "Partner & Channel Pathways", href: "#partner-licensing" },
];

const QUAL_FACTORS = [
  "Number and type of protected environments",
  "Runtime criticality and downstream operational impact",
  "Number of autonomous agents, planners, tools, and workflows",
  "Governance complexity and domain-specific Ω definitions",
  "Compliance, assurance, and evidence requirements",
  "Deployment architecture, including hosted, self-hosted, and embedded models",
  "Geographic footprint, regulated entities, and organisational reach",
  "Support, incident-response, and executive governance requirements",
];

export default function Page() {
  return (
    <PageShell>
      <section className="section" id="pathways">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Enterprise pathways</span>
            <h2>The operating envelope lifecycle.</h2>
            <p>
              Engagements are not progressively larger assessments. Each one advances a single
              piece of work: discovering the real execution surface, defining an Admissible
              Operating Envelope over it, attempting to falsify that envelope, enforcing it
              causally at execution time, operating it in production, and revalidating it as the
              environment changes. Organisations progress only as far as they need.
            </p>
            <p className="aoe-cycle" aria-label="Lifecycle: discover, define, falsify, enforce, operate, revalidate">
              {["Discover", "Define", "Falsify", "Enforce", "Operate", "Revalidate"].map((stage, i) => (
                <span key={stage}>
                  {i > 0 && <span className="aoe-cycle-arr" aria-hidden="true">→</span>}
                  <b>{stage}</b>
                </span>
              ))}
            </p>
          </div>

          <div className="ladder">
            {LADDER.map((tier) => (
              <div key={tier.label} className="reveal">
                <div className="ladder-tier-h">
                  <span className={`ladder-dot${tier.core ? " core" : ""}`} aria-hidden="true" />
                  {tier.label}
                  <span className="ln" aria-hidden="true" />
                </div>
                <div className="ladder-grid">
                  {tier.cards.map((c) => (
                    <Link
                      href={c.href}
                      className={`ladder-card${tier.core ? " is-core" : ""}`}
                      key={c.name}
                    >
                      {tier.core && <span className="ladder-core-tag">Core pathway</span>}
                      <h3 className="ladder-name">{c.name}</h3>
                      <p className="ladder-pos">{c.pos}</p>
                      <div className="ladder-meta">
                        <span className="ladder-time">{c.time}</span>
                        <span className={`ladder-price${c.priceDim ? " dim" : ""}`}>{c.price}</span>
                      </div>
                      <span className="ladder-act">
                        {c.act} <span className="arr" aria-hidden="true">→</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="dw-note reveal" data-d="1">
            The &ldquo;+&rdquo; denotes that figures are not ceilings. Engagement scale rises with
            deployment size, risk surface, compliance burden, number of agents and environments,
            downstream impact, and commercial structure. Scale is qualified by the assessment
            questionnaire — customer reach, industry, agent maturity, governance maturity,
            compliance requirements, multi-agent complexity, and partner intent.
          </p>

          <div className="hero-actions reveal" style={{ marginTop: 36 }}>
            <Link href="/book#assessment" className="btn btn--primary">Book a Runtime Safety Assessment <span className="arr">→</span></Link>
            <Link href="/book" className="btn btn--ghost">Schedule Discovery</Link>
          </div>

          <div className="retainer-note reveal" data-d="1" style={{ marginTop: 40 }}>
            <span className="rn-k">Why the retainer exists — Ω is neither static nor assumed complete</span>
            <p className="rn-eq"><b>ℛ(t) ∩ Ω = ∅</b></p>
            <p className="rn-t">
              The objective is unchanged. It is a statement about reachability relative to a
              declared model, forbidden set, governance configuration, and assumptions — a
              bounded verification result establishes a property against that declared model,
              not that every possible real-world harm has been represented in it. A stronger
              real-world claim requires those modelling and deployment assumptions to remain
              adequate, and nothing about an operating environment guarantees that they will.
              This is precisely what revalidation is for.
            </p>
            <p className="rn-t">
              What the retainer maintains is the correspondence between
              {" "}<b>modelled reality</b>, <b>executed reality</b> and <b>recorded reality</b>
              {" "}— an assurance loop of <b>observe, challenge, falsify, revise,
              revalidate</b> rather than a schedule of meetings. The deployed envelope may
              require revision when models, agents, tools, integrations, permissions,
              workflows, system state, transition semantics, attack surfaces, or regulatory
              requirements change; when an external incident reveals a previously unknown
              failure class; when adversarial testing exposes an omitted state or transition;
              or when execution behaviour diverges from modelled behaviour.
            </p>
            <ul className="rn-surfaces">
              {[
                ["AOE adequacy", "Does the declared permitted and forbidden state model still represent the relevant operational risks?"],
                ["Complete mediation", "Do all consequential execution paths intended to be governed still cross the governance boundary?"],
                ["Authorization ↔ execution", "Does the transition that was authorized correspond to the effect actually committed in the environment?"],
                ["Evidence correspondence", "Does the governance record remain an accurate and sufficiently complete representation of mediated execution, within its stated evidence boundary?"],
                ["Reachability", "Have system changes introduced new trajectories capable of reaching prohibited states represented by the current envelope?"],
              ].map(([k, v]) => (
                <li key={k}>
                  <span className="rn-s-k">{k}</span>
                  <span className="rn-s-v">{v}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="retainer-note reveal" data-d="1" style={{ marginTop: 24 }}>
            <span className="rn-k">Included across engagements — Runtime Governance Executive Reports™</span>
            Every Pilot, Integration, Annual Runtime Governance Licence™, and Managed Governance
            Partner™ engagement includes board-ready evidence: what was protected, what was prevented,
            what changed, and recommended next actions. The API protects the system; the report proves
            the value. <Link href="/managed-governance-partner#executive-reports">See what a report contains →</Link>
          </p>

          <PricingDisclaimer variant="full" />
        </div>
      </section>

      {/* ===== CHOOSING A PATHWAY — situation → recommendation ===== */}
      <section className="section section--tight" id="choosing-a-pathway">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Choosing a pathway</span>
            <h2>Start from your situation.</h2>
            <p>Match where you are today to the recommended entry point. Every pathway can progress to the next rung of the ladder.</p>
          </div>
          <div className="choose-grid reveal">
            {CHOOSE.map((c) =>
              c.href ? (
                <Link href={c.href} className="choose-row" key={c.sit}>
                  <span className="choose-sit">{c.sit}</span>
                  <span className="choose-path">{c.path}</span>
                </Link>
              ) : (
                <div className="choose-row" key={c.sit}>
                  <span className="choose-sit">{c.sit}</span>
                  <span className="choose-path">{c.path}</span>
                </div>
              ),
            )}
          </div>
        </div>
      </section>

      {/* ===== RUNTIME GOVERNANCE ENTERPRISE ASSESSMENT (premium tier) ===== */}
      {/* ===== IN DETAIL — everything below the core decision, folded away =====
           A buyer's first question is "which one am I?", and the lifecycle and
           chooser above answer it. These sections answer the follow-ups, so
           they stay on the page but out of the scroll until asked for. */}
      <section className="section section--tight" id="detail">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">In detail</span>
            <h2>Everything else, when you need it.</h2>
            <p>
              Open only what applies to you. Each section is the same material that
              was here before — product deep-dives, partner routes, the pricing
              rationale, how delivery runs, and the cost comparison.
            </p>
          </div>
          <div className="pw-folds">
          <PathwayFold
            id="enterprise-assessment"
            eyebrow="Premium engagement tier"
            title="Enterprise Runtime Governance Assessment™"
            blurb="Models the operational environment and defines the initial Admissible Operating Envelope."
          >

              <div className="dw-intro reveal" data-d="1">
                <p>
                  The broader-scope engagement for organisations running multiple agents across
                  connected systems. Where Operating Envelope Discovery maps candidate boundaries in a
                  single bounded environment, the Enterprise Assessment models the estate — agents,
                  systems, tools, states, transitions, controls and evidence requirements — and defines
                  the initial Admissible Operating Envelope over it, with board-ready evidence, a
                  governance roadmap and an integration blueprint, delivered with executive and
                  technical stakeholders in the room. The envelope it produces is an initial
                  definition, written to be tested rather than assumed correct.
                </p>
              </div>

              <div className="scale-grid">
                <div className="scale-col is reveal">
                  <h3>Review &amp; analysis</h3>
                  {[
                    "Multi-agent architecture review",
                    "Enterprise Ω mapping",
                    "Cross-system reachability analysis",
                    "Replay evidence",
                    "ROI analysis",
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
                  <h3>Executive deliverables &amp; sessions</h3>
                  {[
                    "Executive workshop",
                    "Technical workshop",
                    "Governance roadmap",
                    "Integration blueprint",
                    "Board-ready executive pack",
                    "Live presentation of findings to stakeholders",
                    "Post-assessment Q&A and implementation planning",
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
                <span className="dw-range-k">Indicative scale</span>
                <div className="price-tiles">
                  <div className="price-tile">
                    <span className="price-tile-k">Operating Envelope Discovery™</span>
                    <span className="price-tile-v">£40K–£75K</span>
                    <span className="price-tile-s">Single bounded environment · fixed 48-hour engagement</span>
                  </div>
                  <div className="price-tile is-hi">
                    <span className="price-tile-k">Enterprise Runtime Governance Assessment™</span>
                    <span className="price-tile-v">£100K–£250K+</span>
                    <span className="price-tile-s">Multi-agent, cross-system · initial AOE definition + executive evidence · 2–6 weeks</span>
                  </div>
                </div>
                <PricingDisclaimer variant="short" />
              </div>

              <div className="dw-ladder reveal" data-d="1">
                <span className="dw-ladder-k">Where it sits in the ladder</span>
                <ol>
                  <li><b>Operating Envelope Discovery™</b> maps consequential execution paths, reachable risk, and candidate envelope boundaries in a bounded environment.</li>
                  <li><b>The Enterprise Runtime Governance Assessment™</b> models the operational environment and defines the initial Admissible Operating Envelope.</li>
                  <li><b>The Limited Pilot™</b> attempts to falsify the proposed envelope and its enforcement assumptions against real workflows and adversarial trajectories.</li>
                  <li><b>Enterprise Integration™</b> places independent authorization in the production execution path and enforces the validated envelope across mediated transitions.</li>
                </ol>
              </div>

              <div className="hero-actions reveal" style={{ marginTop: 40 }}>
                <Link href="/enterprise-runtime-governance-assessment" className="btn btn--primary">Explore the Enterprise Assessment <span className="arr">→</span></Link>
                <Link href="/contact#enterprise-assessment" className="btn btn--ghost">Request Enterprise Assessment</Link>
              </div>
          </PathwayFold>

          {/* ===== PAID DISCOVERY WORKSHOP (new tier: scoping before audit) ===== */}
          <PathwayFold
            id="discovery-workshop"
            eyebrow="New engagement tier"
            title="Paid Discovery Workshop™"
            blurb="Structured scoping before envelope discovery, a pilot, or integration."
          >

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
                <div className="price-tiles">
                  <div className="price-tile">
                    <span className="price-tile-k">Small company</span>
                    <span className="price-tile-v">£5K–£15K</span>
                  </div>
                  <div className="price-tile">
                    <span className="price-tile-k">Mid-market</span>
                    <span className="price-tile-v">£15K–£25K</span>
                  </div>
                  <div className="price-tile">
                    <span className="price-tile-k">Enterprise</span>
                    <span className="price-tile-v">£25K–£50K+</span>
                  </div>
                </div>
                <PricingDisclaimer variant="short" />
              </div>

              <div className="dw-ladder reveal" data-d="1">
                <span className="dw-ladder-k">Where it sits in the ladder</span>
                <ol>
                  <li><b>Free Discovery / Questionnaire Review</b> establishes fit and high-level risk context.</li>
                  <li><b>The Paid Discovery Workshop™</b> defines the scope.</li>
                  <li><b>Operating Envelope Discovery™</b> maps consequential execution paths, reachable risk, and candidate envelope boundaries.</li>
                  <li><b>The Enterprise Runtime Governance Assessment™</b> models the environment and defines the initial Admissible Operating Envelope.</li>
                  <li><b>The Limited Pilot™</b> attempts to falsify that envelope against real workflows and adversarial trajectories.</li>
                  <li><b>Enterprise Integration™</b> places independent authorization in the production execution path and enforces the validated envelope.</li>
                  <li><b>The Annual Runtime Governance™ License™</b> operates the enforcement layer — support, monitoring, enforcement updates, and scheduled revalidation.</li>
                  <li><b>The Advisory Retainer™</b> continuously challenges, revalidates, and revises the deployed envelope as the environment changes.</li>
                </ol>
              </div>

              <p className="dw-note reveal" data-d="1">
                The workshop is <b>optional and never mandatory</b>. The questionnaire remains the
                primary qualification mechanism — if sufficient information is already available, we can
                move directly into an Envelope Discovery, Pilot, or Integration discussion. In some
                cases, Resurrection Tech may recommend exactly that.
              </p>

              <div className="hero-actions reveal" style={{ marginTop: 40 }}>
                <Link href="/book#workshop" className="btn btn--primary">Book Discovery Workshop <span className="arr">→</span></Link>
                <Link href="/contact" className="btn btn--ghost">Discuss Workshop Scope</Link>
              </div>
          </PathwayFold>

          {/* ===== EXECUTIVE & STRATEGIC PATHWAYS ===== */}
          <PathwayFold
            id="executive-leadership"
            eyebrow="Executive & strategic pathways"
            title="Governance leadership beyond operational support."
            blurb="Executive partnership, fractional CAIO, and frontier programmes."
          >

              <div className="plp-grid reveal" data-d="1">
                <div className="plp-card">
                  <h3 className="plp-title">Executive Governance Partnership™</h3>
                  <p className="plp-pos">
                    Executive-level governance leadership beyond operational support.
                  </p>
                  <div className="plp-foot">
                    <span className="plp-terms"><span className="plp-terms-k">Indicative scale</span>£150K–£500K+ / yr · Annual</span>
                  </div>
                </div>
                <div className="plp-card">
                  <h3 className="plp-title">Fractional Chief AI Officer (CAIO) / Executive AI Governance Lead™</h3>
                  <p className="plp-pos">
                    Part-time executive leadership for organisations requiring ongoing AI strategy,
                    deployment governance, executive decision support, and governance programme
                    leadership without appointing a full-time Chief AI Officer.
                  </p>
                  <ul className="plp-acts" aria-label="Typical activities">
                    {[
                      "Executive AI strategy and operating-model design",
                      "AI deployment governance and approval frameworks",
                      "Executive and board risk reviews",
                      "Regulatory and assurance engagement support",
                      "Governance programme leadership",
                      "Cross-functional decision rights and accountability",
                    ].map((t) => <li key={t}>{t}</li>)}
                  </ul>
                  <div className="plp-foot">
                    <span className="plp-terms"><span className="plp-terms-k">Indicative scale</span>£250K–£1M+ / yr · Annual</span>
                  </div>
                </div>
                <div className="plp-card">
                  <h3 className="plp-title">Frontier AI Strategic Partnership™</h3>
                  <p className="plp-pos">
                    Strategic governance engagement for frontier AI labs, foundation model providers,
                    AI infrastructure platforms, autonomous agent platforms, and sovereign AI
                    programmes. Scope may include model-release governance, safety-operations
                    integration, runtime deployment controls, planner validation, strategic roadmap
                    development, and executive governance.
                  </p>
                  <div className="plp-foot">
                    <span className="plp-terms"><span className="plp-terms-k">Commercial</span>Commercial review · minimum annual commitment</span>
                  </div>
                </div>
              </div>

              <div className="hero-actions reveal" style={{ marginTop: 36 }}>
                <Link href="/contact" className="btn btn--ghost">Contact us about executive pathways</Link>
              </div>
          </PathwayFold>

          {/* ===== PARTNER & LICENSING PATHWAYS (channel / OEM motion) ===== */}
          <PathwayFold
            id="partner-licensing"
            eyebrow="Partner & licensing pathways"
            title="Bring Runtime Governance to your own customers."
            blurb="Partner, MSSP, platform and embedded-licensing routes."
          >

              <div className="plp-grid reveal" data-d="1">
                {[
                  {
                    title: "Partner Discovery Workshop™",
                    pos: "For prospective partners scoping a relationship before committing to a channel pathway.",
                    terms: "Scoped during partnership discovery · credited toward onboarding",
                    cta: "Book discovery",
                    href: "/book",
                  },
                  {
                    title: "Strategic Alliance Partner™",
                    pos: "Advisors, consultants, introducers, and strategic relationships — qualified enterprise introductions and strategic market access.",
                    terms: "Commission on realised revenue · no fee to join",
                    cta: "Explore the partnership",
                    href: "/strategic-alliance-partner",
                  },
                  {
                    title: "Managed Governance Partner™ Onboarding",
                    pos: "Prepares an MSSP, consultancy, or assurance firm to confidently sell and deliver Runtime Governance — architecture review, deployment planning, sales enablement, and co-branded material. Strategic onboarding, not a discount.",
                    terms: "Commercial qualification · strategic onboarding, not a discount",
                    cta: "Explore onboarding",
                    href: "/managed-governance-partner",
                  },
                  {
                    title: "Managed Governance Partner™",
                    pos: "Runtime Governance packaged into MSP, MSSP, cybersecurity, compliance, or AI assurance services — ongoing.",
                    terms: "Pricing determined during partnership review · minimum annual commitment",
                    cta: "Explore the partnership",
                    href: "/managed-governance-partner",
                  },
                  {
                    title: "Embedded Runtime Governance Licensing™",
                    pos: "Runtime Governance embedded into platforms, products, or customer-facing AI infrastructure.",
                    terms: "Commercial review · minimum annual guarantee",
                    cta: "Explore licensing",
                    href: "/embedded-runtime-governance-licensing",
                  },
                  {
                    title: "OEM / Enterprise Licensing™",
                    pos: "Large-scale, sovereign, or white-label embedded licensing.",
                    terms: "By commercial review · minimum annual guarantee required",
                    cta: "Explore licensing",
                    href: "/licensing",
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
              <p className="dw-note reveal" data-d="1">
                Partners license Runtime Governance infrastructure, evidence, deployment support,
                monitoring, updates, and commercial rights — <b>not unrestricted raw code</b>. Integration
                is available as a hosted API, a private deployment, or embedded under licence, and
                Resurrection Tech retains ownership of the governance engine.{" "}
                <Link href="/managed-governance-partner#integration-models">See how integration works →</Link>
              </p>
              <p className="dw-note reveal" data-d="1">
                <b>Licensing &amp; OEM terms.</b> Embedded and OEM licensing — including white-label,
                exclusivity, and territory rights — is determined during partnership discovery.
                Self-hosted and embedded deployments scale above hosted equivalents. Usage reporting
                and audit rights are retained. &ldquo;Powered by Resurrection Tech™&rdquo; attribution
                applies unless white-label rights are separately licensed. Exclusivity is never
                automatic and is granted only against a minimum annual guarantee, time-boxed, and
                carved out for direct and named accounts. Deal registration and named-account
                exclusions apply.
              </p>
              <PricingDisclaimer variant="short" />
          </PathwayFold>

          <PathwayFold
            id="pricing-logic"
            eyebrow="Commercial qualification principles"
            title="Priced against the cost of Ω becoming reachable."
            blurb="How engagement scale is qualified, and what the figures are priced against."
          >
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

              <div className="dw-range reveal" data-d="1" style={{ marginTop: 36 }}>
                <span className="dw-range-k">Primary qualification factors</span>
                <div className="qual-grid">
                  {QUAL_FACTORS.map((t) => (
                    <div className="qual-li" key={t}>{t}</div>
                  ))}
                </div>
              </div>

              <div className="retainer-note reveal" data-d="1" style={{ marginTop: 36 }}>
                <span className="rn-k">Engagement philosophy</span>
                <p className="rn-t">
                  The governance layer is priced against the cost of catastrophic risk becoming
                  reachable, not against the complexity of the software itself. Organisations may
                  enter through Free Discovery, a Paid Discovery Workshop, Operating Envelope
                  Discovery™, an Enterprise Runtime Governance Assessment™, or a Limited Pilot™,
                  depending on maturity, validation requirements, and existing understanding of
                  their risk landscape. Production governance is sustained through Enterprise
                  Integration and the Annual Runtime Governance™ License; executive involvement is
                  available through the advisory pathways above. All figures are indicative and
                  non-binding; final commercial terms follow assessment, deployment review, and
                  commercial qualification.
                </p>
              </div>

              <div className="hero-actions reveal" style={{ marginTop: 44 }}>
                <Link href="/book#assessment" className="btn btn--primary">Book a Runtime Safety Assessment <span className="arr">→</span></Link>
                <Link href="/assessment" className="btn btn--ghost">Assess Your Agent</Link>
              </div>
          </PathwayFold>

          {/* ===== REPEATABLE ONBOARDING PATHWAY — the full seven steps ===== */}
          <PathwayFold
            id="onboarding-pathway"
            eyebrow="The repeatable onboarding pathway"
            title="One pathway. Every customer. Repeatable."
            blurb="How a governed deployment is delivered, stage by stage."
          >

              <ol className="pathway-steps reveal">
                {([
                  {
                    n: "01",
                    h: "Runtime Assessment",
                    p: "Your current architecture, deployment model, and reachable risks — assessed in 48 hours, with a recommended pathway.",
                    tag: "48 hours",
                  },
                  {
                    n: "02",
                    h: "Discovery",
                    p: "We arrive already briefed on your models, tools, autonomy level, and regulatory context — a working session, not an exploration.",
                    tag: "Prepared",
                  },
                  {
                    n: "03",
                    h: "API Credentials",
                    p: "An API key, an endpoint, and documentation. A familiar SaaS integration your team already understands.",
                    tag: "Familiar SaaS",
                  },
                  {
                    n: "04",
                    h: "Shadow Mode",
                    p: "Insert one layer; replace nothing. Governance observes every trajectory in production without touching a single existing tool.",
                    tag: "Insert one layer",
                    highlight: true,
                  },
                  {
                    n: "05",
                    h: "Evidence Report",
                    p: "Every decision, blocked trajectory, false positive, latency figure, and audit-log entry — evidence gathered inside your own environment.",
                    tag: "Your environment",
                  },
                  {
                    n: "06",
                    h: "Enable Enforcement",
                    p: "Observe-only becomes observe-and-enforce with one configuration change. No agent rebuild, no redeployment.",
                    tag: "One config change",
                  },
                  {
                    n: "07",
                    h: "Monthly Reporting",
                    p: "Ongoing governance evidence, renewals, and executive visibility — governance as a standing operational role.",
                    tag: "Standing role",
                  },
                ] as { n: string; h: string; p: string; tag: string; highlight?: boolean }[]).map((s) => (
                  <li key={s.n} className={`pathway-step${s.highlight ? " is-key" : ""}`}>
                    <div className="pathway-node" aria-hidden="true">
                      <span className="pathway-n">{s.n}</span>
                    </div>
                    <div className="pathway-body">
                      <div className="pathway-step-head">
                        <h3>{s.h}</h3>
                        <span className="pathway-tag">{s.tag}</span>
                      </div>
                      <p>{s.p}</p>
                      {s.highlight && (
                        <div className="pathway-insert">
                          <div className="pathway-insert-col">
                            <span className="pathway-insert-label">Before</span>
                            <div className="pathway-flow">
                              <span className="pf-node">LLM / Agent</span>
                              <span className="pf-arr" aria-hidden="true">→</span>
                              <span className="pf-node">Tools</span>
                              <span className="pf-arr" aria-hidden="true">→</span>
                              <span className="pf-node">Production</span>
                            </div>
                          </div>
                          <div className="pathway-insert-col">
                            <span className="pathway-insert-label is-after">After</span>
                            <div className="pathway-flow">
                              <span className="pf-node">LLM / Agent</span>
                              <span className="pf-arr" aria-hidden="true">→</span>
                              <span className="pf-node pf-gov">Runtime Governance<span className="pf-verdicts">ALLOW · ESCALATE · BLOCK</span></span>
                              <span className="pf-arr" aria-hidden="true">→</span>
                              <span className="pf-node">Tools</span>
                              <span className="pf-arr" aria-hidden="true">→</span>
                              <span className="pf-node">Production</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>

              <div className="flow reveal">
                <div className="engage-track">
                  {LIFECYCLE.map((s) => (
                    <EngageStage key={s.stage} {...s} />
                  ))}
                </div>
              </div>
          </PathwayFold>

          {/* ===== FINANCIAL RISK COMPARISON — the full ROI dashboard ===== */}
          <PathwayFold
            id="cost-of-failure"
            eyebrow="Risk comparison"
            title="The financial asymmetry of one unsafe execution."
            blurb="Bounded governance cost set against the documented cost of Ω becoming reachable."
          >
            <FinancialComparison embedded />
          </PathwayFold>

          {/* ===== RUNTIME GOVERNANCE IN ACTION (operational console) ===== */}
          <PathwayFold
            id="governance-in-action"
            eyebrow="Runtime governance in action"
            title="See the decision before the action."
            blurb="Worked runtime verdicts against an Admissible Operating Envelope."
          >

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
          </PathwayFold>
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
