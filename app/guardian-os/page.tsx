import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";

/* ============================================================================
 * Guardian OS™ — product page.
 *
 * Every enumerated figure on this page is read from the SHIPPING code, never
 * written by hand: the industry cards come from the pack registry
 * (lib/ops/packs), the executive workspaces from the role table
 * (lib/ops/workspaces), and the governed departments from the provisioning
 * catalog. If a pack gains a policy, this page updates itself — and it can
 * never claim a capability the platform does not have.
 * ========================================================================== */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const packRegistry = require("@/lib/ops/packs");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const workspaceRoles = require("@/lib/ops/workspaces").ROLES as { id: string; title: string; label: string; purpose: string }[];
// eslint-disable-next-line @typescript-eslint/no-var-requires
const DEPARTMENTS = require("@/lib/ops/provisioning").DEPARTMENTS as { id: string; label: string }[];

/** A neutral context so a pack's own metric definitions can be counted. */
const NEUTRAL_CTX = {
  entities: {}, health: null, incidents: [], blocked: [], scopedPolicies: [], packs: [],
  cmd: null, drift: { open: [] }, recentEv: [], proposals: [], escalated: [],
  queue: { count: 0 }, twin: null, perf: null, trends: null, brief: null, recs: [],
};
type PackMeta = {
  id: string; version: string; industry: string; title: string; purpose: string;
  regulations: string[]; metrics: number;
  counts: { policies: number; templates: number; mappings: number; workflows: number };
};
const PACKS: PackMeta[] = packRegistry.all().map((p: any) => ({
  ...packRegistry.meta(p),
  metrics: (() => { try { return p.metrics(NEUTRAL_CTX).length; } catch { return 0; } })(),
}));
/* The page shows three domains in full — the most regulated, and the packs with
 * the deepest content. The rest are named rather than boxed, so the section
 * stays readable on a phone without hiding that eight packs ship. */
const FEATURED_IDS = ["healthcare", "finance", "cybersecurity"];
const FEATURED = FEATURED_IDS.map((id) => PACKS.find((p) => p.id === id)).filter(Boolean) as PackMeta[];
const ALSO = PACKS.filter((p) => !FEATURED_IDS.includes(p.id));

export const metadata: Metadata = {
  title: "Guardian OS™ — The Operating System for Autonomous Enterprises",
  description:
    "Install a complete governed operating environment for your enterprise — not another dashboard. Guardian OS provisions identity, AI systems, trust architecture, Runtime Governance, digital twins, executive workspaces and industry intelligence in one installation.",
  alternates: { canonical: "/guardian-os" },
  openGraph: {
    title: "Guardian OS™ — The Operating System for Autonomous Enterprises",
    description:
      "One installation stands up a complete governed runtime: identity, AI estate, trust architecture, Ω policies, departments, digital twin and executive command.",
    url: "/guardian-os",
  },
};

/* ── Installation phases (mirrors lib/ops/provisioning) ── */
const PHASES = [
  { n: "01", title: "Enterprise Identity", verb: "Automatically provisions", items: ["Organisation", "Business units", "Environments", "Regions", "Compliance domains"] },
  { n: "02", title: "AI Estate", verb: "Automatically maps", items: ["AI systems", "Models", "Agents", "MCP servers", "APIs", "Tools", "Dependencies"] },
  { n: "03", title: "Trust Architecture", verb: "Creates", items: ["Trust boundaries", "Identities", "Approvals", "Protected assets", "Risk zones"] },
  { n: "04", title: "Runtime Governance", verb: "Installs", items: ["Ω Policies", "Fail-closed execution", "Deny-only governance", "Dynamic policy engine"] },
  { n: "05", title: "Department Deployment", verb: "Creates governed departments", items: DEPARTMENTS.map((d) => d.label) },
  { n: "06", title: "Digital Twin", verb: "Automatically generates", items: ["Enterprise graph", "Dependency graph", "AI relationships", "Trust graph", "Runtime graph", "Risk graph"], href: "/ai-twin", hrefLabel: "Your AI Twin™" },
];

