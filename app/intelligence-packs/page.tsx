import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";

/* Read every public figure from the shipping registry. */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const packRegistry = require("@/lib/ops/packs");

const NEUTRAL_CONTEXT = {
  entities: {},
  health: null,
  incidents: [],
  blocked: [],
  scopedPolicies: [],
  packs: [],
  cmd: null,
  drift: { open: [] },
  recentEv: [],
  proposals: [],
  escalated: [],
  queue: { count: 0 },
  twin: null,
  perf: null,
  trends: null,
  brief: null,
  recs: [],
};

type Pack = {
  id: string;
  version: string;
  industry: string;
  title: string;
  purpose: string;
  regulations: string[];
  policies: { name: string; domain: string }[];
  counts: {
    policies: number;
    templates: number;
    mappings: number;
    workflows: number;
  };
  metrics: number;
};

const PACKS: Pack[] = packRegistry.all().map((pack: { metrics: (ctx: typeof NEUTRAL_CONTEXT) => unknown[] }) => ({
  ...packRegistry.meta(pack),
  metrics: (() => {
    try {
      return pack.metrics(NEUTRAL_CONTEXT).length;
    } catch {
      return 0;
    }
  })(),
}));

const TOTALS = PACKS.reduce(
  (totals, pack) => ({
    policies: totals.policies + pack.counts.policies,
    mappings: totals.mappings + pack.counts.mappings,
    workflows: totals.workflows + pack.counts.workflows,
    templates: totals.templates + pack.counts.templates,
  }),
  { policies: 0, mappings: 0, workflows: 0, templates: 0 },
);

export const metadata: Metadata = {
  title: "Industry Intelligence Packs — Sector Intelligence for Guardian OS",
  description:
    "Industry Intelligence Packs adapt Guardian OS to financial services, healthcare, cybersecurity, government, manufacturing, insurance, retail and education—without forking the Runtime Governance kernel.",
  alternates: { canonical: "/intelligence-packs" },
  openGraph: {
    title: "Industry Intelligence Packs — Sector Intelligence for Guardian OS",
    description:
      "Versioned sector intelligence, runtime policies, evidence mappings, executive metrics and incident workflows on one governed enterprise platform.",
    url: "/intelligence-packs",
  },
};

const CONTRACT = [
  ["Runtime policies", "Deny-only Ω policies that constrain sector-specific actions at the moment of execution."],
  ["Policy templates", "Reusable starting points for enterprise-specific controls, thresholds and approval rules."],
  ["Regulatory mappings", "Connections between obligations, implemented controls and the evidence those controls produce."],
  ["Incident workflows", "Sector-specific response steps for events that require investigation, escalation and retained evidence."],
  ["Executive metrics", "Domain measures derived from the same governed enterprise context used across Guardian OS."],
  ["Specialist workspace", "A sector view over the shared AI Twin—never a separate dashboard or second source of truth."],
  ["Recommendations", "Domain-aware candidates that enter the same proposal, approval and evidence lifecycle as other actions."],
  ["Independent versioning", "A clear pack identity and version so changes can be governed, tested and traced."],
];

const LIFECYCLE = [
  ["01", "Match", "Enterprise provisioning identifies the sector and suggests the relevant pack."],
  ["02", "Review", "Policies, mappings, workflows and operating responsibilities are assessed against the enterprise scope."],
  ["03", "Install", "The pack is installed for the provisioned enterprise and recorded in the audit trail."],
  ["04", "Validate", "Each contributed policy passes through the existing dynamic-policy validation lifecycle."],
  ["05", "Activate", "Approved deny-only policies become active in the same Runtime Governance kernel."],
  ["06", "Project", "The specialist workspace and metrics resolve over the same AI Twin and enterprise evidence."],
  ["07", "Operate", "Domain recommendations, incidents and evidence flow through Guardian OS continuously."],
  ["08", "Revalidate", "Pack versions and enterprise-specific controls are reviewed as the estate or obligations change."],
];

