import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "AI Twin™ — A Continuously Derived Model of the AI Enterprise",
  description:
    "The AI Twin is a continuously derived model of enterprise AI systems, agents, models, tools, dependencies, policies, trust relationships, reachability, risks and runtime state—built from operational evidence rather than manual documentation.",
  alternates: { canonical: "/ai-twin" },
  openGraph: {
    title: "AI Twin™ — A Continuously Derived Model of the AI Enterprise",
    description:
      "Replace static AI inventories with a current, evidence-derived enterprise model for governance, security, compliance and operations.",
    url: "/ai-twin",
  },
};

const QUESTIONS = [
  "What AI systems exist?",
  "What agents are running?",
  "Who owns them?",
  "Which models do they use?",
  "What tools can they access?",
  "Which policies govern them?",
  "What has changed?",
  "Where are the risks?",
];

const DERIVATION = [
  ["01", "Collect", "Approved provisioning records, governance decisions, runtime events and monitoring evidence."],
  ["02", "Normalise", "Systems, agents, models, tools, identities and environments resolve into a common schema."],
  ["03", "Relate", "Dependencies, permissions, trust boundaries, policy scope and reachability become graph relationships."],
  ["04", "Derive", "The current enterprise model is assembled from evidence rather than copied into a separate inventory."],
  ["05", "Compare", "The live model is evaluated against the governed baseline to identify meaningful change."],
  ["06", "Project", "Executive Workspaces present the same model through role-specific operational views."],
];

const GRAPH = [
  ["Enterprise", "Organisations, business units, regions, environments, compliance domains and ownership."],
  ["Assets", "AI systems, models, tools, MCP servers, APIs, data services and protected resources."],
  ["Agents", "Deployed agents, specialist roles, autonomy levels, assigned capabilities and operating context."],
  ["Dependencies", "The systems, tools, services and workflows each component relies on or can affect."],
  ["Trust relationships", "Identity providers, operators, approvers, boundaries and delegated authority."],
  ["Policies", "Applicable controls, approval requirements, protected actions and evidence obligations."],
  ["Risks", "Open incidents, risk zones, privileged capability, policy gaps and exposed critical assets."],
  ["Reachability", "Which assets and outcomes are reachable from an agent’s current permissions and tool access."],
  ["Runtime state", "Current governance state, active environments, recent decisions and observed change."],
];

const COMPARISON = [
  ["Creation", "Written or drawn by a person", "Generated from operational evidence"],
  ["Freshness", "Current at the last review", "Re-derived as governed state changes"],
  ["Coverage", "Usually systems and owners", "Systems, agents, tools, policy, trust, risk and reachability"],
  ["Change detection", "Depends on someone reporting it", "Compared with the approved baseline"],
  ["Auditability", "Explains what was documented", "Links current state to source evidence"],
  ["Executive use", "Separate reports for each function", "Role-specific views of one shared model"],
];

const DRIFT = [
  ["New AI system", "A system appears outside the approved estate or expected provisioning path."],
  ["New MCP server", "A server is added outside the governed baseline."],
  ["New tool", "A new capability changes what an agent or AI system can reach."],
  ["Permission change", "An existing tool is elevated to privileged capability."],
  ["Removed control", "A protected asset, critical-system control, risk zone or governance department is removed."],
  ["Disabled policy", "A policy required by the governed baseline is no longer active."],
  ["Unexpected autonomy", "The operating autonomy level rises above the approved baseline."],
  ["Trust-boundary violation", "A new system operates in an environment outside its declared trust boundary."],
];

const STAKEHOLDERS = [
  ["CEO", "Business overview", "See where AI is operating, who owns it and which decisions or risks require executive attention."],
  ["CTO", "Architecture", "Understand systems, agents, models, dependencies, environments and the impact of change."],
  ["CISO", "Security posture", "Identify privileged capability, trust-boundary exposure, permission drift and reachable assets."],
  ["Risk & Compliance", "Evidence", "Connect obligations, policies, decisions, approvals and retained evidence to the current estate."],
  ["Operations", "Live estate", "Track active systems, monitoring state, open drift and operational intervention queues."],
  ["Engineering", "Dependencies", "See tool access, integration paths, upstream dependencies and likely blast radius before change."],
];

const PLATFORM_ROLES = [
  ["AI Twin", "What exists?", "Continuously derives the enterprise, its relationships and current state."],
  ["Runtime Governance", "What is allowed?", "Evaluates proposed behaviour against policy, authority and reachability."],
  ["Guardian OS", "How is the enterprise operated?", "Coordinates provisioning, governance, evidence, monitoring and executive operations."],
  ["Industry Intelligence Packs", "How is governance adapted to the sector?", "Contribute domain policies, mappings, evidence requirements and workflows."],
  ["Executive Workspaces", "How do leaders interact with the platform?", "Present the same governed state through role-specific decisions and briefings."],
];