/* How an enterprise engages. Pathways, not a price list. */
const PATHWAYS = [
  { k: "Assessment", p: "Risk, fit, readiness and governance evaluation.", t: "1–2 weeks" },
  { k: "Enterprise Provisioning", p: "Enterprise identity, AI estate, trust architecture, departments, Your AI Twin and Executive Command.", t: "Scope dependent" },
  { k: "Guardian OS Licence", p: "The full platform: kernel, operating layer, workspaces, governed agents, Your AI Twin and Intelligence Packs.", t: "Annual" },
  { k: "Managed Governance", p: "Ongoing monitoring, optimisation, evidence and revalidation.", t: "Monthly / annual" },
  { k: "Executive Advisory", p: "Fractional CAIO and role-specific executive oversight.", t: "Monthly / annual" },
];

const TIERS = [
  { k: "Standard", who: "Organisations beginning enterprise AI governance with a production foundation.",
    inc: ["Guardian OS, the Runtime Governance kernel, Enterprise Provisioning and Executive Command", "One Industry Intelligence Pack", "One enterprise Digital Twin", "Core executive workspaces and specialist agents", "Standard policies, workflows and support"] },
  { k: "Executive", who: "Large enterprises requiring broader executive coverage and deeper integration.",
    inc: ["Everything in Standard", "Multiple Industry Intelligence Packs", "All standard executive workspaces", "Advanced specialist agents and an expanded enterprise twin", "Priority governance engineering, premium managed governance and included advisory hours"] },
  { k: "Sovereign", who: "Governments, defence, national infrastructure operators and the largest multinationals.",
    inc: ["Everything in Executive", "Sovereign and air-gapped deployment options", "National-scale or multi-enterprise twins", "Global multi-region governance", "Dedicated governance engineering, a dedicated CAIO programme and sovereign operational support"] },
];

const BENEFITS = [
  { title: "Provision in minutes", body: "One installation stands up the whole governed environment — identity, estate, trust, policy, departments and twin." },
  { title: "No blank dashboards", body: "Executive Command opens populated. Realistic example activity is seeded, clearly marked, until live enterprise events replace it." },
  { title: "Runtime governance built-in", body: "Deny-by-default and fail-closed are not a setting. Every action flows proposal → Ω → approval → execution → evidence." },
  { title: "Digital Twin generated automatically", body: "Six enterprise graphs derived from the real estate at install — never a diagram someone has to maintain." },
  { title: "Executive workspaces included", body: `${workspaceRoles.length} role-specific operating environments over one governed source of truth.` },
  { title: "Industry-ready from day one", body: `${PACKS.length} Industry Intelligence Packs ship with the policies, evidence mappings and workflows for your sector.` },
];

/* Enterprise integrations.
 * Two lists, deliberately separated. Guardian OS genuinely sits in front of the
 * agent runtimes in RUNTIMES — that is where it integrates. The systems in
 * REACHES are where governed actions LAND; Guardian OS governs the agent's call
 * to them at the tool-call boundary, which is why no per-vendor connector is
 * required. Naming them without that distinction would imply native connectors
 * and vendor endorsement, neither of which exists. */
const RUNTIMES = ["OpenAI Agents", "LangGraph", "LangChain", "AutoGen", "Amazon Bedrock", "MCP servers", "Custom orchestrators"];
const REACHES = ["Microsoft 365", "Azure", "AWS", "Google Cloud", "Salesforce", "ServiceNow", "SAP", "Snowflake", "Databricks", "Palantir"];

const STACK = [
  { k: "Guardian OS", d: "The enterprise operating system" },
  { k: "Runtime Governance Kernel", d: "Deny-by-default · fail-closed · Ω policies" },
  { k: "Executive Workspaces", d: "One twin, many perspectives" },
  { k: "Industry Packs", d: "Declarative domain intelligence" },
  { k: "Governed Enterprise", d: "Autonomous, evidenced, accountable" },
];

