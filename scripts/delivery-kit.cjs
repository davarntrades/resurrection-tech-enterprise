/* ============================================================
 * Resurrection Tech™ — Delivery Kit (skeleton)
 *
 * Customer manifest/logs IN  →  branded Audit + Executive Report PDFs OUT.
 * Uses the live governance engine (/v1/assess + /v1/evaluate) and the same
 * Chromium print pipeline as scripts/gen-pdfs.cjs.
 *
 *   node scripts/delivery-kit.cjs [input.json]
 *
 * Input (see scripts/delivery-kit.sample.json):
 *   {
 *     "customer": { "name", "environment", "period", "reference" },
 *     "manifest": [ { "name","description","capabilities":[...] }, ... ],  // → audit
 *     "format":   "generic" | "openai" | "mcp" | ...,                      // optional
 *     "domains":  ["finance", ...],                                        // optional
 *     "trajectories": [ [ { "tool","args" }, ... ], ... ],                 // → exec report (replayed)
 *     "decisions":    [ { "verdict","category","tool","reason" }, ... ]    // → exec report (pre-aggregated)
 *   }
 *
 * The engine connection is the ONLY real unknown. Each engine call is isolated
 * and fails soft: if unreachable, the script marks the section
 * "[ENGINE NOT REACHED]" and continues, so you can see exactly what data is
 * present vs missing before a real engagement.
 * ============================================================ */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// Auto-load .env.delivery / .env.local (KEY=VALUE) so analysts never re-export
// GOVERNANCE_URL / GOVERNANCE_TOKEN / CHROME_BIN each session. Real env wins.
(function loadEnv() {
  for (const f of [".env.delivery", ".env.local"]) {
    const p = path.join(__dirname, "..", f);
    try {
      if (!fs.existsSync(p)) continue;
      for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (process.env[m[1]] == null || process.env[m[1]] === "") process.env[m[1]] = v;
      }
    } catch { /* ignore */ }
  }
})();

const GOV = (process.env.GOVERNANCE_URL || "https://resurrection-tech-enterprise-production.up.railway.app").replace(/\/$/, "");

// Opt-in staged progress for the Analyst Console (RT_CONSOLE=1). Emits a single
// parseable line per stage; hand-run CLI output is unchanged when unset.
const emitStage = (k, label) => { if (process.env.RT_CONSOLE) process.stdout.write(`__STAGE__:${k}:${label}\n`); };

