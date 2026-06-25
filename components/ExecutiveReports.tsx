/**
 * Runtime Governance Executive Reports™ — the evidence/value layer of Runtime
 * Governance. Gold .mgp-page theme of its host page. Not priced separately.
 */
const CONTENTS: { h: string; p: string }[] = [
  { h: "What was protected", p: "The systems, data, and tools your agents could reach." },
  { h: "What was prevented", p: "Unsafe actions blocked before they executed." },
  { h: "What changed", p: "New tools, risks, or trajectories since the last period." },
  { h: "Governance posture", p: "Current coverage against forbidden states (Ω)." },
  { h: "ALLOW / BLOCK / ESCALATE metrics", p: "Verdict volumes and trends over time." },
  { h: "Audit trail status", p: "Tamper-evident record of every decision." },
  { h: "Risk reduction actions", p: "Steps taken, and those still outstanding." },
  { h: "Executive recommendations", p: "Prioritised next actions for leadership." },
];

const USES = [
  "Customer renewals",
  "Quarterly business reviews",
  "Compliance evidence",
  "Board reporting",
  "Partner-led customer success",
  "Ongoing governance reviews",
];

const STRUCTURE = [
  ["Executive Summary", "The period at a glance for leadership."],
  ["Runtime Activity", "Volume and pattern of governed actions."],
  ["Actions Prevented", "Unsafe trajectories blocked before execution."],
  ["Escalations", "What was routed for human review, and outcomes."],
  ["Governance Posture", "Coverage against forbidden states (Ω)."],
  ["Risk Reduction", "Measured change in reachable exposure."],
  ["Recommendations", "Prioritised next actions."],
  ["Evidence Appendix", "Audit trail and supporting detail."],
];

export function ExecutiveReports() {
  return (
    <section className="section section--tight" id="executive-reports">
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">Core value layer</span>
          <h2>Runtime Governance Executive Reports™</h2>
          <p className="mgp-reports-lead">The API protects the system. The report proves the value.</p>
          <p>
            Runtime Governance Executive Reports™ turn runtime activity into board-ready evidence. Each
            report shows what was protected, what was prevented, what changed, and what actions are
            recommended next — so Runtime Governance does not only block unsafe actions, it
            demonstrates its value.
          </p>
        </div>

        <div className="mgp-who reveal" data-d="1">
          {CONTENTS.map((c) => (
            <div className="mgp-who-card" key={c.h}>
              <h3 className="mgp-who-h">{c.h}</h3>
              <p className="mgp-who-p">{c.p}</p>
            </div>
          ))}
        </div>

        {/* Monthly evidence layer */}
        <div className="section-head reveal" data-d="1" style={{ marginTop: 44 }}>
          <span className="eyebrow">Monthly evidence layer</span>
          <h3 style={{ fontSize: "1.2rem", margin: 0 }}>A recurring record customers can act on.</h3>
          <p>Delivered monthly, the reports give partners and customers evidence to support:</p>
        </div>
        <div className="mgp-tags reveal" data-d="1">
          {USES.map((u) => <span className="mgp-tag" key={u}>{u}</span>)}
        </div>

        {/* Example report structure */}
        <div className="section-head reveal" data-d="1" style={{ marginTop: 44 }}>
          <span className="eyebrow">Example report structure</span>
          <h3 style={{ fontSize: "1.2rem", margin: 0 }}>What a report contains.</h3>
        </div>
        <ol className="mgp-journey reveal" data-d="1">
          {STRUCTURE.map(([h, p]) => (
            <li key={h}>
              <div>
                <span className="mgp-journey-h">{h}</span>
                <span className="mgp-journey-p">{p}</span>
              </div>
            </li>
          ))}
        </ol>

        <div className="mgp-note reveal" data-d="1" role="note">
          <span className="mgp-note-k">Included, not priced separately</span>
          <p>
            Runtime Governance Executive Reports™ are part of the platform, not an add-on. They are
            included as part of <b>Managed Governance Partner™</b>, <b>Limited Pilot™</b>,{" "}
            <b>Enterprise Integration™</b>, and <b>Annual Runtime Governance Licence™</b> engagements.
          </p>
        </div>
      </div>
    </section>
  );
}
