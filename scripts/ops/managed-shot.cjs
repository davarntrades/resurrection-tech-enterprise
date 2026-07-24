/* ============================================================================
 * Guardian OS — Managed Governance screenshot.
 *
 * Provisions an enterprise, introduces real drift, runs one monitoring pass, and
 * renders the Governance surface (health score + operator queue + drift +
 * evidence pack) with the production stylesheets. Real data, no dev server.
 *
 *   node scripts/ops/managed-shot.cjs
 * ============================================================================ */
"use strict";
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ops-managed-shot-"));
delete process.env.ANTHROPIC_API_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { startMockEngine } = require("./mock-engine.cjs");
const { resolveChromium } = require("../lib/resolve-chromium.cjs");

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const scoreClass = (band) => ["healthy", "ready", "strong", "low"].includes(band) ? "ok"
  : ["watch", "emerging", "developing", "elevated"].includes(band) ? "warn"
  : ["at_risk", "not_ready", "weak", "high"].includes(band) ? "bad" : "";
const sevClass = (s) => s === "critical" ? "bad" : s === "warning" ? "warn" : "ok";
const QICON = { approval: "✋", drift: "◈", incident: "⚠", recommendation: "✦" };
const SUBS = [["governance_maturity", "Maturity"], ["policy_coverage", "Policy coverage"], ["runtime_health", "Runtime health"], ["approval_responsiveness", "Approval responsiveness"], ["evidence_completeness", "Evidence completeness"], ["drift_score", "Drift"]];