// ---- portable Chromium discovery -------------------------------------------
// Browsers downloaded by Playwright (chromium-<rev>/chrome-linux/chrome) or
// Puppeteer (chrome/linux-*/chrome-linux64/chrome), across the default cache
// dirs a no-sudo Codespace install uses, plus any explicit base.
function browserCacheCandidates() {
  const home = os.homedir();
  const out = [];
  const pwBases = [process.env.PLAYWRIGHT_BROWSERS_PATH, path.join(home, ".cache", "ms-playwright"), "/opt/pw-browsers", path.join(home, "Library", "Caches", "ms-playwright")].filter(Boolean);
  for (const base of pwBases) {
    try {
      for (const d of fs.readdirSync(base)) {
        if (!/^chromium/.test(d)) continue;
        out.push(
          path.join(base, d, "chrome-linux", "chrome"),
          path.join(base, d, "chrome-linux", "headless_shell"),
          path.join(base, d, "chrome-headless-shell-linux", "chrome-headless-shell"),
          path.join(base, d, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
        );
      }
    } catch { /* base absent */ }
  }
  const pupBases = [process.env.PUPPETEER_CACHE_DIR && path.join(process.env.PUPPETEER_CACHE_DIR, "chrome"), path.join(home, ".cache", "puppeteer", "chrome")].filter(Boolean);
  for (const base of pupBases) {
    try {
      for (const d of fs.readdirSync(base)) {
        out.push(
          path.join(base, d, "chrome-linux64", "chrome"),
          path.join(base, d, "chrome-mac-x64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
        );
      }
    } catch { /* base absent */ }
  }
  return out;
}
function fromPath() {
  for (const name of ["chromium", "chromium-browser", "google-chrome-stable", "google-chrome"]) {
    try { const p = execFileSync("command", ["-v", name], { shell: "/bin/bash", stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); if (p) return p; } catch { /* not on PATH */ }
  }
  return null;
}
function resolveChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/snap/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ...browserCacheCandidates(),
  ].filter(Boolean);
  for (const p of candidates) { try { if (fs.existsSync(p)) return p; } catch { /* skip */ } }
  const onPath = fromPath();
  if (onPath) { try { if (fs.existsSync(onPath)) return onPath; } catch { /* skip */ } }
  return null;
}
const CHROME_NOT_FOUND = "Chromium not found. Run:  npm run audit:chrome:install   (or set CHROME_BIN=/path/to/chrome)";
const TOKEN = process.env.GOVERNANCE_TOKEN;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const slug = (s) => String(s || "customer").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "customer";

// ---- engine calls (isolated, fail-soft) -------------------------------------
async function assess(body) {
  try {
    const res = await fetch(`${GOV}/v1/assess`, {
      method: "POST", headers: { "content-type": "application/json" },
      // body accepts { manifest } (parsed array/object) or { manifest_text } (the
      // customer's raw file, in any supported format) — no manual reshaping.
      body: JSON.stringify({ format: "generic", ...body }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`assess ${res.status}`);
    return await res.json();
  } catch (e) { console.warn("  ! /v1/assess unreachable:", e.message); return null; }
}
async function evaluate(trajectory, domains) {
  try {
    const headers = { "content-type": "application/json" };
    if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
    const res = await fetch(`${GOV}/v1/evaluate`, {
      method: "POST", headers,
      body: JSON.stringify(domains && domains.length ? { trajectory, domains } : { trajectory }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`evaluate ${res.status}`);
    return await res.json();
  } catch (e) { return { __error: e.message }; }
}
const toVerdict = (v) => {
  const x = String(v || "").toUpperCase();
  if (x === "PERMIT" || x === "ALLOW") return "ALLOW";
  if (x === "ESCALATE" || x === "ENVIRONMENT_SENSITIVE") return "ESCALATE";
  return "BLOCK"; // BLOCK / NO_VALID_SOLUTION / unknown → treat as blocked
};

// ---- preflight: one-command connectivity + field check ----------------------
async function preflight() {
  console.log(`\nResurrection Tech — Delivery Kit · PREFLIGHT\n  engine: ${GOV}\n`);
  let ok = true;
  console.log("• /v1/assess");
  const a = await assess({ manifest: [{ name: "probe_tool", description: "probe", capabilities: ["payment", "external"] }], org: "Preflight" });
  if (!a) { console.log("    UNREACHABLE ✗"); ok = false; }
  else for (const f of ["summary", "exposure", "tools", "grounded_blocks", "attestation"])
    console.log(`    - ${f}: ${a[f] != null ? "present ✓" : "MISSING ✗"}${f === "attestation" && a[f] == null ? "  (engine may omit on probe)" : ""}`);
  console.log("• /v1/evaluate");
  const e = await evaluate([{ tool: "probe_tool", args: {} }], ["finance"]);
  if (!e || e.__error) { console.log(`    UNREACHABLE ✗ ${e && e.__error ? "(" + e.__error + ")" : ""}`); ok = false; }
  else for (const f of ["verdict", "reason", "omega_domain", "trajectory_hash", "layer"])
    console.log(`    - ${f}: ${e[f] != null ? "present ✓" : "MISSING ✗"}`);
  const chromeOk = checkChrome();
  console.log(`\n  Result: engine ${ok ? "reachable ✓" : "NOT reachable ✗"} · Chromium ${chromeOk ? "found ✓" : "NOT found ✗"}${ok && chromeOk ? " — ready to run an audit ✓" : ""}\n`);
}

// ---- Chromium detection -----------------------------------------------------
function checkChrome() {
  const chrome = resolveChrome();
  if (chrome) { console.log(`• Chromium: ${chrome} ✓`); return true; }
  console.log(`• Chromium: NOT FOUND ✗\n    ${CHROME_NOT_FOUND}`);
  return false;
}

// ---- shared brand CSS (compact subset of gen-pdfs.cjs) ----------------------
const CSS = `
@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}
body{background:#08090b;color:#aab2bd;font-family:-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:12px;line-height:1.55}
.wrap{padding:40px 46px}
.brand{display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:14px;margin-bottom:20px}
.brand b{color:#f3f5f7;font-size:14px}.brand .r{color:#e0a93f}.brand .t{font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#6b7480}
.band{background:linear-gradient(180deg,rgba(224,169,63,.14),rgba(224,169,63,.03));border:1px solid #6b4f1c;border-radius:14px;padding:22px 24px;margin-bottom:18px}
.eyebrow{font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#e0a93f}
h1{color:#f3f5f7;font-size:24px;letter-spacing:-.02em;margin:8px 0 4px}h2{color:#f3f5f7;font-size:15px;margin:0 0 10px}
.meta{display:flex;flex-wrap:wrap;gap:16px 26px;margin-top:14px}.meta .k{display:block;font-family:ui-monospace,Menlo,monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#6b7480}.meta .v{color:#f3f5f7}
.sec{border-top:1px solid rgba(255,255,255,.08);padding:18px 0;break-inside:avoid}.sec:first-of-type{border-top:0}
.kpis{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}.kpi{flex:1 1 120px;background:#0b0d10;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:13px 14px}.kpi .v{display:block;color:#f3f5f7;font-size:20px;font-weight:600}.kpi .k{color:#6b7480;font-size:10px}
table{width:100%;border-collapse:collapse;margin-top:8px;font-size:11px}th{text-align:left;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#6b7480;padding:7px 9px;border-bottom:1px solid rgba(255,255,255,.1)}td{padding:8px 9px;border-bottom:1px solid rgba(255,255,255,.06);color:#cdd6e0;vertical-align:top}td.m{color:#f3f5f7}td.n{font-family:ui-monospace,Menlo,monospace;color:#e0a93f;text-align:right}
.tag{font-family:ui-monospace,Menlo,monospace;font-size:9px;padding:2px 7px;border-radius:5px}.cov{color:#3fb27f;border:1px solid rgba(63,178,127,.5)}.par{color:#e0a93f;border:1px solid rgba(224,169,63,.5)}.unc{color:#e5484d;border:1px solid rgba(229,72,77,.5)}
.bar{display:flex;height:13px;border-radius:999px;overflow:hidden;border:1px solid rgba(255,255,255,.1);margin-top:6px}.bar i{display:block;height:100%}.a{background:#3fb27f}.b{background:#e5484d}.e{background:#e0a93f}
.legend{display:flex;gap:16px;flex-wrap:wrap;margin-top:10px;font-family:ui-monospace,Menlo,monospace;font-size:11px}.legend i{width:9px;height:9px;border-radius:2px;margin-right:6px;display:inline-block}
.warn{background:rgba(229,72,77,.08);border:1px solid rgba(229,72,77,.4);border-radius:8px;padding:10px 12px;color:#f0b4b6;font-size:11px;margin-top:8px}
.disc{margin-top:16px;padding-top:12px;border-top:1px dashed rgba(255,255,255,.1);color:#6b7480;font-size:10px}
.foot{margin-top:20px;border-top:1px solid rgba(255,255,255,.08);padding-top:10px;display:flex;justify-content:space-between;font-family:ui-monospace,Menlo,monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#474e58}
`;
const brand = `<div class="brand"><b><span class="r">&#8475;(t)</span>&nbsp;&nbsp;Resurrection Tech&trade;</b><span class="t">Runtime Governance</span></div>`;
const page = (title, inner) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body><div class="wrap">${brand}${inner}<div class="foot"><span>Resurrection Tech&trade;</span><span>${esc(title)}</span><span>Patent GB2600765.8</span></div></div></body></html>`;
const bandBlock = (k, h, sub, meta) => `<div class="band"><span class="eyebrow">${esc(k)}</span><h1>${esc(h)}</h1><p style="color:#aab2bd;margin:0">${esc(sub)}</p><div class="meta">${meta.map(([a, b]) => `<div><span class="k">${esc(a)}</span><span class="v">${esc(b)}</span></div>`).join("")}</div></div>`;
const STATUS_CLASS = { Covered: "cov", COVERED: "cov", Partial: "par", PARTIAL: "par", Uncovered: "unc", UNCOVERED: "unc" };

// ---- AUDIT html from AssessReport ------------------------------------------
function auditHtml(c, report) {
  const meta = [["Customer", c.name], ["Environment", c.environment || "—"], ["Reference", c.reference || "—"], ["Classification", "Confidential"]];
  if (!report) {
    return page("Runtime Safety Audit", bandBlock("48-Hour Runtime Governance Audit", c.name, "Reachable exposure assessment", meta) +
      `<div class="sec"><span class="eyebrow">1 · Status</span><h2>Engine assessment unavailable.</h2><div class="warn">[ENGINE NOT REACHED] /v1/assess did not return a report. Set GOVERNANCE_URL/GOVERNANCE_TOKEN and re-run, or supply a cached assess report. The audit's coverage, exposure, and verified-blocked-trajectory sections come directly from the engine.</div></div>`);
  }
  const s = report.summary || {};
  const exposure = report.exposure || {};
  const tools = report.tools || [];
  const blocks = report.grounded_blocks || [];
  const att = report.attestation;
  return page("Runtime Safety Audit", bandBlock("48-Hour Runtime Governance Audit", c.name, `Reachable exposure assessment · ${report.industry || "general"}`, meta) + `
    <div class="sec"><span class="eyebrow">1 · Executive summary</span><h2>Coverage of reachable forbidden states (&#937;).</h2>
      <div class="kpis">
        <div class="kpi"><span class="v">${s.tools ?? "—"}</span><span class="k">Tools assessed</span></div>
        <div class="kpi"><span class="v">${s.risky ?? "—"}</span><span class="k">Risk-bearing tools</span></div>
        <div class="kpi"><span class="v">${s.coverage_pct ?? "—"}%</span><span class="k">&#937; coverage</span></div>
        <div class="kpi"><span class="v">${s.verified_blocked_trajectories ?? "—"}</span><span class="k">Verified blocked trajectories</span></div>
      </div>
      <p style="margin-top:12px">Covered ${s.covered ?? "—"} · Partial ${s.partial ?? "—"} · Uncovered ${s.uncovered ?? "—"} of ${s.risky ?? "—"} risk-bearing tools. Catalog rules applied: ${report.catalog_rules ?? "—"}.</p>
    </div>
    <div class="sec"><span class="eyebrow">2 · &#937; exposure by risk class</span><h2>Where exposure is reachable.</h2>
      <table><thead><tr><th>Risk class</th><th>Status</th><th>Tools</th><th>Rules</th></tr></thead><tbody>
      ${Object.entries(exposure).map(([rc, x]) => `<tr><td class="m">${esc(rc)}</td><td><span class="tag ${STATUS_CLASS[x.status] || "unc"}">${esc(x.status)}</span></td><td class="n">${x.tools ?? "—"}</td><td>${esc((x.rules || []).join(", ") || "—")}</td></tr>`).join("") || `<tr><td colspan="4">No risk classes reported.</td></tr>`}
      </tbody></table>
    </div>
    <div class="sec"><span class="eyebrow">3 · Tool risk surface</span><h2>What each tool can reach.</h2>
      <table><thead><tr><th>Tool</th><th>Capabilities</th><th>Status</th></tr></thead><tbody>
      ${tools.map((t) => `<tr><td class="m">${esc(t.tool)}</td><td>${esc((t.capabilities || []).join(", ") || "—")}</td><td><span class="tag ${STATUS_CLASS[t.status] || "cov"}">${esc(t.status)}</span></td></tr>`).join("") || `<tr><td colspan="3">No tools reported.</td></tr>`}
      </tbody></table>
    </div>
    <div class="sec"><span class="eyebrow">4 · Verified blocked trajectories</span><h2>Catastrophic actions the engine would block.</h2>
      <table><thead><tr><th>Trajectory</th><th>Risk class</th><th>&#937; domain</th><th>Evidence hash</th></tr></thead><tbody>
      ${blocks.map((b) => `<tr><td class="m">${esc(b.label)}</td><td>${esc(b.risk_class)}</td><td>${esc(b.omega_domain || "—")}</td><td style="font-family:ui-monospace,Menlo,monospace;font-size:9.5px;color:#6b7480">${esc((b.hash || "").slice(0, 16))}</td></tr>`).join("") || `<tr><td colspan="4">None reported.</td></tr>`}
      </tbody></table>
    </div>
    <div class="sec"><span class="eyebrow">5 · Attestation</span><h2>Reproducible, pinned to a build.</h2>
      ${att ? `<table><tbody>
        <tr><td class="m">Engine commit</td><td style="font-family:ui-monospace,Menlo,monospace">${esc(att.engine_commit)}</td></tr>
        <tr><td class="m">Ruleset hash</td><td style="font-family:ui-monospace,Menlo,monospace">${esc(att.ruleset_hash)}</td></tr>
        <tr><td class="m">Service version</td><td>${esc(att.service_version)}</td></tr>
        <tr><td class="m">Reachability horizon</td><td>${esc(att.horizon)}</td></tr>
      </tbody></table>` : `<div class="warn">No attestation block returned by the engine for this run.</div>`}
    </div>
    <div class="sec"><span class="eyebrow">6 · Recommended next step</span><h2>Limited Pilot™.</h2>
      <p>${(s.uncovered ?? 0) > 0 ? `${s.uncovered} risk-bearing tool(s) are uncovered or partial. ` : ""}A Limited Pilot validates interception on your own traffic and closes remaining &#937; coverage before production.</p>
    </div>
    <div class="disc">Generated from the live Runtime Governance engine assessment of the supplied manifest. Pricing indicative and non-binding; final terms follow assessment and deployment review.</div>`);
}

// ---- EXEC REPORT html from aggregated metrics -------------------------------
function reportHtml(c, m) {
  const total = m.total || 0;
  const pct = (n) => total ? ((n / total) * 100).toFixed(1) : "0.0";
  const meta = [["Customer", c.name], ["Period", c.period || "—"], ["Reference", c.reference || "—"], ["Classification", "Board · Confidential"]];
  const cats = Object.entries(m.categories || {}).sort((a, b) => b[1] - a[1]);
  return page("Runtime Governance Executive Report", bandBlock("Runtime Governance Executive Report™", c.name, "Monthly governance evidence", meta) + `
    ${m.source === "none" ? `<div class="sec"><div class="warn">[NO ACTIVITY DATA] Provide "trajectories" (replayed through /v1/evaluate) or pre-aggregated "decisions" to populate runtime metrics. Structure shown below.</div></div>` : ""}
    <div class="sec"><span class="eyebrow">1 · Executive summary</span><h2>The period at a glance.</h2>
      <div class="kpis">
        <div class="kpi"><span class="v">${total.toLocaleString()}</span><span class="k">Actions governed${m.source === "engine" ? " (replayed)" : ""}</span></div>
        <div class="kpi"><span class="v">${(m.block || 0).toLocaleString()}</span><span class="k">Unsafe actions prevented</span></div>
        <div class="kpi"><span class="v">${(m.escalate || 0).toLocaleString()}</span><span class="k">Escalated for review</span></div>
        <div class="kpi"><span class="v">${m.source === "engine" ? "Live" : m.source}</span><span class="k">Data source</span></div>
      </div>
    </div>
    <div class="sec"><span class="eyebrow">2 · Runtime activity</span><h2>Every action resolved to a verdict.</h2>
      <div class="bar"><i class="a" style="width:${pct(m.allow)}%"></i><i class="b" style="width:${pct(m.block)}%"></i><i class="e" style="width:${pct(m.escalate)}%"></i></div>
      <div class="legend"><span><i class="a"></i>ALLOW · ${(m.allow || 0).toLocaleString()} (${pct(m.allow)}%)</span><span><i class="b"></i>BLOCK · ${(m.block || 0).toLocaleString()} (${pct(m.block)}%)</span><span><i class="e"></i>ESCALATE · ${(m.escalate || 0).toLocaleString()} (${pct(m.escalate)}%)</span></div>
    </div>
    <div class="sec"><span class="eyebrow">3 · Actions prevented</span><h2>What was blocked before it executed.</h2>
      <table><thead><tr><th>Category / &#937; domain</th><th>Count</th></tr></thead><tbody>
      ${cats.map(([k, v]) => `<tr><td class="m">${esc(k)}</td><td class="n">${v}</td></tr>`).join("") || `<tr><td colspan="2">No prevented actions in this period.</td></tr>`}
      </tbody></table>
    </div>
    <div class="sec"><span class="eyebrow">4 · Recommendations</span><h2>Prioritised next actions.</h2>
      <p>${(m.block || 0) > 0 ? "Review the top prevented categories with the security team and confirm policy thresholds. " : ""}Schedule the quarterly &#937; revalidation and bring any newly integrated tools under governance at onboarding.</p>
    </div>
    <div class="disc">${m.source === "engine" ? "Generated by replaying supplied trajectories through the live Runtime Governance engine." : m.source === "decisions" ? "Aggregated from supplied decision logs." : "Awaiting activity data."} Figures reflect the supplied period only.</div>`);
}

// ---- one-time auto-install of Chromium when missing ------------------------
let autoInstallTried = false;
function ensureChrome() {
  let chrome = resolveChrome();
  if (chrome) return chrome;
  if (autoInstallTried || process.env.AUDIT_NO_AUTO_INSTALL) return null;
  autoInstallTried = true;
  const installer = path.join(__dirname, "install-chromium.sh");
  if (!fs.existsSync(installer)) return null;
  console.error("• Chromium not found — installing automatically (one-time; this can take a minute)…");
  try { execFileSync("bash", [installer], { stdio: "inherit" }); } catch { /* installer reports its own failure */ }
  // the installer may have written CHROME_BIN to .env.delivery — pick it up
  try {
    const envPath = path.join(__dirname, "..", ".env.delivery");
    if (fs.existsSync(envPath)) {
      const m = fs.readFileSync(envPath, "utf8").match(/^\s*CHROME_BIN\s*=\s*(.+)\s*$/m);
      if (m && !process.env.CHROME_BIN) process.env.CHROME_BIN = m[1].trim().replace(/^["']|["']$/g, "");
    }
  } catch { /* ignore */ }
  chrome = resolveChrome();
  return chrome;
}

// ---- render via Chromium (pipeline unchanged; portable binary lookup) -------
function render(htmlPath, pdfPath) {
  const chrome = ensureChrome();
  if (!chrome) { console.error(`\n✗ ${CHROME_NOT_FOUND}`); process.exit(1); }
  execFileSync(chrome, ["--headless=new", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer", "--print-to-pdf=" + pdfPath, "file://" + htmlPath], { stdio: "ignore" });
}

// ---- standalone PDF render self-test (verifies Chromium actually works) -----
function selfTest() {
  const chrome = ensureChrome();
  if (!chrome) { console.error(`✗ ${CHROME_NOT_FOUND}`); return 1; }
  const dir = path.join(os.tmpdir(), "rt-selftest");
  fs.mkdirSync(dir, { recursive: true });
  const html = path.join(dir, "t.html"), pdf = path.join(dir, "t.pdf");
  fs.writeFileSync(html, "<!doctype html><meta charset='utf-8'><h1>Resurrection Tech — PDF self-test</h1>");
  try { fs.rmSync(pdf, { force: true }); } catch { /* ignore */ }
  try {
    execFileSync(chrome, ["--headless=new", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer", "--print-to-pdf=" + pdf, "file://" + html], { stdio: "ignore" });
  } catch (e) { console.error(`✗ Chromium failed to render (${chrome}): ${e.message}`); return 1; }
  const ok = fs.existsSync(pdf) && fs.readFileSync(pdf).slice(0, 5).toString() === "%PDF-";
  console.log(ok ? `✓ PDF generation OK via ${chrome} (${fs.statSync(pdf).size} bytes)` : "✗ PDF not produced");
  return ok ? 0 : 1;
}

(async () => {
  if (process.argv.includes("--print-chrome")) { const c = resolveChrome(); if (c) { process.stdout.write(c); process.exit(0); } process.exit(1); }
  if (process.argv.includes("--selftest")) { process.exit(selfTest()); }
  if (process.argv.includes("--check-chrome")) { process.exit(checkChrome() ? 0 : 1); }
  if (process.argv.includes("--check")) { await preflight(); return; }

  const flag = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
  let input, srcLabel;
  const manifestFlag = flag("--manifest");
  if (manifestFlag) {
    srcLabel = manifestFlag;
    // Flag mode: point at a raw manifest file (any format) + inline customer details — no JSON authoring.
    if (!fs.existsSync(manifestFlag)) { console.error("Manifest not found:", manifestFlag); process.exit(1); }
    const raw = fs.readFileSync(manifestFlag, "utf8");
    let manifest, manifest_text = raw;
    try { const j = JSON.parse(raw); if (Array.isArray(j)) { manifest = j; manifest_text = undefined; } else if (Array.isArray(j.manifest)) { manifest = j.manifest; manifest_text = undefined; } } catch { /* keep raw text */ }
    input = {
      customer: { name: flag("--name") || "Customer", environment: flag("--environment") || "", period: flag("--period") || "", reference: flag("--reference") || "" },
      industry: flag("--industry"), format: flag("--format") || "generic",
      domains: (flag("--domains") || "").split(",").map((s) => s.trim()).filter(Boolean),
      manifest, manifest_text,
    };
    const tp = flag("--trajectories"); if (tp) input.trajectories = JSON.parse(fs.readFileSync(tp, "utf8"));
    const dp = flag("--decisions"); if (dp) input.decisions = JSON.parse(fs.readFileSync(dp, "utf8"));
  } else {
    const inPath = process.argv.find((a, i) => i >= 2 && !a.startsWith("--")) || path.join(__dirname, "delivery-kit.sample.json");
    if (!fs.existsSync(inPath)) { console.error("Input not found:", inPath); process.exit(1); }
    input = JSON.parse(fs.readFileSync(inPath, "utf8"));
    srcLabel = inPath;
  }
  const c = input.customer || { name: "Customer" };
  const outDir = path.join(__dirname, "..", "deliverables", `${slug(c.name)}-${slug(c.period || c.reference || "report")}`);
  const tmp = "/tmp/rt-delivery"; fs.mkdirSync(outDir, { recursive: true }); fs.mkdirSync(tmp, { recursive: true });
  const auditPdf = path.join(outDir, "audit.pdf");
  const reportPdf = path.join(outDir, "executive-report.pdf");
  const status = { assess: false, evaluate: false };
  const replay = { checked: 0, deterministic: 0 };

  console.log(`\nResurrection Tech — Delivery Kit\n  input:  ${srcLabel}\n  engine: ${GOV}\n  output: ${outDir}\n`);
  emitStage("parsing", "Parsing manifest");

  // AUDIT (/v1/assess) — accepts a parsed manifest array OR raw manifest_text
  let report = null;
  const haveManifest = (Array.isArray(input.manifest) && input.manifest.length) ||
    (typeof input.manifest_text === "string" && input.manifest_text.trim());
  if (haveManifest) {
    console.log("• Audit: assessing manifest via /v1/assess …");
    emitStage("assessment", "Runtime assessment");
    report = await assess({
      manifest: Array.isArray(input.manifest) && input.manifest.length ? input.manifest : undefined,
      manifest_text: input.manifest_text,
      org: c.name, format: input.format || "generic",
    });
    status.assess = !!report;
  } else console.log("• Audit: no manifest supplied — skipping assess.");
  emitStage("exposure", "Ω exposure mapping");
  emitStage("audit", "Generating audit PDF");
  fs.writeFileSync(path.join(tmp, "audit.html"), auditHtml(c, report));
  render(path.join(tmp, "audit.html"), auditPdf);

  // EXEC REPORT metrics (+ replay verification)
  const m = { total: 0, allow: 0, block: 0, escalate: 0, categories: {}, source: "none" };
  if (Array.isArray(input.decisions) && input.decisions.length) {
    m.source = "decisions";
    for (const d of input.decisions) {
      const v = toVerdict(d.verdict); m.total++; m[v.toLowerCase()]++;
      if (v === "BLOCK") { const k = d.category || d.reason || "Unspecified"; m.categories[k] = (m.categories[k] || 0) + 1; }
    }
  } else if (Array.isArray(input.trajectories) && input.trajectories.length) {
    console.log(`• Report: replaying ${input.trajectories.length} trajectories via /v1/evaluate (+ determinism check) …`);
    emitStage("replay", "Replaying trajectories");
    emitStage("determinism", "Determinism verification");
    for (const traj of input.trajectories) {
      const g = await evaluate(traj, input.domains);
      if (g && !g.__error) {
        status.evaluate = true; const v = toVerdict(g.verdict); m.total++; m[v.toLowerCase()]++;
        if (v === "BLOCK") { const k = g.omega_domain || g.reason || "Blocked"; m.categories[k] = (m.categories[k] || 0) + 1; }
        const g2 = await evaluate(traj, input.domains); // replay verification
        if (g2 && !g2.__error) { replay.checked++; if (g2.verdict === g.verdict && g2.trajectory_hash === g.trajectory_hash) replay.deterministic++; }
      }
    }
    m.source = status.evaluate ? "engine" : "none";
  } else console.log("• Report: no trajectories or decisions supplied.");
  emitStage("report", "Generating executive report");
  fs.writeFileSync(path.join(tmp, "report.html"), reportHtml(c, m));
  render(path.join(tmp, "report.html"), reportPdf);

  // FIELD MATRIX — every Priority-1 output, present or missing
  const blocks = (report && report.grounded_blocks) || [];
  const fields = [
    ["Ω exposure coverage", report && report.summary && report.summary.coverage_pct != null],
    ["Exposure by risk class", !!(report && report.exposure && Object.keys(report.exposure).length)],
    ["Verified blocked trajectories", blocks.length > 0],
    ["ALLOW / BLOCK / ESCALATE statistics", m.total > 0],
    ["Prevented categories", Object.keys(m.categories).length > 0],
    ["Recommendations", true],
    ["Audit hashes", blocks.some((b) => b && b.hash)],
    ["Replay verification", replay.checked > 0],
    ["Attestation", !!(report && report.attestation)],
    ["Branded Audit PDF", fs.existsSync(auditPdf)],
    ["Branded Executive Report PDF", fs.existsSync(reportPdf)],
  ];
  console.log("\n— Priority-1 field matrix —");
  for (const [name, ok] of fields) console.log(`  ${ok ? "✅" : "🔴"} ${name}`);
  if (replay.checked) console.log(`     replay determinism: ${replay.deterministic}/${replay.checked}`);

  const missing = fields.filter(([, ok]) => !ok).map(([n]) => n);
  console.log(`\n— Engine —\n  /v1/assess:   ${status.assess ? "reachable ✓" : "unreachable ✗ (audit fields blank)"}\n  /v1/evaluate: ${status.evaluate ? "reachable ✓" : (m.source === "decisions" ? "n/a — used decision logs ✓" : "unreachable ✗")}`);
  if (missing.length) console.log(`\n  ⚠ Missing: ${missing.join(", ")}\n    → almost always engine connectivity. Run:  node scripts/delivery-kit.cjs --check`);

  // machine-readable evidence written alongside the PDFs
  fs.writeFileSync(path.join(outDir, "run-summary.json"), JSON.stringify({
    customer: c, engine: GOV, status, replay,
    metrics: m, fields: Object.fromEntries(fields), missing,
    assess_summary: report ? report.summary : null,
    attestation: report ? report.attestation || null : null,
  }, null, 2));

  console.log(`\nDeliverables:\n  ${auditPdf}\n  ${reportPdf}\n  ${path.join(outDir, "run-summary.json")}\n`);
  emitStage("complete", "Complete");
  if (process.env.RT_CONSOLE) process.stdout.write(`__RESULT__:${path.relative(path.join(__dirname, ".."), outDir)}\n`);

  if (process.argv.includes("--open")) {
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    try { execFileSync(opener, [auditPdf], { stdio: "ignore" }); console.log(`Opened ${auditPdf}`); }
    catch { console.log(`(Could not auto-open; open the files above manually.)`); }
  }
})();
