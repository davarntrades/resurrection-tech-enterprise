import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";

/* ============================================================================
 * Your AI Twin™ — product page.
 *
 * Design language and section chrome are shared with the Guardian OS page
 * (styles/guardian-os.css owns the reusable `gos-*` primitives); the
 * twin-specific components live in styles/ai-twin.css.
 *
 * Every capability described here is one that ships: the six graphs are the
 * facets built by lib/ops/entgraph.js, and the drift kinds are the ones
 * lib/ops/managed.js actually detects. Nothing on this page describes a
 * roadmap item as though it were live.
 * ========================================================================== */

export const metadata: Metadata = {
  title: "Your AI Twin™ — A live model of every AI system you run",
  description:
    "Your AI Twin is a continuously derived model of your entire AI estate — every system, model, agent, tool, MCP server, API, dependency, trust boundary and risk zone — built from the governed runtime, so it is never out of date.",
  alternates: { canonical: "/ai-twin" },
  openGraph: {
    title: "Your AI Twin™ — A live model of every AI system you run",
    description:
      "You cannot govern what you cannot see. Your AI Twin builds itself from the governed runtime and tells you the moment reality diverges from what you approved.",
    url: "/ai-twin",
  },
};

/* The six graphs — the facets lib/ops/entgraph.js builds. */
const GRAPHS = [
  { n: "01", k: "Enterprise", d: "Who you are: the organisation, its business units, environments, regions and compliance domains — the frame everything else hangs from." },
  { n: "02", k: "Asset", d: "What you run: every AI system, model, agent, tool, MCP server, API and integration in the estate, privileged capability flagged." },
  { n: "03", k: "Dependency", d: "What touches what: every mapped relationship across the estate — which agent reaches which tool, through which server, into which system." },
  { n: "04", k: "Runtime", d: "Where it runs: environments and the systems and agents live inside them, with the governance state that applies." },
  { n: "05", k: "Trust", d: "Who may authorise: trust boundaries, identity providers, human approvers and privileged operators — the authority map." },
  { n: "06", k: "Risk", d: "What could hurt: risk zones, critical systems and protected assets, joined to the incidents open against them right now." },
];

/* The divergences Managed Governance detects against the governed baseline. */
const DRIFT = [
  ["New AI system", "A system appeared that was not in the governed baseline."],
  ["New MCP server", "A server was added to the estate outside provisioning."],
  ["New tool", "A capability appeared — critical if it is privileged."],
  ["Permission change", "An existing tool was elevated to privileged."],
  ["Removed control", "A control present at baseline is now missing."],
  ["Disabled policy", "A governance policy is no longer active."],
  ["Unexpected autonomy", "Autonomy was raised above the governed baseline."],
  ["Trust-boundary violation", "A system is running outside any declared boundary."],
];

