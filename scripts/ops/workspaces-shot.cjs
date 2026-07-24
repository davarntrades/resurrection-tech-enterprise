/* ============================================================================
 * Guardian OS — Executive Workspaces screenshot.
 *
 * Provisions an enterprise, runs a monitoring pass, and renders the Workspaces
 * surface (perspective switcher + one executive lens) with the production
 * stylesheets. Real data, no dev server. Renders the CISO lens by default
 * (SHOT_ROLE overrides).
 *
 *   node scripts/ops/workspaces-shot.cjs
 * ============================================================================ */
"use strict";
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ops-ws-shot-"));
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
  if (s.kind === "score") return `<section class="radmin-card"><div class="ops-brief-head"><h3>${esc(s.title)}</h3>${s.overall ? `<span class="radmin-badge ${scoreClass(s.overall.band)}">${s.overall.score} · ${esc(s.overall.band)}</span>` : ""}</div><div class="ops-gov-subs">${s.subs.map((sub) => `<div class="ops-gov-sub ${scoreClass(sub.band)}"><span class="ops-gov-sub-n">${sub.score}</span><span class="ops-gov-sub-l">${esc(sub.label)}</span></div>`).join("")}</div></section>`;
  if (s.kind === "stat") return `<section class="radmin-card"><h3>${esc(s.title)}</h3>${s.items.length === 0 ? `<p class="radmin-sub">—</p>` : `<div class="ops-cmd-stats">${s.items.map((it) => `<div class="ops-cmd-stat"><b>${esc(it.value)}</b><span>${esc(it.label)}</span>${it.hint ? `<span class="ops-ws-hint">${esc(it.hint)}</span>` : ""}</div>`).join("")}</div>`}</section>`;
  const rows = s.items.length === 0 ? `<p class="radmin-sub">${esc(s.empty)}</p>` : `<div class="ops-ws-${s.kind === "timeline" ? "timeline" : "list"}">${s.items.map((it) => `<div class="ops-ws-row ${sevClass(it.severity)}"><div class="ops-ws-rbody"><b>${esc(it.title)}</b>${it.meta ? `<span class="radmin-deliv-meta">${esc(it.meta)}</span>` : ""}</div>${it.severity ? `<span class="radmin-badge ${scoreClass(it.severity === "critical" ? "high" : it.severity === "warning" ? "watch" : "low")}">${esc(it.severity)}</span>` : ""}</div>`).join("")}</div>`;
  return `<section class="radmin-card"><div class="ops-brief-head"><h3>${esc(s.title)}</h3><span class="radmin-badge">${s.items.length}</span></div>${rows}</section>`;
}

function page(css, roles, ws, activeRole) {
  const nav = roles.map((r) => `<button class="ops-ws-tab${r.id === activeRole ? " is-active" : ""}"><span class="ops-ws-tab-t">${esc(r.title)}</span><span class="ops-ws-tab-l">${esc(r.label)}</span></button>`).join("");
  const g = ws.header.governance;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
  <style>body{margin:0;background:var(--bg);}.wrap{max-width:960px;margin:0 auto;padding:28px 24px;}</style></head>
  <body class="radmin"><div class="wrap">
    <section class="radmin-card ops-ws-hero">
      <h2>Executive Workspaces</h2>
      <p class="radmin-sub">One enterprise. One digital twin. One runtime governance engine. Many executive perspectives — each a lens over the same governed source of truth, never a separate dashboard.</p>
      <nav class="ops-ws-nav">${nav}</nav>
    </section>
    <section class="radmin-card ops-ws-head">
      <div class="ops-brief-head"><div><h3>${esc(ws.title)} · ${esc(ws.name)}</h3><p class="radmin-sub">${esc(ws.purpose)}</p></div>
        <div class="ops-ws-headstats"><span class="radmin-badge ${scoreClass(g.band)}">Governance ${g.score}</span><span class="radmin-badge">${ws.header.queue} in queue</span><span class="radmin-badge">${ws.header.drift_open} drift</span></div></div>
    </section>
    ${ws.sections.map(section).join("")}
  </div></body></html>`;
}

async function main() {
  const srv = await startMockEngine({ governancePolicies: true });
  process.env.GOVERNANCE_URL = `http://127.0.0.1:${srv.address().port}`;
  const ops = require("../../lib/ops");
  const rt = require("../../lib/runtime");

  const prov = await ops.provisioning.provision({}, { actor: "davarn@control-room" });
  const org = prov.org_id;
  await ops.entities.create({ org_id: org, layer: "estate", kind: "tool", name: "exfiltrate_data", attrs: { privileged: true } });
  await ops.managed.monitor(org, { actor: "guardian_os" });
  await ops.managed.evidencePack(org, { actor: "davarn@control-room" });
  // A few grounded blocked actions so the CISO lens is populated.
  for (const amt of [25000, 40000, 90000]) {
    await rt.engine.evaluate([{ tool: "wire_transfer", args: { amount: amt } }], ["enterprise"], 3);
    await ops.proposals.propose({ action_id: "wire_transfer", params: { amount: amt }, org_id: org, source: "shot" }).catch(() => {});
  }

  const role = process.env.SHOT_ROLE || "ciso";
  const roles = ops.workspaces.roles();
  const ws = await ops.workspaces.workspace(role, org);

  const css = ["design-system.css", "runtime-admin.css"].map((f) => fs.readFileSync(path.join(__dirname, "../../styles", f), "utf8")).join("\n");
  const html = page(css, roles, ws, role);
  const outDir = process.env.SHOT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), "ops-shot-"));
  const htmlPath = path.join(outDir, `workspace-${role}.html`);
  fs.writeFileSync(htmlPath, html);

  const { chromium } = require("playwright-core");
  const browser = await chromium.launch({ executablePath: resolveChromium() });
  const pageObj = await browser.newPage({ viewport: { width: 1000, height: 1500 }, deviceScaleFactor: 2 });
  await pageObj.goto("file://" + htmlPath);
  await pageObj.waitForTimeout(200);
  const shot = path.join(outDir, `workspace-${role}.png`);
  await pageObj.screenshot({ path: shot, fullPage: true });
  await browser.close();
  srv.close();
  console.log(shot);
}

main().catch((e) => { console.error(e); process.exit(1); });
