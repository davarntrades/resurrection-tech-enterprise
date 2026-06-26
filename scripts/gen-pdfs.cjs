/* Generate brand-matched PDFs (dark + gold, matching the website) via headless
 * Chromium, written to /public/partner-resources/. Run: node scripts/gen-pdfs.cjs
 * Static output is committed and served by the site — no Chromium at runtime. */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = path.join(__dirname, "..", "public", "partner-resources");
const TMP = "/tmp/rt-pdf";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const CSS = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: #08090b; color: #aab2bd;
    font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    font-size: 12px; line-height: 1.55;
  }
  .mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
  .wrap { padding: 40px 46px; }
  .brand { display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:14px; margin-bottom:22px; }
  .brand-name { color:#f3f5f7; font-size:14px; letter-spacing:0.04em; }
  .brand-r { color:#e0a93f; }
  .brand-tag { font-family:ui-monospace,Menlo,monospace; font-size:10px; letter-spacing:0.14em; text-transform:uppercase; color:#6b7480; }
  .eyebrow { font-family:ui-monospace,Menlo,monospace; font-size:10px; letter-spacing:0.16em; text-transform:uppercase; color:#e0a93f; }
  h1 { color:#f3f5f7; font-size:26px; letter-spacing:-0.02em; line-height:1.12; margin:8px 0 6px; }
  h2 { color:#f3f5f7; font-size:15px; letter-spacing:-0.01em; margin:0 0 10px; }
  h3 { color:#f3f5f7; font-size:13px; margin:0 0 4px; }
  p { margin:0 0 10px; }
  b, strong { color:#f3f5f7; }
  .band { background:linear-gradient(180deg, rgba(224,169,63,0.14), rgba(224,169,63,0.03)); border:1px solid #6b4f1c; border-radius:14px; padding:22px 24px; margin-bottom:20px; }
  .band h1 { margin-top:6px; }
  .meta { display:flex; flex-wrap:wrap; gap:18px 28px; margin-top:16px; }
  .meta div { min-width:120px; }
  .meta-k { display:block; font-family:ui-monospace,Menlo,monospace; font-size:9px; letter-spacing:0.12em; text-transform:uppercase; color:#6b7480; margin-bottom:2px; }
  .meta-v { color:#f3f5f7; font-size:12px; }
  .sec { border-top:1px solid rgba(255,255,255,0.08); padding:18px 0; break-inside:avoid; }
  .sec:first-of-type { border-top:0; }
  .kpis { display:flex; gap:10px; flex-wrap:wrap; margin-top:10px; }
  .kpi { flex:1 1 120px; background:#0b0d10; border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:13px 14px; }
  .kpi-v { display:block; color:#f3f5f7; font-size:20px; font-weight:600; letter-spacing:-0.02em; }
  .kpi-k { color:#6b7480; font-size:10px; }
  .bar { display:flex; height:13px; border-radius:999px; overflow:hidden; border:1px solid rgba(255,255,255,0.1); margin:6px 0 0; }
  .bar i { display:block; height:100%; }
  .b-allow{background:#3fb27f} .b-block{background:#e5484d} .b-esc{background:#e0a93f}
  .legend { display:flex; gap:18px; flex-wrap:wrap; margin-top:10px; font-family:ui-monospace,Menlo,monospace; font-size:11px; }
  .legend span{display:inline-flex;align-items:center} .legend i{width:9px;height:9px;border-radius:2px;margin-right:6px}
  table { width:100%; border-collapse:collapse; margin-top:8px; font-size:11.5px; }
  th { text-align:left; font-size:9px; letter-spacing:0.08em; text-transform:uppercase; color:#6b7480; padding:8px 10px; border-bottom:1px solid rgba(255,255,255,0.1); }
  td { padding:9px 10px; border-bottom:1px solid rgba(255,255,255,0.06); color:#cdd6e0; vertical-align:top; }
  td.main { color:#f3f5f7; } td.num { font-family:ui-monospace,Menlo,monospace; color:#e0a93f; text-align:right; }
  .rec { display:grid; gap:8px; margin:6px 0 0; }
  .rec-item { display:grid; grid-template-columns:auto 1fr; gap:10px; background:#0b0d10; border:1px solid rgba(255,255,255,0.06); border-radius:8px; padding:11px 13px; align-items:start; }
  .pri { font-family:ui-monospace,Menlo,monospace; font-size:9px; letter-spacing:0.06em; text-transform:uppercase; padding:3px 7px; border-radius:5px; white-space:nowrap; }
  .pri-h{color:#e5484d;border:1px solid rgba(229,72,77,0.5)} .pri-m{color:#e0a93f;border:1px solid rgba(224,169,63,0.5)} .pri-l{color:#3fb27f;border:1px solid rgba(63,178,127,0.5)}
  .ev-row{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:11.5px}
  .ev-row:last-child{border-bottom:0}
  .ev-k{font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#6b7480} .ev-v{color:#f3f5f7;text-align:right} .ok{color:#3fb27f}
  .redact{background:rgba(255,255,255,0.14);color:transparent;border-radius:3px;padding:0 6px}
  .disc{margin-top:18px;padding-top:14px;border-top:1px dashed rgba(255,255,255,0.1);color:#6b7480;font-size:10.5px}
  .foot{margin-top:22px;border-top:1px solid rgba(255,255,255,0.08);padding-top:12px;display:flex;justify-content:space-between;font-family:ui-monospace,Menlo,monospace;font-size:9px;letter-spacing:0.1em;text-transform:uppercase;color:#474e58}
  /* questionnaire */
  .qsec { break-inside:avoid; margin-top:18px; }
  .qsec-h { display:flex; align-items:baseline; gap:10px; border-bottom:1px solid rgba(224,169,63,0.3); padding-bottom:7px; margin-bottom:10px; }
  .qsec-n { font-family:ui-monospace,Menlo,monospace; color:#e0a93f; font-size:12px; }
  .qsec-t { color:#f3f5f7; font-size:14px; }
  ol.q { margin:0; padding-left:22px; display:grid; gap:6px; }
  ol.q li { color:#cdd6e0; font-size:11.5px; line-height:1.5; }
  .cond { display:block; color:#e0a93f; font-style:italic; font-size:11px; margin-top:2px; }
  .note { background:linear-gradient(180deg, rgba(224,169,63,0.07), transparent); border:1px solid #6b4f1c; border-radius:12px; padding:16px 18px; margin-top:18px; }
  .note h3 { color:#e0a93f; font-size:11px; letter-spacing:0.1em; text-transform:uppercase; margin:0 0 8px; }
  .note ul { margin:0; padding-left:18px; } .note li { color:#cdd6e0; font-size:11px; margin-bottom:4px; }
`;

const brand = `<div class="brand"><span class="brand-name"><span class="brand-r">&#8475;(t)</span>&nbsp;&nbsp;Resurrection Tech&trade;</span><span class="brand-tag">Runtime Governance</span></div>`;
const foot = (label) => `<div class="foot"><span>Resurrection Tech&trade;</span><span>${esc(label)}</span><span>Patent GB2600765.8</span></div>`;

function page(title, inner) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body><div class="wrap">${inner}</div></body></html>`;
}

/* ---------- Executive Report ---------- */
const prevented = [
  ["Unsafe external action", "572", "Calls to unapproved third-party APIs"],
  ["Data exfiltration", "121", "Bulk export of customer records to an external endpoint"],
  ["Privilege escalation", "64", "Agent attempting to elevate its own role"],
  ["Destructive operation", "47", "Mass-delete against a production datastore"],
  ["Unauthorised fund transfer", "38", "Transfer above threshold with no approver"],
];
const reportHtml = page("Runtime Governance Executive Report", `
  ${brand}
  <div class="band">
    <span class="eyebrow">Runtime Governance Executive Report&trade;</span>
    <h1>Monthly Governance Evidence</h1>
    <p style="color:#aab2bd;margin:0">Northwind Logistics — autonomous operations &amp; procurement agents</p>
    <div class="meta">
      <div><span class="meta-k">Reporting period</span><span class="meta-v">1–31 May 2026</span></div>
      <div><span class="meta-k">Reference</span><span class="meta-v">RGER-2026-05-NWL</span></div>
      <div><span class="meta-k">Prepared via</span><span class="meta-v">Managed Governance Partner&trade;</span></div>
      <div><span class="meta-k">Classification</span><span class="meta-v">Board · Confidential</span></div>
    </div>
  </div>
  <div class="sec"><span class="eyebrow">1 · Executive summary</span><h2>The period at a glance.</h2>
    <p>Runtime Governance evaluated <b>48,920</b> agent actions before execution this period across 12 governed agents. <b>842</b> unsafe actions were prevented and <b>466</b> were escalated for human review. Governance coverage held at 100% of defined forbidden states (&#937;), including two newly onboarded tools. No uncovered reachable path to a forbidden state was observed at period end.</p>
    <div class="kpis">
      <div class="kpi"><span class="kpi-v">48,920</span><span class="kpi-k">Actions governed (pre-execution)</span></div>
      <div class="kpi"><span class="kpi-v">842</span><span class="kpi-k">Unsafe actions prevented</span></div>
      <div class="kpi"><span class="kpi-v">466</span><span class="kpi-k">Escalated for review</span></div>
      <div class="kpi"><span class="kpi-v">100%</span><span class="kpi-k">&#937; coverage (18 states)</span></div>
    </div>
  </div>
  <div class="sec"><span class="eyebrow">2 · Runtime activity</span><h2>Every action resolved to a verdict.</h2>
    <div class="bar"><i class="b-allow" style="width:97.3%"></i><i class="b-block" style="width:1.7%"></i><i class="b-esc" style="width:1.0%"></i></div>
    <div class="legend"><span><i class="b-allow"></i>ALLOW · 47,612 (97.3%)</span><span><i class="b-block"></i>BLOCK · 842 (1.7%)</span><span><i class="b-esc"></i>ESCALATE · 466 (1.0%)</span></div>
    <p style="margin-top:12px">Volume rose 14% versus April as the procurement agent expanded, while blocked actions fell 9% — consistent with an improving governance posture. 12 agents and 34 tools were under governance.</p>
  </div>
  <div class="sec"><span class="eyebrow">3 · Actions prevented</span><h2>What was blocked before it executed.</h2>
    <table><thead><tr><th>Category</th><th>Count</th><th>Representative example</th></tr></thead><tbody>
    ${prevented.map(([c, n, ex]) => `<tr><td class="main">${esc(c)}</td><td class="num">${esc(n)}</td><td>${esc(ex)}</td></tr>`).join("")}
    </tbody></table>
  </div>
  <div class="sec"><span class="eyebrow">4 · Escalations</span><h2>Routed to a human, with outcomes.</h2>
    <p>Of <b>466</b> escalations, <b>449</b> were approved after review and <b>17</b> were rejected. Median time-to-decision was <b>6 minutes</b>. Escalations concentrated on first-time vendor payments and cross-system data movements.</p>
  </div>
  <div class="sec"><span class="eyebrow">5 · Governance posture</span><h2>Coverage against forbidden states (&#937;).</h2>
    <p>18 forbidden states are defined for this environment, spanning financial loss, data exfiltration, privilege escalation, and destructive operations. Two new tools were onboarded and re-mapped to &#937; during the period. End-of-period coverage: <b>100% of defined states</b>, with <b>0</b> uncovered reachable paths.</p>
  </div>
  <div class="sec"><span class="eyebrow">6 · Risk reduction</span><h2>Exposure removed before it could occur.</h2>
    <p>The 38 prevented unauthorised-transfer attempts alone represented a modelled single-event exposure of <span class="redact">£0,000,000</span>+ had any reached execution. Reachable exposure across all governed agents fell relative to the April baseline. Figures are modelled and illustrative.</p>
  </div>
  <div class="sec"><span class="eyebrow">7 · Recommendations</span><h2>Prioritised next actions.</h2>
    <div class="rec">
      <div class="rec-item"><span class="pri pri-h">High</span><span>Tighten the approval policy on payment tools so first-time vendor transfers always require a named approver.</span></div>
      <div class="rec-item"><span class="pri pri-m">Medium</span><span>Review the two newly integrated third-party APIs and confirm their &#937; mappings with the security team.</span></div>
      <div class="rec-item"><span class="pri pri-m">Medium</span><span>Schedule the quarterly &#937; revalidation to keep forbidden states aligned with new workflows and regulation.</span></div>
      <div class="rec-item"><span class="pri pri-l">Low</span><span>Extend governance to the planned logistics-routing agent before it reaches production.</span></div>
    </div>
  </div>
  <div class="sec"><span class="eyebrow">8 · Evidence appendix</span><h2>Tamper-evident, reproducible record.</h2>
    <div class="ev-row"><span class="ev-k">Decisions recorded</span><span class="ev-v">48,920</span></div>
    <div class="ev-row"><span class="ev-k">Audit trail</span><span class="ev-v ok">Hash-chained · tamper-check passed ✓</span></div>
    <div class="ev-row"><span class="ev-k">Replay determinism</span><span class="ev-v ok">100% on sampled re-run ✓</span></div>
    <div class="ev-row"><span class="ev-k">Attestation</span><span class="ev-v">ATT-2026-05-NWL · engine commit pinned</span></div>
    <div class="ev-row"><span class="ev-k">Evidence retention</span><span class="ev-v">12 months</span></div>
  </div>
  <div class="disc">Illustrative sample. &ldquo;Northwind Logistics&rdquo; is fictional and all figures are for illustration only. A live report reflects your systems, your defined &#937;, your agents, and your data.</div>
  ${foot("Runtime Governance Executive Report")}
`);

/* ---------- Discovery Questionnaire ---------- */
const SECTIONS = [
  ["Business", [
    "What does your organisation do, and who are your primary customers?",
    "Which partnership type are you exploring (alliance, referral, managed, OEM, embedded, enterprise licensing, technology, channel)?",
    "What problem are you trying to solve for your customers with AI governance?",
    "What is your company size, geography, and primary market?",
    "Are you currently delivering AI or agentic-AI services today?",
    ["If yes: at what scale, and in which sectors?"],
    "What is your motivation for partnering now (customer demand, competitive pressure, regulation)?",
    "Who is the executive sponsor for this partnership on your side?",
  ]],
  ["Technical", [
    "What agent frameworks or platforms do your customers use?",
    "Do your customers run agents in production today?",
    ["If yes: what tools/systems can those agents reach?"],
    "How are agent actions currently controlled, if at all?",
    "Do you have engineering capacity to build/maintain an integration?",
    ["If yes: which languages/stacks does your team work in?"],
    "Do you prefer hosted API, customer-cloud, private, embedded, or proxy/sidecar deployment?",
    "What latency constraints exist in your customers' workflows?",
    "Do any customers require air-gapped or sovereign deployment?",
    "What authentication standards do you/your customers require (keys, OAuth, mTLS)?",
    "Do your customers stream agent outputs or use request/response?",
  ]],
  ["Commercial", [
    "What commercial model fits your business (margin, commission, licence)?",
    "What deal sizes do you typically transact?",
    "Do you prefer to invoice customers directly?",
    "What are your expectations on onboarding investment?",
    "Are you comfortable with a minimum annual commitment?",
    ["If embedded/OEM: do you require white-label, exclusivity, or territory rights?"],
    "What margin or commission would make this commercially viable for you?",
    "How do you typically structure renewals with your customers?",
  ]],
  ["Go-to-market", [
    "How do you currently take new services to market?",
    "What is your sales motion (direct, channel, marketplace, co-sell)?",
    "Do you have a marketing function to support launch?",
    "What co-marketing or enablement would you need from us?",
    "What is a realistic timeline to first customer deployment?",
    "What would a successful first 6–12 months look like?",
  ]],
  ["Target customers", [
    "Which customer segments would you target first?",
    "What industries do your customers operate in?",
    "What is the typical size of your customers (SMB, mid-market, enterprise)?",
    "How many customers could realistically adopt Runtime Governance (reach)?",
    ["If reach is high: which accounts would you prioritise?"],
    "Are any target customers in regulated sectors (finance, healthcare, defence, public)?",
    "Do you have warm accounts ready for a pilot?",
  ]],
  ["Integration", [
    "Where would governance sit in your customers' architecture?",
    "Would you integrate it yourself, or have us deploy?",
    "Which framework adapters do you need first?",
    "Do you need an SDK, an API, or a proxy?",
    "What is your expectation on integration effort and timeline?",
    "Who would own integration maintenance over time?",
    "What environments must be supported (cloud, on-prem, hybrid)?",
  ]],
  ["Compliance", [
    "Which compliance frameworks do your customers care about (EU AI Act, SOC 2, ISO 27001, NIST, HIPAA, GDPR, FCA)?",
    "Do your customers need audit-ready governance evidence?",
    "Are there data-residency requirements?",
    "Do you need governance reports mapped to specific frameworks?",
    "Who owns compliance posture in your customer relationships?",
    "Are there procurement or security-review processes we should prepare for?",
  ]],
  ["Sales", [
    "Who are the buyers and influencers in your customer accounts?",
    "What objections do you expect from customers?",
    "What sales collateral do you need (deck, one-pager, ROI, demo)?",
    "Do you need reference customers or case studies?",
    "How long are your typical sales cycles?",
    "Would you co-sell with our team on early deals?",
  ]],
  ["Support", [
    "What support do your customers expect (hours, SLAs, channels)?",
    "Are you able to provide first-line support?",
    ["If yes: what escalation path do you need into us?"],
    "How do you handle incidents today?",
    "What training would your team need to support governed AI?",
    "Who owns the customer relationship during an incident?",
  ]],
  ["Revenue", [
    "What revenue do you expect this partnership to generate in year one?",
    "How does this fit your existing revenue lines (new vs attach)?",
    "What is your pricing flexibility with customers?",
    "Do you bundle services, or sell governance standalone?",
    "What is your target gross margin?",
    "How do you forecast expansion within existing accounts?",
  ]],
  ["Partnership", [
    "What does a successful partnership look like to you?",
    "What concerns do you have about partnering (lock-in, IP, support, roadmap)?",
    "Do you require deal registration and named-account protection?",
    "What level of joint planning and QBR cadence do you want?",
    "Who from your side would be the day-to-day partnership owner?",
    "Are you evaluating any competing governance approaches?",
    ["If yes: what would make us the preferred choice?"],
    "What would cause this partnership to fail, and how do we prevent it?",
  ]],
  ["Expansion", [
    "How would you grow from a first pilot to multiple customers?",
    "Could you move customers from hosted API to private/embedded over time?",
    "Would you consider embedding governance into your own product later?",
    ["If yes: at what point would OEM/embedded licensing make sense?"],
    "What new services could you build on top of Runtime Governance?",
    "How would executive reports support renewals and upsell for you?",
    "What geographies would you expand into?",
    "What is your 24-month vision for this partnership?",
  ]],
];

const qsections = SECTIONS.map(([title, items], i) => {
  // group consecutive questions into a single <ol>, placing conditionals after their li
  let html = "", openOl = false;
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    if (Array.isArray(it)) { html += `<span class="cond">↳ ${esc(it[0])}</span>`; }
    else { if (!openOl) { html += `<ol class="q" start="${countBefore(SECTIONS, i) + 1 + countNonCondBefore(items, k)}">`; openOl = true; } html += `<li>${esc(it)}</li>`;
      const next = items[k+1];
      if (Array.isArray(next)) { html += `</ol>`; openOl = false; }
    }
  }
  if (openOl) html += `</ol>`;
  return `<div class="qsec"><div class="qsec-h"><span class="qsec-n mono">${String(i+1).padStart(2,"0")}</span><span class="qsec-t">${esc(title)}</span></div>${html}</div>`;
}).join("");

function countNonCondBefore(items, k){let c=0;for(let i=0;i<k;i++)if(!Array.isArray(items[i]))c++;return c;}
function countBefore(secs, idx){let c=0;for(let i=0;i<idx;i++){for(const it of secs[i][1])if(!Array.isArray(it))c++;}return c;}

const questHtml = page("Partner Discovery Questionnaire", `
  ${brand}
  <div class="band">
    <span class="eyebrow">Partner programme</span>
    <h1>Partner Discovery Questionnaire</h1>
    <p style="color:#aab2bd;margin:0">A reusable questionnaire for every partner discovery call — qualify the partner, scope the right model, and pre-empt follow-up meetings.</p>
  </div>
  <p style="margin:0 0 4px">Conditional prompts are marked <span class="cond" style="display:inline">↳ if …</span>. Use the facilitator routing at the end to map answers to a partnership model.</p>
  ${qsections}
  <div class="note">
    <h3>Conditional routing — facilitator notes</h3>
    <ul>
      <li>Introductions only, no delivery → Strategic Alliance / Referral Partner.</li>
      <li>Owns customers + can deliver/support → Managed Governance Partner&trade;.</li>
      <li>Wants governance inside their product → Embedded Licensing&trade; / OEM.</li>
      <li>Resells/transacts, deployment via us → Channel Partner / Reseller.</li>
      <li>Builds a certified integration → Technology Partner.</li>
      <li>High reach + regulated → prioritise private/sovereign deployment + compliance mapping.</li>
    </ul>
  </div>
  ${foot("Partner Discovery Questionnaire")}
`);

function render(name, html) {
  const htmlPath = path.join(TMP, name + ".html");
  const pdfPath = path.join(OUT, name + ".pdf");
  fs.writeFileSync(htmlPath, html);
  execFileSync(CHROME, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer",
    "--print-to-pdf=" + pdfPath, "file://" + htmlPath,
  ], { stdio: "inherit" });
  const kb = (fs.statSync(pdfPath).size / 1024).toFixed(0);
  console.log("wrote", pdfPath, kb + "KB");
}

render("sample-executive-report", reportHtml);
render("partner-discovery-questionnaire", questHtml);
console.log("done");
