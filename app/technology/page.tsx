import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { CanvasScript } from "@/components/CanvasScript";
import { RuntimeGovernanceDemo } from "@/components/RuntimeGovernanceDemo";

export const metadata: Metadata = {
  title: "Technology — Execution Control for Autonomous Systems",
  description:
    "How Morrison Runtime Governance defines and enforces Admissible Operating Envelopes: independent pre-execution authorization, state transitions, Ω reachability, bounded verification, evidence chains, integrations and deployment.",
  alternates: { canonical: "/technology" },
};

/* Section 4 — the three verdicts, stated as control outcomes. */
const VERDICTS = [
  ["allow", "Allow", "The proposed transition satisfies the envelope. It proceeds to the execution path."],
  ["escalate", "Escalate", "Authorization is withheld and routed to an independent approver before any state change."],
  ["block", "Block", "The transition is terminated at the boundary. No state-changing call is issued."],
] as const;

/* Section 5 — what is actually evaluated at the boundary. */
const TRANSITION_INPUTS = [
  ["State", "The current configuration of the environment: resources, records, permissions and prior transitions."],
  ["Action", "The proposed tool call or API invocation, with its arguments, target and scope."],
  ["Trajectory", "The sequence the action belongs to, evaluated over a declared horizon rather than one step at a time."],
  ["Authority", "The permissions and delegation the calling identity actually holds for this action, in this environment."],
  ["Conditions", "The operating conditions the envelope declares — thresholds, approval requirements, data boundaries, time and rate constraints."],
];

/* Section 8 — what a governance evaluation emits. */
const EVIDENCE_CHAIN = [
  ["01", "Proposal record", "The proposed action, its arguments, the calling identity and the environment it was proposed in."],
  ["02", "Policy state", "The exact envelope and Ω definitions in force at evaluation time, identified by version."],
  ["03", "Verdict", "Allow, escalate or block, with the governing rule that produced it."],
  ["04", "Approval", "Where escalation applied: who authorized, under what authority, and when."],
  ["05", "Execution result", "Whether the authorized action was issued, and what the downstream system returned."],
  ["06", "Chain hash", "A hash linking the record to the one before it, so an alteration anywhere breaks verification."],
];

/* Section 11 — profiles. The contract is identical across all of them. */
const PROFILES = [
  ["Cloud", "Managed control plane, hosted evidence store."],
  ["Hybrid", "Local enforcement, centrally managed policy distribution."],
  ["Private cloud", "Customer tenancy, customer-held keys."],
  ["On-premises", "Enforcement and evidence inside the customer estate."],
  ["Sovereign", "Customer-controlled authority and evidence custody in-jurisdiction."],
  ["Air-gapped", "Signed local policy, no required external control plane or network."],
];

