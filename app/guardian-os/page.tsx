import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";

/* Shipping registries keep every quantified claim tied to the platform. */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const packRegistry = require("@/lib/ops/packs");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const workspaceRoles = require("@/lib/ops/workspaces").ROLES as {
  id: string;
  title: string;
  label: string;
  purpose: string;
}[];

const PACKS = packRegistry.all().map((pack: { id: string; industry: string }) => packRegistry.meta(pack)) as {
  id: string;
  industry: string;
  version: string;
  purpose: string;
  regulations: string[];
  counts: { policies: number; mappings: number; workflows: number; templates: number };
}[];

export const metadata: Metadata = {
  title: "Guardian OS™ — Operating Platform for Autonomous Enterprises",
  description:
    "Guardian OS is the operating platform for autonomous enterprises. It brings Runtime Governance, a continuously derived AI Twin, Executive Workspaces and Industry Intelligence Packs into one governed operating model.",
  alternates: { canonical: "/guardian-os" },
  openGraph: {
    title: "Guardian OS™ — Operating Platform for Autonomous Enterprises",
    description:
      "Operate AI systems and agents through one governed platform with continuous visibility, policy enforcement, evidence and executive control.",
    url: "/guardian-os",
  },
};

const PLATFORM = [
  {
    name: "Guardian OS",
    role: "Runs the enterprise operating model",
    detail: "Coordinates provisioning, governance, intelligence, evidence and executive operations.",
  },
  {
    name: "Runtime Governance",
    role: "Enforces policy before execution",
    detail: "Evaluates proposed actions at the tool-call boundary and fails closed when authority is absent.",
  },
  {
    name: "AI Twin",
    role: "Maintains current operational visibility",
    detail: "Continuously derives the estate, its dependencies, trust relationships, risk and runtime state.",
    href: "/ai-twin",
    hrefLabel: "Explore the AI Twin",
  },
  {
    name: "Industry Intelligence Packs",
    role: "Applies sector intelligence",
    detail: "Adds domain policies, regulatory mappings, evidence requirements and incident workflows to the same kernel.",
    href: "/intelligence-packs",
    hrefLabel: "Explore Intelligence Packs",
  },
  {
    name: "Executive Workspaces",
    role: "Turns governed state into operational control",
    detail: "Gives each leader a role-specific view of the same enterprise model, decisions and evidence.",
  },
];

const OPERATING_MODEL = [
  ["Enterprise Provisioning", "Establishes enterprise identity, business units, environments, systems, agents and trust boundaries."],
  ["AI Twin", "Continuously derives the operational model used across the platform."],
  ["Runtime Governance", "Evaluates authority, policy, reachability and approval requirements before execution."],
  ["Industry Intelligence Packs", "Adapt governance and evidence to the organisation’s sector and obligations."],
  ["Executive Workspaces", "Present role-specific decisions, posture, approvals and operational briefings."],
  ["Managed Governance", "Monitors drift, evidence quality and control performance throughout the operating lifecycle."],
];

const LIFECYCLE = [
  ["01", "Deploy or connect", "An AI system, agent or governed workflow enters the enterprise estate."],
  ["02", "Provision", "Guardian OS establishes identity, ownership, environment, permissions and control scope."],
  ["03", "Model", "The AI Twin derives the system, dependencies, trust relationships and reachability."],
  ["04", "Evaluate", "Runtime Governance assesses proposed behaviour against active policy before execution."],
  ["05", "Apply domain context", "The relevant Intelligence Pack adds sector controls and evidence requirements."],
  ["06", "Decide", "Allowed actions proceed; higher-risk actions route to the correct approval authority."],
  ["07", "Evidence", "Inputs, policy context, verdicts, approvals and outcomes are preserved."],
  ["08", "Brief", "Executive Workspaces update from the same governed source of truth."],
  ["09", "Monitor", "Continuous checks detect drift, policy change and emerging operational risk."],
];

const OUTCOMES = [
  ["Know every AI system", "Maintain an accountable view of systems, models, agents, tools and owners."],
  ["Understand every dependency", "See what each system can reach and the downstream consequence of change."],
  ["Govern every action", "Apply policy at the moment an autonomous system attempts to act."],
  ["Detect drift automatically", "Surface divergence from the approved estate and governance baseline."],
  ["Maintain evidence continuously", "Preserve decision and execution evidence as operations occur."],
  ["Deploy with control intact", "Move from pilot to production without rebuilding governance around every agent."],
  ["Reduce operational risk", "Make authority, escalation and failure behaviour explicit before incidents occur."],
];