export default function AiTwinPage() {
  return (
    <PageShell>
      <section className="gos-hero">
        <div className="gos-wrap">
          <span className="gos-eyebrow">Continuously derived enterprise model</span>
          <h1 className="gos-h1">
            AI Twin<span className="gos-tm">™</span>
            <span className="gos-h1-sub">See the AI enterprise as it is now.</span>
          </h1>
          <p className="gos-lede">
            The AI Twin is a continuously derived model of every governed AI system, agent, model, tool,
            dependency, policy, trust relationship, risk and runtime state.
          </p>
          <p className="gos-lede-2">
            It is generated from operational evidence—not maintained as a separate inventory—so leaders can work
            from a current model of the enterprise rather than a diagram of what the enterprise used to be.
          </p>
          <div className="gos-cta-row">
            <Link href="/book" className="gos-btn gos-btn-primary">Book an enterprise briefing</Link>
            <a href="#derived" className="gos-btn gos-btn-ghost">Why derived matters</a>
          </div>
          <div className="twin-signal-line" aria-label="AI Twin defining characteristics">
            <span>Derived</span><span>Evidence-backed</span><span>Continuously generated</span><span>Read-only by default</span>
          </div>
        </div>
      </section>

      <section className="gos-section gos-section-alt" id="problem">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">The visibility gap</span>
            <h2 className="gos-h2">Most organisations cannot answer basic questions about their AI estate.</h2>
            <p className="gos-sec-lede">
              AI estates change faster than manual governance processes can document them. A spreadsheet may list
              approved systems. It rarely shows the agents now running, the tools they can reach, the policies
              currently in force or what changed since the last review.
            </p>
          </header>
          <div className="twin-question-grid">
            {QUESTIONS.map((question, index) => (
              <div className="twin-question reveal" data-d={String((index % 3) + 1)} key={question}>
                <span>{String(index + 1).padStart(2, "0")}</span><strong>{question}</strong>
              </div>
            ))}
          </div>
          <div className="gos-problem-turn reveal">
            <p className="gos-problem-q">Static documentation records intent. Governance needs operational reality.</p>
            <p className="gos-problem-a">
              Architecture diagrams, registers and control spreadsheets remain useful records. They fail when
              treated as the live model of a changing autonomous estate. The AI Twin closes that gap by deriving
              current state from the governed system itself.
            </p>
          </div>
        </div>
      </section>

      <section className="gos-section" id="derived">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">The defining difference</span>
            <h2 className="gos-h2">Derived—not manually maintained.</h2>
            <p className="gos-sec-lede">
              A conventional inventory is another copy of the truth. Every copy needs an owner, a review cycle and
              reconciliation. The AI Twin is assembled from the evidence and governed records the operating
              platform already produces.
            </p>
          </header>
          <div className="twin-derivation">
            {DERIVATION.map(([number, title, body], index) => (
              <div className="twin-derive-step reveal" data-d={String((index % 3) + 1)} key={number}>
                <span>{number}</span><h3>{title}</h3><p>{body}</p>
              </div>
            ))}
          </div>
          <div className="twin-derived-rule reveal">
            <span>Runtime evidence and governed records</span>
            <b>→</b>
            <strong>Continuously derived AI Twin</strong>
            <b>→</b>
            <span>Current operational and executive views</span>
          </div>
        </div>
      </section>

      <section className="gos-section gos-section-alt" id="comparison">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Why derived matters</span>
            <h2 className="gos-h2">A living enterprise cannot be governed from a static picture.</h2>
          </header>
          <div className="gos-comparison twin-comparison reveal" role="table" aria-label="Static documentation compared with a continuously derived enterprise model">
            <div className="gos-comparison-head" role="row">
              <span role="columnheader">Concern</span>
              <span role="columnheader">Static documentation</span>
              <span role="columnheader">Continuously derived model</span>
            </div>
            {COMPARISON.map(([area, staticState, derivedState]) => (
              <div className="gos-comparison-row" role="row" key={area}>
                <strong role="cell">{area}</strong>
                <span role="cell">{staticState}</span>
                <span role="cell">{derivedState}</span>
              </div>
            ))}
          </div>
          <p className="twin-comparison-note reveal">
            The result is better operational awareness, stronger evidence and faster governance decisions—not
            because documentation disappears, but because it is no longer asked to behave like a runtime system.
          </p>
        </div>
      </section>

      <section className="gos-section" id="graph">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Enterprise graph</span>
            <h2 className="gos-h2">Not a list of assets. A model of relationships and consequence.</h2>
            <p className="gos-sec-lede">
              The Twin connects what the enterprise owns, what each autonomous system can reach, who may authorise
              it, which policies apply and where operational risk can propagate.
            </p>
          </header>
          <div className="twin-enterprise-graph">
            <div className="twin-graph-core reveal">
              <span>Continuously derived</span><strong>AI Twin</strong><small>One enterprise model</small>
            </div>
            <div className="twin-graph-facets">
              {GRAPH.map(([title, body], index) => (
                <article className="twin-graph-facet reveal" data-d={String((index % 3) + 1)} key={title}>
                  <h3>{title}</h3><p>{body}</p>
                </article>
              ))}
            </div>
          </div>
          <div className="twin-reachability reveal">
            <span className="gos-kicker">Reachability view</span>
            <div>
              <b>Agent</b><i>can call</i><b>Tool</b><i>can access</i><b>System</b><i>can affect</i><b>Protected outcome</b>
            </div>
            <p>Visibility follows the path of possible action, not just the inventory of components.</p>
          </div>
        </div>
      </section>

      <section className="gos-section gos-section-alt" id="evidence">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Evidence generation</span>
            <h2 className="gos-h2">Every operational view traces back to evidence.</h2>
            <p className="gos-sec-lede">
              The Twin is not an executive illustration detached from the control plane. Its state is derived from
              provisioning, governance, approval, execution and monitoring records produced throughout the
              operating lifecycle.
            </p>
          </header>
          <div className="twin-evidence-flow reveal">
            {["Observed state", "Source identity", "Policy context", "Governance verdict", "Approval state", "Execution outcome", "Retained evidence"].map((item, index, items) => (
              <div key={item}><span>{item}</span>{index < items.length - 1 && <b aria-hidden="true">→</b>}</div>
            ))}
          </div>
          <div className="twin-boundary reveal">
            <span className="gos-kicker">Control boundary</span>
            <p>
              The AI Twin is read-only by default. Any write capability or source-system mutation remains a
              separate governed integration surface requiring explicit policy, authority, testing and evidence.
            </p>
          </div>
        </div>
      </section>

      <section className="gos-section" id="drift">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Drift detection</span>
            <h2 className="gos-h2">Know when reality moves away from the approved baseline.</h2>
            <p className="gos-sec-lede">
              Drift is operationally important because a small change in policy, permission, tool access, autonomy
              or trust can alter what an autonomous system can reach. Current monitoring surfaces the governed
              divergences below; additional estate signals are scoped to the connected evidence sources.
            </p>
          </header>
          <div className="twin-drift-grid">
            {DRIFT.map(([title, body], index) => (
              <article className="twin-drift-item reveal" data-d={String((index % 3) + 1)} key={title}>
                <h3>{title}</h3><p>{body}</p>
              </article>
            ))}
          </div>
          <div className="twin-drift-decision reveal">
            <span>Change detected</span><b>→</b><span>Impact understood</span><b>→</b><span>Evidence attached</span><b>→</b><span>Authority notified</span><b>→</b><strong>Human decision</strong>
          </div>
          <p className="twin-drift-note reveal">
            Detection does not silently rewrite production. The platform identifies the change, relates it to the
            governed baseline and routes the evidence to the appropriate operational authority.
          </p>
        </div>
      </section>

      <section className="gos-section gos-section-alt" id="stakeholders">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Executive use cases</span>
            <h2 className="gos-h2">One Twin. Different questions. Consistent answers.</h2>
            <p className="gos-sec-lede">
              Each stakeholder sees a scoped projection of the same enterprise model. Security, architecture,
              compliance and operations no longer begin from separate inventories.
            </p>
          </header>
          <div className="twin-stakeholder-grid">
            {STAKEHOLDERS.map(([role, view, body], index) => (
              <article className="twin-stakeholder reveal" data-d={String((index % 3) + 1)} key={role}>
                <span>{role}</span><h3>{view}</h3><p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="gos-section" id="platform">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">AI Twin + Guardian OS</span>
            <h2 className="gos-h2">Five responsibilities. One enterprise operating platform.</h2>
          </header>
          <div className="twin-platform-roles">
            {PLATFORM_ROLES.map(([name, question, answer], index) => (
              <article className={`twin-platform-role reveal${index === 0 ? " is-twin" : ""}`} data-d={String((index % 3) + 1)} key={name}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><h3>{name}</h3><strong>{question}</strong><p>{answer}</p></div>
              </article>
            ))}
          </div>
          <p className="twin-platform-note reveal">
            The AI Twin is generated as part of Guardian OS enterprise provisioning and remains the shared model
            used by governance, monitoring and Executive Workspaces.{" "}
            <Link href="/guardian-os" className="twin-inline-link">See the complete Guardian OS operating model →</Link>
          </p>
        </div>
      </section>

      <section className="gos-final">
        <div className="gos-wrap">
          <span className="gos-kicker">Current state. Connected evidence. Accountable decisions.</span>
          <h2 className="gos-final-h">See the AI enterprise you actually operate.</h2>
          <p className="twin-final-sub">
            Replace periodic reconstruction with a continuously derived model built into the operating platform.
          </p>
          <div className="gos-cta-row gos-cta-center">
            <Link href="/book" className="gos-btn gos-btn-primary">Book an enterprise briefing</Link>
            <Link href="/guardian-os" className="gos-btn gos-btn-ghost">Explore Guardian OS</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