const TRANSFORMATION = [
  ["Policy design", "Start from a blank control set", "Start from versioned sector controls and templates"],
  ["Regulatory context", "Interpret obligations separately from operations", "Map obligations to controls and evidence"],
  ["Executive reporting", "Build another sector dashboard", "Project a specialist view from the shared AI Twin"],
  ["Incident response", "Create procedures after an event", "Use defined sector workflows and escalation paths"],
  ["Recommendations", "Review generic AI findings", "Receive domain-aware, evidence-backed proposals"],
  ["Platform architecture", "Fork or customise the governance engine", "Keep one kernel and add declarative intelligence"],
];

const EXAMPLES = [
  ["Financial services", "An agent attempts a high-value payment", "Apply payment thresholds, strong authorisation and approval evidence before execution."],
  ["Healthcare", "An agent attempts to use a clinical tool", "Require clinician authority and preserve the patient-safety decision trail."],
  ["Cybersecurity", "An agent attempts a privileged security action", "Apply least-privilege controls, detect attack patterns and retain the refusal evidence."],
  ["Manufacturing", "An agent attempts robotic or safety-related actuation", "Require engineering authority and enforce the operational safety boundary."],
];

const INVARIANTS = [
  ["One kernel", "Packs do not replace, duplicate or modify the Runtime Governance kernel."],
  ["One AI Twin", "Every specialist view reads the same enterprise identities, assets, dependencies, risk and evidence."],
  ["Deny-only extension", "A pack may add constraints. It cannot weaken the enterprise baseline or create new permission."],
  ["Governed installation", "Policies move through draft, validation and activation rather than appearing as unreviewed configuration."],
  ["Reversible lifecycle", "Removing a pack rolls back its contributed policies and returns the enterprise to its prior baseline."],
  ["Honest metrics", "Where evidence is not connected, the platform reports the gap rather than manufacturing a figure."],
];

const PLATFORM = [
  ["AI Twin", "Supplies the current enterprise systems, relationships, risks and evidence."],
  ["Intelligence Pack", "Interprets that context through the organisation’s sector, obligations and operating risks."],
  ["Runtime Governance", "Enforces the pack’s approved deny-only policies before autonomous action."],
  ["Guardian OS", "Coordinates the lifecycle, recommendations, incidents, approvals and continuous monitoring."],
  ["Executive Workspaces", "Present sector intelligence to the leaders responsible for decisions and oversight."],
];

