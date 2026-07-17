import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { CanvasScript } from "@/components/CanvasScript";
import { RuntimeGovernanceDemo } from "@/components/RuntimeGovernanceDemo";

export const metadata: Metadata = {
  title: "Technology — Runtime Governance, in depth",
  description:
    "How Morrison Runtime Governance works: pre-execution trajectory evaluation, Ω reachability, the Identify–Constrain–Embed–Monitor methodology, full threat coverage across single-agent and multi-agent failure modes, and the core concepts in plain English.",
  alternates: { canonical: "/technology" },
};

const ArrowDown = () => (
  <svg width="14" height="22" viewBox="0 0 14 22" fill="none">
    <path d="M7 0 V18 M2 13 L7 19 L12 13" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

export default function Page() {
  return (
    <PageShell>
      {/* ===== INTRO ===== */}
      <section className="section section--tight" aria-label="Technology overview">
        <div className="wrap">
          <div className="section-head reveal" style={{ marginBottom: 0 }}>
            <span className="eyebrow">Technology</span>
            <h1>Runtime Governance, in depth.</h1>
            <p>
              The complete technical picture: how trajectories are evaluated before execution,
              how the forbidden region Ω is made unreachable, the full threat coverage across
              single-agent and multi-agent failure modes, and the core concepts in plain English.
            </p>
          </div>
        </div>
      </section>

      {/* ===== WHY RUNTIME, WHY BEFORE EXECUTION ===== */}
      <section className="section section--tight" id="before-execution" aria-label="Why runtime governance intercepts before execution">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Before execution</span>
            <h2>Most safety reacts. Governance prevents.</h2>
            <p>
              Traditional AI safety inspects outputs after the system has already acted. Runtime
              Governance evaluates the action before execution.
            </p>
          </div>
          <div className="versus">
            <div className="vs-col legacy reveal">
              <div className="vs-tag"><span className="pip" /> Traditional safety</div>
              <div className="vs-step"><span className="si">01</span> Output generated</div>
              <div className="vs-arrow-v"><ArrowDown /></div>
              <div className="vs-step"><span className="si">02</span> Action taken</div>
              <div className="vs-arrow-v"><ArrowDown /></div>
              <div className="vs-step"><span className="si">03</span> Issue discovered later</div>
            </div>
            <div className="vs-mid"><div className="vbar" /><span>VS</span><div className="vbar" /></div>
            <div className="vs-col gov reveal" data-d="1">
              <div className="vs-tag"><span className="pip" /> Runtime Governance</div>
              <div className="vs-step"><span className="si">01</span> Trajectory evaluated</div>
              <div className="vs-arrow-v"><ArrowDown /></div>
              <div className="vs-step"><span className="si">02</span> Unsafe path detected</div>
              <div className="vs-arrow-v"><ArrowDown /></div>
              <div className="vs-step"><span className="si">03</span> Execution prevented</div>
            </div>
          </div>

          <div className="tp2-grid reveal" style={{ marginTop: "clamp(40px,5vw,64px)" }}>
            <div className="tp2-path is-block">
              {["AI Agent", "Unsafe action chain", "Runtime Governance", "BLOCKED"].map((n, i, a) => (
                <div className="tp2-step" key={n}>
                  <div className={`tp2-node${n === "Runtime Governance" ? " gov" : ""}${n === "BLOCKED" ? " verdict block" : ""}`}>{n}</div>
                  {i < a.length - 1 && <div className="tp2-arrow" aria-hidden="true">↓</div>}
                </div>
              ))}
            </div>
            <div className="tp2-path is-allow">
              {["AI Agent", "Approved action", "Runtime Governance", "Execution"].map((n, i, a) => (
                <div className="tp2-step" key={n}>
                  <div className={`tp2-node${n === "Runtime Governance" ? " gov" : ""}${n === "Execution" ? " verdict ok" : ""}`}>{n}</div>
                  {i < a.length - 1 && <div className="tp2-arrow" aria-hidden="true">↓</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <hr className="divider" />

      {/* ===== METHODOLOGY — IDENTIFY / CONSTRAIN / EMBED / MONITOR ===== */}
      <section className="section" id="what" data-screen-label="Methodology">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Methodology</span>
            <h2>Operational assurance for systems that act on their own.</h2>
            <p>
              Autonomous systems navigate enormous state-spaces. Some of those states are
              catastrophic. We make the forbidden region — Ω — unreachable at runtime.
            </p>
          </div>
          <div className="dowork reveal">
            {[
              ["01 — IDENTIFY", "Identify", "Map the reachable Ω exposure across the system's full operational state-space."],
              ["02 — CONSTRAIN", "Constrain", "Define and validate the geometric boundaries that trajectories must never cross."],
              ["03 — EMBED", "Embed", "Integrate runtime governance directly into the client's deployment environment."],
              ["04 — MONITOR", "Monitor", "Maintain protection as the model, planner, and threat-surface evolve over time."],
            ].map(([num, h, p]) => (
              <div className="cell" key={h}>
                <div className="num">{num}</div>
                <h3>{h}</h3>
                <p>{p}</p>
              </div>
            ))}
          </div>
          <div className="reveal" style={{ marginTop: "clamp(48px,6vw,88px)" }}>
            <p className="pull">
              Identified, constrained, embedded, and monitored — as the operational
              environment evolves, <span className="accent">Ω</span> stays unreachable.
            </p>
          </div>
        </div>
      </section>

      <hr className="divider" />

      {/* ===== Ω REACHABILITY ===== */}
      <section className="section" id="reachability" data-screen-label="Reachability">
        <div className="wrap">
          <div className="reach">
            <div className="reach-stage reveal">
              <canvas id="reach-canvas" aria-hidden="true" />
              <CanvasScript src="/canvas/reach.js" />
            </div>
            <div>
              <div className="section-head reveal" style={{ marginBottom: 0 }}>
                <span className="eyebrow">Ω Reachability</span>
                <h2>Safety, expressed as geometry.</h2>
                <p>
                  States are nodes. Transitions are edges. Governance evaluates every reachable
                  path and denies any transition that would step the system into the forbidden Ω
                  set — before it executes.
                </p>
              </div>
              <div className="reach-legend reveal" data-d="1">
                <div className="legend-row">
                  <span className="swatch safe" />
                  <div>
                    <b>Reachable &amp; safe</b>
                    <span>Transitions that remain outside Ω propagate freely.</span>
                  </div>
                </div>
                <div className="legend-row">
                  <span className="swatch blocked" />
                  <div>
                    <b>Denied transition</b>
                    <span>Edges crossing the boundary are blocked pre-execution.</span>
                  </div>
                </div>
                <div className="legend-row">
                  <span className="swatch omega" />
                  <div>
                    <b>Ω — forbidden region</b>
                    <span>Catastrophic states. Constrained, contained, unreachable.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <hr className="divider" />

      {/* ===== FULL THREAT COVERAGE ===== */}
      <section className="section section--tight tcov" id="threats" aria-label="Threat coverage">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Threat coverage</span>
            <h2>The business risks Runtime Governance prevents.</h2>
            <p>
              Traditional security evaluates individual events. Runtime Governance evaluates the
              trajectory those events create — and denies it before execution.
            </p>
          </div>

          {/* Tier 1 — Enterprise critical */}
          <div className="tcov-tier reveal">
            <div className="tcov-tier-h"><span className="tcov-dot crit" aria-hidden="true" />Enterprise critical risks</div>
            <div className="tcov-grid">
              {([
                ["Unauthorized Financial Execution", "An agent moves money — a transfer, payment, or refund — outside approved limits or to an unverified destination.", "The transfer is denied before it executes, preventing irreversible financial loss."],
                ["Credential & Secret Exfiltration", "An agent reads API keys, tokens, or secrets and routes them toward an external destination.", "The credential-to-external path is blocked before any secret leaves the boundary."],
                ["Data Leakage (PII / PHI / customer data)", "Customer or regulated data is read and then sent beyond the approved boundary.", "The exfiltration trajectory is stopped before a notifiable breach can occur."],
                ["Privilege Escalation", "An agent acquires permissions — for itself or another agent — beyond its authorised scope.", "Escalation is denied before elevated access is ever granted."],
              ] as [string, string, string][]).map(([t, what, prevent]) => (
                <div className="tcov-card crit" key={t}>
                  <div className="tcov-card-h">{t}</div>
                  <p className="tcov-what">{what}</p>
                  <p className="tcov-prevent"><span>Prevented</span>{prevent}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Tier 2 — Autonomous agent risks */}
          <div className="tcov-tier reveal">
            <div className="tcov-tier-h"><span className="tcov-dot auto" aria-hidden="true" />Autonomous agent risks</div>
            <p className="tcov-tier-sub">Failure modes that point-in-time monitoring cannot see, because the danger only exists across the full trajectory.</p>
            <div className="tcov-grid">
              {([
                ["Chained Multi-Step Attacks", "Each step looks benign in isolation; the risk only appears across the full sequence. Event-level monitoring never sees the chain."],
                ["Cross-Agent Delayed Intent", "Intent formed by one agent executes through another, later — breaking the cause-and-effect link monitoring relies on."],
                ["Silent Trajectory Collapse", "The system drifts toward an unsafe state with no single alerting event. Nothing trips a threshold until it is too late."],
                ["Long-Horizon Agent Drift", "Over many steps an agent migrates outside its original mandate — gradually, below the radar of point-in-time checks."],
              ] as [string, string][]).map(([t, d]) => (
                <div className="tcov-card auto" key={t}>
                  <div className="tcov-card-h">{t}</div>
                  <p className="tcov-what">{d}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Tier 3 — Advanced multi-agent catastrophic */}
          <div className="tcov-tier reveal">
            <div className="tcov-tier-h"><span className="tcov-dot adv" aria-hidden="true" />Advanced multi-agent catastrophic risks</div>

            <div className="tcov-featured">
              <div className="tcov-featured-tag">Featured risk</div>
              <h3>Cascading Failures Across Agent Pipelines</h3>
              <p>Multiple individually safe agents can combine into an unsafe system.</p>
              <div className="tcov-chain" aria-hidden="true">
                <span className="tcov-chain-node ok">Agent A — safe</span>
                <span className="tcov-chain-plus">+</span>
                <span className="tcov-chain-node ok">Agent B — safe</span>
                <span className="tcov-chain-plus">+</span>
                <span className="tcov-chain-node ok">Agent C — safe</span>
                <span className="tcov-chain-eq">=</span>
                <span className="tcov-chain-node bad">Combined trajectory — unsafe</span>
              </div>
              <p className="tcov-featured-close">Runtime Governance evaluates the full trajectory across the pipeline — not each agent in isolation — and denies the combined unsafe path before any agent acts.</p>
            </div>

            <div className="tcov-grid tcov-grid--adv">
              {([
                ["Multi-Agent Collusion", "Agents coordinate to achieve together what none could alone.", ["Collusive exfiltration", "Role-split credential theft", "Split unauthorized transfer", "Tool delegation chains"]],
                ["Composite Cross-Domain Risk", "Separate risk categories combine into one unsafe trajectory.", ["Financial execution + data exfiltration", "Credential theft + privilege escalation", "Multiple risk categories in one trajectory"]],
              ] as [string, string, string[]][]).map(([t, d, subs]) => (
                <div className="tcov-card adv" key={t}>
                  <div className="tcov-card-h">{t}</div>
                  <p className="tcov-what">{d}</p>
                  <ul className="tcov-sub">{subs.map((s) => <li key={s}>{s}</li>)}</ul>
                </div>
              ))}
              {([
                ["Hidden-Trajectory Catastrophic Risk", "An unsafe path that never surfaces as an obvious unsafe step."],
                ["Multi-Representation Forbidden-State Reachability", "The same forbidden outcome reached through different encodings or tools."],
                ["Memory Contamination Between Agents", "Unsafe state passed between agents through shared memory or context."],
              ] as [string, string][]).map(([t, d]) => (
                <div className="tcov-card adv" key={t}>
                  <div className="tcov-card-h">{t}</div>
                  <p className="tcov-what">{d}</p>
                </div>
              ))}
            </div>

            <div className="tcov-keymsg reveal">
              <span className="tcov-keymsg-dot" aria-hidden="true" />
              Existing controls watch individual events. Multi-agent systems fail across the whole
              trajectory — which is exactly what Runtime Governance evaluates, before execution.
            </div>
          </div>
        </div>
      </section>

      <hr className="divider" />

      {/* ===== CONCEPTS IN PLAIN ENGLISH ===== */}
      <section className="section section--tight" id="invariants" aria-label="Plain-English concept glossary">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Plain-English clarity</span>
            <h2>The concepts, without the jargon.</h2>
            <p>
              Runtime Governance uses precise technical language. Here is what each core
              term means in plain English, so you know exactly what you are buying.
            </p>
          </div>
          <div className="inv-grid">
            {([
              ["Ω — The Forbidden Region", "The set of system states your AI must never reach. Ω is not a filter — it is a geometric boundary around catastrophic outcomes. Once defined, the governance layer ensures no execution path can enter it."],
              ["Reachability", "Whether your system can ever reach a given state from where it is now. If a catastrophic state is reachable, it will eventually be reached. Governance makes the Ω set unreachable by construction."],
              ["Trajectory", "The sequence of decisions, tool calls, or actions that lead your system from its current state toward an outcome. Governance evaluates the entire trajectory — not just the final action."],
              ["Runtime Constraint", "A rule embedded directly in the execution path that prevents a prohibited action. Unlike policy, it cannot be bypassed, overridden, or forgotten by the model at inference time."],
              ["Pre-Execution Interception", "Blocking a harmful action before it happens — not detecting it after. Most AI safety operates post-hoc. Runtime Governance operates before the action executes."],
              ["Invariant", "A property that must remain true throughout every execution — for example: 'This system will never authorise a payment above threshold X without human approval.' Invariants are formally specified and enforced at runtime."],
            ] as [string, string][]).map(([term, plain]) => (
              <div className="inv-card card reveal" key={term}>
                <div className="inv-term">{term}</div>
                <div className="inv-plain">{plain}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <hr className="divider" />

      {/* ===== INTERACTIVE GOVERNANCE DEMO ===== */}
      <section className="section section--tight" id="demo" aria-label="Interactive governance demonstration">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Interactive demonstration</span>
            <h2>See governance intercept in real time.</h2>
            <p>
              Select a scenario. Runtime Governance evaluates the agent&rsquo;s proposed
              trajectory before execution — safe paths flow through to execution, while
              Ω-bound paths are intercepted at the governance layer, pre-action.
            </p>
          </div>
          <RuntimeGovernanceDemo />
          <div className="demo-cta reveal">
            <span>Want to test your own action chain — or don&rsquo;t have an agent yet?</span>
            <Link href="/test-trajectory" className="btn btn--ghost btn--sm">
              Try the trajectory demo <span className="arr">→</span>
            </Link>
            <Link href="/test-without-agent" className="btn btn--ghost btn--sm">
              Test without your own agent <span className="arr">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ===== NEXT STEPS ===== */}
      <section className="section cta-final" aria-label="Next steps">
        <div className="wrap">
          <div className="inner reveal">
            <span className="eyebrow" style={{ justifyContent: "center" }}>Next steps</span>
            <h2 style={{ marginTop: 20 }}>See it evaluate a live trajectory.</h2>
            <p>
              The interactive demo shows governance intercepting unsafe trajectories in real time,
              and the developer quickstart connects it to your own agent in about 15 minutes.
            </p>
            <div className="hero-actions" style={{ marginTop: 38 }}>
              <Link href="/live-demo" className="btn btn--primary">Try the Live Demo <span className="arr">→</span></Link>
              <Link href="/quickstart" className="btn btn--ghost">Developer quickstart</Link>
              <Link href="/book#assessment" className="btn btn--ghost">Book a Runtime Safety Assessment</Link>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
