import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { PricingDisclaimer } from "@/components/PricingDisclaimer";
import { IntegrationArchitecture } from "@/components/IntegrationArchitecture";
import { DeploymentModels } from "@/components/DeploymentModels";
import { ExecutiveReports } from "@/components/ExecutiveReports";

export const metadata: Metadata = {
  title: "Partner Portal",
  description:
    "The single source of truth for Resurrection Tech partners: what Runtime Governance is, partnership models, who-provides-what, commercial pathways, pricing, integration, executive reports, the customer journey, enablement assets, and FAQs — for MSSPs, cybersecurity and AI consultancies, integrators, compliance firms, platform vendors, OEM, and channel partners.",
  alternates: { canonical: "/partner-portal" },
  robots: { index: true, follow: true },
};

const TOC = [
  ["Overview", "#overview"],
  ["Partnership models", "#models"],
  ["Who provides what", "#responsibilities"],
  ["Commercial", "#commercial"],
  ["Pricing", "#pricing"],
  ["Integration", "#integration-architecture"],
  ["Executive reports", "#executive-reports"],
  ["Customer journey", "#journey"],
  ["Enablement", "#enablement"],
  ["FAQ", "#faq"],
  ["Get started", "#next"],
];

const MODELS: { h: string; forWho: string; resp: string; customer: string; commercial: string; href?: string }[] = [
  {
    h: "Strategic Alliance Partner™",
    forWho: "Advisors, consultants, introducers, strategic relationships.",
    resp: "Qualified introductions; you do not deploy or support.",
    customer: "Enterprises you already advise.",
    commercial: "Commission on realised revenue · no fee to join.",
    href: "/strategic-alliance-partner",
  },
  {
    h: "Referral Partner",
    forWho: "Networks and individuals who can refer opportunities.",
    resp: "Refer and register the opportunity.",
    customer: "Any qualified enterprise lead.",
    commercial: "Referral fee on realised revenue · time-boxed attribution.",
  },
  {
    h: "Managed Governance Partner™",
    forWho: "MSSPs, cybersecurity, compliance, AI-assurance firms.",
    resp: "Sell, deploy, and support governed AI within your service.",
    customer: "Your existing managed-service customers.",
    commercial: "Onboarding + annual platform + per-customer bands.",
    href: "/managed-governance-partner",
  },
  {
    h: "OEM Partner",
    forWho: "Vendors shipping governance inside a product at scale.",
    resp: "Productise and distribute; first-line support.",
    customer: "Your product's customer base.",
    commercial: "By commercial review · minimum annual guarantee.",
    href: "/embedded-runtime-governance-licensing",
  },
  {
    h: "Embedded Licensing™",
    forWho: "Platforms and vendors embedding governance into their product.",
    resp: "Integrate via API/SDK; ship as a native capability.",
    customer: "Users of your platform.",
    commercial: "Annual licence £100K+/yr + minimum guarantee.",
    href: "/embedded-runtime-governance-licensing",
  },
  {
    h: "Enterprise Licensing™",
    forWho: "Large-scale, sovereign, or white-label deployments.",
    resp: "Operate within agreed usage and deployment boundaries.",
    customer: "Enterprise / government estates.",
    commercial: "By commercial review · minimum annual guarantee.",
  },
  {
    h: "Technology Partner",
    forWho: "Frameworks, tools, and infrastructure that integrate with us.",
    resp: "Build and maintain a certified integration / adapter.",
    customer: "Joint customers using both products.",
    commercial: "Co-marketing / co-sell · terms by agreement.",
  },
  {
    h: "Channel Partner / Reseller",
    forWho: "Resellers and distributors taking governance to market.",
    resp: "Sell and transact; deployment via RT or a Managed Partner.",
    customer: "Accounts in your channel and territory.",
    commercial: "Channel margin · deal registration · named-account terms.",
  },
];

