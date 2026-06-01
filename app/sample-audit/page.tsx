import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Sample Audit Report",
  description:
    "An illustrative, redacted sample of the Runtime Governance Audit deliverable — and exactly what you receive for a Runtime Safety Assessment.",
  alternates: { canonical: "/sample-audit" },
};

export default function Page() {
  return (
    <PageShell>
      <section className="section section--tight tp" aria-label="Sample audit report">
        <div className="wrap">
          <span className="eyebrow">Deliverable</span>
          <h1>Sample Audit Report</h1>
          <p className="tp-lede">
            Exactly what a customer receives from a Runtime Governance Audit, shown as an
            illustrative redacted example. This is a representative template — a fictional client,
            not a real engagement.
          </p>
          <div className="tp-note" style={{ marginTop: 16 }}>
            <span className="k">Note</span>
            <ul><li>Illustrative sample. Fictional client (&ldquo;Northbank&rdquo;). Figures are illustrative, not a guarantee. A real report reflects your systems and your defined Ω.</li></ul>
          </div>

          {/* The document */}
          <div className="tp-doc">
            <div className="tp-doc-head">
              <span className="t">Runtime Governance Audit — Northbank Treasury Agent</span>
              <span className="tp-pill warn">SAMPLE · REDACTED</span>
            </div>
            <div className="tp-doc-body">
              <div className="tp-doc-section">
                <h4>Executive summary</h4>
                <p><b>Risk level: Critical.</b> The autonomous treasury-operations agent can reach three catastrophic states from normal operation. The most severe permits funds movement to an unverified destination with no human approval.</p>
                <p><b>Findings:</b> 3 reachable Ω states (1 Critical, 2 High). Existing controls reduce likelihood but leave the forbidden states reachable.</p>
                <p><b>Business impact:</b> single-event reachable exposure modelled at <span className="tp-redact">£0.0B</span>+; regulatory exposure under FCA / AML. Illustrative, not a guarantee.</p>
              </div>

              <div className="tp-doc-section">
                <h4>Reachability findings</h4>
                <p><b>Ω-01 · unauthorized_transfer (Critical).</b> Trajectory: <code>read_file(payment_queue) → transfer(destination.verified=false)</code>. Affected assets: Banking APIs, Payment Systems. Threats: T01, T04.</p>
                <p><b>Ω-02 · limit_breach (High).</b> Trajectory: <code>transfer(amount &gt; <span className="tp-redact">£00,000</span>, approver=none)</code>. Affected assets: Payment Systems. Threat: T04.</p>
                <p><b>Ω-03 · data_exfiltration (High).</b> Trajectory: <code>read_database(customers) → http_request(external)</code>. Affected assets: Customer Records, CRM Data. Threat: T02.</p>
              </div>

              <div className="tp-doc-section">
                <h4>Technical analysis</h4>
                <p><b>Why blocked / where risk emerged.</b> Each finding is a trajectory whose reachable set intersects Ω. Ω-01 emerges at the transfer step because the destination is unverified; the existing RBAC and post-hoc monitoring controls do not make the state unreachable — they only observe it after settlement.</p>
                <p>Evaluation occurs at the execution boundary, pre-action. Legitimate operations (e.g. an approved vendor payment) route through cleanly; only trajectories that reach Ω are intercepted.</p>
              </div>

              <div className="tp-doc-section">
                <h4>Recommended remediation</h4>
                <p>1. Define Ω for treasury operations (unverified-destination transfer, unapproved limit breach, customer-data egress).</p>
                <p>2. Place Runtime Governance at the agent&rsquo;s tool-call boundary; enforce pre-execution interception for Ω-bound trajectories.</p>
                <p>3. Require verified-destination + approval invariants on all transfer actions.</p>
                <p>4. Route customer-data reads through internal sinks only; deny external egress.</p>
              </div>

              <div className="tp-doc-section">
                <h4>Governance outcome</h4>
                <p><b>BLOCK</b> — Ω-01, Ω-02, Ω-03 trajectories denied before execution.</p>
                <p><b>PERMIT</b> — approved vendor payments and internal workflows execute unchanged.</p>
                <p><b>ESCALATE</b> — borderline transfers above policy threshold routed for human approval with a full audit record.</p>
              </div>
            </div>
          </div>

          {/* What You Receive (PRIORITY 6) */}
          <div className="tp-block">
            <h2>What you receive — Runtime Safety Assessment</h2>
            <p className="tp-sub">No ambiguity about what the engagement buys.</p>
            <div className="tp-facts">
              <div><dt>Timeline</dt><dd>48 hours from scoped start</dd></div>
              <div><dt>Investment</dt><dd>£40K–£75K (one-time)</dd></div>
              <div><dt>Deliverable 1</dt><dd>Reachable Exposure Report — ranked Ω states with severity</dd></div>
              <div><dt>Deliverable 2</dt><dd>Trajectory findings — the action chains that reach each Ω</dd></div>
              <div><dt>Deliverable 3</dt><dd>Affected assets &amp; threat mapping (T01–T06)</dd></div>
              <div><dt>Deliverable 4</dt><dd>Recommended remediation &amp; governance outcome (permit / block / escalate)</dd></div>
              <div><dt>Output format</dt><dd>Written report + structured findings + read-out call</dd></div>
              <div><dt>Customer responsibilities</dt><dd>Access to the agent&rsquo;s action/tool definitions and a scoping session to define Ω</dd></div>
            </div>
            <p className="tp-prose" style={{ marginTop: 14 }}>
              If material Ω exposure is identified, the typical next step is a <b>Structural Safety
              Pilot</b> (£250K–£750K+, 4–8 weeks) that validates interception on your own traffic,
              followed by Integration and an Advisory Retainer (£35K–£100K/mo) that keeps Ω current
              as models, tools, and regulations change.
            </p>
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
