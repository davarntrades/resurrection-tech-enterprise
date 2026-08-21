import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { CanvasScript } from "@/components/CanvasScript";
import { RuntimeGovernanceDemo } from "@/components/RuntimeGovernanceDemo";

export const metadata: Metadata = {
  title: "Technology — Local Safety Envelopes & Runtime Governance",
  description:
    "How Morrison Runtime Governance defines and enforces local Safety Envelopes: bounded deployment context, pre-execution trajectory evaluation, Ω reachability, the Identify–Constrain–Embed–Monitor methodology, and evidence for single-agent and multi-agent operation.",
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
            <h1>Local Safety Envelopes, enforced at runtime.</h1>
            <p>
              A global claim that an autonomous system is “safe” is too broad to operate on.
              Morrison evaluates safety locally: in a specified environment, with specified tools,
              permissions, policies, state transitions, and reachable consequences. That bounded
              operating region is the <strong>Safety Envelope</strong>.
            </p>
          </div>
        </div>
      </section>

      {/* ===== LOCAL SAFETY ENVELOPE ===== */}
      <section className="section section--tight" id="safety-envelope" aria-label="Local Safety Envelope">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Local Safety Envelope</span>
            <h2>Define where safe autonomous operation ends.</h2>
            <p>
              The Safety Envelope is the locally validated region in which an autonomous system can
              operate under a defined deployment context. It is scoped to the actual environment —
              the agents, tools, permissions, policies, trajectory horizon, and reachable states in
              front of us — not to an abstract universal claim about the underlying model.
            </p>
          </div>
          <div className="tp2-grid reveal">
            <div className="tp2-path is-allow">
              {["Environment", "Inside Safety Envelope", "Runtime Governance", "ALLOW"].map((n, i, a) => (
                <div className="tp2-step" key={n}>
                  <div className={`tp2-node${n === "Runtime Governance" ? " gov" : ""}${n === "ALLOW" ? " verdict ok" : ""}`}>{n}</div>
                  {i < a.length - 1 && <div className="tp2-arrow" aria-hidden="true">↓</div>}
                </div>
              ))}
            </div>
            <div className="tp2-path is-block">
              {["Environment", "Boundary violation / Ω reachability", "Runtime Governance", "BLOCK / ESCALATE"].map((n, i, a) => (
                <div className="tp2-step" key={n}>
                  <div className={`tp2-node${n === "Runtime Governance" ? " gov" : ""}${n === "BLOCK / ESCALATE" ? " verdict block" : ""}`}>{n}</div>
                  {i < a.length - 1 && <div className="tp2-arrow" aria-hidden="true">↓</div>}
                </div>
              ))}
            </div>
          </div>
          <p className="pull reveal" style={{ marginTop: "clamp(36px,4vw,56px)" }}>
            Local safety is a bounded claim: <span className="accent">what this system can safely reach,
            in this environment, under these constraints.</span>
          </p>
        </div>
      </section>

      <hr className="divider" />

      {/* ===== WHY RUNTIME, WHY BEFORE EXECUTION ===== */}
      <section className="section section--tight" id="before-execution" aria-label="Why runtime governance intercepts before execution">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Before execution</span>
            <h2>Most safety reacts. Governance enforces the boundary.</h2>
            <p>
              Traditional AI safety often inspects outputs or incidents after the system has acted.
              Runtime Governance evaluates the proposed trajectory before execution and decides whether
              it remains inside the local Safety Envelope.
            </p>
          </div>
          <div className="versus">
            <div className="vs-col legacy reveal">
              <div className="vs-tag"><span className="pip" /> After-the-fact control</div>
              <div className="vs-step"><span className="si">01</span> Output generated</div>
              <div className="vs-arrow-v"><ArrowDown /></div>
              <div className="vs-step"><span className="si">02</span> Action taken</div>
              <div className="vs-arrow-v"><ArrowDown /></div>
              <div className="vs-step"><span className="si">03</span> Boundary violation discovered later</div>
            </div>
            <div className="vs-mid"><div className="vbar" /><span>VS</span><div className="vbar" /></div>
            <div className="vs-col gov reveal" data-d="1">
              <div className="vs-tag"><span className="pip" /> Runtime Governance</div>
              <div className="vs-step"><span className="si">01</span> Trajectory evaluated</div>
              <div className="vs-arrow-v"><ArrowDown /></div>
              <div className="vs-step"><span className="si">02</span> Envelope status determined</div>
              <div className="vs-arrow-v"><ArrowDown /></div>
              <div className="vs-step"><span className="si">03</span> ALLOW / ESCALATE / BLOCK</div>
            </div>
          </div>

          <div className="tp2-grid reveal" style={{ marginTop: "clamp(40px,5vw,64px)" }}>
            <div className="tp2-path is-block">
              {["AI Agent", "Trajectory leaves envelope", "Runtime Governance", "BLOCKED"].map((n, i, a) => (
                <div className="tp2-step" key={n}>
                  <div className={`tp2-node${n === "Runtime Governance" ? " gov" : ""}${n === "BLOCKED" ? " verdict block" : ""}`}>{n}</div>
                  {i < a.length - 1 && <div className="tp2-arrow" aria-hidden="true">↓</div>}
                </div>
              ))}
            </div>
            <div className="tp2-path is-allow">
              {["AI Agent", "Trajectory remains inside envelope", "Runtime Governance", "Execution"].map((n, i, a) => (
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

      {/* ===== UNIVERSAL GOVERNANCE LAYER ===== */}
      <section className="section section--tight" id="stack" aria-label="Universal governance layer — full stack view">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Universal governance layer</span>
            <h2>The envelope is local. The enforcement layer is portable.</h2>
            <p>
              The Safety Envelope changes with the environment; the enforcement mechanism does not.
              Runtime Governance operates at the execution boundary, independent of model weights,
              architectures, providers, or training methods.
            </p>
          </div>

          <div className="mw-agnostic reveal" aria-label="Agnostic across the stack">
            {[
              "Provider-agnostic",
              "Model-agnostic",
              "Agent-framework agnostic",
              "Deployment-agnostic",
              "Third-party compatible",
              "Future-model compatible",
            ].map((t) => (
              <span key={t} className="mw-ag"><span className="mw-ag-dot" aria-hidden="true" />{t}</span>
            ))}
          </div>

          <div className="mw-arch reveal">
            <div className="mw-layer mw-models">
              <div className="mw-layer-label">Any provider · model · agent · system</div>
              <div className="mw-model-chips">
                {["OpenAI", "Anthropic", "Google", "Meta", "DeepSeek", "Qwen", "Microsoft Phi", "Mistral", "Grok", "Custom Models", "Third-Party Agents", "Internal Systems"].map((m) => (
                  <span key={m} className="mw-chip">{m}</span>
                ))}
              </div>
            </div>
            <div className="mw-arrow" aria-hidden="true">
              <div className="mw-arrow-line" />
              <div className="mw-arrow-cap">↓ every transition evaluated against the local envelope</div>
            </div>
            <div className="mw-layer mw-gov">
              <div className="mw-gov-inner">
                <span className="mw-omega">Ω</span>
                <div>
                  <div className="mw-gov-kicker">Local Safety Envelope · Runtime Governance Layer</div>
                  <div className="mw-gov-title">Morrison Runtime Governance<span className="tm">™</span></div>
                  <div className="mw-gov-sub">Trajectory evaluation · Boundary enforcement · Pre-execution interception</div>
                </div>
              </div>
            </div>
            <div className="mw-arrow" aria-hidden="true">
              <div className="mw-arrow-line" />
              <div className="mw-arrow-cap">↓ only envelope-admissible actions reach your systems</div>
            </div>
            <div className="mw-layer mw-system">
              <div className="mw-layer-label">Protected enterprise systems &amp; data</div>
              <div className="mw-model-chips">
                {["Customer Data", "CRM Systems", "Banking APIs", "Email Systems", "Cloud Infrastructure", "Internal Tools", "Databases", "Autonomous Workflows"].map((a) => (
                  <span key={a} className="mw-chip mw-asset">{a}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="mw-note reveal">
            <div className="mwn-row">
              <span className="mwn-dot safe" />
              <span>Trajectories inside the validated Safety Envelope pass through to your systems</span>
            </div>
            <div className="mwn-row">
              <span className="mwn-dot blocked" />
              <span>Boundary-violating or Ω-bound trajectories are blocked or escalated pre-execution</span>
            </div>
          </div>

          <p className="mw-examples reveal">
            Models will change. Tools and permissions will change. The local envelope can be revalidated
            without changing the enforcement architecture.
          </p>
        </div>
      </section>

      <hr className="divider" />

      {/* ===== METHODOLOGY ===== */}
      <section className="section" id="what" data-screen-label="Methodology">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Methodology</span>
            <h2>Map, define, enforce, and revalidate the local Safety Envelope.</h2>
            <p>
              Autonomous systems operate in changing state-spaces. Morrison turns that environment
              into a bounded operating claim that can be tested and enforced at runtime.
            </p>
          </div>
          <div className="dowork reveal">
            {[
              ["01 — IDENTIFY", "Identify", "Map the deployment context: reachable states, tools, permissions, policies, data flows, and Ω exposure."],
              ["02 — CONSTRAIN", "Constrain", "Define and validate the local Safety Envelope and the boundaries trajectories must satisfy."],
              ["03 — EMBED", "Embed", "Integrate Runtime Governance at the execution boundary so every proposed action is evaluated before it runs."],
              ["04 — MONITOR", "Revalidate", "Revalidate the envelope as models, tools, permissions, policies, and the operational environment change."],
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
              The claim stays bounded to the environment. The boundary stays enforceable as the
              system evolves. <span className="accent">Ω remains the forbidden region inside that geometry.</span>
            </p>
          </div>
        </div>
      </section>

      <hr className="divider" />

      {/* ===== SAFETY ENVELOPE GEOMETRY ===== */}
      <section className="section" id="reachability" data-screen-label="Reachability">
        <div className="wrap">
          <div className="reach">
            <div className="reach-stage reveal">
              <canvas id="reach-canvas" aria-hidden="true" />
              <CanvasScript src="/canvas/reach.js" />
            </div>
            <div>
              <div className="section-head reveal" style={{ marginBottom: 0 }}>
                <span className="eyebrow">Safety Envelope Geometry</span>
                <h2>Local safety, expressed as reachability.</h2>
                <p>
                  States are nodes. Transitions are edges. The Safety Envelope describes the region
                  the system may occupy under the current environment and constraints. Runtime Governance
                  evaluates each reachable path and denies transitions that leave the envelope or enter
                  the forbidden <span className="om">Ω</span> set — before execution.
                </p>
              </div>
              <div className="reach-legend reveal" data-d="1">
                <div className="legend-row">
                  <span className="swatch safe" />
                  <div>
                    <b>Inside the Safety Envelope</b>
                    <span>Locally admissible transitions propagate under the validated constraints.</span>
                  </div>
                </div>
                <div className="legend-row">
                  <span className="swatch blocked" />
                  <div>
                    <b>Boundary violation</b>
                    <span>Transitions leaving the validated region are blocked or escalated pre-execution.</span>
                  </div>
                </div>
                <div className="legend-row">
                  <span className="swatch omega" />
                  <div>
                    <b>Ω — forbidden region</b>
                    <span>States the system must not reach. Constrained, contained, unreachable.</span>
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
            <span className="eyebrow">Boundary coverage</span>
            <h2>What can push a system outside its local Safety Envelope.</h2>
            <p>
              Traditional security evaluates individual events. Runtime Governance evaluates the
              trajectory those events create and whether that trajectory remains locally admissible
              before execution.
            </p>
          </div>

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

          <div className="tcov-tier reveal">
            <div className="tcov-tier-h"><span className="tcov-dot adv" aria-hidden="true" />Advanced multi-agent boundary risks</div>

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
              Existing controls watch individual events. Multi-agent systems can leave a safe operating
              region across the whole trajectory — which is exactly what Runtime Governance evaluates,
              before execution.
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
              Runtime Governance uses precise technical language. Here is what each core term means
              in plain English, so the boundary of the claim is explicit.
            </p>
          </div>
          <div className="inv-grid">
            {([
              ["Safety Envelope", "The locally validated region in which an autonomous system may operate under a specified environment and set of constraints. It is a bounded deployment claim, not a universal claim that a model is safe."],
              ["Ω — The Forbidden Region", "The set of states your AI must not reach. Ω sits inside the broader safety geometry as the explicitly forbidden region that governance makes unreachable."],
              ["Reachability", "Whether your system can reach a given state from where it is now through available transitions. Governance uses reachability to test whether a trajectory stays inside the envelope or approaches a forbidden region."],
              ["Trajectory", "The sequence of decisions, tool calls, or actions that lead your system from its current state toward an outcome. Governance evaluates the trajectory, not only the final action."],
              ["Runtime Constraint", "A rule embedded directly in the execution path that prevents or escalates a prohibited transition before the tool call runs."],
              ["Pre-Execution Interception", "Evaluating and governing an action before it happens — not detecting a boundary violation after the fact."],
              ["Invariant", "A property that must remain true throughout execution — for example: 'This system will never authorise a payment above threshold X without human approval.'"],
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
            <h2>See the Safety Envelope enforced in real time.</h2>
            <p>
              Select a scenario. Runtime Governance evaluates the agent&rsquo;s proposed trajectory
              before execution — trajectories inside the envelope flow through, while boundary-
              violating or Ω-bound paths are intercepted pre-action.
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
            <h2 style={{ marginTop: 20 }}>Map the local Safety Envelope in your environment.</h2>
            <p>
              Start with a live trajectory, then evaluate the real tools, permissions, policies,
              and reachable states that define the boundary for your deployment.
            </p>
            <div className="hero-actions" style={{ marginTop: 38 }}>
              <Link href="/live-demo" className="btn btn--primary">Try the Live Demo <span className="arr">→</span></Link>
              <Link href="/quickstart" className="btn btn--ghost">Developer quickstart</Link>
              <Link href="/book#assessment" className="btn btn--ghost">Book a Safety Envelope Assessment</Link>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}