// Who provides what — Lead / Support / — across the three parties.
const MATRIX: [string, string, string, string][] = [
  // [responsibility, Resurrection Tech, Partner, End customer]
  ["Sales", "Enablement", "Lead", "—"],
  ["Technical onboarding", "Lead", "Support", "—"],
  ["Runtime Governance API", "Owns", "Integrates", "Consumes"],
  ["Integration", "Guides", "Lead", "Participates"],
  ["Support", "Escalation", "First-line", "Raises"],
  ["Executive reports", "Generates", "Presents", "Receives"],
  ["Renewals", "Supports", "Lead", "Decides"],
  ["Customer success", "Enables", "Lead", "—"],
  ["Security updates", "Owns", "Applies / informs", "—"],
  ["Training", "Provides", "Delivers", "Consumes"],
  ["Compliance", "Governance evidence", "Maps to frameworks", "Owns posture"],
  ["Governance updates (Ω)", "Owns", "Reviews", "—"],
  ["Incident response", "Engine / root cause", "Customer-facing", "Reports"],
];

const COMMERCIAL_PATHS: { h: string; p: string }[] = [
  { h: "Partner Discovery Workshop™", p: "Structured scoping of a prospective partnership — fit, customers, and go-to-market. Credited toward onboarding." },
  { h: "Managed Governance Partner™ Onboarding", p: "Strategic enablement that prepares you to sell and deliver governed AI before introducing it to customers." },
  { h: "Limited Pilot™", p: "Validate Runtime Governance against real workflows in a bounded, observable engagement." },
  { h: "Runtime Governance Audit", p: "Identify catastrophic trajectory exposure and governance gaps in a fixed, fast engagement." },
  { h: "Enterprise Integration", p: "One-time production deployment into operational systems." },
  { h: "Annual Runtime Governance Licence™", p: "Ongoing governance — monitoring, updates, support, and revalidation." },
  { h: "Executive Reporting", p: "Monthly board-ready evidence, included with engagements (not a separate purchase)." },
  { h: "Board Reporting", p: "Executive summaries packaged for leadership and governance committees." },
  { h: "OEM / Enterprise Licensing™", p: "Embedded, white-label, sovereign, or large-scale licensing by commercial review." },
];

const JOURNEY = [
  "Discovery", "Partner qualification", "Partner Discovery Workshop™", "Technical validation",
  "Limited Pilot™", "Partner onboarding", "API integration", "Customer deployment",
  "Monthly executive reports", "Renewals", "Expansion", "Enterprise licensing",
];

const ASSETS: { h: string; p: string; status: string; href?: string }[] = [
  { h: "Partner FAQ (full)", p: "60+ answers across general, technical, and commercial.", status: "Download", href: "/partner-resources/partner-faq.md" },
  { h: "Discovery questionnaire", p: "Reusable partner-call questionnaire (internal/shared).", status: "Download", href: "/partner-resources/partner-discovery-questionnaire.md" },
  { h: "Architecture diagrams", p: "Integration, deployment, and verdict-flow diagrams.", status: "On this page" },
  { h: "Example executive report", p: "A representative monthly Runtime Governance report.", status: "View", href: "/sample-executive-report" },
  { h: "Sales deck", p: "Partner-facing pitch and positioning.", status: "On request" },
  { h: "ROI calculator", p: "Model prevented-incident value vs governance cost.", status: "On request" },
  { h: "Compliance mappings", p: "EU AI Act, SOC 2, ISO 27001, NIST alignment.", status: "On request" },
  { h: "Demo videos", p: "Engine in action: ALLOW / BLOCK / ESCALATE.", status: "On request" },
  { h: "API documentation", p: "Endpoints, schema, auth, and adapters.", status: "On request" },
  { h: "Case studies", p: "Representative deployments and outcomes.", status: "On request" },
];

