/* ============================================================================
 * Guardian OS — Industry Intelligence Packs screenshot.
 *
 * Provisions an enterprise, installs a pack, and renders the Industry surface
 * (catalog + the pack's specialised dashboard) with the production stylesheets.
 * Real data, no dev server. SHOT_PACK selects the pack (default healthcare).
 *
 *   node scripts/ops/industry-shot.cjs
 * ============================================================================ */
"use strict";
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ops-ind-shot-"));
delete process.env.ANTHROPIC_API_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { startMockEngine } = require("./mock-engine.cjs");
const { resolveChromium } = require("../lib/resolve-chromium.cjs");

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const scoreClass = (band) => ["healthy", "ready", "strong", "low"].includes(band) ? "ok"
  : ["watch", "emerging", "developing", "elevated"].includes(band) ? "warn"
  : ["at_risk", "not_ready", "weak", "high"].includes(band) ? "bad" : "";
const sevClass = (s) => s === "critical" ? "bad" : s === "warning" ? "warn" : "";

function section(s) {
  if (s.kind === "note") return `<section class="radmin-card ops-ws-note"><h3>${esc(s.title)}</h3><p class="radmin-sub">${esc(s.reason)}</p><span class="radmin-badge">not yet instrumented</span></section>`;
  if (s.kind === "stat") return `<section class="radmin-card"><h3>${esc(s.title)}</h3>${s.items.length === 0 ? `<p class="radmin-sub">—</p>` : `<div class="ops-cmd-stats">${s.items.map((it) => `<div class="ops-cmd-stat"><b>${esc(it.value)}</b><span>${esc(it.label)}</span></div>`).join("")}</div>`}</section>`;
  const rows = s.items.length === 0 ? `<p class="radmin-sub">${esc(s.empty)}</p>` : `<div class="ops-ws-${s.kind === "timeline" ? "timeline" : "list"}">${s.items.map((it) => `<div class="ops-ws-row ${sevClass(it.severity)}"><div class="ops-ws-rbody"><b>${esc(it.title)}</b>${it.meta ? `<span class="radmin-deliv-meta">${esc(it.meta)}</span>` : ""}</div>${it.severity ? `<span class="radmin-badge ${scoreClass(it.severity === "critical" ? "high" : it.severity === "warning" ? "watch" : "low")}">${esc(it.severity)}</span>` : ""}</div>`).join("")}</div>`;
  return `<section class="radmin-card"><div class="ops-brief-head"><h3>${esc(s.title)}</h3><span class="radmin-badge">${s.items.length}</span></div>${rows}</section>`;
}

function card(p, installedIds) {
  const on = installedIds.has(p.id);
  return `<div class="ops-ind-card${on ? " is-on" : ""}">
    <div class="ops-ind-head"><div><b>${esc(p.title)}</b><span class="radmin-deliv-meta">${esc(p.industry)} · v${esc(p.version)}</span></div>${on ? `<span class="radmin-badge ok">installed</span>` : ""}</div>
    <p class="ops-ind-purpose">${esc(p.purpose)}</p>
    <div class="ops-ind-counts"><span>${p.counts.policies} Ω policies</span><span>${p.counts.templates} templates</span><span>${p.counts.mappings} evidence maps</span><span>${p.counts.workflows} workflows</span></div>
    <div class="ops-ind-regs">${p.regulations.slice(0, 4).map((r) => `<span class="ops-ind-reg">${esc(r)}</span>`).join("")}</div>
    <div class="ops-ind-actions">${on ? `<button class="radmin-btn sm primary">Open dashboard</button><button class="radmin-btn sm">Remove</button>` : `<button class="radmin-btn sm">Install pack</button>`}</div>
  </div>`;
}

