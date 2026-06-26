import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Sample Executive Report",
  description:
    "An illustrative Runtime Governance Executive Report™ — the board-ready monthly evidence a customer receives: what was protected, what was prevented, governance posture, ALLOW/BLOCK/ESCALATE metrics, risk reduction, recommendations, and a tamper-evident audit trail. Fictional organisation and figures.",
  alternates: { canonical: "/sample-executive-report" },
};

const PREVENTED: [string, string, string][] = [
  ["Unsafe external action", "572", "Calls to unapproved third-party APIs"],
  ["Data exfiltration", "121", "Bulk export of customer records to an external endpoint"],
  ["Privilege escalation", "64", "Agent attempting to elevate its own role"],
  ["Destructive operation", "47", "Mass-delete against a production datastore"],
  ["Unauthorised fund transfer", "38", "Transfer above threshold with no approver"],
];

export default function Page() {
  return (
    <PageShell>
      <main className="mgp-page rep">
        <div className="wrap">
          <div className="rep-doc reveal">

            {/* Header band */}
            <div className="rep-band">
              <span className="rep-band-k">Runtime Governance Executive Report™</span>
              <h1 className="rep-band-title">Monthly Governance Evidence</h1>
              <p className="rep-band-sub">Northwind Logistics — autonomous operations &amp; procurement agents</p>
              <div className="rep-meta">
                <div><span className="rep-meta-k">Reporting period</span><span className="rep-meta-v">1–31 May 2026</span></div>
                <div><span className="rep-meta-k">Reference</span><span className="rep-meta-v">RGER-2026-05-NWL</span></div>
                <div><span className="rep-meta-k">Prepared via</span><span className="rep-meta-v">Managed Governance Partner™</span></div>
                <div><span className="rep-meta-k">Classification</span><span className="rep-meta-v">Board · Confidential</span></div>
              </div>
            </div>

            {/* 1 — Executive Summary */}
            <section className="rep-sec">
              <span className="rep-eyebrow">1 · Executive summary</span>
              <h2 className="rep-h2">The period at a glance.</h2>
              <p className="rep-p">
                Runtime Governance evaluated <b>48,920</b> agent actions before execution this period
                across 12 governed agents. <b>842</b> unsafe actions were prevented and <b>466</b> were
                escalated for human review. Governance coverage held at 100% of defined forbidden states
                (Ω), including two newly onboarded tools. No uncovered reachable path to a forbidden
                state was observed at period end.
              </p>
              <div className="rep-kpis" style={{ marginTop: 14 }}>
                <div className="rep-kpi"><span className="rep-kpi-v">48,920</span><span className="rep-kpi-k">Actions governed (pre-execution)</span></div>
                <div className="rep-kpi"><span className="rep-kpi-v">842</span><span className="rep-kpi-k">Unsafe actions prevented</span></div>
                <div className="rep-kpi"><span className="rep-kpi-v">466</span><span className="rep-kpi-k">Escalated for review</span></div>
                <div className="rep-kpi"><span className="rep-kpi-v">100%</span><span className="rep-kpi-k">Ω coverage (18 states)</span></div>
              </div>
            </section>

            {/* 2 — Runtime Activity */}
            <section className="rep-sec">
              <span className="rep-eyebrow">2 · Runtime activity</span>
              <h2 className="rep-h2">Every action resolved to a verdict.</h2>
              <div className="rep-bar" aria-hidden="true">
                <i className="b-allow" style={{ width: "97.3%" }} />
                <i className="b-block" style={{ width: "1.7%" }} />
                <i className="b-esc" style={{ width: "1.0%" }} />
              </div>
              <div className="rep-legend">
                <span><i className="b-allow" />ALLOW · 47,612 (97.3%)</span>
                <span><i className="b-block" />BLOCK · 842 (1.7%)</span>
                <span><i className="b-esc" />ESCALATE · 466 (1.0%)</span>
              </div>
              <p className="rep-p" style={{ marginTop: 14 }}>
                Volume rose 14% versus April as the procurement agent expanded, while blocked actions
                fell 9% — consistent with an improving governance posture as upstream policies tightened.
                12 agents and 34 tools were under governance.
              </p>
            </section>

            {/* 3 — Actions Prevented */}
            <section className="rep-sec">
              <span className="rep-eyebrow">3 · Actions prevented</span>
              <h2 className="rep-h2">What was blocked before it executed.</h2>
              <div className="tbl-wrap" data-rowreveal>
                <table className="tbl">
                  <thead>
                    <tr><th>Category</th><th>Count</th><th>Representative example</th></tr>
                  </thead>
                  <tbody>
                    {PREVENTED.map(([c, n, ex]) => (
                      <tr key={c}>
                        <td data-l="Category" className="t-main">{c}</td>
                        <td data-l="Count" className="t-price">{n}</td>
                        <td data-l="Example">{ex}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 4 — Escalations */}
            <section className="rep-sec">
              <span className="rep-eyebrow">4 · Escalations</span>
              <h2 className="rep-h2">Routed to a human, with outcomes.</h2>
              <p className="rep-p">
                Of <b>466</b> escalations, <b>449</b> were approved after review and <b>17</b> were
                rejected. Median time-to-decision was <b>6 minutes</b>. Escalations concentrated on
                first-time vendor payments and cross-system data movements — the categories where
                human judgement adds the most value.
              </p>
            </section>

            {/* 5 — Governance Posture */}
            <section className="rep-sec">
              <span className="rep-eyebrow">5 · Governance posture</span>
              <h2 className="rep-h2">Coverage against forbidden states (Ω).</h2>
              <p className="rep-p">
                18 forbidden states are defined for this environment, spanning financial loss, data
                exfiltration, privilege escalation, and destructive operations. Two new tools (a
                payments connector and a vendor-onboarding API) were onboarded and re-mapped to Ω during
                the period. End-of-period coverage: <b>100% of defined states</b>, with <b>0</b>
                uncovered reachable paths detected.
              </p>
            </section>

            {/* 6 — Risk Reduction */}
            <section className="rep-sec">
              <span className="rep-eyebrow">6 · Risk reduction</span>
              <h2 className="rep-h2">Exposure removed before it could occur.</h2>
              <p className="rep-p">
                The 38 prevented unauthorised-transfer attempts alone represented a modelled
                single-event exposure of <span className="rep-redact">£0,000,000</span>+ had any reached
                execution. Reachable exposure across all governed agents fell relative to the April
                baseline as new tools were brought under governance at onboarding rather than after
                deployment. Figures are modelled and illustrative.
              </p>
            </section>

            {/* 7 — Recommendations */}
            <section className="rep-sec">
              <span className="rep-eyebrow">7 · Recommendations</span>
              <h2 className="rep-h2">Prioritised next actions.</h2>
              <ul className="rep-rec">
                <li><span className="rep-pri rep-pri--high">High</span><span className="rep-rec-t">Tighten the approval policy on payment tools so first-time vendor transfers always require a named approver.</span></li>
                <li><span className="rep-pri rep-pri--med">Medium</span><span className="rep-rec-t">Review the two newly integrated third-party APIs and confirm their Ω mappings with the security team.</span></li>
                <li><span className="rep-pri rep-pri--med">Medium</span><span className="rep-rec-t">Schedule the quarterly Ω revalidation to keep forbidden states aligned with new workflows and regulation.</span></li>
                <li><span className="rep-pri rep-pri--low">Low</span><span className="rep-rec-t">Extend governance to the planned logistics-routing agent before it reaches production.</span></li>
              </ul>
            </section>

            {/* 8 — Evidence Appendix */}
            <section className="rep-sec">
              <span className="rep-eyebrow">8 · Evidence appendix</span>
              <h2 className="rep-h2">Tamper-evident, reproducible record.</h2>
              <div className="rep-ev">
                <div className="rep-ev-row"><span className="rep-ev-k">Decisions recorded</span><span className="rep-ev-v">48,920</span></div>
                <div className="rep-ev-row"><span className="rep-ev-k">Audit trail</span><span className="rep-ev-v rep-ev-ok">Hash-chained · tamper-check passed ✓</span></div>
                <div className="rep-ev-row"><span className="rep-ev-k">Replay determinism</span><span className="rep-ev-v rep-ev-ok">100% on sampled re-run ✓</span></div>
                <div className="rep-ev-row"><span className="rep-ev-k">Attestation</span><span className="rep-ev-v">ATT-2026-05-NWL · engine commit pinned</span></div>
                <div className="rep-ev-row"><span className="rep-ev-k">Evidence retention</span><span className="rep-ev-v">12 months</span></div>
              </div>
            </section>

            <p className="rep-disc">
              Illustrative sample. &ldquo;Northwind Logistics&rdquo; is fictional and all figures are for
              illustration only. A live report reflects your systems, your defined Ω, your agents, and
              your data. Available as a hosted view and as a PDF for board distribution.
            </p>
          </div>

          <div className="hero-actions reveal" style={{ marginTop: 36, justifyContent: "center" }}>
            <Link href="/managed-governance-partner#executive-reports" className="btn btn--primary">How Executive Reports work <span className="arr">→</span></Link>
            <Link href="/contact" className="btn btn--ghost">Discuss Partnership <span className="arr">→</span></Link>
          </div>
        </div>
      </main>
    </PageShell>
  );
}
