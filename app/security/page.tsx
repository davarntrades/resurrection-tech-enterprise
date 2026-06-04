import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Security & Trust",
  description:
    "Enterprise trust: what Morrison Runtime Governance evaluates and stores, audit logging and export, deployment architecture and patterns, retention, and security principles (pre-execution, fail-closed, planner-untrusted, trajectory-level).",
  alternates: { canonical: "/security" },
};

export default function Page() {
  return (
    <PageShell>
      <section className="section section--tight tp" aria-label="Security and trust">
        <div className="wrap">
          <span className="eyebrow">Security &amp; trust</span>
          <h1>Security &amp; Trust</h1>
          <p className="tp-lede">
            What a security team needs before anything sits in the execution path: what is
            evaluated, what is and isn&rsquo;t stored, how audit works, where it deploys, and the
            enforcement principles. Items that require commercial or legal sign-off are flagged
            rather than asserted, so this page can be relied on in review.
          </p>

          {/* Deployment architecture */}
          <div className="tp-block">
            <h2>Deployment architecture</h2>
            <p className="tp-sub">
              Governance is a pre-execution checkpoint at the tool-dispatch boundary:
            </p>
            <div className="tp-flowline" aria-label="Agent to governance layer to decision to tool execution">
              <span>Agent / Planner</span><i aria-hidden="true">→</i>
              <span className="is-gov">Governance Layer</span><i aria-hidden="true">→</i>
              <span>ALLOW / BLOCK</span><i aria-hidden="true">→</i>
              <span>Tool execution</span>
            </div>
            <p className="tp-sub" style={{ marginTop: 18 }}>
              The reference service is a stateless container running the pure-Python engine, so it can
              run wherever your workloads do. These are the architecturally supported patterns:
            </p>
            <div className="tp-grid">
              <div className="tp-card"><span className="k">Cloud</span><p>Managed HTTPS service (e.g. the public reference deployment). Fastest to stand up for pilots.</p></div>
              <div className="tp-card"><span className="k">Customer VPC</span><p>Run the container inside your own cloud; trajectories are evaluated within your perimeter.</p></div>
              <div className="tp-card"><span className="k">Self-hosted / on-prem</span><p>Runs as a container or sidecar in your data centre for workloads that cannot leave the building.</p></div>
              <div className="tp-card"><span className="k">Hybrid</span><p>Service in your VPC, called by agents across environments via the same HTTP contract.</p></div>
            </div>
            <div className="tp-todo">
              <b>Sign-off needed:</b> managed-offering SLAs, support tiers, and any air-gapped
              packaging are commercial commitments — confirm scope per engagement. The architecture
              supports the patterns above; availability of a <em>managed</em> form of each is a
              contractual matter.
            </div>
          </div>

          {/* Data handling */}
          <div className="tp-block">
            <h2>Data handling</h2>
            <p className="tp-sub">What the governance layer evaluates, and what it does not.</p>
            <div className="tp-grid">
              <div className="tp-card"><span className="k">What is evaluated</span><p>The proposed tool calls and their arguments — the trajectory — submitted before execution, to evaluate reachability of Ω.</p></div>
              <div className="tp-card"><span className="k">What is not required</span><p>Model weights, training data, prompts, or model internals. Governance is model-agnostic and external to the model.</p></div>
              <div className="tp-card"><span className="k">What is stored (reference service)</span><p>Nothing by default. The engine is a pure function; the reference service holds no datastore and persists no evaluations. It returns the verdict and emits structured operational logs (verdict, layer, timing) — not the evaluated payload. Per-evaluation engine logging is off by default (<code>log_all=false</code>).</p></div>
              <div className="tp-card"><span className="k">What you control</span><p>Audit records are produced by the caller/host that wants them (see Audit logging). In a VPC/self-hosted deployment, evaluated payloads never leave your environment.</p></div>
            </div>
            <div className="tp-todo">
              <b>Sign-off needed:</b> if you adopt a managed/SaaS form, publish the data-processing
              terms (DPA) covering what transits the hosted endpoint and for how long. The
              self-hosted pattern avoids this by keeping evaluation in your perimeter.
            </div>
          </div>

          {/* Audit logging */}
          <div className="tp-block">
            <h2>Audit logging</h2>
            <p className="tp-sub">
              Every evaluation yields a structured, attributable record. These are the actual fields
              the engine and console produce:
            </p>
            <div className="tp-grid">
              <div className="tp-card"><span className="k">Per-decision fields</span><p><code>verdict</code> (ALLOW/BLOCK/ESCALATE), <code>reason</code>, <code>omega_domain</code>, triggered <code>rule</code>, governance <code>layer</code>, <code>reachability_distance</code>, and a deterministic <code>trajectory_hash</code>.</p></div>
              <div className="tp-card"><span className="k">Timestamping</span><p>Each record carries a UTC timestamp; evaluation timing (<code>eval_time_ms</code>) is recorded for performance attribution.</p></div>
              <div className="tp-card"><span className="k">Attribution</span><p>Decisions attribute to the specific rule and enforcement layer that fired — not an opaque score — so each action maps to the control it engaged.</p></div>
              <div className="tp-card"><span className="k">Export</span><p>The console exports the audit trail as JSON or TXT and supports copy-to-clipboard. The same structured record is available programmatically from the API response.</p></div>
            </div>
            <p className="tp-sub" style={{ marginTop: 14 }}>
              Records are deterministic and replayable (the trajectory hash is stable across runs),
              which is what makes them suitable for a regulator-ready audit file. Try it in the{" "}
              <Link href="/live-demo" className="tp-link">live console</Link>.
            </p>
          </div>

          {/* Retention */}
          <div className="tp-block">
            <h2>Retention</h2>
            <div className="tp-grid">
              <div className="tp-card"><span className="k">Evaluation retention</span><p>Default: none. The reference service does not persist trajectories or verdicts; nothing to retain unless you choose to store the returned records.</p></div>
              <div className="tp-card"><span className="k">Audit retention</span><p>You own it. Records are emitted to the caller; you store them in your own log/SIEM under your existing retention policy.</p></div>
              <div className="tp-card"><span className="k">Export behaviour</span><p>On demand — JSON/TXT from the console, or the structured verdict from each API response. No background export.</p></div>
              <div className="tp-card"><span className="k">Deletion</span><p>Because the default posture stores nothing centrally, deletion is governed by your own log store. A managed form would inherit a documented policy.</p></div>
            </div>
            <div className="tp-todo">
              <b>Sign-off needed:</b> if a managed/SaaS form is adopted, publish concrete retention
              windows and a deletion SLA for any records held on the hosted side.
            </div>
          </div>

          {/* Security principles */}
          <div className="tp-block tp-prose">
            <h2>Security principles</h2>
            <p><b>Pre-execution enforcement.</b> The verdict is computed and returned <em>before</em> any tool runs. A trajectory that would reach a forbidden state Ω is intercepted before execution, not flagged after the fact.</p>
            <p><b>Deny-by-default / fail-closed.</b> The engine permits a trajectory only when it can show <span className="om">ℛ(t) ∩ Ω = ∅</span>; otherwise it blocks. A production gate should treat a governance outage as &ldquo;do not execute&rdquo; — the runnable integration examples fail closed on transport error.</p>
            <p><b>The planner remains untrusted.</b> The verdict is a pure function of the proposed trajectory, independent of which model produced it. Swapping or upgrading the planner does not change a verdict, and a compromised or hallucinating planner cannot talk its way past the boundary.</p>
            <p><b>Trajectory-level, not per-call.</b> Governance evaluates the reachable set of the whole proposed plan — including source→sink data flow and multi-agent/joint trajectories — so harm that appears only in the combination of individually-admissible steps is caught.</p>
            <div className="tp-todo">
              <b>Honest note:</b> the public website demo route degrades to an in-process heuristic if
              the live engine is unreachable (so the marketing page never breaks). That is a
              demo-availability choice — a production deployment should fail closed, as the examples do.
            </div>
            <div className="tp-todo">
              <b>Sign-off needed:</b> formal certifications (SOC 2 / ISO 27001), penetration-test
              cadence, and a vulnerability-disclosure contact are not claimed here. Add them only when
              held. None are asserted.
            </div>
          </div>

          {/* Performance (now measured) */}
          <div className="tp-block tp-prose">
            <h2>Performance</h2>
            <p>
              Governance adds a bounded pre-execution check per action (not per token), so cost scales
              with the number and shape of governed actions, not model size. Unlike earlier, these are
              now <b>measured</b>, not estimated: on the benchmark environment a single-step evaluation
              runs at sub-millisecond median latency.
            </p>
            <p>
              See the full table, charts, methodology and downloadable report on{" "}
              <Link href="/enterprise#performance" className="tp-link">Enterprise readiness → Operational performance</Link>.
              Production latency depends on your host CPU, concurrency, and transport — re-run the
              benchmark harness on target hardware for deployment figures.
            </p>
          </div>

          <div className="tp-cta">
            <Link href="/book#assessment" className="btn btn--primary">Book a Runtime Safety Assessment <span className="arr">→</span></Link>
            <Link href="/enterprise" className="btn btn--ghost">Enterprise readiness</Link>
            <Link href="/evidence" className="btn btn--ghost">Evidence &amp; methodology</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