const DEPLOYMENTS = [
  ["Cloud", "Operate Guardian OS within a cloud-aligned enterprise architecture."],
  ["Hybrid", "Coordinate governance across cloud services and controlled private environments."],
  ["Private cloud", "Keep platform services inside a dedicated enterprise cloud boundary."],
  ["On-premises", "Deploy within organisation-controlled infrastructure where the engagement supports it."],
  ["Sovereign", "Apply jurisdictional, residency and operational-control requirements to the deployment model."],
  ["Air-gapped", "Support isolated operating environments where available and scoped for the programme."],
];

const TRANSFORMATION = [
  ["AI inventory", "Spreadsheets and periodic discovery", "Continuously derived enterprise model"],
  ["Policy", "Documents interpreted after the fact", "Runtime evaluation before execution"],
  ["Executive visibility", "Separate reports and inconsistent numbers", "Role-specific views of one governed state"],
  ["Evidence", "Reconstructed for audit or incident review", "Generated through the operating lifecycle"],
  ["Sector controls", "Rebuilt for each programme", "Versioned Intelligence Packs on one kernel"],
  ["Change", "Manual reviews struggle to follow drift", "Baseline comparison and continuous monitoring"],
];

const PATHWAYS = [
  ["Assessment", "Establish risk, readiness, operating scope and the first governed use case.", "1–2 weeks"],
  ["Enterprise Provisioning", "Model the estate, establish trust boundaries and configure the operating environment.", "Scope dependent"],
  ["Guardian OS Licence", "Run the platform, workspaces, governed agents, AI Twin and selected Intelligence Packs.", "Annual"],
  ["Managed Governance", "Monitor drift, evidence, policy performance and revalidation requirements.", "Monthly or annual"],
  ["Executive Advisory", "Support accountable adoption, operating-model decisions and executive oversight.", "Monthly or annual"],
];

const RUNTIMES = ["OpenAI Agents", "LangGraph", "LangChain", "AutoGen", "Amazon Bedrock", "MCP servers", "Custom orchestrators"];
const ENTERPRISE_SYSTEMS = ["Microsoft 365", "Azure", "AWS", "Google Cloud", "Salesforce", "ServiceNow", "SAP", "Snowflake", "Databricks", "Palantir"];

function PlatformMap() {
  return (
    <div className="gos-platform-map reveal" role="img" aria-label="Guardian OS operating model: Guardian OS runs the enterprise, Runtime Governance enforces policy, the AI Twin provides visibility, Industry Intelligence Packs provide domain expertise and Executive Workspaces provide operational control.">
      {PLATFORM.map((item, index) => (
        <div className="gos-platform-row" key={item.name}>
          <div className={`gos-platform-node${index === 0 ? " is-os" : ""}${index === 1 ? " is-kernel" : ""}`}>
            <span className="gos-platform-index">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h3>{item.name}</h3>
              <strong>{item.role}</strong>
              <p>{item.detail}</p>
              {item.href && <Link href={item.href}>{item.hrefLabel} →</Link>}
            </div>
          </div>
          {index < PLATFORM.length - 1 && <span className="gos-platform-arrow" aria-hidden="true">↓</span>}
        </div>
      ))}
    </div>
  );
}

