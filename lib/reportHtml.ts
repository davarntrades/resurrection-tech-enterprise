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
  }
</style></head>
<body>
  <div class="eyebrow">Resurrection Tech&trade; &middot; Confidential</div>
  <h1>${esc(title)}</h1>
  <div class="sub">${esc(orgName || "Customer organisation")} &middot; ${esc(fmtDate(win.since))} &rarr; ${esc(fmtDate(win.until))} &middot; generated ${esc(fmtDate(report?.generated_at))}</div>
  <hr class="rule" />

  <p style="font-size:12.5pt">${esc(report?.headline || "")}</p>

  <h2>Overall posture</h2>
  <p>${esc(ex.posture || "—")}</p>
  <p><b>Risk level:</b> <span class="risk ${esc(ex.risk || "Low")}">${esc(ex.risk || "—")}</span></p>

  <h2>Key findings</h2>
  <ul>${li(findings.length ? findings : ["No unsafe trajectory was permitted; governance operated cleanly."])}</ul>

  <h2>Business impact</h2>
  <p>${esc(ex.business_impact || "—")}</p>

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
