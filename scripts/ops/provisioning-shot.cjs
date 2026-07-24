/* ============================================================================
 * Guardian OS — Enterprise Provisioning screenshot.
 *
 * Renders the Provision surface (installer + populated Executive Command) with
 * REAL data: it runs one provision() against a temp store + mock engine, then
 * lays the result out with the production stylesheets and captures it. No dev
 * server, no auth — a faithful visual of what an operator sees after install.
 *
 *   node scripts/ops/provisioning-shot.cjs
 * ============================================================================ */
"use strict";
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ops-provision-shot-"));
delete process.env.ANTHROPIC_API_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { startMockEngine } = require("./mock-engine.cjs");
const { resolveChromium } = require("../lib/resolve-chromium.cjs");

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const PHASE_META = [
  ["identity", "1 · Enterprise Identity", "Org, business units, environments, regions, compliance"],
  ["estate", "2 · AI Estate", "Systems, models, agents, tools, MCP, APIs — relationships auto-mapped"],
  ["trust", "3 · Trust Architecture", "Boundaries, IdPs, approvers, operators, risk zones, protected assets"],
  ["governance", "4 · Runtime Governance", "Ω policies via the dynamic engine — validated, fail-closed, deny-only"],
  ["departments", "5 · Department Deployment", "Guardian OS departments enabled as governed agents"],
  ["twin", "6 · Digital Twin", "Six enterprise graphs generated immediately"],
];

function phaseRows(result) {
  return PHASE_META.map(([key, title, desc]) => {
    const p = result[key] || {};
    const detail = key === "governance" ? `${p.active ?? 0} policies active · fail-closed`
      : key === "departments" ? `${p.enabled ?? 0} departments enabled`
      : key === "twin" ? `${p.facets ? Object.keys(p.facets).length : 6} graphs`
      : `${p.count ?? 0} entities`;
    return `<div class="ops-prov-phase is-done"><span class="ops-prov-phase-mark">✓</span>` +
      `<div><b>${esc(title)}</b><span class="radmin-deliv-meta">${esc(desc)}</span></div>` +
      `<span class="ops-prov-phase-detail">${esc(detail)}</span></div>`;
  }).join("");
}

function statCells(cells) {
  return cells.map(([n, l]) => `<div class="ops-cmd-stat"><b>${esc(n)}</b><span>${esc(l)}</span></div>`).join("");
}

function page(css, spec, result, command) {
  const c = command;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
  <style>body{margin:0;background:var(--bg);}.wrap{max-width:960px;margin:0 auto;padding:28px 24px;}</style></head>
  <body class="radmin"><div class="wrap">
    <section class="radmin-card ops-prov-hero">
      <div class="ops-brief-head"><div>
        <h2>Guardian OS · Enterprise Provisioning</h2>
        <p class="radmin-sub">Not an onboarding form — the operating-system installation for an autonomous enterprise. One install stands up a complete governed runtime: identity, the AI estate with relationships mapped, trust architecture, fail-closed Ω policies through the dynamic policy engine, Guardian OS departments, the six digital-twin graphs, and a populated Executive Command. There is never an empty dashboard.</p>
      </div><button class="radmin-btn primary">Install Guardian OS</button></div>
      <div class="ops-prov-spec"><span class="radmin-badge">${esc(spec.name)}</span>
        <span class="radmin-deliv-meta">${esc(spec.industry)} · ${esc((spec.regions || []).join("/"))} · ${(spec.ai_systems || []).length} AI systems · ${esc((spec.compliance || []).join(", "))}</span></div>
    </section>

    <section class="radmin-card">
      <h3>Installation — ${esc(result.name || spec.name)} <span class="radmin-badge ok">complete</span></h3>
      <div class="ops-prov-phases">${phaseRows(result)}</div>
      <button class="radmin-linkbtn">Open Executive Command →</button>
    </section>

    <section class="radmin-card ops-prov-cmd">
      <div class="ops-brief-head"><h3>Executive Command — ${esc(c.name)}</h3>
        ${c.health ? `<span class="radmin-badge ok">Health: ${esc(c.health.score)} · ${esc(c.health.band)}</span>` : ""}</div>
      <div class="ops-cmd-stats">${statCells([
        [c.ai_systems.systems, "AI systems"],
        [c.ai_systems.agents, "agents"],
        [`${c.governance.active_policies}`, `Ω policies (${c.governance.status})`],
        [c.open_approvals.length, "open approvals"],
        [c.risks.open_incidents, "open risks"],
        [c.departments.length, "departments"],
      ])}</div>
      <p class="radmin-deliv-meta">Risk zones: ${esc((c.risks.risk_zones || []).join(" · "))}</p>
      <div class="ops-prov-actions"><b>Recommended actions</b>
        ${(c.recommended_actions || []).map((a) => `<button class="radmin-linkbtn">${esc(a.title)} →</button>`).join("")}</div>
      <p class="radmin-deliv-meta">Governance: fail-closed · Twin: ${c.twin ? Object.keys(c.twin).length : 0} graphs · seeded with realistic example activity until live enterprise events replace it.</p>
    </section>
  </div></body></html>`;
}

async function main() {
  const srv = await startMockEngine({ governancePolicies: true });
  process.env.GOVERNANCE_URL = `http://127.0.0.1:${srv.address().port}`;
  const ops = require("../../lib/ops");

  const r = await ops.provisioning.provision({}, { actor: "davarn@control-room" });
  const command = await ops.provisioning.command(r.org_id);
  const spec = ops.provisioning.exampleSpec();

  const css = ["design-system.css", "runtime-admin.css"].map((f) => fs.readFileSync(path.join(__dirname, "../../styles", f), "utf8")).join("\n");
  const html = page(css, spec, r.result, command);
  const outDir = process.env.SHOT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), "ops-shot-"));
  const htmlPath = path.join(outDir, "provisioning.html");
  fs.writeFileSync(htmlPath, html);

  const { chromium } = require("playwright-core");
  const browser = await chromium.launch({ executablePath: resolveChromium() });
  const pageObj = await browser.newPage({ viewport: { width: 1000, height: 1400 }, deviceScaleFactor: 2 });
  await pageObj.goto("file://" + htmlPath);
  await pageObj.waitForTimeout(200);
  const shot = path.join(outDir, "provisioning.png");
  await pageObj.screenshot({ path: shot, fullPage: true });
  await browser.close();
  srv.close();
  console.log(shot);
}

main().catch((e) => { console.error(e); process.exit(1); });