const FAQ: { group: string; items: [string, string][] }[] = [
  {
    group: "General",
    items: [
      ["What does Resurrection Tech actually sell?", "Runtime governance infrastructure, evidence, deployment support, monitoring, updates, and commercial rights to use the governance layer — not unrestricted source code."],
      ["How does Runtime Governance work?", "Every proposed agent action is evaluated before execution and resolved to ALLOW, BLOCK, or ESCALATE, based on whether its reachable trajectory intersects forbidden states (Ω)."],
      ["Why do customers buy it?", "To deploy autonomous agents safely, evidence governance for regulators and boards, and prevent catastrophic actions before they execute."],
      ["Why does a partnership make sense?", "Your customers are adopting agentic AI in environments you already secure, advise, or operate. You add governed AI without building the technology."],
      ["Do customers keep working with us or with Resurrection Tech?", "With you. For Managed and Channel models you own the relationship; governance runs behind the scenes."],
      ["Can we white-label?", "Embedded/OEM white-label rights are available under licence and are determined during partnership discovery."],
      ["Who owns the technology?", "Resurrection Tech retains ownership of the engine, governance logic, IP, updates, and infrastructure regardless of deployment location."],
      ["How quickly can we get started?", "A discovery call, then onboarding. Hosted-API validation can begin quickly; full enablement follows the engagement plan."],
    ],
  },
  {
    group: "Technical",
    items: [
      ["How long does integration take?", "It varies with how cleanly the framework exposes tool-execution hooks, the auth model, streaming vs request/response, and deployment constraints. Stacks close to our contract integrate quickly; others take longer. We scope each as an engineering estimate."],
      ["What does integration actually require?", "A thin adapter that normalises the framework's tool calls into one contract; the engine returns the verdict. Anything that can make an HTTPS POST can connect."],
      ["What deployment options exist?", "Hosted API, customer cloud (AWS/Azure/GCP), private cloud, on-prem, embedded SDK, and network proxy/sidecar."],
      ["Can customers stay on the hosted API?", "Yes — it is the fastest route and fully supported. They can move to customer-hosted or private deployment later."],
      ["How does authentication work?", "API keys for hosted; environment-appropriate auth (keys, OAuth, mTLS) for customer-hosted and private deployments."],
      ["What happens if the API is unavailable?", "Fail-mode (fail-open vs fail-closed) is an explicit governance decision configured per deployment, with health checks and fallbacks."],
      ["What evidence is collected?", "A tamper-evident audit trail of every decision, plus the metrics that power the monthly executive reports."],
      ["Do you support MCP and agent SDKs?", "MCP and agent-SDK adapters are on the roadmap; today we support hosted-API integration plus framework adapters (LangChain, OpenAI Agents, Anthropic tool use, Bedrock, Azure AI, custom)."],
      ["What about latency?", "The engine decision is sub-millisecond; the practical budget is the network round-trip, which embedded/private deployment minimises for latency-sensitive flows."],
    ],
  },
  {
    group: "Commercial",
    items: [
      ["How does the commercial model work?", "Typically partner onboarding (one-time), annual platform access, and per-customer commercial bands, with a minimum annual commitment. Specifics depend on the model."],
      ["Is onboarding a discount?", "No. Onboarding is strategic enablement that prepares you to sell and deliver; customer engagements continue through the standard ladder, unchanged."],
      ["Who invoices the customer?", "In Managed and Channel models, the partner invoices the customer and keeps the relationship. Other models vary by agreement."],
      ["How do renewals work?", "The partner leads renewals; the monthly executive reports provide the evidence that supports them."],
      ["How do executive reports fit commercially?", "They are included with Managed Governance Partner™, Limited Pilot™, Enterprise Integration™, and Annual Licence engagements — not priced separately."],
      ["When does commercial review apply?", "For embedded/OEM/enterprise licensing, white-label, exclusivity, territory, and large-scale or sovereign deployments."],
      ["Is exclusivity available?", "Exclusivity is never automatic. It is time-boxed, granted against a minimum annual guarantee, and carved out for direct and named accounts."],
      ["Do you sell direct as well?", "Yes — Resurrection Tech retains the right to sell direct; deal registration and named-account exclusions protect partner-sourced deals."],
      ["What is the minimum commitment?", "Most ongoing models carry a minimum annual commitment, confirmed during commercial review."],
    ],
  },
];