export default function AiTwinPage() {
  return (
    <PageShell>
      {/* ───────────────────────────── HERO ───────────────────────────── */}
      <section className="gos-hero">
        <div className="gos-wrap">
          <span className="gos-eyebrow">Resurrection Tech™</span>
          <h1 className="gos-h1">
            Your AI Twin<span className="gos-tm">™</span>
            <span className="gos-h1-sub">A live model of every AI system you run.</span>
          </h1>
          <p className="gos-lede">
            Your AI Twin is a continuously derived model of your entire AI estate — every system, model, agent,
            tool, MCP server, API, dependency, trust boundary and risk zone.
          </p>
          <p className="gos-lede-2">
            It is not a diagram someone maintains. It builds itself from the governed runtime, so it is accurate
            by construction — and it tells you the moment reality diverges from what you approved.
          </p>
          <div className="gos-cta-row">
            <Link href="/book" className="gos-btn gos-btn-primary">Book a Demo</Link>
            <a href="#graphs" className="gos-btn gos-btn-ghost">See what it maps</a>
          </div>

          {/* Estate render — illustrative structure, not customer data. */}
          <div className="twin-render" role="img" aria-label="An AI Twin: an enterprise resolving into systems, agents, models, tools and MCP servers, with governance state attached">
            <div className="gos-render-chrome">
              <span className="gos-dot" /><span className="gos-dot" /><span className="gos-dot" />
              <span className="gos-render-url">Your AI Twin · estate</span>
            </div>
            <div className="twin-render-body">
              <pre className="twin-tree">
{`enterprise
├── Production
│   ├── Payments Copilot        `}<span className="twin-gov">governed</span>{`
│   │   ├── Payments Agent  ──▶  wire_transfer   `}<span className="twin-priv">privileged</span>{`
│   │   ├── model            claude-opus
│   │   └── mcp              core-banking-mcp
│   └── Advisory Copilot        `}<span className="twin-gov">governed</span>{`
│       └── Advisory Agent  ──▶  generate_report
└── Test
    └── Ops Copilot             `}<span className="twin-drift">drift: new tool</span>{`
        └── Ops Agent       ──▶  deploy_runtime  `}<span className="twin-priv">privileged</span>
              </pre>
              <div className="twin-render-legend">
                <span><i className="twin-k twin-k-gov" /> under policy</span>
                <span><i className="twin-k twin-k-priv" /> privileged capability</span>
                <span><i className="twin-k twin-k-drift" /> diverged from baseline</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────────── PROBLEM ───────────────────────────── */}
      <section className="gos-section gos-section-alt" id="problem">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">The problem</span>
            <h2 className="gos-h2">Almost no enterprise can say, precisely, what AI it is running.</h2>
            <p className="gos-sec-lede">
              Agents get built by four teams in three months. Tools are added in an afternoon. An MCP server is
              wired in to unblock a demo and never removed. Nobody is being reckless — the estate simply grows
              faster than anyone&apos;s ability to describe it.
            </p>
          </header>
          <div className="gos-gap-grid">
            {[
              ["The inventory is a spreadsheet", "Assembled by hand, accurate on the day it was written, stale by the end of the week. It lists systems, not what they can reach."],
              ["The architecture diagram has rotted", "Drawn once for a review. It shows the design, not the deployment — and nothing updates it when a tool is added."],
              ["Shadow AI is invisible by definition", "An agent nobody registered, a tool added outside change control, a server left behind after a pilot. None of it appears anywhere."],
              ["Nobody can see the blast radius", "When something goes wrong, the first question — what else touches this? — takes days to answer, and the answer is a guess."],
            ].map(([t, d], i) => (
              <article className="gos-gap reveal" data-d={String((i % 3) + 1)} key={t}>
                <h3>{t}</h3>
                <p>{d}</p>
              </article>
            ))}
          </div>
          <div className="gos-problem-turn reveal">
            <p className="gos-problem-q">
              You cannot govern what you cannot see. You cannot prove what you cannot describe.
            </p>
            <p className="gos-problem-a">
              Every governance control, every audit answer and every executive decision rests on knowing what the
              estate actually <strong>is</strong>. Your AI Twin makes that knowledge a property of the running
              system rather than a document someone owns.
            </p>
          </div>
        </div>
      </section>

      {/* ────────────────────────── IS / IS NOT ────────────────────────── */}
      <section className="gos-section" id="what">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">What it is</span>
            <h2 className="gos-h2">A shared intelligence layer — not an uncontrolled write surface.</h2>
            <p className="gos-sec-lede">
              &ldquo;Digital twin&rdquo; carries a lot of baggage. Here is exactly what Your AI Twin is, and just as
              importantly, what it is not.
            </p>
          </header>
          <div className="twin-isnot">
            <div className="twin-isnot-col twin-isnot-is reveal">
              <span className="twin-vs-h">It is</span>
              <ul>
                <li>A live, read-only representation of approved organisational state</li>
                <li>A shared context for executives, specialists and governed agents</li>
                <li>A provenance-aware model of systems, workflows, risks and dependencies</li>
                <li>A policy-enforced intelligence and decision layer</li>
                <li>A governed route from observation to evidence-backed proposal</li>
              </ul>
            </div>
            <div className="twin-isnot-col twin-isnot-not reveal" data-d="1">
              <span className="twin-vs-h">It is not</span>
              <ul>
                <li>An autonomous copy of the company with unrestricted write access</li>
                <li>Another isolated dashboard owned by one department</li>
                <li>A replacement for any source system or system of record</li>
                <li>Permission for an AI model to act without review</li>
                <li>A claim that every source is complete, current or automatically correct</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────── SIX GRAPHS ─────────────────────────── */}
      <section className="gos-section" id="graphs">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">What it maps</span>
            <h2 className="gos-h2">Six graphs. One estate.</h2>
            <p className="gos-sec-lede">
              The Twin is generated the moment an enterprise is provisioned, and re-derived on every read. Each
              graph answers a different question about the same estate.
            </p>
          </header>
          <div className="twin-graph-grid">
            {GRAPHS.map((g, i) => (
              <article className="twin-graph reveal" data-d={String((i % 3) + 1)} key={g.k}>
                <span className="twin-graph-n">{g.n}</span>
                <h3 className="twin-graph-k">{g.k}</h3>
                <p className="twin-graph-d">{g.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ────────────────────── DERIVED, NOT MAINTAINED ────────────────────── */}
      <section className="gos-section gos-section-alt" id="derived">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Why it stays true</span>
            <h2 className="gos-h2">Derived, not maintained.</h2>
            <p className="gos-sec-lede">
              Most enterprise models fail the same way: they are a second copy of the truth, and copies drift.
              The Twin holds no state of its own. It is a projection over the records the governed runtime
              already owns — so there is nothing to update, nothing to reconcile, and nothing to fall behind.
            </p>
          </header>
          <div className="twin-vs reveal">
            <div className="twin-vs-col twin-vs-bad">
              <span className="twin-vs-h">A maintained model</span>
              <ul>
                <li>Someone has to update it</li>
                <li>Accurate only as of its last edit</li>
                <li>Disagrees with production silently</li>
                <li>A second source of truth to reconcile</li>
                <li>Trusted until the day it matters</li>
              </ul>
            </div>
            <div className="twin-vs-col twin-vs-good">
              <span className="twin-vs-h">A derived twin</span>
              <ul>
                <li>Assembled on demand from live records</li>
                <li>Accurate as of the moment you asked</li>
                <li>Cannot disagree — it has no copy</li>
                <li>Read-only: no state, nothing to tamper with</li>
                <li>The same model every executive reads</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ────────────────────── CORE DESIGN PRINCIPLES ────────────────────── */}
      <section className="gos-section" id="principles">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Core design principles</span>
            <h2 className="gos-h2">Six commitments the Twin is built on.</h2>
          </header>
          <dl className="twin-principles">
            {[
              ["Read-only by default", "The Twin observes and reconciles organisational state. It does not silently mutate source systems."],
              ["Shared truth, scoped views", "Leaders work from common evidence, while role, policy and legal boundaries control visibility and authority."],
              ["Proposals before execution", "Agents may analyse and recommend. Material action remains a separately governed decision."],
              ["Evidence before autonomy", "Provenance, policy context, approval state and outcome are preserved for accountable review."],
              ["Model independence", "The governance boundary applies across heterogeneous models, agents, tools and vendors."],
              ["Graceful uncertainty", "Conflicts, stale data and missing evidence are surfaced — never compressed into false confidence."],
            ].map(([t, d], i) => (
              <div className="twin-principle reveal" data-d={String((i % 3) + 1)} key={t}>
                <dt>{t}</dt>
                <dd>{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ───────────────────── TECHNICAL ARCHITECTURE ───────────────────── */}
      <section className="gos-section gos-section-alt" id="architecture">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Technical architecture</span>
            <h2 className="gos-h2">Approved context in. Accountable evidence out.</h2>
            <p className="gos-sec-lede">
              Approved enterprise sources feed the Twin&apos;s read-only model. The Twin continuously provides
              governed context to Guardian OS. Runtime Governance evaluates authority, reachability, policy and
              evidence before any proposal can advance.
            </p>
          </header>
          <div className="gos-stack reveal">
            {[
              { k: "Approved enterprise sources", d: "Customers · workflows · systems · risks · controls · dependencies" },
              { k: "Your AI Twin", d: "Continuous enterprise model · systems · agents · workflows · dependencies · policies" },
              { k: "Guardian OS + Runtime Governance", d: "Workspaces · Intelligence Packs · authority · reachability · proposals · approvals" },
              { k: "Governed executive & specialist operations", d: "Executive agents · specialist agents · Control Room · accountable decisions" },
              { k: "Evidence & accountability", d: "Source · policy context · verdict · approval state · audit trail · outcome" },
            ].map((s, i, arr) => (
              <div className="gos-stack-row" key={s.k}>
                <div className={`gos-stack-node${i === 1 ? " is-kernel" : ""}`}>
                  <span className="gos-stack-k">{s.k}</span>
                  <span className="gos-stack-d">{s.d}</span>
                </div>
                {i < arr.length - 1 && <span className="gos-stack-arrow" aria-hidden="true">↓</span>}
              </div>
            ))}
          </div>
          <p className="twin-arch-caption reveal">
            Approved context enters the Twin read-only; Guardian OS turns understanding into governed operations;
            evidence preserves accountability.
          </p>
          <div className="twin-boundary reveal">
            <span className="gos-kicker">Control boundary</span>
            <p>
              Any future write capability, workflow execution or source-system mutation is treated as a
              <strong> separate governed integration surface</strong>. It must pass explicit policy, approval,
              testing, evidence and operational-readiness requirements before activation.
            </p>
          </div>
        </div>
      </section>

      {/* ───────────────────────────── DRIFT ───────────────────────────── */}
      <section className="gos-section" id="drift">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Drift detection</span>
            <h2 className="gos-h2">It tells you when reality moves away from what you approved.</h2>
            <p className="gos-sec-lede">
              At install, the Twin is captured as a governed <strong>baseline</strong> — the estate as approved.
              Every monitoring pass compares the live enterprise against it. Each divergence becomes an
              evidence-backed drift event, deduplicated, so a daily pass never double-reports.
            </p>
          </header>
          <div className="twin-drift-grid">
            {DRIFT.map(([t, d], i) => (
              <article className="twin-drift-item reveal" data-d={String((i % 3) + 1)} key={t}>
                <h3>{t}</h3>
                <p>{d}</p>
              </article>
            ))}
          </div>
          <p className="twin-drift-note reveal">
            Drift lowers the enterprise&apos;s governance health score and surfaces in the operator queue — with the
            evidence attached. Nothing is auto-corrected: the Twin reports, a human decides.
          </p>
        </div>
      </section>

      {/* ────────────────────────── WHO READS IT ────────────────────────── */}
      <section className="gos-section gos-section-alt" id="uses">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Who reads it</span>
            <h2 className="gos-h2">One twin. Every executive.</h2>
            <p className="gos-sec-lede">
              The Twin is the source every Guardian OS workspace projects from — so the CTO&apos;s topology, the
              CISO&apos;s privileged-capability map and the Chief Risk Officer&apos;s exposure all come from the same
              model. They cannot disagree, because there is only one.
            </p>
          </header>
          <div className="twin-use-grid">
            {[
              ["Answer the audit question", "What AI do you run, what can it reach, who approved it — answered from the running system, not reassembled from memory."],
              ["See the blast radius", "The dependency graph shows what else touches a system before you change or isolate it."],
              ["Find the ungoverned", "Privileged capability with no policy over it is visible as a gap, not discovered during an incident."],
              ["Watch the estate change", "Every new system, server, tool or permission change is a recorded event with evidence behind it."],
            ].map(([t, d], i) => (
              <article className="gos-benefit reveal" data-d={String((i % 3) + 1)} key={t}>
                <h3>{t}</h3>
                <p>{d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ────────────────────── THE GOVERNING DISTINCTION ────────────────────── */}
      <section className="gos-section" id="distinction">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">The governing distinction</span>
            <h2 className="gos-h2">Three things, doing three jobs.</h2>
          </header>
          <div className="twin-dist">
            {[
              ["Your AI Twin", "The organisation's shared model — what exists, what it touches, what may authorise it."],
              ["Guardian OS", "Turns that model into executive and operational capability: workspaces, departments, packs."],
              ["Runtime Governance", "The conscience and control boundary around how autonomous systems interpret the model and move toward action."],
            ].map(([t, d], i) => (
              <article className={`twin-dist-item reveal${i === 2 ? " is-boundary" : ""}`} data-d={String(i + 1)} key={t}>
                <h3>{t}</h3>
                <p>{d}</p>
              </article>
            ))}
          </div>
          <p className="twin-dist-note reveal">
            The Twin is generated automatically when Guardian OS is installed.{" "}
            <Link href="/guardian-os" className="twin-inline-link">See how the installation works →</Link>
          </p>
        </div>
      </section>

      {/* ───────────────────────────── FINAL CTA ───────────────────────────── */}
      <section className="gos-final">
        <div className="gos-wrap">
          <h2 className="gos-final-h">See your AI estate as it actually is.</h2>
          <p className="twin-final-sub">
            Your AI Twin is generated automatically when Guardian OS is installed — there is nothing to draw and
            nothing to maintain.
          </p>
          <div className="gos-cta-row gos-cta-center">
            <Link href="/book" className="gos-btn gos-btn-primary">Book a Demo</Link>
            <Link href="/guardian-os" className="gos-btn gos-btn-ghost">Explore Guardian OS™</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