function page(css, ov, health, queue, drift, packs, name) {
  const subs = SUBS.map(([k, l]) => { const s = health.scores[k]; return `<div class="ops-gov-sub ${scoreClass(s.band)}"><span class="ops-gov-sub-n">${s.score}</span><span class="ops-gov-sub-l">${esc(l)}</span></div>`; }).join("");
  const qitems = queue.items.map((i) => `<div class="ops-gov-qitem ${sevClass(i.severity)}"><span class="ops-gov-qicon">${QICON[i.type] || "·"}</span><div class="ops-gov-qbody"><b>${esc(i.title)}</b>${i.detail ? `<span class="radmin-deliv-meta">${esc(i.detail)}</span>` : ""}</div><div class="ops-gov-qactions">${i.type === "drift" ? `<button class="radmin-btn sm">Acknowledge</button>` : ""}<button class="radmin-linkbtn">Open →</button></div></div>`).join("");
  const drows = drift.open.map((d) => `<div class="ops-gov-drow ${sevClass(d.severity)}"><span class="radmin-badge">${esc(d.kind.replace(/_/g, " "))}</span><div class="ops-gov-dbody"><b>${esc(d.subject)}</b><span class="radmin-deliv-meta">${esc(d.detail)}</span></div><span class="radmin-badge warn">${esc(d.status)}</span></div>`).join("");
  const packrows = packs.map((p) => `<div class="ops-gov-pack"><div><b>${esc(p.period)}</b> <span class="radmin-deliv-meta">signed ${esc(String(p.hash).slice(0, 16))}… · just now</span></div><a class="radmin-linkbtn">View →</a></div>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
  <style>body{margin:0;background:var(--bg);}.wrap{max-width:960px;margin:0 auto;padding:28px 24px;}</style></head>
  <body class="radmin"><div class="wrap">
    <section class="radmin-card ops-gov-hero">
      <div class="ops-brief-head"><div>
        <h2>Managed Governance</h2>
        <p class="radmin-sub">Guardian OS continuously watches every provisioned enterprise — drift, health, evidence and recommendations — and surfaces only what needs a human. You should never have to ask "is my customer's AI safe today?" — it already knows.</p>
      </div><div class="ops-gov-hero-stats">
        <div class="ops-cmd-stat"><b>${ov.watching}</b><span>enterprises watched</span></div>
        <div class="ops-cmd-stat"><b>${ov.queue_total}</b><span>need a human</span></div>
        <div class="ops-cmd-stat"><b>${ov.drift_open_total}</b><span>open drift</span></div>
      </div></div>
    </section>
    <section class="radmin-card">
      <div class="ops-brief-head"><div><h3>${esc(name)}</h3>
        <span class="radmin-deliv-meta">Baseline v1 · trend ${esc(health.trend.direction)}${health.risk_trends ? ` · ${esc(health.risk_trends)}` : ""}</span></div>
        <div class="ops-gov-actions"><button class="radmin-btn sm">Run monitoring pass</button><button class="radmin-btn sm">Generate evidence pack</button></div></div>
      <div class="ops-gov-health">
        <div class="ops-gov-overall ${scoreClass(health.band)}"><b>${health.overall}</b><span>Governance confidence</span><em>${esc(health.band)}</em></div>
        <div class="ops-gov-subs">${subs}</div>
      </div>
    </section>
    <section class="radmin-card">
      <h3>Operator queue <span class="radmin-badge">${queue.count}</span></h3>
      <p class="radmin-sub">Only what genuinely needs a human. Everything else Guardian OS handles automatically.</p>
      <div class="ops-gov-queue">${qitems}</div>
    </section>
    <section class="radmin-card">
      <h3>Governance drift <span class="radmin-badge">${drift.open.length}</span></h3>
      <p class="radmin-sub">Today's enterprise vs its governed baseline. Every event is evidence-backed.</p>
      <div class="ops-gov-drift">${drows}</div>
    </section>
    <section class="radmin-card">
      <h3>Evidence packs</h3>
      <p class="radmin-sub">Customer-ready, content-signed governance evidence — one export per period.</p>
      <div class="ops-gov-packs">${packrows}</div>
    </section>
  </div></body></html>`;
}

async function main() {
  const srv = await startMockEngine({ governancePolicies: true });
  process.env.GOVERNANCE_URL = `http://127.0.0.1:${srv.address().port}`;
  const ops = require("../../lib/ops");

  const prov = await ops.provisioning.provision({}, { actor: "davarn@control-room" });
  const org = prov.org_id;
  // Introduce realistic drift so the surface is populated.
  await ops.entities.create({ org_id: org, layer: "estate", kind: "tool", name: "delete_ledger", attrs: { privileged: true } });
  await ops.entities.create({ org_id: org, layer: "estate", kind: "ai_system", name: "Shadow Copilot", refs: [] });
  const scoped = (await ops.govpolicy.active({})).filter((p) => p.scope === org);
  await ops.govpolicy.rollback({ name: scoped[0].name, scope: org, actor: "insider" });
  await ops.managed.monitor(org, { actor: "guardian_os" });
  await ops.managed.evidencePack(org, { actor: "davarn@control-room" });

  const [ov, health, queue, drift, packs] = await Promise.all([
    ops.managed.overview(), ops.managed.health(org), ops.managed.queue(org), ops.managed.detectDrift(org), ops.managed.listPacks(org),
  ]);

  const css = ["design-system.css", "runtime-admin.css"].map((f) => fs.readFileSync(path.join(__dirname, "../../styles", f), "utf8")).join("\n");
  const html = page(css, ov, health, queue, drift, packs, prov.result.name || "Aurora Financial");
  const outDir = process.env.SHOT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), "ops-shot-"));
  const htmlPath = path.join(outDir, "managed-governance.html");
  fs.writeFileSync(htmlPath, html);

  const { chromium } = require("playwright-core");
  const browser = await chromium.launch({ executablePath: resolveChromium() });
  const pageObj = await browser.newPage({ viewport: { width: 1000, height: 1500 }, deviceScaleFactor: 2 });
  await pageObj.goto("file://" + htmlPath);
  await pageObj.waitForTimeout(200);
  const shot = path.join(outDir, "managed-governance.png");
  await pageObj.screenshot({ path: shot, fullPage: true });
  await browser.close();
  srv.close();
  console.log(shot);
}

main().catch((e) => { console.error(e); process.exit(1); });
