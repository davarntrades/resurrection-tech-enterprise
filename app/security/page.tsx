import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Security, Data Handling & Deployment",
  description:
    "How Morrison Runtime Governance deploys, what it observes and retains, its security model, integration surface, and performance considerations — written for enterprise security review.",
  alternates: { canonical: "/security" },
};

export default function Page() {
  return (
    <PageShell>
      <section className="section section--tight tp" aria-label="Security, data handling and deployment">
        <div className="wrap">
          <span className="eyebrow">Security &amp; deployment</span>
          <h1>Security, Data Handling &amp; Deployment</h1>
          <p className="tp-lede">
            The questions an enterprise security team asks before anything sits in the execution
            path. Where ground-truth commitments require sign-off they are flagged rather than
            asserted — so this page can be relied on in a security review.
          </p>

          {/* Deployment models */}
          <div className="tp-block">
            <h2>Deployment models</h2>
            <p className="tp-sub">
              Runtime Governance runs at the agent&rsquo;s execution boundary as middleware. Because
              it sits at the boundary rather than inside a model, it can be deployed where your
              workloads already run.
            </p>
            <div className="tp-grid">
              <div className="tp-card"><span className="k">Customer VPC</span><p>Deployed inside your own cloud environment; trajectories are evaluated within your security perimeter.</p></div>
              <div className="tp-card"><span className="k">On-premises</span><p>Runs within your data centre for workloads that cannot leave the building.</p></div>
              <div className="tp-card"><span className="k">SaaS</span><p>Hosted evaluation endpoint for lower-sensitivity workloads and rapid pilots.</p></div>
              <div className="tp-card"><span className="k">Air-gapped</span><p>For isolated/classified environments. <span className="tp-pill warn">Confirm availability</span></p></div>
            </div>
            <div className="tp-todo">
              <b>Owner action:</b> confirm which of these deployment models are actually offered
              today versus on the roadmap, and remove or re-label any that are not yet available. Do
              not imply air-gapped/on-prem support if it has not been delivered.
            </div>
          </div>

          {/* Data handling */}
          <div className="tp-block">
            <h2>Data handling</h2>
            <p className="tp-sub">What the governance layer sees, and what it does not.</p>
            <div className="tp-grid">
              <div className="tp-card"><span className="k">Observes</span><p>Proposed tool calls and their arguments (the trajectory) at the execution boundary, in order to evaluate reachability of Ω.</p></div>
              <div className="tp-card"><span className="k">Does not require</span><p>Model weights, training data, or model internals. Governance is model-agnostic and external to the model.</p></div>
              <div className="tp-card"><span className="k">Retains</span><p>Governance decisions and audit records (verdict, reason, Ω, timestamp) for auditability. <span className="tp-pill warn">Confirm retention policy</span></p></div>
              <div className="tp-card"><span className="k">Does not retain</span><p>In a VPC/on-prem deployment, evaluated payloads need not leave your environment. <span className="tp-pill warn">Confirm</span></p></div>
            </div>
            <div className="tp-todo">
              <b>Owner action:</b> publish the exact data-retention policy (what is stored, where,
              for how long, and under what legal basis) and a DPA. A security team will not approve
              an in-path component without this.
            </div>
          </div>

          {/* Security model */}
          <div className="tp-block tp-prose">
            <h2>Security model</h2>
            <p><b>Execution boundary.</b> Governance is enforced at the point where an agent would act — the tool-call boundary — not inside the model and not after the fact.</p>
            <p><b>Pre-execution enforcement.</b> A trajectory that would reach Ω is intercepted before any action runs. The default posture is fail-closed: if a trajectory cannot be shown to keep <span className="om">Ω</span> unreachable, it is not permitted to execute.</p>
            <p><b>Logging.</b> Every governed decision produces a timestamped, attributable record — the verdict, the reason, the forbidden state, and the risk — suitable for an audit file.</p>
            <p><b>Auditability.</b> Records are designed to be regulator-ready: one artifact per decision, mapping actions to the controls and forbidden states they engage.</p>
            <div className="tp-todo">
              <b>Owner action:</b> add current security posture and certifications honestly —
              e.g. SOC 2 / ISO 27001 status (achieved, in progress, or not yet started), penetration
              test cadence, and a vulnerability-disclosure contact. Do not claim certifications that
              are not held.
            </div>
          </div>

          {/* Integration surface */}
          <div className="tp-block">
            <h2>Integration surface</h2>
            <div className="tp-grid">
              <div className="tp-card"><span className="k">Middleware placement</span><p>A thin wrapper around the agent&rsquo;s tool-call layer: evaluate, then execute only if permitted.</p></div>
              <div className="tp-card"><span className="k">API</span><p>A request/response evaluation interface — submit a proposed trajectory, receive a structured verdict before execution.</p></div>
              <div className="tp-card"><span className="k">Model-agnostic</span><p>Works across GPT, Claude, Gemini, Llama, and Mistral; survives model swaps because it is external to the model.</p></div>
            </div>
            <div className="tp-todo">
              <b>Owner action:</b> link the integration/API specification and any SDKs once published.
            </div>
          </div>

          {/* Performance */}
          <div className="tp-block tp-prose">
            <h2>Performance</h2>
            <p>
              Governance adds a bounded pre-execution evaluation at the tool-call boundary. The
              architectural consideration is that the check runs per action rather than per token,
              so cost scales with the number of governed actions, not model size.
            </p>
            <p>
              <b>Representative latency figures are not yet published.</b> Rather than quote a number
              we cannot stand behind, we will publish latency from pilot telemetry. Honest answer
              today: it is a synchronous pre-execution check; budget for a small added latency on
              governed actions and confirm against your own workload during a pilot.
            </p>
            <div className="tp-todo">
              <b>Owner action:</b> replace with measured p50/p95 latency from a pilot once available.
            </div>
          </div>

          <div className="tp-cta">
            <Link href="/book#assessment" className="btn btn--primary">Book a Runtime Safety Assessment <span className="arr">→</span></Link>
            <Link href="/evidence" className="btn btn--ghost">Evidence &amp; methodology</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