export default function IntelligencePacksPage() {
  return (
    <PageShell>
      <section className="gos-hero ip-hero">
        <div className="gos-wrap">
          <span className="gos-eyebrow">Industry Intelligence Packs</span>
          <h1 className="gos-h1">
            Sector intelligence<span className="ip-title-break"> built into Guardian OS.</span>
          </h1>
          <p className="gos-lede">
            Industry Intelligence Packs adapt Guardian OS to the policies, evidence, metrics and operational
            decisions that matter in your sector.
          </p>
          <p className="gos-lede-2">
            They do not create another platform. Each pack is a versioned, declarative intelligence layer over the
            same Runtime Governance kernel, the same AI Twin and the same governed operating lifecycle.
          </p>
          <div className="gos-cta-row">
            <Link href="/book" className="gos-btn gos-btn-primary">Discuss your industry</Link>
            <a href="#catalog" className="gos-btn gos-btn-ghost">Explore the pack catalog</a>
          </div>
          <div className="ip-proof" aria-label="Shipping Industry Intelligence Pack facts">
            <div><strong>{PACKS.length}</strong><span>packs shipping</span></div>
            <div><strong>{TOTALS.policies}</strong><span>runtime policies</span></div>
            <div><strong>{TOTALS.mappings}</strong><span>evidence mappings</span></div>
            <div><strong>{TOTALS.workflows}</strong><span>incident workflows</span></div>
            <div><strong>1</strong><span>governance kernel</span></div>
          </div>
        </div>
      </section>

      <section className="gos-section gos-section-alt" id="problem">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">The enterprise problem</span>
            <h2 className="gos-h2">Generic governance does not understand sector consequence.</h2>
            <p className="gos-sec-lede">
              The control boundary may be common, but the meaning of an action is not. A payment, clinical
              recommendation, privileged security command or robotic instruction carries different authority,
              evidence and escalation requirements.
            </p>
          </header>
          <div className="ip-example-grid">
            {EXAMPLES.map(([sector, event, response], index) => (
              <article className="ip-example reveal" data-d={String((index % 3) + 1)} key={sector}>
                <span>{sector}</span>
                <h3>{event}</h3>
                <p>{response}</p>
              </article>
            ))}
          </div>
          <div className="gos-problem-turn reveal">
            <p className="gos-problem-q">The kernel provides the control boundary. The pack provides the domain judgement.</p>
            <p className="gos-problem-a">
              Resurrection Tech separates these responsibilities deliberately. Runtime Governance remains stable
              and model independent. Industry intelligence can evolve by sector without fragmenting the platform.
            </p>
          </div>
        </div>
      </section>

      <section className="gos-section" id="architecture">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Architecture</span>
            <h2 className="gos-h2">One operating platform. Declarative sector layers.</h2>
            <p className="gos-sec-lede">
              Installing a pack contributes domain intelligence to services Guardian OS already operates. No
              product is duplicated and no sector receives a private fork of the kernel.
            </p>
          </header>
          <div className="ip-architecture reveal" role="img" aria-label="Guardian OS and the AI Twin provide shared enterprise context. An Industry Intelligence Pack contributes sector intelligence. Runtime Governance enforces the resulting policies and Executive Workspaces provide oversight.">
            <div className="ip-arch-source">
              <span>Shared enterprise context</span>
              <strong>Guardian OS + AI Twin</strong>
              <small>Assets · agents · dependencies · trust · risk · evidence</small>
            </div>
            <span className="ip-arch-arrow" aria-hidden="true">↓</span>
            <div className="ip-arch-pack">
              <span>Declarative domain layer</span>
              <strong>Industry Intelligence Pack</strong>
              <small>Policy · evidence · metrics · workflow · recommendations</small>
            </div>
            <span className="ip-arch-arrow" aria-hidden="true">↓</span>
            <div className="ip-arch-output">
              <div><span>Enforcement</span><strong>Runtime Governance</strong></div>
              <div><span>Operational control</span><strong>Executive Workspaces</strong></div>
            </div>
          </div>
          <div className="ip-invariant-grid">
            {INVARIANTS.map(([title, body], index) => (
              <article className="ip-invariant reveal" data-d={String((index % 3) + 1)} key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="gos-section gos-section-alt" id="contents">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">The pack contract</span>
            <h2 className="gos-h2">Every pack must carry operational intelligence—not a folder of documents.</h2>
            <p className="gos-sec-lede">
              The registry validates a common contract at load time. A malformed pack fails before installation
              rather than entering the enterprise in a partially configured state.
            </p>
          </header>
          <div className="ip-contract-grid">
            {CONTRACT.map(([title, body], index) => (
              <article className="ip-contract reveal" data-d={String((index % 3) + 1)} key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="gos-section" id="catalog">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Shipping catalog</span>
            <h2 className="gos-h2">{PACKS.length} sectors. One validated pack architecture.</h2>
            <p className="gos-sec-lede">
              Every figure below is read directly from the production pack registry. Pack scope is confirmed
              against the enterprise’s jurisdiction, systems and obligations during assessment.
            </p>
          </header>
          <div className="ip-catalog">
            {PACKS.map((pack, index) => (
              <article className="ip-pack reveal" data-d={String((index % 3) + 1)} key={pack.id}>
                <header>
                  <div><span>{pack.title}</span><h3>{pack.industry}</h3></div>
                  <b>v{pack.version}</b>
                </header>
                <p>{pack.purpose}</p>
                <div className="ip-regulations">
                  {pack.regulations.map((regulation) => <span key={regulation}>{regulation}</span>)}
                </div>
                <dl>
                  <div><dt>Policies</dt><dd>{pack.counts.policies}</dd></div>
                  <div><dt>Templates</dt><dd>{pack.counts.templates}</dd></div>
                  <div><dt>Evidence maps</dt><dd>{pack.counts.mappings}</dd></div>
                  <div><dt>Workflows</dt><dd>{pack.counts.workflows}</dd></div>
                  <div><dt>Executive metrics</dt><dd>{pack.metrics}</dd></div>
                  <div><dt>Kernel</dt><dd>Shared</dd></div>
                </dl>
              </article>
            ))}
          </div>
          <div className="ip-extension-note reveal">
            <div>
              <span className="gos-kicker">Additional sectors</span>
              <h3>A new sector is a new validated pack—not a new Guardian OS.</h3>
            </div>
            <p>
              Additional domain layers can be developed through the same contract: independently versioned,
              deny-only, evidence-aware and governed through the same installation lifecycle.
            </p>
          </div>
        </div>
      </section>

      <section className="gos-section gos-section-alt" id="lifecycle">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Governed lifecycle</span>
            <h2 className="gos-h2">Installed with control. Operated continuously. Reversible by design.</h2>
            <p className="gos-sec-lede">
              A pack is not copied into production as unchecked configuration. Its controls enter through the
              existing policy lifecycle and remain part of the managed governance operating model.
            </p>
          </header>
          <ol className="ip-lifecycle">
            {LIFECYCLE.map(([number, title, body], index) => (
              <li className="ip-lifecycle-step reveal" data-d={String((index % 3) + 1)} key={number}>
                <span>{number}</span><div><h3>{title}</h3><p>{body}</p></div>
              </li>
            ))}
          </ol>
          <div className="ip-lifecycle-rule reveal">
            <span>Install</span><b>Draft → validate → activate → audit</b>
            <span>Operate</span><b>Observe → recommend → govern → approve → evidence</b>
            <span>Remove</span><b>Rollback contributed policies → restore prior baseline</b>
          </div>
        </div>
      </section>

      <section className="gos-section" id="transformation">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Enterprise transformation</span>
            <h2 className="gos-h2">Move faster without flattening sector risk.</h2>
          </header>
          <div className="gos-comparison reveal" role="table" aria-label="Enterprise governance before and after installing an Industry Intelligence Pack">
            <div className="gos-comparison-head" role="row">
              <span role="columnheader">Operating concern</span>
              <span role="columnheader">Without a pack</span>
              <span role="columnheader">With an Intelligence Pack</span>
            </div>
            {TRANSFORMATION.map(([area, before, after]) => (
              <div className="gos-comparison-row" role="row" key={area}>
                <strong role="cell">{area}</strong><span role="cell">{before}</span><span role="cell">{after}</span>
              </div>
            ))}
          </div>
          <div className="ip-outcomes">
            {[
              ["Shorten implementation", "Begin with tested domain structures instead of an empty policy file."],
              ["Preserve one architecture", "Scale across industries without multiplying kernels, twins or governance dashboards."],
              ["Improve executive relevance", "Turn common enterprise evidence into the sector questions leaders actually need answered."],
              ["Strengthen audit readiness", "Connect controls and operational evidence to the obligations they are intended to support."],
            ].map(([title, body], index) => (
              <article className="ip-outcome reveal" data-d={String((index % 3) + 1)} key={title}>
                <h3>{title}</h3><p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="gos-section gos-section-alt" id="platform">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">One enterprise operating platform</span>
            <h2 className="gos-h2">Domain expertise in context—not in isolation.</h2>
          </header>
          <div className="ip-platform">
            {PLATFORM.map(([name, body], index) => (
              <div className={`ip-platform-row reveal${index === 1 ? " is-pack" : ""}`} data-d={String((index % 3) + 1)} key={name}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><h3>{name}</h3><p>{body}</p></div>
                {index < PLATFORM.length - 1 && <b aria-hidden="true">↓</b>}
              </div>
            ))}
          </div>
          <div className="ip-crosslinks reveal">
            <Link href="/guardian-os">Explore Guardian OS <span>→</span></Link>
            <Link href="/ai-twin">Explore the AI Twin <span>→</span></Link>
            <Link href="/integrations">Review enterprise integration <span>→</span></Link>
          </div>
        </div>
      </section>

      <section className="gos-final">
        <div className="gos-wrap">
          <span className="gos-kicker">One kernel. Your sector. Governed from day one.</span>
          <h2 className="gos-final-h">Bring domain intelligence into the operating platform.</h2>
          <p className="twin-final-sub">
            Start with the pack aligned to your sector, then validate it against your systems, authority model and
            regulatory environment.
          </p>
          <div className="gos-cta-row gos-cta-center">
            <Link href="/book" className="gos-btn gos-btn-primary">Discuss your industry</Link>
            <Link href="/guardian-os" className="gos-btn gos-btn-ghost">Explore Guardian OS</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