function page(css, catalog, installedIds, dash) {
  const metrics = (dash.metrics || []).map((m) => `<div class="ops-cmd-stat${m.band ? ` ops-ind-m-${scoreClass(m.band)}` : ""}"><b>${esc(m.value)}</b><span>${esc(m.label)}</span>${m.hint ? `<span class="ops-ws-hint">${esc(m.hint)}</span>` : ""}</div>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
  <style>body{margin:0;background:var(--bg);}.wrap{max-width:960px;margin:0 auto;padding:28px 24px;}</style></head>
  <body class="radmin"><div class="wrap">
    <section class="radmin-card ops-ind-hero">
      <h2>Industry Intelligence Packs</h2>
      <p class="radmin-sub">One Runtime Governance kernel. One Guardian OS. One digital twin. Industry Packs add domain intelligence — policies, dashboards, executive metrics, recommendations, templates and evidence mappings — without forking the platform. Installing a pack activates its deny-only Ω policies through the same governed lifecycle; removing it rolls them back.</p>
    </section>
    <section class="radmin-card">
      <div class="ops-brief-head"><h3>Pack catalog</h3><span class="radmin-badge">${catalog.length} available · ${installedIds.size} installed</span></div>
      <div class="ops-ind-grid">${catalog.map((p) => card(p, installedIds)).join("")}</div>
    </section>
    <section class="radmin-card ops-ind-dashhead">
      <div class="ops-brief-head"><div><h3>${esc(dash.title)} · ${esc(dash.name)}</h3><p class="radmin-sub">${esc(dash.purpose)}</p></div><span class="radmin-badge">v${esc(dash.version)}</span></div>
      <div class="ops-cmd-stats">${metrics}</div>
      <div class="ops-ind-regs">${(dash.regulations || []).map((r) => `<span class="ops-ind-reg">${esc(r)}</span>`).join("")}</div>
    </section>
    ${dash.sections.map(section).join("")}
  </div></body></html>`;
}

async function main() {
  const srv = await startMockEngine({ governancePolicies: true });
  process.env.GOVERNANCE_URL = `http://127.0.0.1:${srv.address().port}`;
  const ops = require("../../lib/ops");
  const rt = require("../../lib/runtime");
  const packId = process.env.SHOT_PACK || "healthcare";

  // A healthcare-shaped enterprise so the pack's lens has real material.
  const spec = {
    name: "Meridian Health System", industry: "Healthcare",
    business_units: ["Acute Care", "Outpatient", "Research"], regions: ["EU", "UK"],
    compliance: ["HIPAA", "GDPR", "EU AI Act"],
    ai_systems: [
      { name: "Clinical Copilot", environment: "Production",
        agents: [{ name: "Clinical Triage Agent", model: "claude-opus-4-8", tools: ["triage_patient", "prescribe_medication", "export_documents"], privileged_tools: ["prescribe_medication"], mcp_servers: ["ehr-mcp"] }],
        apis: ["EHR API"], integrations: ["Epic"] },
      { name: "Care Coordination", environment: "Production",
        agents: [{ name: "Care Planner", model: "claude-sonnet-5", tools: ["update_care_plan", "discharge_patient"], privileged_tools: ["discharge_patient"], mcp_servers: [] }],
        apis: ["Scheduling API"], integrations: [] },
    ],
    trust: { identity_providers: ["Okta"], approvers: ["Chief Medical Officer", "DPO"], operators: ["Platform SRE"],
      trust_boundaries: ["Clinical network"], risk_zones: ["Patient safety", "PHI"], critical_systems: ["EHR"], protected_assets: ["Patient records", "PHI store"] },
  };
  const prov = await ops.provisioning.provision(spec, { actor: "davarn@control-room" });
  const org = prov.org_id;
  await ops.industry.install(org, packId, { actor: "davarn@control-room" });
  await ops.managed.monitor(org, { actor: "guardian_os" });
  await ops.managed.evidencePack(org, { actor: "davarn@control-room" });
  // Grounded refusals so the clinical lens shows real governed activity.
  await rt.engine.evaluate([{ tool: "prescribe_medication", args: {} }], ["healthcare"], 3);
  await ops.proposals.propose({ action_id: "export_documents", params: { org_id: org, destination_external: true }, org_id: org, source: "shot" }).catch(() => {});

  const catalog = ops.industry.catalog();
  const installedIds = new Set((await ops.industry.installed(org)).map((i) => i.pack_id));
  const dash = await ops.industry.dashboard(org, packId);

  const css = ["design-system.css", "runtime-admin.css"].map((f) => fs.readFileSync(path.join(__dirname, "../../styles", f), "utf8")).join("\n");
  const html = page(css, catalog, installedIds, dash);
  const outDir = process.env.SHOT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), "ops-shot-"));
  const htmlPath = path.join(outDir, `industry-${packId}.html`);
  fs.writeFileSync(htmlPath, html);

  const { chromium } = require("playwright-core");
  const browser = await chromium.launch({ executablePath: resolveChromium() });
  const pageObj = await browser.newPage({ viewport: { width: 1000, height: 1500 }, deviceScaleFactor: 2 });
  await pageObj.goto("file://" + htmlPath);
  await pageObj.waitForTimeout(200);
  const shot = path.join(outDir, `industry-${packId}.png`);
  await pageObj.screenshot({ path: shot, fullPage: true });
  await browser.close();
  srv.close();
  console.log(shot);
}

main().catch((e) => { console.error(e); process.exit(1); });