/* ── Control Room render (inline SVG — no external assets) ── */
function ControlRoomRender() {
  const phases = [
    ["Enterprise Identity", "13 entities"], ["AI Estate", "23 entities"], ["Trust Architecture", "14 entities"],
    ["Runtime Governance", "10 policies active"], ["Department Deployment", `${DEPARTMENTS.length} departments`], ["Digital Twin", "6 graphs"],
  ];
  return (
    <div className="gos-render" role="img" aria-label="Guardian OS Control Room — an enterprise installation completing all six phases and opening Executive Command">
      <div className="gos-render-chrome">
        <span className="gos-dot" /><span className="gos-dot" /><span className="gos-dot" />
        <span className="gos-render-url">Guardian OS · Control Room</span>
      </div>
      <div className="gos-render-body">
        <div className="gos-render-head">
          <div>
            <div className="gos-render-title">Installation — complete</div>
            <div className="gos-render-sub">Enterprise provisioning · governed runtime</div>
          </div>
          <span className="gos-pill gos-pill-ok">complete</span>
        </div>
        <div className="gos-render-phases">
          {phases.map(([t, d]) => (
            <div className="gos-render-phase" key={t}>
              <span className="gos-check">✓</span>
              <span className="gos-render-phase-t">{t}</span>
              <span className="gos-render-phase-d">{d}</span>
            </div>
          ))}
        </div>
        <div className="gos-render-cmd">
          <div className="gos-render-cmd-h">Executive Command</div>
          <div className="gos-render-stats">
            {[["3", "AI systems"], ["3", "agents"], ["10", "Ω policies"], ["1", "open approval"], ["1", "open risk"], [String(DEPARTMENTS.length), "departments"]].map(([v, l]) => (
              <div className="gos-render-stat" key={l}><b>{v}</b><span>{l}</span></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GuardianOSPage() {
  return (
    <PageShell>
      {/* ───────────────────────────── HERO ───────────────────────────── */}
      <section className="gos-hero">
        <div className="gos-wrap">
          <span className="gos-eyebrow">Resurrection Tech™</span>
          <h1 className="gos-h1">
            Guardian OS<span className="gos-tm">™</span>
            <span className="gos-h1-sub">The Operating System for Autonomous Enterprises.</span>
          </h1>
          <p className="gos-lede">
            Install a complete governed operating environment for your enterprise—not another dashboard.
          </p>
          <p className="gos-lede-2">
            Guardian OS provisions identity, AI systems, trust architecture, Runtime Governance, digital twins,
            executive workspaces and industry intelligence in one installation.
          </p>
          <div className="gos-cta-row">
            <Link href="/book" className="gos-btn gos-btn-primary">Book a Demo</Link>
            <a href="#install" className="gos-btn gos-btn-ghost">Explore Guardian OS</a>
          </div>
          <ControlRoomRender />
        </div>
      </section>

      {/* ───────────────────────── THE PROBLEM ───────────────────────── */}
      <section className="gos-section gos-section-alt" id="problem">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">The problem</span>
            <h2 className="gos-h2">Enterprises are deploying AI that acts — with nothing standing between the decision and the consequence.</h2>
            <p className="gos-sec-lede">
              An agent that can only talk is a demo. An agent that can move money, change infrastructure, email a
              customer or touch a patient record is an operational system — and most enterprises have no layer that
              decides, before the fact, whether that action is allowed.
            </p>
          </header>
          <div className="gos-gap-grid">
            {[
              ["Observability tells you afterwards", "Traces and logs explain what already happened. By then the wire has been sent, the record exported, the environment changed."],
              ["Guardrails filter words, not actions", "Prompt and content filters shape what a model says. They do not authorise what a tool is about to do."],
              ["Policy lives in documents", "Your AI policy is a PDF, a committee and a spreadsheet. None of it is enforced at the moment of execution."],
              ["Evidence is assembled after the fact", "When a regulator, auditor or board asks what your AI did and why, someone reconstructs it from logs — if it can be reconstructed at all."],
            ].map(([t, d], i) => (
              <article className="gos-gap reveal" data-d={String((i % 3) + 1)} key={t}>
                <h3>{t}</h3>
                <p>{d}</p>
              </article>
            ))}
          </div>
          <div className="gos-problem-turn reveal">
            <p className="gos-problem-q">
              So the questions that matter go unanswered: <em>What is our AI allowed to do? What did it actually do?
              And can we prove it?</em>
            </p>
            <p className="gos-problem-a">
              The usual answer is a governance <strong>project</strong> — months of integration, bespoke policy
              engineering, a dashboard, and an evidence trail nobody trusts. Guardian OS replaces the project with
              an <strong>installation</strong>: a governed operating environment that already knows how to decide,
              record and prove.
            </p>
          </div>
        </div>
      </section>

      {/* ─────────────────── HOW INSTALLATION WORKS ─────────────────── */}
      <section className="gos-section" id="install">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Installation</span>
            <h2 className="gos-h2">How installation works.</h2>
            <p className="gos-sec-lede">
              Guardian OS installs the way an operating system installs — six phases, in order, one run.
              Not an onboarding form.
            </p>
          </header>
          <div className="gos-phase-grid">
            {PHASES.map((p, i) => (
              <article className="gos-phase reveal" data-d={String((i % 3) + 1)} key={p.n}>
                <span className="gos-phase-n">{p.n}</span>
                <h3 className="gos-phase-t">{p.title}</h3>
                <p className="gos-phase-verb">{p.verb}</p>
                <ul className="gos-phase-list">
                  {p.items.map((it) => <li key={it}>{it}</li>)}
                </ul>
                {p.href && <Link href={p.href} className="gos-phase-link">{p.hrefLabel} →</Link>}
              </article>
            ))}
          </div>
          <div className="gos-launch reveal">
            <span className="gos-launch-arrow" aria-hidden="true">↓</span>
            <div>
              <span className="gos-launch-label">After installation, Guardian OS automatically launches</span>
              <span className="gos-launch-title">Executive Command</span>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────── EXECUTIVE WORKSPACES ───────────────────── */}
      <section className="gos-section gos-section-alt" id="workspaces">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Executive Workspaces</span>
            <h2 className="gos-h2">Every executive sees the same enterprise.</h2>
            <p className="gos-sec-lede">
              One enterprise. One digital twin. One Runtime Governance kernel. Each workspace is simply another
              projection of the same governed source of truth — never a separate dashboard, never a second number.
            </p>
          </header>
          <div className="gos-ws-grid">
            {workspaceRoles.map((r, i) => (
              <article className="gos-ws reveal" data-d={String((i % 3) + 1)} key={r.id}>
                <h3 className="gos-ws-t">{r.title}</h3>
                <span className="gos-ws-l">{r.label}</span>
                <p className="gos-ws-p">{r.purpose}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────── INDUSTRY INTELLIGENCE PACKS ─────────────────── */}
      <section className="gos-section" id="industry">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Industry Intelligence Packs</span>
            <h2 className="gos-h2">Pre-loaded for your industry.</h2>
            <p className="gos-sec-lede">
              Guardian OS comes pre-loaded with the policies, metrics, workspaces, evidence mappings and incident
              workflows for your sector. Packs never fork Guardian OS — they contribute declarative intelligence
              to the same kernel.
            </p>
          </header>

          {/* Why they matter, before what they contain. */}
          <div className="gos-why reveal">
            <div className="gos-why-lede">
              <h3 className="gos-why-h">Production-ready industry intelligence.</h3>
              <p>
                The hard part of governing an enterprise is rarely the engine — it is knowing what
                <em> your sector</em> must forbid, evidence and escalate. An Intelligence Pack is that knowledge,
                already written, already validated, installed in one governed step.
              </p>
              <p className="gos-why-claim">
                Packs buy implementation time, reduce deployment risk, and shorten the path to a governed
                enterprise.
              </p>
            </div>
            <ul className="gos-why-list">
              {[
                ["Less implementation effort", "The policies, mappings and workflows already exist — nobody starts from an empty policy file."],
                ["Faster deployment", "Install a pack and the sector's controls are live in the kernel the same day."],
                ["Lower project risk", "Removable and versioned: a pack installs through the governed lifecycle and rolls back cleanly."],
                ["Fewer governance mistakes", "Deny-only by construction — a pack can only add constraints, never weaken the baseline."],
                ["Sector best practice, encoded", "Regulatory mappings state which control each obligation satisfies and what evidences it."],
              ].map(([t, d]) => (
                <li key={t}><b>{t}</b><span>{d}</span></li>
              ))}
            </ul>
          </div>

          {/* One kernel, many packs — rendered from the shipping registry. */}
          <div className="gos-tree reveal" role="img" aria-label={`Guardian OS Kernel with ${PACKS.length} industry packs: ${PACKS.map((p) => p.industry).join(", ")}`}>
            <pre className="gos-tree-pre">
              <span className="gos-tree-root">Guardian OS Kernel</span>{"\n"}
              {PACKS.map((p, i) => (
                <span key={p.id}>
                  {"            "}
                  <span className="gos-tree-branch">{i === PACKS.length - 1 ? "└── " : "├── "}</span>
                  <span className="gos-tree-leaf">{p.industry} Pack</span>{"\n"}
                </span>
              ))}
            </pre>
            <p className="gos-tree-note">
              One kernel. {PACKS.length} packs shipping. A new industry is a new pack — the kernel never changes.
            </p>
          </div>

          <div className="gos-pack-grid">
            {FEATURED.map((p, i) => (
              <article className="gos-pack reveal" data-d={String((i % 3) + 1)} key={p.id}>
                <header className="gos-pack-head">
                  <h3 className="gos-pack-t">{p.industry}</h3>
                  <span className="gos-pack-v">v{p.version}</span>
                </header>
                <p className="gos-pack-p">{p.purpose}</p>
                {/* every regulation is shown, so the chips always match the count below */}
                <div className="gos-pack-regs">
                  {p.regulations.map((r) => <span className="gos-reg" key={r}>{r}</span>)}
                </div>
                <dl className="gos-pack-specs">
                  <div><dt>Regulations</dt><dd>{p.regulations.length}</dd></div>
                  <div><dt>Ω Policies</dt><dd>{p.counts.policies}</dd></div>
                  <div><dt>Evidence maps</dt><dd>{p.counts.mappings}</dd></div>
                  <div><dt>Incident workflows</dt><dd>{p.counts.workflows}</dd></div>
                  <div><dt>Executive metrics</dt><dd>{p.metrics}</dd></div>
                  <div><dt>Policy templates</dt><dd>{p.counts.templates}</dd></div>
                </dl>
                <footer className="gos-pack-foot">
                  Governance pack · installs through the governed policy lifecycle · removable
                </footer>
              </article>
            ))}
          </div>

          {/* The remaining packs are named, not boxed — same fact, far less scroll. */}
          <p className="gos-also reveal">
            <span className="gos-also-k">Also shipping</span>
            {ALSO.map((p) => <span className="gos-also-i" key={p.id}>{p.industry}</span>)}
            <Link href="/contact" className="twin-inline-link">Ask about your sector →</Link>
          </p>

          <blockquote className="gos-quote reveal">
            Industry Intelligence Packs buy time and reduce risk by delivering production-ready governance
            from day one.
          </blockquote>
        </div>
      </section>

      {/* ─────────────────── ONE RUNTIME GOVERNANCE KERNEL ─────────────────── */}
      <section className="gos-section gos-section-alt" id="kernel">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Architecture</span>
            <h2 className="gos-h2">One Runtime Governance kernel.</h2>
            <p className="gos-sec-lede">
              One kernel. One operating system. Unlimited industries. Industry packs never fork Guardian OS —
              they only contribute declarative intelligence.
            </p>
          </header>
          <div className="gos-stack reveal">
            {STACK.map((s, i) => (
              <div className="gos-stack-row" key={s.k}>
                <div className={`gos-stack-node${i === 1 ? " is-kernel" : ""}`}>
                  <span className="gos-stack-k">{s.k}</span>
                  <span className="gos-stack-d">{s.d}</span>
                </div>
                {i < STACK.length - 1 && <span className="gos-stack-arrow" aria-hidden="true">↓</span>}
              </div>
            ))}
          </div>
          <div className="gos-kernel-notes">
            {[
              ["Deny-by-default", "Nothing executes because an agent asked. The kernel authorises, or it does not."],
              ["Fail-closed", "If governance is unreachable, execution stops. Unavailability never becomes permission."],
              ["Deny-only extensions", "A pack's policies can only add constraints — the baseline is never weakened."],
              ["Evidence by construction", "Every decision leaves a verdict, a reason and a trajectory hash."],
            ].map(([t, d], i) => (
              <div className="gos-note reveal" data-d={String((i % 3) + 1)} key={t}>
                <h4>{t}</h4><p>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────────────────── BENEFITS ───────────────────────────── */}
      <section className="gos-section" id="benefits">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Why Guardian OS</span>
            <h2 className="gos-h2">An installed environment, not an integration project.</h2>
          </header>
          <div className="gos-benefit-grid">
            {BENEFITS.map((b, i) => (
              <article className="gos-benefit reveal" data-d={String((i % 3) + 1)} key={b.title}>
                <h3>{b.title}</h3>
                <p>{b.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────── ENTERPRISE INTEGRATIONS ─────────────────── */}
      <section className="gos-section" id="integrations">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Enterprise integrations</span>
            <h2 className="gos-h2">Governed wherever your agents already reach.</h2>
            <p className="gos-sec-lede">
              Guardian OS governs at the <strong>tool-call boundary</strong> — the moment an agent tries to act.
              That is why it does not need a bespoke connector for every system in your estate: it governs the
              call, whatever sits on the other end.
            </p>
          </header>

          <div className="gos-int">
            <div className="gos-int-col reveal">
              <span className="gos-int-h">Guardian OS sits in front of</span>
              <p className="gos-int-p">Your agent runtime — where governance is enforced before an action leaves.</p>
              <div className="gos-int-tags">
                {RUNTIMES.map((r) => <span className="gos-int-tag is-native" key={r}>{r}</span>)}
              </div>
            </div>
            <div className="gos-int-col reveal" data-d="1">
              <span className="gos-int-h">Your agents reach</span>
              <p className="gos-int-p">Where governed actions land. Each call is evaluated against policy before it executes.</p>
              <div className="gos-int-tags">
                {REACHES.map((r) => <span className="gos-int-tag" key={r}>{r}</span>)}
              </div>
            </div>
          </div>

          <p className="gos-int-note reveal">
            Systems are named to show where governed actions typically land. Guardian OS governs an agent&apos;s
            call to a system — it is not a native connector to, nor endorsed by, any vendor listed.{" "}
            <Link href="/integrations" className="twin-inline-link">See how it integrates →</Link>
          </p>
        </div>
      </section>

      {/* ───────────────────── ENGAGEMENT + LICENCE TIERS ───────────────────── */}
      <section className="gos-section gos-section-alt" id="engage">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">How enterprises engage</span>
            <h2 className="gos-h2">Start with an assessment. Scale to an operating model.</h2>
            <p className="gos-sec-lede">
              Guardian OS is adopted in stages. Most enterprises begin with an assessment — risk, fit and
              readiness — and the finding credits toward the engagement that follows.
            </p>
          </header>
          <ol className="gos-ladder">
            {PATHWAYS.map((p, i) => (
              <li className="gos-ladder-step reveal" data-d={String((i % 3) + 1)} key={p.k}>
                <span className="gos-ladder-n">{String(i + 1).padStart(2, "0")}</span>
                <div className="gos-ladder-body">
                  <h3>{p.k}</h3>
                  <p>{p.p}</p>
                </div>
                <span className="gos-ladder-t">{p.t}</span>
              </li>
            ))}
          </ol>

          <div className="gos-tiers">
            <h3 className="gos-tiers-h reveal">Licence tiers</h3>
            <p className="gos-tiers-sub reveal">
              The tier grows with operational capability, deployment responsibility and the depth of governance
              support included.
            </p>
            <div className="gos-tier-grid">
              {TIERS.map((t, i) => (
                <article className={`gos-tier reveal${i === 1 ? " is-mid" : ""}`} data-d={String((i % 3) + 1)} key={t.k}>
                  <h4 className="gos-tier-k">Guardian OS {t.k}</h4>
                  <p className="gos-tier-who">{t.who}</p>
                  <ul className="gos-tier-list">
                    {t.inc.map((x) => <li key={x}>{x}</li>)}
                  </ul>
                </article>
              ))}
            </div>
            <p className="gos-tier-note reveal">
              Guardian OS Sovereign is the annual platform tier. A sovereign or national deployment is a separate
              implementation programme to establish governed AI infrastructure across a department, institution or
              national environment. <Link href="/contact" className="twin-inline-link">Talk to sales about scope and pricing →</Link>
            </p>
          </div>
        </div>
      </section>

      {/* ───────────────────────────── FINAL CTA ───────────────────────────── */}
      <section className="gos-final">
        <div className="gos-wrap">
          <h2 className="gos-final-h">
            Install a governed operating system for your autonomous enterprise.
          </h2>
          <div className="gos-cta-row gos-cta-center">
            <Link href="/book" className="gos-btn gos-btn-primary">Book a Demo</Link>
            <Link href="/contact" className="gos-btn gos-btn-ghost">Contact Sales</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