export default function Page() {
  return (
    <PageShell>
      <div className="mgp-page portal">
        {/* Section nav */}
        <nav className="portal-toc" aria-label="Partner portal sections">
          <div className="portal-toc-row">
            {TOC.map(([label, href]) => (
              <a href={href} key={href}>{label}</a>
            ))}
          </div>
        </nav>

        {/* ===== HERO / OVERVIEW ===== */}
        <section className="section mgp portal-hero" id="overview">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Partner portal</span>
              <h1>Everything you need to partner with Resurrection Tech™.</h1>
              <p className="mgp-lede">
                One link, one source of truth. After a discovery call, this is where partners find what
                Runtime Governance is, how the partnership works, the commercial and integration
                options, the executive-reporting layer, and the answers to the questions that usually
                take three more meetings.
              </p>
            </div>
            <div className="portal-kpis reveal" data-d="1">
              <div className="portal-kpi"><span className="portal-kpi-v">Pre-execution</span><span className="portal-kpi-k">governance, not after-the-fact logging</span></div>
              <div className="portal-kpi"><span className="portal-kpi-v">&lt; 1 ms</span><span className="portal-kpi-k">engine decision</span></div>
              <div className="portal-kpi"><span className="portal-kpi-v">Any stack</span><span className="portal-kpi-k">if it can POST over HTTPS, it can connect</span></div>
            </div>

            <div className="mgp-prose reveal" data-d="1" style={{ marginTop: 32 }}>
              <h2 style={{ fontSize: "1.2rem", margin: "0 0 8px" }}>Executive summary</h2>
              <p><b>What it is.</b> Runtime Governance evaluates an agent&rsquo;s proposed actions before they execute and returns ALLOW, BLOCK, or ESCALATE — keeping reachable trajectories out of forbidden states (Ω).</p>
              <p><b>Why enterprises need it.</b> Autonomous agents now touch payment systems, customer data, infrastructure, and regulated workflows. Pre-execution control is becoming a deployment requirement, not a feature.</p>
              <p><b>Why partners make sense.</b> You already hold the customer relationship, the security mandate, or the platform. Partners extend existing services into governed AI without inventing reachability-based governance themselves.</p>
              <p><b>Expected customer outcomes.</b> Safe agent deployment, board-ready evidence, faster compliance, and prevented incidents — with the partner owning the relationship and the renewal.</p>
            </div>
          </div>
        </section>

        {/* ===== PARTNERSHIP MODELS ===== */}
        <section className="section section--tight" id="models">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Partnership models</span>
              <h2>Choose the motion that fits your business.</h2>
              <p>From introductions to embedded licensing — every model, with who it&rsquo;s for and how it works.</p>
            </div>
            <div className="portal-models reveal" data-d="1">
              {MODELS.map((m) => (
                <div className="portal-model" key={m.h}>
                  <h3 className="portal-model-h">{m.h}</h3>
                  <div className="portal-model-row"><span className="portal-model-k">For</span><span className="portal-model-v">{m.forWho}</span></div>
                  <div className="portal-model-row"><span className="portal-model-k">Responsibilities</span><span className="portal-model-v">{m.resp}</span></div>
                  <div className="portal-model-row"><span className="portal-model-k">Typical customer</span><span className="portal-model-v">{m.customer}</span></div>
                  <div className="portal-model-row"><span className="portal-model-k">Commercial</span><span className="portal-model-v">{m.commercial}{m.href ? <> · <Link href={m.href}>details →</Link></> : null}</span></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== WHO PROVIDES WHAT ===== */}
        <section className="section section--tight" id="responsibilities">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Division of responsibility</span>
              <h2>Who provides what.</h2>
              <p>Across Resurrection Tech, the partner, and the end customer.</p>
            </div>
            <div className="tbl-wrap reveal" data-rowreveal data-d="1">
              <table className="tbl">
                <thead>
                  <tr><th>Responsibility</th><th>Resurrection Tech</th><th>Partner</th><th>End customer</th></tr>
                </thead>
                <tbody>
                  {MATRIX.map(([r, rt, p, c]) => (
                    <tr key={r}>
                      <td data-l="Responsibility" className="t-main">{r}</td>
                      <td data-l="Resurrection Tech">{rt}</td>
                      <td data-l="Partner">{p}</td>
                      <td data-l="End customer">{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ===== COMMERCIAL PATHWAYS ===== */}
        <section className="section section--tight" id="commercial">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Commercial pathways</span>
              <h2>How engagements are structured.</h2>
              <p>A ladder of engagements, not a price list. Each is scoped to where the partner and customer are.</p>
            </div>
            <div className="portal-list reveal" data-d="1">
              {COMMERCIAL_PATHS.map((c) => (
                <div className="portal-item" key={c.h}>
                  <h3 className="portal-item-h">{c.h}</h3>
                  <p className="portal-item-p">{c.p}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== PRICING ===== */}
        <section className="section section--tight" id="pricing">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Pricing</span>
              <h2>How pricing works.</h2>
            </div>
            <div className="mgp-prose reveal" data-d="1">
              <p><b>When fixed pricing applies.</b> Standard-ladder engagements have indicative bands — Runtime Governance Audit (£40K–£75K), Limited Pilot (£250K–£750K+), Annual Licence (£75K–£500K+/yr), Advisory Retainer (£35K–£100K+/mo), and Managed Governance Partner onboarding (£25K–£50K, recommended £35K).</p>
              <p><b>When commercial review applies.</b> Enterprise Integration, embedded/OEM/enterprise licensing, white-label, exclusivity, territory, and large-scale or sovereign deployments are scoped commercially.</p>
              <p><b>When annual commitments apply.</b> Ongoing platform access, licensing, and embedded models carry a minimum annual commitment confirmed during review.</p>
              <p><b>Onboarding vs implementation.</b> Onboarding is <b>strategic enablement</b> — it prepares a partner to sell and deliver governed AI. It is not a discount on enterprise pricing, and customer engagements continue through the standard ladder unchanged. Implementation is the technical work to deploy for a specific customer.</p>
              <p>See the full ladder on the <Link href="/enterprise-pathways">Enterprise pathways &amp; pricing</Link> page.</p>
            </div>
            <PricingDisclaimer variant="full" />
          </div>
        </section>

        {/* ===== INTEGRATION (reused components) ===== */}
        <IntegrationArchitecture />
        <DeploymentModels />

        {/* ===== EXECUTIVE REPORTS (reused) ===== */}
        <ExecutiveReports />

        {/* ===== CUSTOMER JOURNEY ===== */}
        <section className="section section--tight" id="journey">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Customer journey</span>
              <h2>From discovery to enterprise licensing.</h2>
              <p>The path a partner takes a customer through — and where the relationship compounds.</p>
            </div>
            <ol className="mgp-journey reveal" data-d="1">
              {JOURNEY.map((step) => (
                <li key={step}><div><span className="mgp-journey-h">{step}</span></div></li>
              ))}
            </ol>
          </div>
        </section>

        {/* ===== ENABLEMENT ===== */}
        <section className="section section--tight" id="enablement">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Partner enablement</span>
              <h2>Assets to take to market.</h2>
              <p>Download what&rsquo;s ready; the rest is available on request during onboarding.</p>
            </div>
            <div className="portal-list reveal" data-d="1">
              {ASSETS.map((a) => (
                <div className="portal-item" key={a.h}>
                  <h3 className="portal-item-h">{a.h}</h3>
                  <p className="portal-item-p">{a.p}</p>
                  {a.href
                    ? <a className="portal-item-tag" href={a.href} target="_blank" rel="noopener noreferrer">{a.status} ↓</a>
                    : <span className="portal-item-tag">{a.status}</span>}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== FAQ ===== */}
        <section className="section section--tight" id="faq">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">FAQ</span>
              <h2>Answers before you ask.</h2>
              <p>The questions partners raise most. The <a href="/partner-resources/partner-faq.md" target="_blank" rel="noopener noreferrer">full FAQ</a> covers 60+ across general, technical, and commercial.</p>
            </div>
            <div className="portal-faq reveal" data-d="1">
              {FAQ.map((g) => (
                <div className="portal-faqgroup" key={g.group}>
                  <h3 className="portal-faqgroup-h">{g.group}</h3>
                  {g.items.map(([q, a]) => (
                    <details key={q}>
                      <summary>{q}</summary>
                      <p className="portal-faq-a">{a}</p>
                    </details>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== NEXT STEPS ===== */}
        <section className="section section--tight" id="next">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Next steps</span>
              <h2>Ready to move forward?</h2>
              <p>Tell us your model and your customers, and we&rsquo;ll scope onboarding and a go-to-market plan.</p>
            </div>
            <div className="hero-actions reveal" data-d="1" style={{ marginTop: 8 }}>
              <Link href="/contact" className="btn btn--primary">Discuss Partnership <span className="arr">→</span></Link>
              <Link href="/book#strategy" className="btn btn--ghost">Book a call <span className="arr">→</span></Link>
              <Link href="/enterprise-pathways#partner-licensing" className="btn btn--ghost">All partner pathways <span className="arr">→</span></Link>
            </div>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
