/**
 * Premium editorial executive-report HTML (customer-facing print deliverable).
 *
 * Built from a persisted report + its summarize() output — self-contained,
 * A4 print-styled, light editorial house style (the customer-deliverable
 * exception to the dark Control Room theme). Rendered to executive-report.pdf
 * by the Railway renderer. No external assets — everything is inline so the
 * renderer can print it with all network access disabled.
 */
const { FONT_FACE_CSS } = require("./reportFonts.cjs");

const esc = (s: any) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "—");

export function buildExecutiveReportHtml(report: any, summary: any, orgName?: string | null): string {
  const ex = summary?.executive || {};
  const win = report?.window || {};
  const period = String(report?.period || "monthly");
  const title = `${period[0].toUpperCase()}${period.slice(1)} Runtime Governance — Executive Report`;
  const findings: string[] = Array.isArray(ex.key_findings) ? ex.key_findings : [];
  const actions: string[] = Array.isArray(ex.recommended_actions) ? ex.recommended_actions : [];
  const t = report?.totals || {};
  const engineBlocked = report?.engine_verdicts?.BLOCK || t.BLOCK || 0;
  const wouldBlock = report?.would_block || 0;
  const impactValue = engineBlocked
    ? `${engineBlocked} prevented`
    : wouldBlock
      ? `${wouldBlock} exposed in shadow`
      : "No high-risk event";
  const li = (arr: string[]) => arr.map((x) => `<li>${esc(x)}</li>`).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>
  ${FONT_FACE_CSS}
  @page { size: A4; margin: 20mm 18mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "TeX Gyre Pagella", Georgia, serif; color: #14181d; font-size: 11.5pt; line-height: 1.55; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .eyebrow { font-family: "TeX Gyre Heros", Arial, sans-serif; font-size: 8.5pt; letter-spacing: .22em; text-transform: uppercase; color: #8a6d1f; }
  h1 { font-size: 22pt; line-height: 1.15; margin: 6px 0 4px; font-weight: 600; letter-spacing: -.01em; }
  .sub { font-family: "TeX Gyre Heros", Arial, sans-serif; font-size: 9pt; color: #6b7480; letter-spacing: .04em; }
  .rule { border: 0; border-top: 1px solid #14181d; margin: 14px 0 18px; }
  .hair { border: 0; border-top: 1px solid #d8dde3; margin: 18px 0; }
  h2 { font-family: "TeX Gyre Heros", Arial, sans-serif; font-size: 10pt; letter-spacing: .12em; text-transform: uppercase; color: #14181d; margin: 20px 0 8px; }
  .summary { margin: 22px 0 24px; break-inside: avoid; }
  .summary-kicker { font-family: "TeX Gyre Heros", Arial, sans-serif; font-size: 8.5pt; letter-spacing: .2em; text-transform: uppercase; color: #7a7f86; }
  .summary-title { font-family: "TeX Gyre Heros", Arial, sans-serif; font-size: 16pt; line-height: 1.2; letter-spacing: -.01em; text-transform: none; margin: 5px 0 13px; }
  .summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .summary-card { min-height: 102px; padding: 13px 15px; background: #f5f5f4; border: 1px solid #dededc; border-radius: 2px; break-inside: avoid; }
  .summary-card.lead { border-left: 3px solid #14181d; }
  .summary-card.risk-High { border-left: 3px solid #b3261e; }
  .summary-card.risk-Medium { border-left: 3px solid #9a6b00; }
  .summary-card.risk-Low { border-left: 3px solid #1e7a46; }
  .card-label { display: block; font-family: "TeX Gyre Heros", Arial, sans-serif; font-size: 8.5pt; letter-spacing: .12em; text-transform: uppercase; color: #7a7f86; }
  .card-value { display: block; font-family: "TeX Gyre Heros", Arial, sans-serif; font-size: 18pt; line-height: 1.15; font-weight: 600; margin-top: 7px; }
  .card-copy { display: block; color: #6b6f74; font-size: 9.5pt; line-height: 1.3; margin-top: 5px; }
  p { margin: 0 0 10px; }
  ul { margin: 0 0 10px; padding-left: 18px; }
  li { margin: 3px 0; }
  .risk { display: inline-block; font-family: "TeX Gyre Heros", Arial, sans-serif; font-size: 8.5pt; letter-spacing: .08em; text-transform: uppercase; padding: 2px 9px; border-radius: 2px; border: 1px solid currentColor; }
  .risk.High { color: #b3261e; } .risk.Medium { color: #9a6b00; } .risk.Low { color: #1e7a46; }
  table { width: 100%; border-collapse: collapse; font-family: "TeX Gyre Heros", Arial, sans-serif; font-size: 9.5pt; }
  td, th { text-align: left; padding: 7px 0; border-bottom: 1px solid #e6e9ee; }
  th { color: #6b7480; font-weight: 500; letter-spacing: .04em; width: 46%; }
  .foot { font-family: "TeX Gyre Heros", Arial, sans-serif; font-size: 8pt; color: #8a929c; letter-spacing: .08em; margin-top: 26px; }
  @media screen {
    body { max-width: 900px; margin: 32px auto; padding: 40px 48px; }
  }
  @media screen and (max-width: 600px) {
    body { width: 100%; margin: 0; padding: 24px 18px 40px; overflow-wrap: anywhere; }
    h1 { font-size: 20pt; }
    table { table-layout: fixed; }
    th { width: 58%; }
    td, th { overflow-wrap: anywhere; }
    .summary-card { min-height: 112px; padding: 12px; }
    .card-value { font-size: 15pt; }
  }
</style></head>
<body>
  <div class="eyebrow">Resurrection Tech&trade; &middot; Confidential</div>
  <h1>${esc(title)}</h1>
  <div class="sub">${esc(orgName || "Customer organisation")} &middot; ${esc(fmtDate(win.since))} &rarr; ${esc(fmtDate(win.until))} &middot; generated ${esc(fmtDate(report?.generated_at))}</div>
  <hr class="rule" />

  <p style="font-size:12.5pt">${esc(report?.headline || "")}</p>

  <section class="summary">
    <div class="summary-kicker">Executive decision summary</div>
    <h2 class="summary-title">What requires leadership attention?</h2>
    <div class="summary-grid">
      <div class="summary-card lead"><span class="card-label">Current posture</span><span class="card-value">${report?.enforced ? "Enforcing" : "Observing"}</span><span class="card-copy">${esc(ex.posture || "Governance posture not recorded.")}</span></div>
      <div class="summary-card risk-${esc(ex.risk || "Low")}"><span class="card-label">Risk level</span><span class="card-value">${esc(ex.risk || "—")}</span><span class="card-copy">Based on governed outcomes in this reporting window.</span></div>
      <div class="summary-card"><span class="card-label">Business impact</span><span class="card-value">${esc(impactValue)}</span><span class="card-copy">${esc(ex.business_impact || "No impact statement available.")}</span></div>
      <div class="summary-card"><span class="card-label">Recommended actions</span><span class="card-value">${actions.length}</span><span class="card-copy">Leadership actions identified from the available runtime evidence.</span></div>
    </div>
  </section>

  <h2>Key findings</h2>
  <ul>${li(findings.length ? findings : ["No unsafe trajectory was permitted; governance operated cleanly."])}</ul>

  <h2>Recommended actions</h2>
  <ul>${li(actions.length ? actions : ["Maintain the current governance-evidence cadence."])}</ul>

  <hr class="hair" />
  <h2>Evidence at a glance</h2>
  <table>
    <tr><th>Trajectories governed</th><td>${esc(report?.trajectories ?? 0)}</td></tr>
    <tr><th>ALLOW / ESCALATE / BLOCK</th><td>${esc(t.ALLOW || 0)} / ${esc(t.ESCALATE || 0)} / ${esc(t.BLOCK || 0)}</td></tr>
    <tr><th>Would-have-blocked (shadow)</th><td>${esc(report?.would_block ?? 0)}</td></tr>
    <tr><th>Escalated to human review</th><td>${esc(report?.human_review ?? 0)}</td></tr>
  </table>

  <div class="foot">Patent GB2600765.8 &middot; Morrison Runtime Governance&trade; &middot; Runtime evidence is recorded from the live engine — never fabricated.</div>
</body></html>`;
}