export default function GuardianOSPage() {
  return (
    <PageShell>
      <section className="gos-hero">
        <div className="gos-wrap">
          <span className="gos-eyebrow">Enterprise operating platform</span>
          <h1 className="gos-h1">
            Guardian OS<span className="gos-tm">™</span>
            <span className="gos-h1-sub">The operating platform for autonomous enterprises.</span>
          </h1>
          <p className="gos-lede">
            Guardian OS gives organisations one operating environment for deploying, governing and supervising
            AI systems and autonomous agents.
          </p>
          <p className="gos-lede-2">
            It combines Runtime Governance, a continuously derived AI Twin, Industry Intelligence Packs,
            Executive Workspaces, enterprise provisioning and managed governance—without changing the
            governance kernel for each deployment model or sector.
          </p>
          <div className="gos-cta-row">
            <Link href="/book" className="gos-btn gos-btn-primary">Book an enterprise briefing</Link>
            <a href="#platform" className="gos-btn gos-btn-ghost">See the operating model</a>
          </div>
          <div className="gos-hero-proof" aria-label="Guardian OS platform attributes">
            <span>Model independent</span>
            <span>Policy enforced at runtime</span>
            <span>Evidence by construction</span>
            <span>Cloud to sovereign deployment</span>
          </div>
        </div>
      </section>

      <section className="gos-section gos-section-alt" id="platform">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">One integrated platform</span>
            <h2 className="gos-h2">Operate the enterprise. Govern the action. Preserve the evidence.</h2>
            <p className="gos-sec-lede">
              Guardian OS is the operating layer. Runtime Governance is the control boundary. The AI Twin is the
              current model of the enterprise. Intelligence Packs adapt the platform to the sector. Executive
              Workspaces turn governed state into decisions.
            </p>
          </header>
          <PlatformMap />
        </div>
      </section>

      <section className="gos-section" id="architecture">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Enterprise operating model</span>
            <h2 className="gos-h2">Six capabilities. One source of governed truth.</h2>
            <p className="gos-sec-lede">
              Each capability has a distinct responsibility, but all operate over the same identities, policies,
              evidence and enterprise state. There are no disconnected governance dashboards to reconcile.
            </p>
          </header>
          <div className="gos-operating-grid">
            {OPERATING_MODEL.map(([title, body], index) => (
              <article className="gos-operating-card reveal" data-d={String((index % 3) + 1)} key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
          <div className="gos-kernel-band reveal">
            <div>
              <span className="gos-kicker">Common control plane</span>
              <h3>One Runtime Governance kernel across the platform.</h3>
            </div>
            <ul>
              <li>Deny by default</li>
              <li>Fail closed</li>
              <li>Deny-only policy extensions</li>
              <li>Evidence-backed verdicts</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="gos-section gos-section-alt" id="lifecycle">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Continuous operating lifecycle</span>
            <h2 className="gos-h2">Governance continues after deployment.</h2>
            <p className="gos-sec-lede">
              Guardian OS does not end at onboarding. It continuously connects enterprise state, runtime decisions,
              sector obligations, evidence and executive oversight.
            </p>
          </header>
          <ol className="gos-lifecycle">
            {LIFECYCLE.map(([number, title, body], index) => (
              <li className="gos-lifecycle-step reveal" data-d={String((index % 3) + 1)} key={number}>
                <span className="gos-lifecycle-number">{number}</span>
                <div><h3>{title}</h3><p>{body}</p></div>
              </li>
            ))}
          </ol>
          <div className="gos-continuous reveal">
            <span>Continuous loop</span>
            <strong>Observe → evaluate → decide → evidence → brief → monitor → re-evaluate</strong>
          </div>
        </div>
      </section>

      <section className="gos-section" id="outcomes">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Executive outcomes</span>
            <h2 className="gos-h2">Control the estate without slowing the mission.</h2>
          </header>
          <div className="gos-outcome-grid">
            {OUTCOMES.map(([title, body], index) => (
              <article className="gos-outcome reveal" data-d={String((index % 3) + 1)} key={title}>
                <h3>{title}.</h3><p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="gos-section gos-section-alt" id="transformation">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Before and after</span>
            <h2 className="gos-h2">From fragmented AI oversight to an operating model.</h2>
          </header>
          <div className="gos-comparison reveal" role="table" aria-label="Enterprise transformation before and after Guardian OS">
            <div className="gos-comparison-head" role="row">
              <span role="columnheader">Operating concern</span>
              <span role="columnheader">Before Guardian OS</span>
              <span role="columnheader">With Guardian OS</span>
            </div>
            {TRANSFORMATION.map(([area, before, after]) => (
              <div className="gos-comparison-row" role="row" key={area}>
                <strong role="cell">{area}</strong>
                <span role="cell">{before}</span>
                <span role="cell">{after}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="gos-section" id="workspaces">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Executive Workspaces</span>
            <h2 className="gos-h2">One enterprise. Role-specific command.</h2>
            <p className="gos-sec-lede">
              Every workspace reads from the same AI Twin, governance state and evidence system. Leaders see the
              decisions relevant to their mandate without creating competing versions of the enterprise.
            </p>
          </header>
          <div className="gos-ws-grid">
            {workspaceRoles.map((role, index) => (
              <article className="gos-ws reveal" data-d={String((index % 3) + 1)} key={role.id}>
                <h3 className="gos-ws-t">{role.title}</h3>
                <span className="gos-ws-l">{role.label}</span>
                <p className="gos-ws-p">{role.purpose}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="gos-section gos-section-alt" id="industry">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Industry Intelligence Packs</span>
            <h2 className="gos-h2">Sector intelligence without a separate platform.</h2>
            <p className="gos-sec-lede">
              Versioned packs contribute policies, regulatory mappings, evidence requirements and incident
              workflows to the same Runtime Governance kernel. They can add constraints; they cannot weaken the
              enterprise baseline.
            </p>
          </header>
          <div className="gos-pack-summary">
            {PACKS.map((pack, index) => (
              <article className="gos-pack-compact reveal" data-d={String((index % 3) + 1)} key={pack.id}>
                <header><h3>{pack.industry}</h3><span>v{pack.version}</span></header>
                <p>{pack.purpose}</p>
                <dl>
                  <div><dt>Policies</dt><dd>{pack.counts.policies}</dd></div>
                  <div><dt>Evidence maps</dt><dd>{pack.counts.mappings}</dd></div>
                  <div><dt>Workflows</dt><dd>{pack.counts.workflows}</dd></div>
                </dl>
              </article>
            ))}
          </div>
          <p className="gos-int-note reveal">
            Pack counts are read directly from the shipping registry. Availability and regulatory scope are
            confirmed during assessment.
          </p>
          <div className="gos-cta-row reveal">
            <Link href="/intelligence-packs" className="gos-btn gos-btn-ghost">Explore Industry Intelligence Packs</Link>
          </div>
        </div>
      </section>

      <section className="gos-section" id="deployment">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Deployment profiles</span>
            <h2 className="gos-h2">Change the deployment boundary—not the governance standard.</h2>
            <p className="gos-sec-lede">
              Guardian OS can be aligned to enterprise, jurisdictional and infrastructure requirements. The
              hosting and connectivity model may change; the Runtime Governance kernel and decision contract do not.
            </p>
          </header>
          <div className="gos-deployment-grid">
            {DEPLOYMENTS.map(([title, body], index) => (
              <article className="gos-deployment reveal" data-d={String((index % 3) + 1)} key={title}>
                <h3>{title}</h3><p>{body}</p>
              </article>
            ))}
          </div>
          <div className="gos-deployment-kernel reveal">
            <span>Deployment profile</span><b>Cloud · Hybrid · Private · On-premises · Sovereign · Air-gapped</b>
            <span>Unchanged control contract</span><b>Identity → policy → verdict → approval → execution → evidence</b>
          </div>
        </div>
      </section>

      <section className="gos-section gos-section-alt" id="integration">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Enterprise integration</span>
            <h2 className="gos-h2">Governed where autonomous systems attempt to act.</h2>
            <p className="gos-sec-lede">
              Guardian OS sits at the agent and tool-call boundary. It evaluates the proposed action before it
              reaches the enterprise system, independent of the model that produced it.
            </p>
          </header>
          <div className="gos-int">
            <div className="gos-int-col reveal">
              <span className="gos-int-h">Agent and orchestration layer</span>
              <p className="gos-int-p">Where Guardian OS receives the proposed action for governance.</p>
              <div className="gos-int-tags">{RUNTIMES.map((item) => <span className="gos-int-tag is-native" key={item}>{item}</span>)}</div>
            </div>
            <div className="gos-int-col reveal" data-d="1">
              <span className="gos-int-h">Enterprise destination</span>
              <p className="gos-int-p">Where the governed action would execute if policy and authority allow it.</p>
              <div className="gos-int-tags">{ENTERPRISE_SYSTEMS.map((item) => <span className="gos-int-tag" key={item}>{item}</span>)}</div>
            </div>
          </div>
          <p className="gos-int-note reveal">
            Named systems illustrate common destinations for governed actions. They do not imply a native connector
            or vendor endorsement. <Link href="/integrations" className="twin-inline-link">Review the integration model →</Link>
          </p>
        </div>
      </section>

      <section className="gos-section" id="adoption">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Enterprise adoption</span>
            <h2 className="gos-h2">Move from assessed risk to continuous operation.</h2>
            <p className="gos-sec-lede">
              Adoption is staged so architecture, policy, operational ownership and evidence can be validated
              before the platform becomes part of the enterprise control environment.
            </p>
          </header>
          <ol className="gos-ladder">
            {PATHWAYS.map(([title, body, timing], index) => (
              <li className="gos-ladder-step reveal" data-d={String((index % 3) + 1)} key={title}>
                <span className="gos-ladder-n">{String(index + 1).padStart(2, "0")}</span>
                <div className="gos-ladder-body"><h3>{title}</h3><p>{body}</p></div>
                <span className="gos-ladder-t">{timing}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="gos-final">
        <div className="gos-wrap">
          <span className="gos-kicker">Enterprise infrastructure for autonomous operations</span>
          <h2 className="gos-final-h">Operate AI with visibility, policy and evidence built in.</h2>
          <p className="twin-final-sub">
            Start with one governed use case. Establish the operating model required to scale.
          </p>
          <div className="gos-cta-row gos-cta-center">
            <Link href="/book" className="gos-btn gos-btn-primary">Book an enterprise briefing</Link>
            <Link href="/ai-twin" className="gos-btn gos-btn-ghost">Explore the AI Twin</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