export default function Page() {
  return (
    <PageShell>
      {/* ══════════ 1 · CAPABILITY ≠ AUTHORITY ══════════ */}
      <section className="rt-section rt-section--first" aria-labelledby="tech-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal in">Technology</span>
          <h1 id="tech-title" className="rt-display rt-tech-title reveal in" data-d="1">
            Capability <span className="neq">≠</span> Authority
          </h1>
          <p className="rt-lede reveal in" data-d="2">
            What an autonomous system is able to compute is a separate question from what it is
            permitted to execute. Morrison Runtime Governance operates on the second question only.
          </p>
          <p className="rt-lede reveal in" data-d="2">
            It sits on the execution path, evaluates each proposed state transition against a
            declared Admissible Operating Envelope, and issues an authorization decision before any
            state-changing call is made.
          </p>
          <nav className="rt-jump reveal" data-d="3" aria-label="On this page">
            {[
              ["#envelope", "Operating envelope"],
              ["#authorization", "Authorization"],
              ["#transitions", "State transitions"],
              ["#reachability", "Reachability"],
              ["#verification", "Bounded verification"],
              ["#evidence-chain", "Evidence chain"],
              ["#integrations", "Integrations"],
              ["#performance", "Performance"],
              ["#deployment", "Deployment"],
            ].map(([href, label]) => (
              <a key={href} href={href}>{label}</a>
            ))}
          </nav>
        </div>
      </section>

      {/* ══════════ 2 · ADMISSIBLE OPERATING ENVELOPE ══════════ */}
      {/* The legacy anchor stays stable for existing inbound links. */}
      <section className="rt-section rt-section--band" id="envelope" aria-labelledby="env-title">
        <span id="safety-envelope" className="rt-anchor" aria-hidden="true" />
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">Admissible Operating Envelope</span>
          <h2 id="env-title" className="rt-h2 rt-narrow reveal" data-d="1">
            Declare the permitted region
            <br />
            before trusting operation.
          </h2>
          <p className="rt-lede reveal" data-d="2">
            An Admissible Operating Envelope is the set of states, actions, transitions and
            operating conditions a system is permitted to occupy or execute within a defined
            environment. It is scoped to the actual deployment — the agents, tools, permissions,
            policies, trajectory horizon and reachable states in front of us — not to a universal
            claim about the underlying model.
          </p>

          <div className="rt-defs reveal" data-d="3">
            {[
              ["Environment", "The deployment context being governed."],
              ["Tools & permissions", "The executable surface reachable from that context."],
              ["Policies & conditions", "The declared constraints that define admissible operation."],
              ["Horizon", "The trajectory depth over which reachable states are evaluated."],
              ["Ω", "The explicitly forbidden region inside that geometry."],
            ].map(([k, v]) => (
              <div key={k}>
                <span className="k">{k}</span>
                <span className="v">{v}</span>
              </div>
            ))}
          </div>

          <p className="rt-note reveal">
            The same engineering principle appears wherever consequences are physical: a flight
            envelope in aviation, a workspace envelope in robotics. Different systems, one method —
            declare the operating boundary before trusting operation.
          </p>
        </div>
      </section>

      {/* ══════════ 3 · PROPOSAL → AUTHORIZATION → EXECUTION ══════════ */}
      <section className="rt-section" id="authorization" aria-labelledby="auth-title">
        <span id="before-execution" className="rt-anchor" aria-hidden="true" />
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">Proposal → Authorization → Execution</span>
          <h2 id="auth-title" className="rt-h2 rt-narrow reveal" data-d="1">
            The decision is made
            <br />
            before the call is issued.
          </h2>

          <div className="rt-path rt-tech-path reveal" data-d="2">
            <div className="rt-path-node">
              <span className="n-label">01 / Proposal</span>
              <span className="n-title">Action proposed</span>
              <span className="n-desc">A tool call or API invocation is requested, with arguments and target.</span>
            </div>
            <div className="rt-path-link" aria-hidden="true"><span className="rt-path-glyph">→</span></div>
            <div className="rt-path-node rt-path-node--authority">
              <span className="n-label">02 / Authorization</span>
              <span className="n-title">Independently evaluated</span>
              <span className="n-desc">Assessed against the envelope by a component outside the proposing system.</span>
            </div>
            <div className="rt-path-link" aria-hidden="true"><span className="rt-path-glyph">→</span></div>
            <div className="rt-path-node">
              <span className="n-label">03 / Execution</span>
              <span className="n-title">Authorized call issued</span>
              <span className="n-desc">Only a transition that satisfied authorization reaches the downstream system.</span>
            </div>
          </div>

          <p className="rt-note reveal">
            Evaluation is deterministic: the same proposed trajectory against the same policy state
            produces the same verdict. The evaluator is not a model judging its own output.
          </p>
        </div>
      </section>

      {/* ══════════ 4 · ALLOW / ESCALATE / BLOCK ══════════ */}
      <section className="rt-section rt-section--band" id="verdicts" aria-labelledby="verdict-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">Allow / Escalate / Block</span>
          <h2 id="verdict-title" className="rt-h2 rt-narrow reveal" data-d="1">
            Three outcomes. One of them
            <br />
            reaches the execution path.
          </h2>
          <div className="rt-verdicts rt-verdicts--standalone reveal" data-d="2">
            {VERDICTS.map(([id, name, desc]) => (
              <div className={`rt-verdict rt-verdict--${id}`} key={id}>
                <span className="v-key"><span className="v-mark" aria-hidden="true" />{name}</span>
                <span className="v-desc">{desc}</span>
              </div>
            ))}
          </div>
          <p className="rt-note reveal">
            Fail-closed: if policy cannot be verified, or the evaluator cannot reach a decision, the
            transition does not execute. The absence of an allow is not an allow.
          </p>
        </div>
      </section>

      {/* ══════════ 5 · STATE TRANSITIONS ══════════ */}
      <section className="rt-section" id="transitions" aria-labelledby="trans-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">State transitions</span>
          <h2 id="trans-title" className="rt-h2 rt-narrow reveal" data-d="1">
            The unit of evaluation is the
            <br />
            transition, not the output.
          </h2>
          <p className="rt-lede reveal" data-d="2">
            A transition takes the environment from <span className="rt-inline-mono">x(t)</span> to{" "}
            <span className="rt-inline-mono">x(t+1)</span>. Governance evaluates that step and the
            trajectory it belongs to — natural-language output is not the object under evaluation.
          </p>
          <div className="rt-defs reveal" data-d="3">
            {TRANSITION_INPUTS.map(([k, v]) => (
              <div key={k}>
                <span className="k">{k}</span>
                <span className="v">{v}</span>
              </div>
            ))}
          </div>
          <p className="rt-note reveal">
            This is why chained and cross-agent paths are visible to it: each step may be admissible
            in isolation while the sequence is not. The sequence is what gets evaluated.
          </p>
        </div>
      </section>

      {/* ══════════ 6 · REACHABILITY ══════════ */}
      <section className="rt-section rt-section--band" id="reachability" aria-labelledby="reach-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">Reachability</span>
          <h2 id="reach-title" className="rt-h2 rt-narrow reveal" data-d="1">
            States are nodes.
            <br />
            Transitions are edges.
          </h2>

          <div className="rt-reach-grid">
            <div className="reveal" data-d="2">
              <div className="reach-stage">
                <canvas id="reach-canvas" aria-hidden="true" />
                <CanvasScript src="/canvas/reach.js" />
              </div>
              <p className="rt-figcaption">
                A discrete state space. Transitions that would step into Ω are denied at the
                boundary rather than reported afterwards.
              </p>
            </div>
            <div className="reveal" data-d="3">
              <div className="reach-legend">
                <div className="legend-row">
                  <span className="swatch safe" aria-hidden="true" />
                  <div>
                    <b>Inside the envelope</b>
                    <span>Admissible transitions propagate under the declared constraints.</span>
                  </div>
                </div>
                <div className="legend-row">
                  <span className="swatch blocked" aria-hidden="true" />
                  <div>
                    <b>Boundary violation</b>
                    <span>Transitions leaving the declared region are blocked or escalated pre-execution.</span>
                  </div>
                </div>
                <div className="legend-row">
                  <span className="swatch omega" aria-hidden="true" />
                  <div>
                    <b>Ω — forbidden region</b>
                    <span>States the system must not reach under the governed transition system.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ 7 · BOUNDED VERIFICATION ══════════ */}
      <section className="rt-section" id="verification" aria-labelledby="verify-title">
        <span id="invariants" className="rt-anchor" aria-hidden="true" />
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">Bounded verification</span>
          <h2 id="verify-title" className="rt-h2 rt-narrow reveal" data-d="1">
            Within the declared model,
            <br />
            no forbidden state remains reachable.
          </h2>

          <p className="rt-lede reveal" data-d="2">
            Stated formally, the verification condition is:
          </p>

          <p className="rt-notation reveal" data-d="3">
            Reach<sub>G</sub>(X₀) ∩ Ω = ∅
          </p>

          <dl className="rt-defs reveal">
            <div><dt>X₀</dt><dd>Initial state set</dd></div>
            <div><dt>G</dt><dd>Governed transition system</dd></div>
            <div><dt>Reach<sub>G</sub>(X₀)</dt><dd>States reachable while governance is active</dd></div>
            <div><dt>Ω</dt><dd>Configured forbidden states</dd></div>
          </dl>

          <p className="rt-lede reveal">
            In plain English: within the declared bounded model, no configured forbidden state
            remains reachable under the governed transition system.
          </p>

          <div className="rt-claim reveal">
            <span className="c-key">Claim boundary</span>
            <p>
              This is <strong>bounded verification, not a universal proof of AI safety</strong>. The
              result holds for the environment, tools, permissions, policies, horizon and Ω
              definitions that were declared and evaluated. It does not assert that the underlying
              model is safe in every environment or under every future configuration. If the
              deployment context changes materially, the envelope is revalidated.
            </p>
          </div>
        </div>
      </section>

      {/* ══════════ 8 · EVIDENCE CHAIN ══════════ */}
      <section className="rt-section rt-section--band" id="evidence-chain" aria-labelledby="chain-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">Evidence chain</span>
          <h2 id="chain-title" className="rt-h2 rt-narrow reveal" data-d="1">
            Every decision leaves
            <br />
            a record that can be replayed.
          </h2>
          <div className="rt-stack reveal" data-d="2">
            {EVIDENCE_CHAIN.map(([idx, name, body]) => (
              <div className="rt-stack-row" key={idx}>
                <span className="s-idx">{idx}</span>
                <div><span className="s-name">{name}</span></div>
                <p className="s-body">{body}</p>
              </div>
            ))}
          </div>
          <p className="rt-note reveal">
            Replay is deterministic: the recorded proposal and the recorded policy state reproduce
            the recorded verdict. A record that has been altered fails verification.
          </p>
          <div className="rt-links reveal">
            <Link href="/evidence">Evidence &amp; methodology</Link>
            <Link href="/security">Security &amp; deployment</Link>
          </div>
        </div>
      </section>

      {/* ══════════ 9 · INTEGRATIONS ══════════ */}
      <section className="rt-section" id="integrations" aria-labelledby="integ-title">
        <span id="stack" className="rt-anchor" aria-hidden="true" />
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">Integrations</span>
          <h2 id="integ-title" className="rt-h2 rt-narrow reveal" data-d="1">
            The envelope is local.
            <br />
            The control layer is portable.
          </h2>
          <p className="rt-lede reveal" data-d="2">
            The envelope changes with the environment; the enforcement mechanism does not.
            Governance operates at the execution boundary, independent of model weights,
            architectures, providers or training methods.
          </p>
          <ul className="rt-attrs reveal" data-d="3">
            {[
              "Provider-agnostic",
              "Model-agnostic",
              "Agent-framework agnostic",
              "Deployment-agnostic",
              "Third-party compatible",
              "Future-model compatible",
            ].map((t, i) => (
              <li key={t}>
                <span className="a-idx">{String(i + 1).padStart(2, "0")}</span>
                {t}
              </li>
            ))}
          </ul>
          <p className="rt-note reveal">
            Models, tools and permissions change. The envelope is revalidated without changing the
            enforcement architecture.
          </p>
          <div className="rt-links reveal">
            <Link href="/integrations">How it integrates</Link>
            <Link href="/developers">Developer surface</Link>
          </div>
        </div>
      </section>

      {/* ══════════ 10 · PERFORMANCE ══════════ */}
      <section className="rt-section rt-section--band" id="performance" aria-labelledby="perf-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">Performance</span>
          <h2 id="perf-title" className="rt-h2 rt-narrow reveal" data-d="1">
            Authorization sits on the
            <br />
            critical path, so it is measured there.
          </h2>
          <p className="rt-lede reveal" data-d="2">
            Because the evaluation is deterministic rather than model-mediated, its cost is a
            function of the declared envelope and horizon, not of prompt length or sampling. It
            scales with the number of steps in the evaluated trajectory.
          </p>

          <div className="rt-proof reveal" data-d="3">
            {[
              ["0.298 ms", <>Single-step authorization, p50 — <b>96 rules, 800 iterations</b></>],
              ["0.338 ms", <>Single-step authorization, p95</>],
              ["2.33 ms", <>Four-step trajectory, p50</>],
              ["11.5 ms", <>Sixteen-step trajectory, p50</>],
            ].map(([v, l], i) => (
              <div className="rt-proof-row" key={i}>
                <span className="p-value">{v}</span>
                <span className="p-label">{l}</span>
              </div>
            ))}
          </div>

          <div className="rt-claim reveal">
            <span className="c-key">Measurement conditions</span>
            <p>
              Single-threaded, horizon 3, measured on the published build environment. These are{" "}
              <strong>representative figures, not a production-hardware guarantee</strong>. Every
              governed run also records its own evaluation latency, approval wait and downstream
              provider latency separately, so the figure a deployment quotes is one it measured.
            </p>
          </div>
          <div className="rt-links reveal">
            <Link href="/evidence">Measured results</Link>
            <Link href="/live-demo">Run an evaluation</Link>
          </div>
        </div>
      </section>

      {/* ══════════ 11 · DEPLOYMENT ══════════ */}
      <section className="rt-section" id="deployment" aria-labelledby="deploy-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">Deployment</span>
          <h2 id="deploy-title" className="rt-h2 rt-narrow reveal" data-d="1">
            One control contract
            <br />
            across every profile.
          </h2>
          <div className="rt-map reveal" data-d="2">
            {PROFILES.map(([name, desc]) => (
              <div className="rt-map-row" key={name}>
                <span className="m-from">{name}</span>
                <span className="m-arrow" aria-hidden="true">→</span>
                <span className="m-to">{desc}</span>
              </div>
            ))}
          </div>
          <p className="rt-note reveal">
            The deployment profile changes where enforcement runs and who holds the keys. It does
            not change the contract: identity → policy → verdict → approval → execution → evidence.
          </p>
          <div className="rt-links reveal">
            <Link href="/guardian-os">Guardian OS</Link>
            <Link href="/guardian-os/sovereign">Sovereign</Link>
          </div>
        </div>
      </section>

      {/* ══════════ BOUNDARY COVERAGE ══════════ */}
      <section className="rt-section rt-section--band" id="threats" aria-labelledby="cov-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">Boundary coverage</span>
          <h2 id="cov-title" className="rt-h2 rt-narrow reveal" data-d="1">
            What can push a system
            <br />
            outside its envelope.
          </h2>
          <p className="rt-lede reveal" data-d="2">
            Event-level controls evaluate individual calls. Governance evaluates the trajectory those
            calls create, and whether it remains admissible before execution.
          </p>

          <div className="rt-cov reveal" data-d="3">
            {([
              ["Unauthorized financial execution", "A transfer, payment or refund outside approved limits or to an unverified destination.", "The transfer is denied before it executes."],
              ["Credential and secret exfiltration", "Keys, tokens or secrets read and routed toward an external destination.", "The credential-to-external path is blocked before any secret leaves the boundary."],
              ["Regulated data leakage", "Customer or regulated data read and then sent beyond the approved boundary.", "The exfiltration trajectory is stopped before a notifiable breach occurs."],
              ["Privilege escalation", "Permissions acquired beyond the authorized scope, for the calling identity or another.", "Escalation is denied before elevated access is granted."],
              ["Chained multi-step paths", "Each step is admissible in isolation; the sequence is not. Event-level controls never see the chain.", "The sequence is evaluated over the declared horizon, not one call at a time."],
              ["Cross-agent delegation", "A transition proposed through one component and executed through another, later.", "Authority is evaluated against the identity that actually holds it, across the pipeline."],
            ] as [string, string, string][]).map(([t, what, outcome]) => (
              <div className="rt-cov-row" key={t}>
                <h3 className="rt-h3">{t}</h3>
                <p className="c-what">{what}</p>
                <p className="c-outcome"><span>Control outcome</span>{outcome}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ TERMS ══════════ */}
      <section className="rt-section" id="terms" aria-labelledby="terms-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">Terms</span>
          <h2 id="terms-title" className="rt-h2 rt-narrow reveal" data-d="1">
            The vocabulary, stated exactly.
          </h2>
          <div className="rt-defs rt-defs--wide reveal" data-d="2">
            {([
              ["Admissible Operating Envelope", "The set of states, actions, transitions and operating conditions a system is permitted to occupy or execute within a defined environment. A bounded deployment claim, not a universal claim about a model."],
              ["Ω — forbidden region", "The set of states the system must not reach. Ω sits inside the envelope geometry as the explicitly forbidden region."],
              ["Reachability", "Whether a state can be reached from the current state through available transitions, over a declared horizon."],
              ["Trajectory", "The sequence of actions leading from the current state toward an outcome. The trajectory is evaluated, not only the final action."],
              ["Runtime constraint", "A rule on the execution path that terminates or escalates a prohibited transition before the call runs."],
              ["Pre-execution authorization", "Evaluating and deciding a proposed action before it is issued, rather than detecting a violation afterwards."],
              ["Invariant", "A property that must hold throughout execution — for example, that no payment above a threshold is issued without independent approval."],
              ["Fail-closed", "If policy cannot be verified or a decision cannot be reached, the transition does not execute."],
            ] as [string, string][]).map(([term, plain]) => (
              <div key={term}>
                <span className="k">{term}</span>
                <span className="v">{plain}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ RUN ONE ══════════ */}
      <section className="rt-section rt-section--band" id="demo" aria-labelledby="demo-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">Run one</span>
          <h2 id="demo-title" className="rt-h2 rt-narrow reveal" data-d="1">
            Evaluate a trajectory
            <br />
            against an envelope.
          </h2>
          <p className="rt-lede reveal" data-d="2">
            Select a scenario. The proposed trajectory is evaluated before execution: admissible
            paths pass through, boundary-violating and Ω-bound paths are terminated pre-action.
          </p>
          <div className="rt-demo-frame reveal" data-d="3">
            <RuntimeGovernanceDemo />
          </div>
          <div className="rt-links reveal">
            <Link href="/test-trajectory">Test a trajectory</Link>
            <Link href="/test-without-agent">Test without your own agent</Link>
          </div>
        </div>
      </section>

      {/* ══════════ NEXT ══════════ */}
      <section className="rt-section rt-closing" aria-labelledby="next-title">
        <div className="rt-wrap">
          <h2 id="next-title" className="rt-principle rt-principle--center reveal">
            Declare the envelope.
            <br />
            Enforce the boundary.
          </h2>
          <p className="rt-lede rt-closing-lede reveal" data-d="1">
            Start with a live evaluation, then map the real tools, permissions, policies and
            reachable states that define the boundary for your deployment.
          </p>
          <div className="rt-actions rt-actions--center reveal" data-d="2">
            <Link href="/live-demo" className="btn btn--primary btn--live">
              <span className="live-pip" aria-hidden="true" />
              Try Live Demo <span className="arr">→</span>
            </Link>
            <Link href="/book#assessment" className="btn btn--ghost">
              Book Runtime Assessment <span className="arr">→</span>
            </Link>
            <Link href="/developers" className="btn btn--text">
              Developer surface
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
