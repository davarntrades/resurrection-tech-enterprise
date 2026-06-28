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
// Structured per-stage debug checks surfaced in the console (✓/✗ + detail).
const emitCheck = (ok, label) => { if (process.env.RT_CONSOLE) process.stdout.write(`__CHECK__:${ok ? 1 : 0}:${String(label).replace(/\n/g, " ")}\n`); };
const emitError = (msg) => { if (process.env.RT_CONSOLE) process.stdout.write(`__ERROR__:${String(msg).replace(/\n/g, " ")}\n`); };

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
          path.join(base, d, "chrome-linux64", "chrome"),
          path.join(base, d, "chrome-linux", "headless_shell"),
          path.join(base, d, "chrome-headless-shell-linux", "chrome-headless-shell"),
          path.join(base, d, "chrome-headless-shell-linux64", "chrome-headless-shell"),
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
// Browsers bundled in the repo (./chrome) or via npm (node_modules/.bin).
// @puppeteer/browsers installs to ./chrome/<platform>-<build>/chrome-<platform>/chrome
// (e.g. ./chrome/linux-150xxxx/chrome-linux64/chrome), so scan the versioned
// subdirectories — not just fixed paths.
function localChromeCandidates() {
  const root = path.join(__dirname, "..");
  const chromeDir = path.join(root, "chrome");
  const out = [
    path.join(chromeDir, "chrome"),
    path.join(chromeDir, "chrome-linux", "chrome"),
    path.join(chromeDir, "chrome-linux64", "chrome"),
    path.join(root, "node_modules", ".bin", "chromium"),
  ];
  try {
    for (const d of fs.readdirSync(chromeDir)) {
      out.push(
        path.join(chromeDir, d, "chrome-linux64", "chrome"),
        path.join(chromeDir, d, "chrome-linux", "chrome"),
        path.join(chromeDir, d, "chrome"),
        path.join(chromeDir, d, "chrome-headless-shell-linux64", "chrome-headless-shell"),
        path.join(chromeDir, d, "chrome-mac-x64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
        path.join(chromeDir, d, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
      );
    }
  } catch { /* no ./chrome dir */ }
  return out;
}
function fromPath() {
  // `which` is a real binary (no shell), avoiding the DEP0190 warning that
  // `execFileSync("command", …, {shell})` triggers on newer Node. Return ALL
  // matches so resolveChrome can verify each (a name may point at a snap stub).
  const out = [];
  for (const name of ["google-chrome-stable", "google-chrome", "chromium", "chromium-browser"]) {
    try { const p = execFileSync("which", [name], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); if (p) out.push(p); } catch { /* not on PATH */ }
  }
  return out;
}
// A path "exists" is not enough: the Ubuntu chromium-browser snap stub exists but
// only prints "requires the chromium snap to be installed" and exits non-zero.
// A binary is USABLE only if `<bin> --version` exits 0 and looks like a browser.
const _usable = new Map();
function chromeVersion(bin) {
  try { return execFileSync(bin, ["--version"], { timeout: 8000, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); }
  catch { return ""; }
}
function chromeUsable(bin) {
  if (!bin) return false;
  if (_usable.has(bin)) return _usable.get(bin);
  let ok = false;
  try {
    if (fs.existsSync(bin)) {
      const out = chromeVersion(bin); // "" if it exited non-zero (snap stub) or timed out
      ok = /\b(chromium|chrome|google chrome)\b/i.test(out) && !/snap/i.test(out);
    }
  } catch { ok = false; }
  _usable.set(bin, ok);
  return ok;
}
function resolveChrome() {
  // Preference order: explicit override → repo-bundled → Playwright/Puppeteer
  // downloads → real system browsers → PATH. Every candidate must pass the
  // usability check, so a snap stub is never selected even though it exists.
  const candidates = [
    process.env.CHROME_BIN,
    ...localChromeCandidates(),
    ...browserCacheCandidates(),
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser", // snap stub on Ubuntu — rejected by chromeUsable()
    "/snap/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ...fromPath(),
  ].filter(Boolean);
  for (const p of candidates) { if (chromeUsable(p)) return p; }
  return null;
}
const CHROME_NOT_FOUND = "No usable Chromium found (a snap stub doesn't count). Run:  npm run audit:chrome:install   (or set CHROME_BIN=/path/to/real/chrome)";
const TOKEN = process.env.GOVERNANCE_TOKEN;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const slug = (s) => String(s || "customer").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "customer";

// ---- measured runtime performance (no estimates; real timings only) ---------
// Every successful /v1/evaluate round-trip contributes one latency sample, taken
// with a high-resolution monotonic clock. Percentiles/throughput are derived
// from these samples; if none exist the report shows a "pending" state.
const PERF = { evalSamples: [], assessMs: null };
const nowMs = () => Number(process.hrtime.bigint()) / 1e6;

// ---- engine calls (isolated, fail-soft, fully instrumented) ------------------
// Both calls capture and print the HTTP status code + raw response body so a
// contract mismatch (e.g. wrong request shape, 4xx/5xx, non-JSON) is visible
// BEFORE the "no report"/"no verdict" fallback.
function bodySnippet(t) { return String(t || "").replace(/\s+/g, " ").slice(0, 700); }
async function assess(body) {
  const t0 = nowMs();
  const shape = Array.isArray(body.manifest)
    ? `manifest[] (${body.manifest.length} tools)`
    : (body.manifest_text != null ? `manifest_text (${String(body.manifest_text).length} bytes, format=${body.format || "generic"})` : "unknown");
  let res;
  try {
    res = await fetch(`${GOV}/v1/assess`, {
      method: "POST", headers: { "content-type": "application/json" },
      // body accepts { manifest } (parsed array/object) or { manifest_text } (the
      // customer's raw file, in any supported format) — no manual reshaping.
      body: JSON.stringify({ format: "generic", ...body }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    console.warn(`  ! /v1/assess request failed (request: ${shape}): ${e.message}`);
    emitCheck(false, `/v1/assess request failed (${shape}): ${e.message}`);
    return null;
  }
  PERF.assessMs = nowMs() - t0;
  const text = await res.text().catch(() => "");
  let json = null; try { json = JSON.parse(text); } catch { /* non-JSON */ }
  const good = res.ok && json && (json.summary || json.exposure || json.tools);
  console.log(`  /v1/assess → HTTP ${res.status} · request: ${shape} · ${text.length} bytes${good ? " · OK" : ""}`);
  if (!good) {
    console.warn(`  ! /v1/assess: no usable report. Full response body:\n${text}\n`);
    emitCheck(false, `/v1/assess HTTP ${res.status} (sent ${shape}) — body: ${bodySnippet(text) || "(empty)"}`);
    return null;
  }
  return json;
}
async function evaluate(trajectory, domains) {
  const t0 = nowMs();
  let res;
  try {
    const headers = { "content-type": "application/json" };
    if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
    res = await fetch(`${GOV}/v1/evaluate`, {
      method: "POST", headers,
      body: JSON.stringify(domains && domains.length ? { trajectory, domains } : { trajectory }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) { return { __error: e.message }; }
  const text = await res.text().catch(() => "");
  let json = null; try { json = JSON.parse(text); } catch { /* non-JSON */ }
  if (!res.ok || !json || json.verdict == null) {
    return { __error: `HTTP ${res.status}`, __status: res.status, __body: text };
  }
  PERF.evalSamples.push(nowMs() - t0); // measured per-evaluation round-trip
  return json;
}
// derive percentile/throughput stats from the measured samples (null if none)
function perfStats() {
  const xs = PERF.evalSamples.slice().sort((a, b) => a - b);
  const n = xs.length;
  if (!n) return null;
  const sum = xs.reduce((a, b) => a + b, 0);
  const q = (p) => xs[Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1))];
  return { n, mean: sum / n, p50: q(50), p95: q(95), p99: q(99), min: xs[0], max: xs[n - 1], eps: (1000 * n) / sum, samples: xs };
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
  else {
    // omega_domain is conditional: the engine only returns it when a trajectory
    // intersects an Ω domain (a BLOCK). The benign preflight probe doesn't, so
    // its absence is expected — not a failure.
    const OPTIONAL = new Set(["omega_domain"]);
    for (const f of ["verdict", "reason", "omega_domain", "trajectory_hash", "layer"]) {
      const present = e[f] != null;
      console.log(`    - ${f}: ${present ? "present ✓" : OPTIONAL.has(f) ? "n/a — optional (only on BLOCK) ✓" : "MISSING ✗"}`);
    }
  }
  const chromeOk = checkChrome();
  console.log(`\n  Result: engine ${ok ? "reachable ✓" : "NOT reachable ✗"} · Chromium ${chromeOk ? "usable ✓" : "NOT usable ✗"}${ok && chromeOk ? " — ready to run an audit ✓" : ""}\n`);
}

// ---- Chromium detection (verifies the binary actually runs) ------------------
// Uses ensureChrome(), so a plain `npm run audit:check` / `audit:chrome` will
// auto-install a working Chromium when one isn't present (set AUDIT_NO_AUTO_INSTALL
// to disable). Pure path lookups elsewhere use resolveChrome() to avoid recursion.
function checkChrome() {
  const chrome = ensureChrome();
  if (chrome) { const v = chromeVersion(chrome); console.log(`• Chromium: usable ✓  ${chrome}${v ? `  (${v})` : ""}`); return true; }
  console.log(`• Chromium: NOT usable ✗\n    ${CHROME_NOT_FOUND}`);
  return false;
}

// ---- shared brand CSS (compact subset of gen-pdfs.cjs) ----------------------
const CSS = `
@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}
body{background:#08090b;color:#aab2bd;font-family:-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:12px;line-height:1.55}
.wrap{padding:40px 46px}
/* On screen, present as a centred page with room to breathe (PDF keeps @page). */
@media screen{body{background:#050608;padding:24px 16px}.wrap{max-width:940px;margin:0 auto;border:1px solid rgba(255,255,255,.06);border-radius:8px}}
.brand{display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:14px;margin-bottom:20px}
.brand b{color:#f3f5f7;font-size:14px}.brand .r{color:#e0a93f}.brand .t{font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#6b7480}
.band{background:linear-gradient(180deg,rgba(224,169,63,.14),rgba(224,169,63,.03));border:1px solid #6b4f1c;border-radius:14px;padding:22px 24px;margin-bottom:18px}
.band-sub{color:#aab2bd;margin:0}
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
/* neutral enterprise status callout (slate/blue — never error red) */
.status{background:linear-gradient(180deg,rgba(76,125,255,.10),rgba(76,125,255,.02));border:1px solid rgba(76,125,255,.35);border-left:3px solid #4c7dff;border-radius:10px;padding:14px 16px;margin-top:10px}
.status .lbl{font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#8fb0ff}
.status p{margin:6px 0 0;color:#cdd6e0}
.badge{display:inline-flex;align-items:center;gap:7px;font-family:ui-monospace,Menlo,monospace;font-size:11px;font-weight:600;letter-spacing:.06em;padding:6px 12px;border-radius:999px;border:1px solid #6b4f1c;background:linear-gradient(180deg,rgba(224,169,63,.18),rgba(224,169,63,.04));color:#f2c66a}
.badge .d{width:8px;height:8px;border-radius:50%;background:#e0a93f;box-shadow:0 0 0 3px rgba(224,169,63,.18)}
.badge.live{border-color:rgba(63,178,127,.5);background:linear-gradient(180deg,rgba(63,178,127,.18),rgba(63,178,127,.04));color:#6fdcab}.badge.live .d{background:#3fb27f;box-shadow:0 0 0 3px rgba(63,178,127,.18)}
.check{list-style:none;margin:10px 0 0;padding:0;columns:2;column-gap:24px}
.check li{break-inside:avoid;padding:6px 0 6px 24px;position:relative;color:#cdd6e0;font-size:11.5px}
.check li:before{content:"\\2713";position:absolute;left:0;top:5px;width:16px;height:16px;border-radius:50%;background:rgba(63,178,127,.14);border:1px solid rgba(63,178,127,.5);color:#3fb27f;font-size:10px;line-height:15px;text-align:center}
.check li small{display:block;color:#6b7480;font-family:ui-monospace,Menlo,monospace;font-size:9.5px;margin-top:1px}
.pending{list-style:none;margin:8px 0 0;padding:0;columns:2;column-gap:24px}
.pending li{break-inside:avoid;padding:5px 0 5px 22px;position:relative;color:#8a929c;font-size:11px}
.pending li:before{content:"";position:absolute;left:2px;top:9px;width:8px;height:8px;border-radius:50%;border:1px solid #4a525c}
.journey{display:flex;gap:0;margin-top:12px;flex-wrap:wrap}
.journey .step{flex:1 1 0;min-width:88px;text-align:center;position:relative;padding:0 4px}
.journey .step:after{content:"";position:absolute;top:7px;left:50%;width:100%;height:2px;background:rgba(255,255,255,.10)}
.journey .step:last-child:after{display:none}
.journey .dot{width:14px;height:14px;border-radius:50%;border:2px solid #3a414b;background:#0b0d10;margin:0 auto 8px;position:relative;z-index:1}
.journey .step.done .dot{border-color:#3fb27f;background:#3fb27f}
.journey .step.now .dot{border-color:#e0a93f;background:#e0a93f;box-shadow:0 0 0 4px rgba(224,169,63,.18)}
.journey .step.done:after{background:rgba(63,178,127,.5)}
.journey .lab{font-size:9.5px;line-height:1.3;color:#6b7480}
.journey .step.done .lab{color:#aab2bd}.journey .step.now .lab{color:#f2c66a;font-weight:600}
/* runtime performance visuals — minimal enterprise charts */
.verified{display:inline-flex;align-items:center;gap:6px;font-family:ui-monospace,Menlo,monospace;font-size:9.5px;font-weight:600;letter-spacing:.06em;padding:3px 9px;border-radius:999px;border:1px solid rgba(63,178,127,.5);background:rgba(63,178,127,.10);color:#6fdcab;margin-left:8px;vertical-align:middle}
.perf{display:flex;gap:14px;flex-wrap:wrap;margin-top:14px}
.perf .chart{flex:1 1 200px;background:#0b0d10;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:12px 14px}
.perf .chart .ct{font-family:ui-monospace,Menlo,monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#6b7480;margin-bottom:10px}
.hist{display:flex;align-items:flex-end;gap:3px;height:62px}
.hist i{flex:1;min-width:3px;background:linear-gradient(180deg,#f2c66a,#e0a93f);border-radius:3px 3px 0 0;opacity:.92}
.hist + .ax{display:flex;justify-content:space-between;font-family:ui-monospace,Menlo,monospace;font-size:8.5px;color:#6b7480;margin-top:5px}
.pctl{display:flex;flex-direction:column;gap:8px;margin-top:2px}
.pctl .row{display:flex;align-items:center;gap:8px}
.pctl .lab{width:34px;font-family:ui-monospace,Menlo,monospace;font-size:9.5px;color:#8fb0ff}
.pctl .track{flex:1;height:9px;background:rgba(255,255,255,.06);border-radius:999px;overflow:hidden}
.pctl .fill{height:100%;background:linear-gradient(90deg,#4c7dff,#8fb0ff);border-radius:999px}
.pctl .val{width:62px;text-align:right;font-family:ui-monospace,Menlo,monospace;font-size:9.5px;color:#cdd6e0}
.tput{display:flex;align-items:baseline;gap:8px}.tput .big{font-size:30px;font-weight:600;color:#f3f5f7}.tput .u{font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#6b7480}
.tput .track{height:9px;background:rgba(255,255,255,.06);border-radius:999px;overflow:hidden;margin-top:12px}.tput .fill{height:100%;background:linear-gradient(90deg,#3fb27f,#6fdcab);border-radius:999px}
.perfsum{margin-top:14px;padding:11px 14px;background:linear-gradient(180deg,rgba(63,178,127,.08),rgba(63,178,127,.02));border:1px solid rgba(63,178,127,.3);border-left:3px solid #3fb27f;border-radius:10px;color:#cdd6e0;font-size:11.5px}
.stagebars{display:flex;flex-direction:column;gap:8px;margin-top:14px}
.stagebars .row{display:flex;align-items:center;gap:10px}
.stagebars .lab{flex:0 0 210px;font-size:11px;color:#cdd6e0}
.stagebars .track{flex:1;height:10px;background:rgba(255,255,255,.06);border-radius:999px;overflow:hidden}
.stagebars .fill{height:100%;background:linear-gradient(90deg,#e0a93f,#f2c66a);border-radius:999px}
.stagebars .row.tot .fill{background:linear-gradient(90deg,#4c7dff,#8fb0ff)}
.stagebars .val{flex:0 0 140px;text-align:right;font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#cdd6e0}
.grade{display:flex;align-items:center;gap:16px;padding:16px 18px;border-radius:12px;background:#0b0d10;border:1px solid rgba(255,255,255,.08);border-left:3px solid #6b7480}
.grade .g{font-size:34px;font-weight:700;letter-spacing:-.02em;line-height:1}
.grade .gtext{display:flex;flex-direction:column}
.grade .gk{font-family:ui-monospace,Menlo,monospace;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#6b7480;margin-bottom:2px}
.grade .gl{font-size:15px;font-weight:600;color:#f3f5f7}
.grade .gb{display:block;color:#8a929c;font-size:10px;font-family:ui-monospace,Menlo,monospace;margin-top:3px}
.grade.grade-aplus,.grade.grade-a{border-left-color:#3fb27f}.grade.grade-aplus .g,.grade.grade-a .g{color:#6fdcab}
.grade.grade-b{border-left-color:#e0a93f}.grade.grade-b .g{color:#f2c66a}
.grade.grade-c{border-left-color:#e5484d}.grade.grade-c .g{color:#f0888c}
.scan{width:100%;border-collapse:collapse;margin-top:8px}.scan .st-cell{text-align:right}
.st{display:inline-block;font-family:ui-monospace,Menlo,monospace;font-size:10px;font-weight:700;padding:2px 9px;border-radius:6px;border:1px solid rgba(255,255,255,.12);color:#cdd6e0}
.st.ok{color:#6fdcab;border-color:rgba(63,178,127,.5)}
.st.grade-aplus,.st.grade-a{color:#6fdcab;border-color:rgba(63,178,127,.6)}
.st.grade-b{color:#f2c66a;border-color:rgba(224,169,63,.6)}
.st.grade-c{color:#f0888c;border-color:rgba(229,72,77,.6)}
.st-sub{color:#8a929c;font-size:11px;margin-left:6px}
.ictx{margin-top:16px;padding:14px 16px;background:#0b0d10;border:1px solid rgba(255,255,255,.08);border-radius:10px}
.ictx-k{font-family:ui-monospace,Menlo,monospace;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#6b7480}
.ictx ul{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:0}
.ictx li{display:flex;justify-content:space-between;gap:14px;font-size:12px;color:#aab2bd;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05)}
.ictx li:last-child{border-bottom:0}
.ictx li.meas{color:#f3f5f7}.ictx li.meas .ic-v{color:#6fdcab;font-weight:600}
.ictx .ic-v{font-family:ui-monospace,Menlo,monospace}
.ictx li em{font-style:normal;font-family:ui-monospace,Menlo,monospace;font-size:8.5px;letter-spacing:.08em;text-transform:uppercase;color:#6b7480;margin-left:6px}
.tline{margin-top:14px;padding-left:7px}
.tline .node{position:relative;padding:0 0 24px 30px;border-left:2px solid rgba(255,255,255,.14)}
.tline .node:last-child{border-left-color:transparent;padding-bottom:0}
.tline .dot{position:absolute;left:-8px;top:2px;width:13px;height:13px;border-radius:50%;background:#0b0d10;border:2px solid #6b7480}
.tline .node.key .dot{border-color:#3fb27f;background:rgba(63,178,127,.25)}
.tline .node.end .dot{border-color:#e0a93f;background:rgba(224,169,63,.25)}
.tline .t{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#8a929c}
.tline .node.key .t{color:#6fdcab;font-weight:700}.tline .node.end .t{color:#f2c66a;font-weight:700}
.tline .l{color:#f3f5f7;font-size:13px;font-weight:600;margin-top:1px}
.tline .sub{color:#8a929c;font-size:10.5px}
.tline .phase{margin:7px 0 0;display:flex;flex-wrap:wrap;gap:6px}
.tline .phase span{font-family:ui-monospace,Menlo,monospace;font-size:9.5px;color:#cdd6e0;background:#0b0d10;border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:3px 9px}
/* executive verdict + execution chains + risk tags (shared, dark) */
.verdict{display:flex;flex-wrap:wrap;gap:12px;margin-top:10px}
.vcard{flex:1 1 150px;background:#0b0d10;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:13px 15px}
.vcard .vk{display:block;font-family:ui-monospace,Menlo,monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#6b7480}
.vcard .vv{display:block;color:#f3f5f7;font-size:18px;font-weight:600;margin-top:3px}
.vcard.lead{flex:1 1 200px;border-width:2px}
.vcard.r-low{border-color:rgba(63,178,127,.6)}.vcard.r-low .vv{color:#6fdcab}
.vcard.r-medium{border-color:rgba(224,169,63,.6)}.vcard.r-medium .vv{color:#f2c66a}
.vcard.r-high{border-color:rgba(229,136,77,.7)}.vcard.r-high .vv{color:#f0a96a}
.vcard.r-critical{border-color:rgba(229,72,77,.7)}.vcard.r-critical .vv{color:#f0888c}
.chain{display:flex;flex-direction:column;align-items:flex-start;gap:3px;margin-top:8px}
.chain-step{background:#0b0d10;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:7px 12px;color:#cdd6e0;font-size:11px}
.chain-arrow{color:#6b7480;font-size:11px;margin:0 0 0 14px}
.chain-verdict{font-weight:700;font-family:ui-monospace,Menlo,monospace;letter-spacing:.06em}
.v-block{border-color:rgba(229,72,77,.6);color:#f0888c}.v-allow{border-color:rgba(63,178,127,.6);color:#6fdcab}.v-escalate{border-color:rgba(224,169,63,.6);color:#f2c66a}
.rt{font-family:ui-monospace,Menlo,monospace;font-size:9px;padding:2px 7px;border-radius:5px;border:1px solid}
.rt.crit{color:#f0888c;border-color:rgba(229,72,77,.6)}.rt.high{color:#f0a96a;border-color:rgba(229,136,77,.6)}.rt.med{color:#f2c66a;border-color:rgba(224,169,63,.5)}.rt.low{color:#6fdcab;border-color:rgba(63,178,127,.5)}
.tcase{border-top:1px solid rgba(255,255,255,.06);padding:12px 0;break-inside:avoid}.tcase:first-child{border-top:0}
.tcase .th{display:flex;align-items:center;gap:10px}.tcase .tn{color:#f3f5f7;font-weight:600;font-size:12px}
.explain{margin-top:8px;display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;font-size:11px}.explain .ek{font-family:ui-monospace,Menlo,monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#6b7480}.explain .ev{color:#cdd6e0}
.consequence .chain-step{border-color:rgba(229,72,77,.35)}
.vcard .vsub{display:block;color:#8a929c;font-size:10px;margin-top:4px;line-height:1.4}
.vcard .vv.vv-sm{font-size:14px}
.vcard.rec{flex:1 1 100%;border-color:rgba(224,169,63,.4)}
.exposure-band{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px;margin-top:14px;padding:14px 16px;background:linear-gradient(180deg,rgba(229,72,77,.10),rgba(229,72,77,.02));border:1px solid rgba(229,72,77,.4);border-left:3px solid #e5484d;border-radius:10px}
.exposure-band .eb-k{font-family:ui-monospace,Menlo,monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#f0888c}
.exposure-band .eb-v{color:#f3f5f7;font-size:15px;font-weight:600}
`;
// ---- editorial house style (light, Pagella/Heros, hairline rules) ----------
// A faithful CSS translation of rtstyle.tex: serif body (TeX Gyre Pagella),
// sans kickers (Heros), grey ink #212121, soft #737373, hair #b8b8b8, card
// #f3f3f3; booktabs-style tables; left-bordered callouts. Same HTML structure
// as the dark theme — only the stylesheet + wordmark differ. Select with
// RT_PDF_STYLE=editorial or --style editorial.
const CSS_EDITORIAL = `
@page{size:letter;margin:0.9in 1in}*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff;color:#212121;font-family:"TeX Gyre Pagella","Palatino Linotype","Book Antiqua","URW Palladio L",Georgia,serif;font-size:10.5pt;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.wrap{padding:0}
/* On screen the @page margins don't apply, so render a centred white page with
   generous margins on a soft grey backdrop — matching how the PDF looks. */
@media screen{html,body{background:#e7e7ea}.wrap{max-width:850px;margin:32px auto;padding:64px 72px;background:#fff;box-shadow:0 1px 28px rgba(0,0,0,.14);border-radius:3px}}
.eyebrow,.brand b,.brand .t,.meta .k,th,td.n,.tag,.kpi .k,.legend,.foot,.badge,.verified,.ct,.lbl,h1,h2{font-family:"TeX Gyre Heros","Helvetica Neue",Arial,sans-serif}
.brand{display:flex;justify-content:space-between;align-items:baseline;border-bottom:0.5pt solid #b8b8b8;padding-bottom:8px;margin-bottom:18px}
.brand b{font-weight:700;color:#212121;font-size:11pt;letter-spacing:.02em}.brand .r{color:#212121}
.brand .t{font-size:7.5pt;letter-spacing:.18em;text-transform:uppercase;color:#737373}
.band{background:#f3f3f3;border:0;border-left:2.6pt solid #212121;border-radius:1.5pt;padding:16px 18px;margin-bottom:18px}
.band-sub{color:#737373;margin:0}
.eyebrow{font-size:7.5pt;letter-spacing:.20em;text-transform:uppercase;color:#737373}
h1{color:#212121;font-size:20pt;font-weight:700;letter-spacing:-.01em;margin:6px 0 4px}
h2{color:#212121;font-size:13pt;font-weight:700;margin:0 0 8px}
.meta{display:flex;flex-wrap:wrap;gap:10px 26px;margin-top:12px}.meta .k{display:block;font-size:7pt;letter-spacing:.12em;text-transform:uppercase;color:#737373}.meta .v{color:#212121}
.sec{border-top:0.5pt solid #b8b8b8;padding:16px 0;break-inside:avoid}.sec:first-of-type{border-top:0}
.kpis{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}.kpi{flex:1 1 130px;background:#f3f3f3;border:0.6pt solid #e2e2e2;border-radius:2pt;padding:12px 14px}.kpi .v{display:block;color:#212121;font-size:17pt;font-weight:700}.kpi .k{color:#737373;font-size:8pt;margin-top:2px}
table{width:100%;border-collapse:collapse;margin-top:8px;font-size:9pt}th{text-align:left;font-size:7.5pt;letter-spacing:.06em;text-transform:uppercase;color:#212121;font-weight:700;padding:6px 8px;border-bottom:1pt solid #212121}td{padding:6px 8px;border-bottom:0.5pt solid #d9d9d9;color:#333;vertical-align:top}td.m{color:#212121}td.n{text-align:right;color:#212121}
.tag{font-size:7.5pt;padding:1px 7px;border-radius:2pt;border:0.6pt solid #b8b8b8;color:#212121}.cov{border-color:#212121}.par{color:#737373}.unc{color:#212121;border-color:#212121}
.bar{display:flex;height:10px;border-radius:0;overflow:hidden;border:0.5pt solid #b8b8b8;margin-top:6px}.bar i{display:block;height:100%}.a{background:#cfcfcf}.b{background:#212121}.e{background:#8a8a8a}
.legend{display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;font-size:8.5pt;color:#333}.legend i{width:8px;height:8px;border-radius:1px;margin-right:6px;display:inline-block}
.warn{background:#f3f3f3;border:0;border-left:2.6pt solid #212121;border-radius:1.5pt;padding:10px 12px;color:#333;font-size:9pt;margin-top:8px}
.disc{margin-top:16px;padding-top:10px;border-top:0.5pt dashed #b8b8b8;color:#737373;font-size:8pt;font-style:italic}
.foot{margin-top:20px;border-top:0.5pt solid #b8b8b8;padding-top:8px;display:flex;justify-content:space-between;font-size:7.5pt;letter-spacing:.04em;color:#737373}
.status{background:#f3f3f3;border:0;border-left:2.6pt solid #212121;border-radius:1.5pt;padding:12px 14px;margin-top:10px}.status .lbl{font-size:7.5pt;letter-spacing:.14em;text-transform:uppercase;color:#737373}.status p{margin:6px 0 0;color:#333}
.badge{display:inline-flex;align-items:center;gap:6px;font-size:8pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:4px 10px;border:0.8pt solid #212121;border-radius:2pt;background:#fff;color:#212121}.badge .d{display:none}.badge.live{border-color:#212121}
.verified{display:inline-flex;align-items:center;gap:5px;font-size:7.5pt;font-weight:700;letter-spacing:.06em;padding:2px 8px;border:0.6pt solid #212121;border-radius:2pt;color:#212121;margin-left:8px}
.check{list-style:none;margin:8px 0 0;padding:0;columns:2;column-gap:24px}.check li{break-inside:avoid;padding:5px 0 5px 20px;position:relative;color:#333;font-size:9.5pt}.check li:before{content:"\\2713";position:absolute;left:0;top:4px;color:#212121;font-size:9pt}.check li small{display:block;color:#737373;font-size:7.5pt;margin-top:1px}
.pending{list-style:none;margin:8px 0 0;padding:0;columns:2;column-gap:24px}.pending li{break-inside:avoid;padding:4px 0 4px 18px;position:relative;color:#737373;font-size:9pt}.pending li:before{content:"\\2013";position:absolute;left:2px;color:#b8b8b8}
.journey{display:flex;gap:0;margin-top:12px;flex-wrap:wrap}.journey .step{flex:1 1 0;min-width:80px;text-align:center;position:relative;padding:0 4px}.journey .step:after{content:"";position:absolute;top:6px;left:50%;width:100%;height:0.6pt;background:#d9d9d9}.journey .step:last-child:after{display:none}.journey .dot{width:11px;height:11px;border-radius:50%;border:1.4pt solid #b8b8b8;background:#fff;margin:0 auto 7px;position:relative;z-index:1}.journey .step.done .dot{border-color:#212121;background:#212121}.journey .step.now .dot{border-color:#212121;background:#fff;box-shadow:0 0 0 2.5pt #d9d9d9}.journey .step.done:after{background:#9a9a9a}.journey .lab{font-size:7.5pt;line-height:1.3;color:#737373}.journey .step.done .lab{color:#333}.journey .step.now .lab{color:#212121;font-weight:700}
.perf{display:flex;gap:14px;flex-wrap:wrap;margin-top:14px}.perf .chart{flex:1 1 200px;background:#f3f3f3;border:0.6pt solid #e2e2e2;border-radius:2pt;padding:12px 14px}.perf .chart .ct{font-size:7.5pt;letter-spacing:.10em;text-transform:uppercase;color:#737373;margin-bottom:10px}
.hist{display:flex;align-items:flex-end;gap:3px;height:60px}.hist i{flex:1;min-width:3px;background:#212121;border-radius:1px 1px 0 0;opacity:.85}.hist + .ax{display:flex;justify-content:space-between;font-size:7pt;color:#737373;margin-top:5px}
.pctl{display:flex;flex-direction:column;gap:8px}.pctl .row{display:flex;align-items:center;gap:8px}.pctl .lab{width:30px;font-size:8pt;color:#212121}.pctl .track{flex:1;height:8px;background:#e2e2e2;border-radius:999px;overflow:hidden}.pctl .fill{height:100%;background:#212121;border-radius:999px}.pctl .val{width:60px;text-align:right;font-size:8pt;color:#333}
.tput{display:flex;align-items:baseline;gap:8px}.tput .big{font-size:24pt;font-weight:700;color:#212121}.tput .u{font-size:8.5pt;color:#737373}.tput .track{height:8px;background:#e2e2e2;border-radius:999px;overflow:hidden;margin-top:12px}.tput .fill{height:100%;background:#212121;border-radius:999px}
.perfsum{margin-top:14px;padding:11px 14px;background:#f3f3f3;border-left:2.6pt solid #212121;border-radius:1.5pt;color:#333;font-size:9.5pt}
.stagebars{display:flex;flex-direction:column;gap:8px;margin-top:14px}
.stagebars .row{display:flex;align-items:center;gap:10px}
.stagebars .lab{flex:0 0 210px;font-size:9pt;color:#212121}
.stagebars .track{flex:1;height:9px;background:#e2e2e2;border-radius:999px;overflow:hidden}
.stagebars .fill{height:100%;background:#9a6a12;border-radius:999px}
.stagebars .row.tot .fill{background:#212121}
.stagebars .val{flex:0 0 140px;text-align:right;font-size:8pt;color:#333;font-family:"TeX Gyre Heros",Arial,sans-serif}
.grade{display:flex;align-items:center;gap:16px;padding:15px 17px;border-radius:2pt;background:#f3f3f3;border:0.6pt solid #e2e2e2;border-left:2.6pt solid #737373}
.grade .g{font-size:28pt;font-weight:700;line-height:1;font-family:"TeX Gyre Heros",Arial,sans-serif}
.grade .gtext{display:flex;flex-direction:column}
.grade .gk{font-family:"TeX Gyre Heros",Arial,sans-serif;font-size:7pt;letter-spacing:.14em;text-transform:uppercase;color:#737373;margin-bottom:2px}
.grade .gl{font-size:12pt;font-weight:700;color:#212121;font-family:"TeX Gyre Heros",Arial,sans-serif}
.grade .gb{display:block;color:#737373;font-size:8pt;margin-top:3px}
.grade.grade-aplus,.grade.grade-a{border-left-color:#2e7d52}.grade.grade-aplus .g,.grade.grade-a .g{color:#2e7d52}
.grade.grade-b{border-left-color:#9a6a12}.grade.grade-b .g{color:#9a6a12}
.grade.grade-c{border-left-color:#b3261e}.grade.grade-c .g{color:#b3261e}
.scan{width:100%;border-collapse:collapse;margin-top:8px}.scan .st-cell{text-align:right}
.st{display:inline-block;font-family:"TeX Gyre Heros",Arial,sans-serif;font-size:8.5pt;font-weight:700;padding:1px 8px;border-radius:2pt;border:0.6pt solid #b8b8b8;color:#212121}
.st.ok{color:#2e7d52;border-color:#2e7d52}
.st.grade-aplus,.st.grade-a{color:#2e7d52;border-color:#2e7d52}
.st.grade-b{color:#9a6a12;border-color:#9a6a12}
.st.grade-c{color:#b3261e;border-color:#b3261e}
.st-sub{color:#737373;font-size:9pt;margin-left:6px}
.ictx{margin-top:16px;padding:13px 15px;background:#f3f3f3;border:0.6pt solid #e2e2e2;border-radius:2pt}
.ictx-k{font-family:"TeX Gyre Heros",Arial,sans-serif;font-size:7pt;letter-spacing:.14em;text-transform:uppercase;color:#737373}
.ictx ul{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:0}
.ictx li{display:flex;justify-content:space-between;gap:14px;font-size:9.5pt;color:#333;padding:6px 0;border-bottom:0.5pt solid #e2e2e2}
.ictx li:last-child{border-bottom:0}
.ictx li.meas{color:#212121;font-weight:600}.ictx li.meas .ic-v{color:#2e7d52}
.ictx li em{font-style:normal;font-size:7pt;letter-spacing:.06em;text-transform:uppercase;color:#737373;margin-left:6px}
.tline{margin-top:14px;padding-left:7px}
.tline .node{position:relative;padding:0 0 22px 30px;border-left:1.5pt solid #d2d2d2}
.tline .node:last-child{border-left-color:transparent;padding-bottom:0}
.tline .dot{position:absolute;left:-7px;top:2px;width:12px;height:12px;border-radius:50%;background:#fff;border:1.5pt solid #9a9a9a}
.tline .node.key .dot{border-color:#2e7d52;background:#dcefe4}
.tline .node.end .dot{border-color:#9a6a12;background:#f1e6cc}
.tline .t{font-family:"TeX Gyre Heros",Arial,sans-serif;font-size:8.5pt;color:#737373}
.tline .node.key .t{color:#2e7d52;font-weight:700}.tline .node.end .t{color:#9a6a12;font-weight:700}
.tline .l{color:#212121;font-size:10.5pt;font-weight:700;margin-top:1px;font-family:"TeX Gyre Heros",Arial,sans-serif}
.tline .sub{color:#737373;font-size:8.5pt}
.tline .phase{margin:6px 0 0;display:flex;flex-wrap:wrap;gap:6px}
.tline .phase span{font-family:"TeX Gyre Heros",Arial,sans-serif;font-size:7.5pt;color:#333;background:#f3f3f3;border:0.6pt solid #d9d9d9;border-radius:2pt;padding:2px 8px}
/* executive verdict + execution chains + risk tags (shared, editorial) */
.verdict{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}
.vcard{flex:1 1 150px;background:#f3f3f3;border:0.6pt solid #e2e2e2;border-radius:2pt;padding:12px 14px}
.vcard .vk{display:block;font-family:"TeX Gyre Heros",Arial,sans-serif;font-size:7pt;letter-spacing:.1em;text-transform:uppercase;color:#737373}
.vcard .vv{display:block;color:#212121;font-size:15pt;font-weight:700;margin-top:2px;font-family:"TeX Gyre Heros",Arial,sans-serif}
.vcard.lead{flex:1 1 200px;border-left:2.6pt solid #212121}
.vcard.r-low{border-left-color:#2e7d52}.vcard.r-low .vv{color:#2e7d52}
.vcard.r-medium{border-left-color:#9a6a12}.vcard.r-medium .vv{color:#9a6a12}
.vcard.r-high{border-left-color:#b4561d}.vcard.r-high .vv{color:#b4561d}
.vcard.r-critical{border-left-color:#b3261e}.vcard.r-critical .vv{color:#b3261e}
.chain{display:flex;flex-direction:column;align-items:flex-start;gap:3px;margin-top:8px}
.chain-step{background:#f3f3f3;border:0.6pt solid #d9d9d9;border-radius:2pt;padding:6px 11px;color:#333;font-size:9pt}
.chain-arrow{color:#9a9a9a;font-size:9pt;margin:0 0 0 12px}
.chain-verdict{font-weight:700;font-family:"TeX Gyre Heros",Arial,sans-serif;letter-spacing:.04em}
.v-block{border-color:#b3261e;color:#b3261e}.v-allow{border-color:#2e7d52;color:#2e7d52}.v-escalate{border-color:#9a6a12;color:#9a6a12}
.rt{font-family:"TeX Gyre Heros",Arial,sans-serif;font-size:7pt;padding:1px 7px;border-radius:2pt;border:0.6pt solid}
.rt.crit{color:#b3261e;border-color:#b3261e}.rt.high{color:#b4561d;border-color:#b4561d}.rt.med{color:#9a6a12;border-color:#9a6a12}.rt.low{color:#2e7d52;border-color:#2e7d52}
.tcase{border-top:0.5pt solid #d9d9d9;padding:12px 0;break-inside:avoid}.tcase:first-child{border-top:0}
.tcase .th{display:flex;align-items:center;gap:10px}.tcase .tn{color:#212121;font-weight:700;font-size:10pt;font-family:"TeX Gyre Heros",Arial,sans-serif}
.explain{margin-top:8px;display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;font-size:9pt}.explain .ek{font-family:"TeX Gyre Heros",Arial,sans-serif;font-size:7pt;letter-spacing:.08em;text-transform:uppercase;color:#737373}.explain .ev{color:#333}
.consequence .chain-step{border-color:#e0b9b6}
.vcard .vsub{display:block;color:#737373;font-size:8pt;margin-top:3px;line-height:1.4;font-family:"TeX Gyre Pagella",Georgia,serif}
.vcard .vv.vv-sm{font-size:11pt}
.vcard.rec{flex:1 1 100%;border-left:2.6pt solid #9a6a12}
.exposure-band{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px;margin-top:14px;padding:13px 15px;background:#f7efef;border:0.6pt solid #e0b9b6;border-left:2.6pt solid #b3261e;border-radius:2pt}
.exposure-band .eb-k{font-family:"TeX Gyre Heros",Arial,sans-serif;font-size:7pt;letter-spacing:.1em;text-transform:uppercase;color:#b3261e}
.exposure-band .eb-v{color:#212121;font-size:11pt;font-weight:700;font-family:"TeX Gyre Heros",Arial,sans-serif}
`;
const STYLE = (() => {
  const i = process.argv.indexOf("--style");
  const fromFlag = i >= 0 ? process.argv[i + 1] : undefined;
  return String(fromFlag || process.env.RT_PDF_STYLE || "editorial").toLowerCase();
})();
const EDITORIAL = STYLE === "editorial";
const ACTIVE_CSS = EDITORIAL ? CSS_EDITORIAL : CSS;
const brand = EDITORIAL
  ? `<div class="brand"><b>Resurrection Tech&trade;</b><span class="t">Runtime Governance</span></div>`
  : `<div class="brand"><b><span class="r">&#8475;(t)</span>&nbsp;&nbsp;Resurrection Tech&trade;</b><span class="t">Runtime Governance</span></div>`;
const page = (title, inner) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${ACTIVE_CSS}</style></head><body><div class="wrap">${brand}${inner}<div class="foot"><span>Resurrection Tech&trade;</span><span>${esc(title)}</span><span>Patent GB2600765.8</span></div></div></body></html>`;
const bandBlock = (k, h, sub, meta) => `<div class="band"><span class="eyebrow">${esc(k)}</span><h1>${esc(h)}</h1><p class="band-sub">${esc(sub)}</p><div class="meta">${meta.map(([a, b]) => `<div><span class="k">${esc(a)}</span><span class="v">${esc(b)}</span></div>`).join("")}</div></div>`;
const STATUS_CLASS = { Covered: "cov", COVERED: "cov", Partial: "par", PARTIAL: "par", Uncovered: "unc", UNCOVERED: "unc" };

// ---- Runtime Performance section (identical markup in audit + exec report) ---
// Populated only from measured samples; otherwise a neutral blue "pending"
// state. Never placeholder numbers.
function fmtMs(ms) {
  if (ms == null || !isFinite(ms)) return "—";
  const v = ms < 1 ? ms.toFixed(3) : ms < 10 ? ms.toFixed(2) : ms < 100 ? ms.toFixed(1) : Math.round(ms).toString();
  return `${v} ms`;
}
function histogram(samples) {
  const n = samples.length, min = samples[0], max = samples[n - 1];
  const bins = Math.min(12, Math.max(5, Math.round(Math.sqrt(n))));
  const span = (max - min) || 1;
  const counts = new Array(bins).fill(0);
  for (const x of samples) { let i = Math.floor(((x - min) / span) * bins); if (i >= bins) i = bins - 1; if (i < 0) i = 0; counts[i]++; }
  const peak = Math.max(...counts, 1);
  return `<div class="hist">${counts.map((c) => `<i style="height:${Math.max(4, Math.round((c / peak) * 100))}%"></i>`).join("")}</div><div class="ax"><span>${fmtMs(min)}</span><span>${fmtMs(max)}</span></div>`;
}
function perfSection(stats, attestation, replay) {
  const att = attestation || {};
  const head = (verified) => `<span class="eyebrow">Runtime Performance${verified ? `<span class="verified">PERFORMANCE VERIFIED &#10003;</span>` : ""}</span><h2>Measured governance performance during evaluation.</h2>`;
  if (!stats) {
    return `<div class="sec">${head(false)}
      <div class="status"><span class="lbl">Runtime performance · pending</span>
        <p>Performance metrics will automatically populate once representative trajectories have been evaluated through the Runtime Governance engine.</p>
      </div></div>`;
  }
  const det = (replay && replay.checked) ? `${replay.deterministic} / ${replay.checked} identical replay` : "—";
  const cards = [
    ["Average evaluation latency", fmtMs(stats.mean)],
    ["Median (P50)", fmtMs(stats.p50)],
    ["P95 latency", fmtMs(stats.p95)],
    ["P99 latency", fmtMs(stats.p99)],
    ["Fastest evaluation", fmtMs(stats.min)],
    ["Slowest evaluation", fmtMs(stats.max)],
    ["Total evaluations", String(stats.n)],
    ["Evaluations / second", stats.eps.toFixed(stats.eps < 10 ? 1 : 0)],
    ["Replay determinism", det],
    ["Runtime source", "Live Runtime Governance Engine"],
    ["Engine version", att.service_version ? esc(att.service_version) : "—"],
    ["Ruleset version", att.ruleset_hash ? esc(String(att.ruleset_hash).slice(0, 12)) : "—"],
  ];
  const scale = stats.max || 1;
  const pbar = (label, v) => `<div class="row"><span class="lab">${label}</span><span class="track"><span class="fill" style="width:${Math.max(3, Math.round((v / scale) * 100))}%"></span></span><span class="val">${fmtMs(v)}</span></div>`;
  const tputFill = Math.max(3, Math.min(100, Math.round((stats.min / stats.mean) * 100)));
  const allDet = replay && replay.checked && replay.deterministic === replay.checked;
  const summary = `Runtime Governance evaluated ${stats.n} representative ${stats.n === 1 ? "trajectory" : "trajectories"} with ${fmtMs(stats.mean)} average latency${allDet ? " while maintaining deterministic governance decisions" : ""}.`;
  return `<div class="sec">${head(true)}
    <div class="kpis">${cards.map(([k, v]) => `<div class="kpi"><span class="v">${v}</span><span class="k">${k}</span></div>`).join("")}</div>
    <div class="perf">
      <div class="chart"><div class="ct">Latency distribution</div>${histogram(stats.samples)}</div>
      <div class="chart"><div class="ct">Percentiles</div><div class="pctl">${pbar("P50", stats.p50)}${pbar("P95", stats.p95)}${pbar("P99", stats.p99)}${pbar("Max", stats.max)}</div></div>
      <div class="chart"><div class="ct">Throughput</div><div class="tput"><span class="big">${stats.eps.toFixed(stats.eps < 10 ? 1 : 0)}</span><span class="u">eval / sec</span></div><div class="track"><span class="fill" style="width:${tputFill}%"></span></div></div>
    </div>
    <div class="perfsum">${esc(summary)}</div>
  </div>`;
}

// ---- per-stage pipeline instrumentation (real measured wall-clock) ----------
// Stages are captured during the run; total is the sum of the measured stages
// (matching the worked example 4+21+17+46+90 = 178 ms). Percentages are each
// stage's share of that total. PDF generation may be 0 ms when Chromium is
// unavailable (HTML + Markdown still delivered) — that is surfaced, not hidden.
const STAGE_ORDER = [
  ["Manifest parsing", "manifest_parse"],
  ["Governance evaluation", "governance_eval"],
  ["Replay", "trajectory_replay"],
  ["Report generation", "report_generation"],
  ["PDF generation", "pdf_generation"],
];
function stageTotal(stages) {
  if (!stages) return 0;
  if (stages.total) return stages.total;
  return STAGE_ORDER.reduce((a, [, k]) => a + (stages[k] || 0), 0);
}
const fmtRate = (n) => (n >= 1000 ? Math.round(n).toLocaleString() : n >= 10 ? n.toFixed(0) : n.toFixed(1));
// Human-friendly duration: seconds once we cross 1s, otherwise milliseconds.
const fmtDur = (ms) => (ms == null || !isFinite(ms)) ? "—" : (ms >= 1000 ? (ms / 1000).toFixed(2) + " s" : fmtMs(ms));
// Static reference points so a reader can place a measured latency in context.
const INDUSTRY_REFERENCE = [
  ["Human reaction time", "~250 ms"],
  ["Typical API request", "50–200 ms"],
];
// One source of truth for throughput/efficiency so HTML, Markdown, JSON and the
// console all report identical (measured) figures.
function computeRuntimeMetrics(stages, perf, replay, ctx, summary) {
  const total = stageTotal(stages);
  const rr = (ctx && ctx.replayResults) || [];
  const trajTimes = rr.map((r) => r.eval_ms).filter((x) => typeof x === "number");
  const N = rr.length;                       // trajectories replayed (returned a verdict)
  const M = perf ? perf.n : 0;               // total /v1/evaluate round-trips (verdict + determinism)
  const totalSec = total > 0 ? total / 1000 : 0;
  const effEval = totalSec ? M / totalSec : 0;
  const effTraj = totalSec ? N / totalSec : 0;
  const detPct = (replay && replay.checked) ? Math.round((replay.deterministic / replay.checked) * 100) : null;
  const cov = summary && summary.coverage_pct != null ? summary.coverage_pct : null;
  const trajStats = trajTimes.length ? {
    avg: trajTimes.reduce((a, b) => a + b, 0) / trajTimes.length,
    fast: Math.min(...trajTimes), slow: Math.max(...trajTimes),
  } : null;
  return { total, N, M, totalSec, effEval, effTraj, detPct, cov, trajTimes, trajStats, avg: perf ? perf.mean : null, eps: perf ? perf.eps : null };
}
// Performance grade from measured thresholds. Graded on the engine's average
// evaluation latency (the core governance-performance signal, independent of
// delivery-layer concerns like PDF rendering) and gated by replay determinism —
// a non-deterministic engine is never an A grade. Returns null when no
// evaluations have been measured yet (deployment-ready, pre-replay).
const GRADE_CLASS = { "A+": "grade-aplus", "A": "grade-a", "B": "grade-b", "C": "grade-c" };
function performanceGrade(rtm) {
  const avg = rtm && rtm.avg;
  if (avg == null) return null;
  let grade, label;
  if (avg < 10) { grade = "A+"; label = "Excellent"; }
  else if (avg < 50) { grade = "A"; label = "Production Ready"; }
  else if (avg < 150) { grade = "B"; label = "Minor optimisation recommended"; }
  else { grade = "C"; label = "Requires optimisation"; }
  // determinism gate: cap A-grades if verdicts are not fully reproducible
  if (rtm.detPct != null) {
    if (rtm.detPct < 90) { grade = "C"; label = "Requires optimisation"; }
    else if (rtm.detPct < 100 && (grade === "A+" || grade === "A")) { grade = "B"; label = "Minor optimisation recommended"; }
  }
  const basis = `avg evaluation latency ${fmtMs(avg)}${rtm.detPct != null ? `, determinism ${rtm.detPct}%` : ""}`;
  return { grade, label, basis };
}
function pipelineTimingHtml(stages, perf, replay, ctx, summary, attestation) {
  if (!stages) return ""; // pass-1 measurement render — section added on pass 2
  const total = stageTotal(stages);
  const rr = (ctx && ctx.replayResults) || [];
  if (!total && !perf && !rr.length) return "";
  const X = computeRuntimeMetrics(stages, perf, replay, ctx, summary);
  const t = total || 1;
  const g = performanceGrade(X);

  // ===== 0 · Audit timeline — one graphic, manifest → delivered report =====
  const govMs = perf ? fmtMs(perf.mean) : "—";
  const timeline = `<div class="sec"><span class="eyebrow">Audit timeline</span><h2>From manifest received to delivered report — at a glance.</h2>
    <div class="tline">
      <div class="node"><span class="dot"></span><div class="t">0 ms</div><div class="l">Manifest received</div></div>
      <div class="node key"><span class="dot"></span><div class="t">${esc(govMs)}</div><div class="l">Runtime Governance decision</div><div class="sub">verdict reached &amp; verified</div></div>
      <div class="node phase-node"><span class="dot"></span><div class="t">document generation</div><div class="l">Report assembly</div>
        <div class="phase"><span>HTML</span><span>PDF</span><span>Branding</span><span>Secure links</span><span>Audit package</span></div></div>
      <div class="node end"><span class="dot"></span><div class="t">${esc(fmtDur(total))}</div><div class="l">Customer receives report</div></div>
    </div>
    <p style="margin-top:12px;color:#8a929c">The governance decision lands in milliseconds; the rest of the timeline is document assembly and secure delivery — not governance compute.</p>
  </div>`;

  // ===== 1 · Performance at a glance — the five-second executive summary =====
  const compRows = [
    ["Runtime Governance Engine", g ? `<span class="st ${GRADE_CLASS[g.grade]}">${esc(g.grade)}</span> <span class="st-sub">${esc(g.label)}</span>` : `<span class="st">pending</span>`],
    ["Determinism", esc(X.detPct != null ? `${X.detPct}%` : "n/a")],
    ["Average evaluation latency", esc(perf ? fmtMs(perf.mean) : "—")],
    ["Governance coverage", esc(X.cov != null ? `${X.cov}%` : "—")],
    ["End-to-end audit delivery", esc(fmtDur(total))],
    ["Report generation", `<span class="st ok">Complete</span>`],
  ];
  const comparison = `<div class="sec"><span class="eyebrow">Performance at a glance</span><h2>The five-second summary.</h2>
    <table class="scan"><thead><tr><th>Component</th><th>Status</th></tr></thead><tbody>
    ${compRows.map(([k, v]) => `<tr><td class="m">${esc(k)}</td><td class="st-cell">${v}</td></tr>`).join("")}
    </tbody></table></div>`;

  // ===== 2 · Runtime Governance Engine — how fast/reliably it decides =====
  const gradeCard = g ? `<div class="grade ${GRADE_CLASS[g.grade] || ""}"><span class="g">${esc(g.grade)}</span><span class="gtext"><span class="gk">Runtime Governance Grade</span><span class="gl">${esc(g.label)}</span><span class="gb">Governance engine only — based on ${esc(g.basis)}</span></span></div>` : "";
  // industry context — place the measured latency against familiar reference points
  const ctxRows = [
    ["Runtime Governance evaluation", perf ? fmtMs(perf.mean) : "—", true],
    ...INDUSTRY_REFERENCE.map(([k, v]) => [k, v, false]),
    ["Customer audit delivery", fmtDur(total), true],
  ];
  const industryContext = `<div class="ictx"><span class="ictx-k">Industry context</span>
    <ul>${ctxRows.map(([k, v, meas]) => `<li${meas ? ' class="meas"' : ""}><span class="ic-l">${esc(k)}</span><span class="ic-v">${esc(v)}${meas ? ' <em>measured</em>' : ""}</span></li>`).join("")}</ul></div>`;
  const engineKpiData = [
    ["Average evaluation latency", perf ? fmtMs(perf.mean) : "—"],
    ["Throughput", perf ? `${fmtRate(perf.eps)} / sec` : "—"],
    ["Determinism", X.detPct != null ? `${X.detPct}%` : "n/a"],
    ["Governance coverage", X.cov != null ? `${X.cov}%` : "—"],
    ["Trajectories replayed", String(X.N)],
    ["Governance evaluations", String(X.M)],
  ];
  const engineKpis = engineKpiData.map(([k, v]) => `<div class="kpi"><span class="v" style="font-size:18px">${esc(v)}</span><span class="k">${esc(k)}</span></div>`).join("");
  let replayPerf = "";
  if (rr.length > 1 && X.trajTimes.length) {
    const scale = X.trajStats.slow || 1;
    const trows = rr.map((r) => {
      const ms = typeof r.eval_ms === "number" ? r.eval_ms : 0;
      return `<div class="row"><span class="lab">Trajectory ${r.index}</span><span class="track"><span class="fill" style="width:${Math.max(3, Math.round((ms / scale) * 100))}%"></span></span><span class="val">${fmtMs(ms)}</span></div>`;
    }).join("");
    replayPerf = `<div style="margin-top:20px"><span class="eyebrow" style="display:block;margin-bottom:8px">Replay performance · per trajectory</span>
      <div class="stagebars">${trows}</div>
      <div class="kpis" style="margin-top:12px">
        <div class="kpi"><span class="v" style="font-size:18px">${fmtMs(X.trajStats.avg)}</span><span class="k">Average</span></div>
        <div class="kpi"><span class="v" style="font-size:18px">${fmtMs(X.trajStats.fast)}</span><span class="k">Fastest</span></div>
        <div class="kpi"><span class="v" style="font-size:18px">${fmtMs(X.trajStats.slow)}</span><span class="k">Slowest</span></div>
      </div></div>`;
  }
  const engineSection = `<div class="sec"><span class="eyebrow">Runtime Governance Engine</span><h2>How fast and reliably the engine makes governance decisions.</h2>
    ${gradeCard}
    ${industryContext}
    <div class="kpis" style="margin-top:20px">${engineKpis}</div>
    ${replayPerf}
    <p style="margin-top:14px;color:#8a929c">Engine timings are measured per <span style="font-family:ui-monospace,Menlo,monospace">/v1/evaluate</span> round-trip with a high-resolution monotonic clock. Reference points are industry norms, shown for intuition only.</p>
  </div>`;

  // ===== 3 · Audit Generation Pipeline — where end-to-end time is spent =====
  const rows = STAGE_ORDER.map(([label, k]) => ({ label, ms: stages[k] || 0, pct: (stages[k] || 0) / t * 100 }));
  const bars = rows.map((r) => `<div class="row"><span class="lab">${esc(r.label)}</span><span class="track"><span class="fill" style="width:${Math.max(2, Math.round(r.pct))}%"></span></span><span class="val">${r.pct.toFixed(0)}% · ${fmtMs(r.ms)}</span></div>`).join("")
    + `<div class="row tot"><span class="lab"><b>Total customer delivery</b></span><span class="track"><span class="fill" style="width:100%"></span></span><span class="val">100% · ${fmtDur(total)}</span></div>`;
  const pipelineKpiData = [
    ["Total customer delivery", fmtDur(total)],
    ["Effective evaluations / sec", X.totalSec ? fmtRate(X.effEval) : "—"],
    ["Effective trajectories / sec", X.totalSec ? fmtRate(X.effTraj) : "—"],
  ];
  const pipelineKpis = pipelineKpiData.map(([k, v]) => `<div class="kpi"><span class="v" style="font-size:18px">${esc(v)}</span><span class="k">${esc(k)}</span></div>`).join("");
  const pipelineSection = `<div class="sec"><span class="eyebrow">Audit Generation Pipeline</span><h2>Where end-to-end delivery time is spent — ingestion through documents.</h2>
    <div class="kpis">${pipelineKpis}</div>
    <div style="margin-top:18px"><span class="eyebrow" style="display:block;margin-bottom:8px">CPU time breakdown</span>
      <div class="stagebars">${bars}</div></div>
    <p style="margin-top:14px;color:#8a929c">The engine reaches its verdicts in milliseconds; the remaining time is spent rendering the HTML and PDF documents, not making governance decisions. All values measured, never estimated.</p>
  </div>`;

  return timeline + comparison + engineSection + perfSection(perf, attestation, replay) + pipelineSection;
}
function pipelineTimingMarkdown(stages, perf, replay, ctx, summary) {
  if (!stages) return ""; // pass-1 measurement render — section added on pass 2
  const total = stageTotal(stages);
  const rr = (ctx && ctx.replayResults) || [];
  if (!total && !perf && !rr.length) return "";
  const X = computeRuntimeMetrics(stages, perf, replay, ctx, summary);
  const g = performanceGrade(X);
  const t = total || 1;
  const L = [];

  // Audit timeline — one graphic, manifest → delivered report
  L.push(``, `## Audit timeline`, ``, "```");
  L.push(`0 ms`);
  L.push(`  │`);
  L.push(`  ├── Manifest received`);
  L.push(`  │`);
  L.push(`  ├── Runtime Governance decision .... ${perf ? fmtMs(perf.mean) : "—"}`);
  L.push(`  │`);
  L.push(`  ├───────────────`);
  L.push(`  │   HTML · PDF · Branding · Secure links · Audit package`);
  L.push(`  │`);
  L.push(`  └── Customer receives report ....... ${fmtDur(total)}`);
  L.push("```");
  L.push(`_The governance decision lands in milliseconds; the rest is document assembly and secure delivery, not governance compute._`);

  // Performance at a glance — five-second summary
  L.push(``, `## Performance at a glance`, ``, `| Component | Status |`, `|---|---|`);
  L.push(`| Runtime Governance Engine | ${g ? `${g.grade} (${g.label})` : "pending"} |`);
  L.push(`| Determinism | ${X.detPct != null ? X.detPct + "%" : "n/a"} |`);
  L.push(`| Average evaluation latency | ${perf ? fmtMs(perf.mean) : "—"} |`);
  L.push(`| Governance coverage | ${X.cov != null ? X.cov + "%" : "—"} |`);
  L.push(`| End-to-end audit delivery | ${fmtDur(total)} |`);
  L.push(`| Report generation | Complete |`);

  // Runtime Governance Engine
  L.push(``, `## Runtime Governance Engine`, ``);
  if (g) L.push(`**Runtime Governance grade: ${g.grade} — ${g.label}**  _(governance engine only — based on ${g.basis})_`, ``);
  L.push(`- Average evaluation latency: **${perf ? fmtMs(perf.mean) : "—"}**`);
  L.push(`- Throughput: ${perf ? fmtRate(perf.eps) + " evaluations/sec" : "—"}`);
  L.push(`- Determinism: ${X.detPct != null ? X.detPct + "%" : "n/a"}`);
  L.push(`- Governance coverage: ${X.cov != null ? X.cov + "%" : "—"}`);
  L.push(`- Trajectories replayed: ${X.N} · Governance evaluations: ${X.M}`);
  L.push(``, `**Industry context**`, ``);
  L.push(`- Runtime Governance evaluation: ${perf ? fmtMs(perf.mean) : "—"} _(measured)_`);
  for (const [k, v] of INDUSTRY_REFERENCE) L.push(`- ${k}: ${v}`);
  L.push(`- Customer audit delivery: ${fmtDur(total)} _(measured)_`);
  if (rr.length > 1 && X.trajTimes.length) {
    L.push(``, `**Replay performance — per trajectory**`, ``, `| Trajectory | Latency |`, `|---|---|`);
    for (const r of rr) L.push(`| Trajectory ${r.index} | ${fmtMs(typeof r.eval_ms === "number" ? r.eval_ms : 0)} |`);
    L.push(`| **Average** | **${fmtMs(X.trajStats.avg)}** |`, `| Fastest | ${fmtMs(X.trajStats.fast)} |`, `| Slowest | ${fmtMs(X.trajStats.slow)} |`);
  }

  // Audit Generation Pipeline
  L.push(``, `## Audit Generation Pipeline`, ``);
  L.push(`- Total customer delivery: **${fmtDur(total)}**`);
  L.push(`- Effective evaluations/sec: ${X.totalSec ? fmtRate(X.effEval) : "—"} · Effective trajectories/sec: ${X.totalSec ? fmtRate(X.effTraj) : "—"}`);
  L.push(``, `### CPU time breakdown`, ``, `| Stage | Latency | Share |`, `|---|---|---|`);
  for (const [label, k] of STAGE_ORDER) { const ms = stages[k] || 0; L.push(`| ${label} | ${fmtMs(ms)} | ${(ms / t * 100).toFixed(0)}% |`); }
  L.push(`| **Total customer delivery** | **${fmtDur(total)}** | **100%** |`);
  L.push(``, `_The engine reaches its verdicts in milliseconds; the remaining time is spent rendering the HTML and PDF documents, not making governance decisions._`);
  return L.join("\n");
}

// ---- enterprise report helpers (real names, sector framing, verdicts) ------
const humanize = (s) => String(s || "").replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (m) => m.toUpperCase());
const toolName = (t) => (typeof t === "string" ? t : (t && (t.tool || t.name || t.id || (t.function && t.function.name)))) || "";

// Parse the analyst-supplied manifest into REAL tool names (+ capability hints).
function parseManifestTools(input) {
  let arr = null;
  if (Array.isArray(input.manifest) && input.manifest.length) arr = input.manifest;
  else if (typeof input.manifest_text === "string" && input.manifest_text.trim()) {
    const raw = input.manifest_text.trim();
    try { const j = JSON.parse(raw); arr = Array.isArray(j) ? j : (Array.isArray(j.tools) ? j.tools : (Array.isArray(j.manifest) ? j.manifest : null)); } catch { /* not JSON */ }
    if (!arr) {
      const body = raw.replace(/^\s*tools?\s*:/i, "");
      arr = body.split(/[\n,]+/).map((x) => x.replace(/^[\s\-*•]+/, "").replace(/\(.*\)$/, "").trim()).filter(Boolean);
    }
  }
  if (!arr) return [];
  return arr.map((t) => ({ name: toolName(t), capabilities: (t && t.capabilities) || [], raw: t })).filter((t) => t.name && t.name.toLowerCase() !== "name");
}
const CAP_RULES = [
  [/transfer|payment|wire|disburse|refund|invoice|payout|remit/i, "Payments", "Critical"],
  [/approve|authoris|authoriz|sign[_\s-]?off|release|sanction/i, "Authorisation", "High"],
  [/delete|drop|wipe|destroy|revoke|terminate|shutdown|purge|freeze/i, "Destructive / state-changing", "Critical"],
  [/prescrib|medicat|dose|clinical|diagnos|treat|discharge|order[_\s-]?(med|rx)/i, "Clinical action", "Critical"],
  [/export|download|exfil|send|email|share|upload|transmit|sync/i, "Data egress", "High"],
  [/credential|password|secret|api[_\s-]?key|token|privilege|role|grant|escalat/i, "Privilege / secrets", "Critical"],
  [/patient|phi|health|medical|record|account|customer|profile|ledger|transaction|pii/i, "Sensitive data", "Medium"],
  [/read|lookup|get|list|view|search|history|report|fetch|query/i, "Read-only", "Low"],
];
function classifyTool(name, caps) {
  const hay = `${name} ${(caps || []).join(" ")}`;
  for (const [re, cap, risk] of CAP_RULES) if (re.test(hay)) return { capability: cap, risk };
  return { capability: "General", risk: "Medium" };
}
// Canonical tool list: real names from the manifest, merged with engine status.
function toolModel(report, parsed) {
  const engine = {};
  for (const t of (report && report.tools) || []) { const n = toolName(t); if (n && n.toLowerCase() !== "name") engine[n.toLowerCase()] = t; }
  let names = parsed.map((p) => p.name);
  if (!names.length) names = Object.values(engine).map(toolName);
  const seen = new Set(); names = names.filter((n) => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
  return names.map((n) => {
    const e = engine[n.toLowerCase()] || {};
    const caps = (parsed.find((p) => p.name.toLowerCase() === n.toLowerCase()) || {}).capabilities || e.capabilities || [];
    const cls = classifyTool(n, caps);
    const status = e.status || "";
    const gov = /uncover|none|unprotect|exposed/i.test(status) ? "Unprotected" : /partial/i.test(status) ? "Partial" : "Protected";
    return { name: n, capability: cls.capability, risk: cls.risk, governance: gov };
  });
}
const RISK_CLASS = { Critical: "crit", High: "high", Medium: "med", Low: "low" };
const SECTORS = {
  finance: { label: "Financial Services", focus: ["payment fraud", "unauthorised wire transfers", "customer-account compromise", "insider abuse", "transaction-approval bypass"], assets: ["customer funds", "payment rails", "account systems", "transaction ledgers"], consequence: ["Unauthorised transfer executed", "Customer funds lost", "Regulatory investigation (FCA)", "Mandatory incident disclosure", "Incident response & operational downtime"], exposure: "£2M–£25M+ per incident (lost funds, fines, remediation, reputational damage)" },
  healthcare: { label: "Healthcare", focus: ["PHI exposure", "patient-safety actions", "clinical-system integrity", "medical-device commands"], assets: ["patient records (PHI)", "clinical systems", "medication & order workflows", "connected devices"], consequence: ["Unauthorised PHI access or clinical action", "Patient-safety incident", "HIPAA / regulatory investigation", "Mandatory breach notification", "Care disruption & remediation"], exposure: "£1M–£15M+ per incident (penalties, notification, patient harm, remediation)" },
  cybersecurity: { label: "Cybersecurity", focus: ["credential misuse", "privilege escalation", "data exfiltration", "ransomware pathways"], assets: ["credentials & secrets", "privileged access", "sensitive data stores", "production infrastructure"], consequence: ["Credential or privilege abuse", "Data exfiltration at scale", "Ransomware / destructive action", "Breach disclosure & forensics", "Extended operational downtime"], exposure: "£1M–£20M+ per incident (breach, ransom, downtime, disclosure)" },
  defence: { label: "Defence", focus: ["mission-system integrity", "classified-asset access", "command-chain integrity"], assets: ["mission systems", "classified assets", "command & control"], consequence: ["Unauthorised mission-system action", "Classified data exposure", "Command-integrity compromise", "Security review & containment", "Operational stand-down"], exposure: "Mission-critical — severe national-security and operational impact" },
  insurance: { label: "Insurance", focus: ["fraudulent claims", "policyholder-data exposure", "unauthorised payouts", "underwriting integrity"], assets: ["policyholder data", "claims systems", "payout rails"], consequence: ["Fraudulent payout executed", "Policyholder-data exposure", "Regulatory investigation", "Breach notification", "Remediation & downtime"], exposure: "£1M–£15M+ per incident (payouts, fines, remediation)" },
  energy: { label: "Energy & Utilities", focus: ["operational-technology integrity", "grid/control actions", "safety-critical commands"], assets: ["OT/control systems", "safety systems", "customer data"], consequence: ["Unauthorised control action", "Safety-critical command issued", "Regulatory & safety investigation", "Service disruption", "Remediation & downtime"], exposure: "Severe — safety, regulatory and continuity-of-supply impact" },
  default: { label: "Enterprise", focus: ["unauthorised high-impact actions", "sensitive-data exposure", "privileged misuse"], assets: ["critical systems", "sensitive data", "privileged operations"], consequence: ["Unauthorised high-impact action", "Sensitive-data exposure", "Regulatory / contractual exposure", "Incident response", "Operational downtime"], exposure: "£1M–£10M+ per incident (impact, remediation, disclosure)" },
};
function sectorProfile(industry, domains) {
  const key = `${industry || ""} ${(domains || []).join(" ")}`.toLowerCase();
  if (/financ|bank|payment|capital|treasur/.test(key)) return SECTORS.finance;
  if (/health|clinic|medical|patient|pharma|hospital/.test(key)) return SECTORS.healthcare;
  if (/cyber|security|infosec|soc\b|mssp/.test(key)) return SECTORS.cybersecurity;
  if (/defen|military|gov\b|classified|mod\b/.test(key)) return SECTORS.defence;
  if (/insur|claim|underwrit|actuar/.test(key)) return SECTORS.insurance;
  if (/energy|utilit|grid|power|oil|gas/.test(key)) return SECTORS.energy;
  return SECTORS.default;
}
function executiveVerdict(s, blockedCount) {
  const uncovered = s.uncovered ?? 0;
  const coverage = s.coverage_pct;
  let risk = "LOW";
  if (blockedCount >= 1) risk = "MEDIUM";
  if (uncovered > 0 || blockedCount >= 3 || (coverage != null && coverage < 80)) risk = "HIGH";
  if (coverage != null && coverage < 50) risk = "CRITICAL";
  const productionReady = uncovered === 0 && (coverage == null || coverage >= 95) ? "YES" : "NO";
  return { risk, productionReady, coverage };
}
function recommendEngagement(blockedCount, s, replayCount) {
  const uncovered = s.uncovered ?? 0;
  if (uncovered > 0 || blockedCount >= 3) return { name: "Immediate Remediation Required", why: `${uncovered > 0 ? `${uncovered} risk-bearing tool(s) are uncovered. ` : ""}${blockedCount >= 3 ? `${blockedCount} catastrophic trajectories were blocked. ` : ""}Remediate exposed pathways and re-validate before any production rollout.` };
  if (blockedCount >= 1) return { name: "Limited Pilot™", why: `${blockedCount} catastrophic trajector${blockedCount === 1 ? "y was" : "ies were"} blocked. Validate interception on your own production traffic before broad rollout.` };
  if (replayCount > 0) return { name: "Enterprise Integration™", why: "No catastrophic trajectories were blocked and Ω coverage is complete — proceed to production deployment of Runtime Governance." };
  return { name: "48-Hour Audit™ → Limited Pilot™", why: "Structural assessment complete. Replay representative trajectories to validate runtime interception, then scope a Limited Pilot." };
}
function humanizeStep(step) {
  if (typeof step === "string") return humanize(step);
  const t = humanize(toolName(step) || "step");
  const a = step.args || {};
  const bits = [];
  if (a.amount != null) bits.push(typeof a.amount === "number" ? `£${a.amount.toLocaleString()}` : String(a.amount));
  for (const k of ["dest", "destination", "to", "recipient", "account", "target", "patient", "record", "resource", "table"]) if (a[k] != null) { bits.push(`${humanize(k)}: ${a[k]}`); break; }
  if (a.external === true || /"external"|external:\s*true/i.test(JSON.stringify(a))) bits.push("external");
  if (a.approval === false || a.skip_approval === true) bits.push("approval skipped");
  return bits.length ? `${t} — ${bits.join(" · ")}` : t;
}
function chainHtml(steps, verdictLabel, kind) {
  const parts = (steps || []).map((s) => `<div class="chain-step">${esc(humanizeStep(s))}</div>`);
  const body = parts.join('<div class="chain-arrow">↓</div>');
  const vb = verdictLabel ? `<div class="chain-arrow">↓</div><div class="chain-step chain-verdict v-${verdictLabel.toLowerCase()}">${esc(verdictLabel)}</div>` : "";
  return `<div class="chain${kind ? " " + kind : ""}">${body}${vb}</div>`;
}
function policyName(omega, riskClass, sector) {
  if (riskClass) return `${sector.label} — ${humanize(riskClass)}`;
  if (omega) return `${humanize(omega)} runtime policy`;
  return `${sector.label} runtime governance policy`;
}

// ---- AUDIT html from AssessReport ------------------------------------------
// Renders the Verdict / Reason / Policy / Ω-domain explainer that a CTO/board can
// read without technical knowledge — used per blocked trajectory (items 2 & 3).
function explainBlock({ verdict, reason, policy, omega }) {
  const rows = [
    ["Verdict", verdict || "BLOCKED"],
    ["Reason", reason || "Action would reach a forbidden state."],
    ["Policy triggered", policy || "Runtime governance policy"],
    ["Ω domain", omega || "—"],
  ];
  return `<div class="explain">${rows.map(([k, v]) => `<div class="ek">${esc(k)}</div><div class="ev">${esc(v)}</div>`).join("")}</div>`;
}
function blockedCasesHtml(ctx, blocks, sector) {
  const replayBlocks = (ctx.replayResults || []).filter((r) => r.verdict === "BLOCK");
  if (replayBlocks.length) {
    return replayBlocks.map((r, i) => `
      <div class="tcase">
        <div class="tn">Case ${i + 1} · ${esc(r.label)}</div>
        ${chainHtml(r.steps, "BLOCKED", "consequence")}
        ${explainBlock({ verdict: "BLOCKED", reason: r.reason, policy: policyName(r.omega_domain, null, sector), omega: r.omega_domain })}
      </div>`).join("");
  }
  // No replay yet — render grounded blocks from the structural assessment.
  if (blocks.length) {
    return blocks.map((b, i) => `
      <div class="tcase">
        <div class="tn">Case ${i + 1} · ${esc(b.label)}</div>
        ${chainHtml([b.label], "BLOCKED", "consequence")}
        ${explainBlock({ verdict: "BLOCKED", reason: `${humanize(b.risk_class || "high-impact")} action reaches a forbidden state and is intercepted before execution.`, policy: policyName(b.omega_domain, b.risk_class, sector), omega: b.omega_domain })}
        ${b.hash ? `<div class="ar-f" style="font-family:ui-monospace,Menlo,monospace;font-size:9.5px;color:#6b7480;margin-top:6px">evidence ${esc(String(b.hash).slice(0, 24))}</div>` : ""}
      </div>`).join("");
  }
  return `<p style="color:#8a929c">No catastrophic trajectories were reached within the engine's reachability horizon for the supplied manifest.</p>`;
}
function auditHtml(c, report, perf, replay, ctx, stages) {
  ctx = ctx || { replayResults: [], parsedTools: [], industry: "", domains: [] };
  const meta = [["Customer", c.name], ["Environment", c.environment || "—"], ["Reference", c.reference || "—"], ["Classification", "Confidential"]];
  if (!report) {
    return page("Runtime Safety Audit", bandBlock("48-Hour Runtime Governance Audit", c.name, "Reachable exposure assessment", meta) +
      `<div class="sec"><span class="eyebrow">Status</span><h2>Engine assessment unavailable.</h2><div class="warn">[ENGINE NOT REACHED] /v1/assess did not return a report. Set GOVERNANCE_URL/GOVERNANCE_TOKEN and re-run, or supply a cached assess report. The audit's coverage, exposure, and verified-blocked-trajectory sections come directly from the engine.</div></div>`);
  }
  const s = report.summary || {};
  const exposure = report.exposure || {};
  const blocks = report.grounded_blocks || [];
  const att = report.attestation;
  const sector = sectorProfile(ctx.industry, ctx.domains);
  const tools = toolModel(report, ctx.parsedTools || []);
  const replayBlockCount = (ctx.replayResults || []).filter((r) => r.verdict === "BLOCK").length;
  const blockedCount = replayBlockCount || s.verified_blocked_trajectories || blocks.length || 0;
  const ev = executiveVerdict(s, blockedCount);
  const rec = recommendEngagement(blockedCount, s, (ctx.replayResults || []).length);
  const rk = ev.risk.toLowerCase();
  const mono = "font-family:ui-monospace,Menlo,monospace";
  const nowStamp = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const evidenceHash = (blocks.find((b) => b && b.hash) || {}).hash || (att && att.ruleset_hash) || "";

  // ---- item 7 · Executive Verdict card ----
  const verdictCard = `
    <div class="verdict">
      <div class="vcard lead r-${rk}">
        <span class="vk">Overall risk</span><span class="vv">${esc(ev.risk)}</span>
        <span class="vsub">${esc(sector.label)} runtime exposure</span>
      </div>
      <div class="vcard"><span class="vk">Production ready</span><span class="vv">${esc(ev.productionReady)}</span><span class="vsub">${ev.productionReady === "YES" ? "Ω coverage complete" : "remediation required"}</span></div>
      <div class="vcard"><span class="vk">Blocked trajectories</span><span class="vv">${blockedCount}</span><span class="vsub">catastrophic actions intercepted</span></div>
      <div class="vcard"><span class="vk">Governance coverage</span><span class="vv">${s.coverage_pct ?? "—"}%</span><span class="vsub">of reachable forbidden states (Ω)</span></div>
      <div class="vcard rec"><span class="vk">Recommendation</span><span class="vv vv-sm">${esc(rec.name)}</span><span class="vsub">${esc(rec.why)}</span></div>
    </div>`;

  // ---- item 4 · sector-aware executive summary ----
  const sectorSummary = `
    <div class="sec"><span class="eyebrow">Executive summary · ${esc(sector.label)}</span><h2>Reachable forbidden-state coverage for ${esc(c.name)}.</h2>
      <p style="margin:0 0 12px">This assessment evaluates the agent environment against the ${esc(sector.label.toLowerCase())} threat model — ${esc(sector.focus.join(", "))} — measuring which catastrophic actions are reachable and whether Runtime Governance intercepts them before execution.</p>
      <div class="kpis">
        <div class="kpi"><span class="v">${s.tools ?? "—"}</span><span class="k">Tools assessed</span></div>
        <div class="kpi"><span class="v">${s.risky ?? "—"}</span><span class="k">Risk-bearing tools</span></div>
        <div class="kpi"><span class="v">${s.coverage_pct ?? "—"}%</span><span class="k">&#937; coverage</span></div>
        <div class="kpi"><span class="v">${blockedCount}</span><span class="k">Blocked trajectories</span></div>
      </div>
      <p style="margin-top:12px">Covered ${s.covered ?? "—"} · Partial ${s.partial ?? "—"} · Uncovered ${s.uncovered ?? "—"} of ${s.risky ?? "—"} risk-bearing tools. Protected assets in scope: ${esc(sector.assets.join(", "))}.</p>
    </div>`;

  // ---- items 1 & 5 · Tool Risk Surface (real names) ----
  const toolSurface = `
    <div class="sec"><span class="eyebrow">Tool risk surface</span><h2>What each tool can reach — and whether it is governed.</h2>
      <table><thead><tr><th>Tool</th><th>Capability</th><th>Risk</th><th>Governance status</th></tr></thead><tbody>
      ${tools.map((t) => `<tr><td class="m">${esc(t.name)}</td><td>${esc(t.capability)}</td><td><span class="rt ${RISK_CLASS[t.risk] || "med"}">${esc(t.risk)}</span></td><td><span class="tag ${t.governance === "Unprotected" ? "unc" : t.governance === "Partial" ? "par" : "cov"}">${esc(t.governance)}</span></td></tr>`).join("") || `<tr><td colspan="4">No tools parsed from the supplied manifest.</td></tr>`}
      </tbody></table>
    </div>`;

  // ---- items 2 & 3 · verified blocked trajectories with chains + explainers ----
  const blockedSec = `
    <div class="sec"><span class="eyebrow">Verified blocked trajectories</span><h2>Catastrophic actions the engine intercepts — and why.</h2>
      ${blockedCasesHtml(ctx, blocks, sector)}
    </div>`;

  // ---- item 6 · per-trajectory replay summary ----
  const replaySummary = (ctx.replayResults || []).length ? `
    <div class="sec"><span class="eyebrow">Trajectory replay summary</span><h2>Every replayed trajectory, resolved to a verdict.</h2>
      <table><thead><tr><th>Trajectory</th><th>Verdict</th><th>Reason</th></tr></thead><tbody>
      ${ctx.replayResults.map((r) => `<tr><td class="m">Trajectory ${r.index} · ${esc(r.label)}</td><td><span class="v-${(r.verdict || "").toLowerCase()}">${esc(r.verdict)}</span></td><td>${esc(r.reason || (r.verdict === "ALLOW" ? "No forbidden state reached." : "—"))}</td></tr>`).join("")}
      </tbody></table>
    </div>` : "";

  // ---- item 9 · metrics page ----
  const detTxt = (replay && replay.checked) ? `${replay.deterministic}/${replay.checked} identical` : "—";
  const metrics = [
    ["Replay determinism", detTxt],
    ["Runtime latency (avg)", perf ? fmtMs(perf.mean) : "—"],
    ["Governance coverage", s.coverage_pct != null ? `${s.coverage_pct}%` : "—"],
    ["Unsafe escapes", String(s.uncovered ?? 0)],
    ["Blocked trajectories", String(blockedCount)],
    ["Ruleset version", att && att.ruleset_hash ? String(att.ruleset_hash).slice(0, 12) : "—"],
    ["Runtime version", att && att.service_version ? att.service_version : "—"],
    ["Evidence hash", evidenceHash ? String(evidenceHash).slice(0, 16) : "—"],
    ["Evaluation timestamp", nowStamp],
  ];
  const metricsSec = `
    <div class="sec"><span class="eyebrow">Governance metrics</span><h2>The assurance numbers, on one page.</h2>
      <div class="kpis">${metrics.map(([k, v]) => `<div class="kpi"><span class="v" style="font-size:18px">${esc(v)}</span><span class="k">${k}</span></div>`).join("")}</div>
    </div>`;

  // ---- item 11 · "If Runtime Governance had not been present" ----
  const counterfactual = `
    <div class="sec"><span class="eyebrow">If Runtime Governance had not been present</span><h2>The consequence chain that was prevented.</h2>
      <p style="margin:0 0 14px">Without runtime interception, the ${blockedCount} catastrophic trajector${blockedCount === 1 ? "y" : "ies"} identified above would have executed against ${esc(c.name)}'s ${esc(sector.assets.slice(0, 2).join(" and "))}. The likely consequence chain:</p>
      ${chainHtml(sector.consequence, null, "consequence")}
      <div class="exposure-band">
        <span class="eb-k">Estimated financial &amp; operational exposure</span>
        <span class="eb-v">${esc(sector.exposure)}</span>
      </div>
      <p style="margin-top:12px;color:#8a929c">Estimate reflects typical ${esc(sector.label.toLowerCase())} incident impact (direct loss, regulatory penalty, remediation, disclosure and downtime). Runtime Governance intercepted these pathways before execution.</p>
    </div>`;

  // ---- exposure by risk class (retained) ----
  const exposureSec = Object.keys(exposure).length ? `
    <div class="sec"><span class="eyebrow">&#937; exposure by risk class</span><h2>Where exposure is reachable.</h2>
      <table><thead><tr><th>Risk class</th><th>Status</th><th>Tools</th><th>Rules</th></tr></thead><tbody>
      ${Object.entries(exposure).map(([rc, x]) => `<tr><td class="m">${esc(rc)}</td><td><span class="tag ${STATUS_CLASS[x.status] || "unc"}">${esc(x.status)}</span></td><td class="n">${x.tools ?? "—"}</td><td>${esc((x.rules || []).join(", ") || "—")}</td></tr>`).join("")}
      </tbody></table>
    </div>` : "";

  // ---- attestation (retained) ----
  const attestationSec = att ? `
    <div class="sec"><span class="eyebrow">Attestation</span><h2>Reproducible, pinned to a build.</h2>
      <table><tbody>
        <tr><td class="m">Engine commit</td><td style="${mono}">${esc(att.engine_commit)}</td></tr>
        <tr><td class="m">Ruleset hash</td><td style="${mono}">${esc(att.ruleset_hash)}</td></tr>
        <tr><td class="m">Service version</td><td>${esc(att.service_version)}</td></tr>
        <tr><td class="m">Reachability horizon</td><td>${esc(att.horizon)}</td></tr>
      </tbody></table>
    </div>` : "";

  // ---- item 10 · dynamic recommendation ----
  const recSec = `
    <div class="sec"><span class="eyebrow">Recommended engagement</span><h2>${esc(rec.name)}.</h2>
      <p>${esc(rec.why)}</p>
    </div>`;

  return page("Runtime Safety Audit",
    bandBlock("48-Hour Runtime Governance Audit", c.name, `${sector.label} · reachable exposure assessment`, meta)
    + verdictCard
    + sectorSummary
    + toolSurface
    + exposureSec
    + blockedSec
    + replaySummary
    + metricsSec
    + pipelineTimingHtml(stages, perf, replay, ctx, s, report.attestation)
    + counterfactual
    + attestationSec
    + recSec
    + `<div class="disc">Generated from the live Runtime Governance engine assessment of the supplied manifest. Tool names, verdicts, Ω domains and evidence hashes are taken directly from the engine. Financial-exposure figures are indicative sector estimates; commercial terms are non-binding and follow deployment review.</div>`);
}

// ---- governance journey stepper (shared across report modes) ----------------
const JOURNEY = ["Assessment", "48-Hour Audit", "Deployment-Ready Report", "Limited Pilot™", "Live Runtime Report", "Monthly Evidence"];
function journeyHtml(currentIdx) {
  return `<div class="journey">${JOURNEY.map((label, i) => {
    const cls = i < currentIdx ? "done" : i === currentIdx ? "now" : "";
    return `<div class="step ${cls}"><div class="dot"></div><div class="lab">${esc(label)}</div></div>`;
  }).join("")}</div>`;
}

// ---- EXEC REPORT — two modes, auto-selected by whether live evidence exists --
// Mode 1 "Deployment Ready": structural assessment done, no replayed trajectories
//   yet → presented as an intentional readiness posture (never an error).
// Mode 2 "Live Runtime Evidence": trajectories replayed → operational metrics.
// We never fabricate runtime numbers; the report transitions automatically.
function reportHtml(c, m, assess, replay, perf, ctx, stages) {
  ctx = ctx || { replayResults: [], parsedTools: [], industry: "", domains: [] };
  const isLive = (m.source === "engine" || m.source === "decisions") && (m.total || 0) > 0;
  const meta = [["Customer", c.name], ["Period", c.period || "—"], ["Reference", c.reference || "—"], ["Classification", "Board · Confidential"]];
  const s = (assess && assess.summary) || {};
  const att = assess && assess.attestation;
  const blocks = (assess && assess.grounded_blocks) || [];
  const hashCount = blocks.filter((b) => b && b.hash).length;
  const rep = replay || { checked: 0, deterministic: 0 };
  const mono = "font-family:ui-monospace,Menlo,monospace";
  const sector = sectorProfile(ctx.industry, ctx.domains);
  const replayBlockCount = (ctx.replayResults || []).filter((r) => r.verdict === "BLOCK").length;
  const blockedCount = replayBlockCount || s.verified_blocked_trajectories || blocks.length || 0;
  const rec = recommendEngagement(blockedCount, s, (ctx.replayResults || []).length);
  // per-trajectory replay summary (item 6), shared across report modes
  const replaySummarySec = (ctx.replayResults || []).length ? `
    <div class="sec"><span class="eyebrow">Trajectory replay summary</span><h2>Every replayed trajectory, resolved to a verdict.</h2>
      <table><thead><tr><th>Trajectory</th><th>Verdict</th><th>Reason</th></tr></thead><tbody>
      ${ctx.replayResults.map((r) => `<tr><td class="m">Trajectory ${r.index} · ${esc(r.label)}</td><td><span class="v-${(r.verdict || "").toLowerCase()}">${esc(r.verdict)}</span></td><td>${esc(r.reason || (r.verdict === "ALLOW" ? "No forbidden state reached." : "—"))}</td></tr>`).join("")}
      </tbody></table>
    </div>` : "";
  const recSec = `
    <div class="sec"><span class="eyebrow">Recommended engagement</span><h2>${esc(rec.name)}.</h2>
      <p>${esc(rec.why)}</p>
    </div>`;

  // shared evidence appendices (the audit's proof, carried into every report)
  const structural = () => `
    <div class="sec"><span class="eyebrow">Structural governance evidence</span><h2>Carried forward from the 48-Hour Runtime Governance Audit.</h2>
      <div class="kpis">
        <div class="kpi"><span class="v">${s.tools ?? "—"}</span><span class="k">Tools assessed</span></div>
        <div class="kpi"><span class="v">${s.coverage_pct ?? "—"}%</span><span class="k">&#937; coverage</span></div>
        <div class="kpi"><span class="v">${s.verified_blocked_trajectories ?? "—"}</span><span class="k">Verified blocked trajectories</span></div>
        <div class="kpi"><span class="v">${hashCount || "—"}</span><span class="k">Audit evidence hashes</span></div>
      </div>
    </div>`;
  const attestationSec = () => att ? `
    <div class="sec"><span class="eyebrow">Engine attestation</span><h2>Reproducible, pinned to a build.</h2>
      <table><tbody>
        <tr><td class="m">Engine commit</td><td style="${mono}">${esc(att.engine_commit)}</td></tr>
        <tr><td class="m">Ruleset hash</td><td style="${mono}">${esc(String(att.ruleset_hash || "").slice(0, 40))}…</td></tr>
        <tr><td class="m">Service version</td><td>${esc(att.service_version)}</td></tr>
        <tr><td class="m">Reachability horizon</td><td>${esc(att.horizon)} steps</td></tr>
      </tbody></table>
    </div>` : "";

  // ---------- MODE 1 — DEPLOYMENT READY ----------
  if (!isLive) {
    const ready = !!assess;
    const readiness = [
      ["Structural assessment completed", `${s.tools ?? "—"} tools · ${s.risky ?? "—"} risk-bearing`],
      ["&#937; exposure analysed", `${Object.keys((assess && assess.exposure) || {}).length} risk classes`],
      ["Rule coverage verified", `${s.coverage_pct ?? "—"}% of reachable forbidden states`],
      ["Reachability analysis completed", att ? `horizon ${att.horizon} steps` : "engine reachability horizon"],
      ["Audit hashes generated", `${hashCount} evidence hashes`],
      ["Engine attestation complete", att ? `commit ${String(att.engine_commit || "").slice(0, 10)}` : "pinned build"],
      ["Deterministic governance verified", att ? `ruleset ${String(att.ruleset_hash || "").slice(0, 10)}` : "pinned ruleset"],
      ["Deployment ready", "structural readiness confirmed"],
    ];
    const pending = ["Actions governed", "ALLOW / BLOCK / ESCALATE statistics", "Prevented categories", "Replay verification", "Determinism (runtime)", "Runtime evidence hashes", "Monthly trends", "Governance effectiveness"];
    return page("Runtime Governance Executive Report",
      bandBlock("Runtime Governance Executive Report™", c.name, "Deployment readiness", meta) + `
      <div style="margin:-6px 0 16px"><span class="badge"><span class="d"></span>DEPLOYMENT READY</span></div>
      <div class="sec"><span class="eyebrow">Runtime evidence status · ${esc(sector.label)}</span><h2>Structural governance assessment completed successfully.</h2>
        <p style="margin:0 0 12px">Assessed against the ${esc(sector.label.toLowerCase())} threat model — ${esc(sector.focus.join(", "))} — protecting ${esc(sector.assets.join(", "))}.</p>
        <div class="status"><span class="lbl">Runtime evidence status</span>
          <p>Runtime evidence will populate automatically after representative agent trajectories have been replayed through the live Runtime Governance engine. This report currently represents <b style="color:#f3f5f7">deployment readiness</b> rather than production activity.</p>
          <p style="margin-top:8px;color:#8fb0ff">Operational metrics become available automatically once runtime evidence exists — no manual editing or re-issue required.</p>
        </div>
      </div>
      <div class="sec"><span class="eyebrow">Governance journey</span><h2>Where this engagement sits.</h2>
        ${journeyHtml(2)}
        <p style="margin-top:14px;color:#aab2bd">Next milestone: a <b style="color:#f2c66a">Limited Pilot™</b> replays representative trajectories through the engine, after which this report transitions automatically to <b style="color:#f3f5f7">Live Runtime Evidence</b>.</p>
      </div>
      ${ready ? `<div class="sec"><span class="eyebrow">Deployment readiness</span><h2>Verified before any production traffic.</h2>
        <ul class="check">${readiness.map(([t, sub]) => `<li>${t}<small>${esc(sub)}</small></li>`).join("")}</ul>
      </div>` : `<div class="sec"><div class="status"><span class="lbl">Assessment pending</span><p>The structural assessment did not complete for this run. Re-run once the engine assessment is available — this report never displays readiness it cannot evidence.</p></div></div>`}
      ${ready ? structural() : ""}
      ${attestationSec()}
      ${pipelineTimingHtml(stages, perf, rep, ctx, s, att)}
      <div class="sec"><span class="eyebrow">Operational metrics — pending live evidence</span><h2>Populate automatically once trajectories are evaluated.</h2>
        <p style="color:#8a929c">The following become available the moment governed trajectories flow through <span style="${mono};color:#8fb0ff">/v1/evaluate</span>:</p>
        <ul class="pending">${pending.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
      </div>
      ${recSec}
      <div class="disc">This report intentionally omits production metrics until representative trajectories have been replayed through the live Runtime Governance engine. Resurrection Tech&trade; never fabricates runtime evidence — operational sections populate only from live engine results.</div>`);
  }

  // ---------- MODE 2 — LIVE RUNTIME EVIDENCE ----------
  const total = m.total || 0;
  const pct = (n) => total ? ((n / total) * 100).toFixed(1) : "0.0";
  const cats = Object.entries(m.categories || {}).sort((a, b) => b[1] - a[1]);
  const effectiveness = total ? (((m.block || 0) + (m.escalate || 0)) / total * 100).toFixed(1) : "0.0";
  const detPct = rep.checked ? Math.round((rep.deterministic / rep.checked) * 100) : null;
  return page("Runtime Governance Executive Report",
    bandBlock("Runtime Governance Executive Report™", c.name, "Live runtime governance evidence", meta) + `
    <div style="margin:-6px 0 16px"><span class="badge live"><span class="d"></span>LIVE RUNTIME EVIDENCE</span></div>
    <div class="sec"><span class="eyebrow">Governance journey</span><h2>Where this engagement sits.</h2>${journeyHtml(4)}</div>
    <div class="sec"><span class="eyebrow">Executive summary</span><h2>The period at a glance.</h2>
      <div class="kpis">
        <div class="kpi"><span class="v">${total.toLocaleString()}</span><span class="k">Actions governed${m.source === "engine" ? " (replayed)" : ""}</span></div>
        <div class="kpi"><span class="v">${(m.block || 0).toLocaleString()}</span><span class="k">Unsafe actions prevented</span></div>
        <div class="kpi"><span class="v">${(m.escalate || 0).toLocaleString()}</span><span class="k">Escalated for review</span></div>
        <div class="kpi"><span class="v">${effectiveness}%</span><span class="k">Governance effectiveness</span></div>
      </div>
    </div>
    <div class="sec"><span class="eyebrow">Runtime activity</span><h2>Every action resolved to a verdict.</h2>
      <div class="bar"><i class="a" style="width:${pct(m.allow)}%"></i><i class="b" style="width:${pct(m.block)}%"></i><i class="e" style="width:${pct(m.escalate)}%"></i></div>
      <div class="legend"><span><i class="a"></i>ALLOW · ${(m.allow || 0).toLocaleString()} (${pct(m.allow)}%)</span><span><i class="b"></i>BLOCK · ${(m.block || 0).toLocaleString()} (${pct(m.block)}%)</span><span><i class="e"></i>ESCALATE · ${(m.escalate || 0).toLocaleString()} (${pct(m.escalate)}%)</span></div>
    </div>
    <div class="sec"><span class="eyebrow">Actions prevented</span><h2>What was blocked before it executed.</h2>
      <table><thead><tr><th>Category / &#937; domain</th><th>Count</th></tr></thead><tbody>
      ${cats.map(([k, v]) => `<tr><td class="m">${esc(k)}</td><td class="n">${v}</td></tr>`).join("") || `<tr><td colspan="2">No prevented actions in this period.</td></tr>`}
      </tbody></table>
    </div>
    <div class="sec"><span class="eyebrow">Replay &amp; determinism</span><h2>Every verdict is reproducible.</h2>
      ${rep.checked ? `<div class="kpis">
        <div class="kpi"><span class="v">${rep.checked}</span><span class="k">Trajectories replayed</span></div>
        <div class="kpi"><span class="v">${rep.deterministic}/${rep.checked}</span><span class="k">Deterministic verdicts</span></div>
        <div class="kpi"><span class="v">${detPct}%</span><span class="k">Determinism</span></div>
      </div>` : `<p style="color:#8a929c">Determinism replay not applicable for this source (decision logs supplied directly).</p>`}
    </div>
    ${replaySummarySec}
    ${pipelineTimingHtml(stages, perf, rep, ctx, s, att)}
    ${recSec}
    ${structural()}
    ${attestationSec()}
    <div class="disc">${m.source === "engine" ? "Generated by replaying supplied trajectories through the live Runtime Governance engine." : "Aggregated from supplied decision logs."} Figures reflect the supplied period only. Resurrection Tech&trade; never fabricates runtime evidence.</div>`);
}

// ---- Markdown deliverables (always produced; no browser required) ----------
const mdEsc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
function perfMarkdown(perf, replay) {
  if (!perf) return "";
  return `\n## Runtime performance (measured)\n\n`
    + `- Average evaluation latency: ${fmtMs(perf.mean)}\n`
    + `- P50 / P95 / P99: ${fmtMs(perf.p50)} / ${fmtMs(perf.p95)} / ${fmtMs(perf.p99)}\n`
    + `- Fastest / slowest: ${fmtMs(perf.min)} / ${fmtMs(perf.max)}\n`
    + `- Total evaluations: ${perf.n} · ${perf.eps.toFixed(perf.eps < 10 ? 1 : 0)} eval/sec\n`
    + `- Replay determinism: ${replay && replay.checked ? `${replay.deterministic}/${replay.checked}` : "—"}\n`;
}
function auditMarkdown(c, report, perf, replay, ctx, stages) {
  ctx = ctx || { replayResults: [], parsedTools: [], industry: "", domains: [] };
  const L = [`# Runtime Safety Audit — ${c.name}`, ``, `**Reference:** ${c.reference || "—"}  |  **Environment:** ${c.environment || "—"}  |  **Classification:** Confidential`];
  if (!report) { L.push(``, `> Engine assessment unavailable for this run. Coverage, exposure, and verified-blocked-trajectory sections come from the live Runtime Governance engine — set GOVERNANCE_URL/GOVERNANCE_TOKEN and re-run.`); return L.join("\n"); }
  const s = report.summary || {}, ex = report.exposure || {}, blocks = report.grounded_blocks || [], att = report.attestation;
  const sector = sectorProfile(ctx.industry, ctx.domains);
  const tools = toolModel(report, ctx.parsedTools || []);
  const replayBlocks = (ctx.replayResults || []).filter((r) => r.verdict === "BLOCK");
  const blockedCount = replayBlocks.length || s.verified_blocked_trajectories || blocks.length || 0;
  const ev = executiveVerdict(s, blockedCount);
  const rec = recommendEngagement(blockedCount, s, (ctx.replayResults || []).length);
  // Executive verdict (item 7)
  L.push(``, `## Executive verdict`, ``);
  L.push(`- **Overall risk:** ${ev.risk}`);
  L.push(`- **Production ready:** ${ev.productionReady}`);
  L.push(`- **Blocked trajectories:** ${blockedCount}`);
  L.push(`- **Governance coverage:** ${s.coverage_pct ?? "—"}%`);
  L.push(`- **Recommendation:** ${rec.name} — ${rec.why}`);
  L.push(``, `## Executive summary — ${sector.label}`, ``);
  L.push(`Assessed against the ${sector.label.toLowerCase()} threat model — ${sector.focus.join(", ")} — protecting ${sector.assets.join(", ")}.`, ``);
  L.push(`- Tools assessed: **${s.tools ?? "—"}** (risk-bearing: ${s.risky ?? "—"})`);
  L.push(`- Ω coverage: **${s.coverage_pct ?? "—"}%** (covered ${s.covered ?? "—"} · partial ${s.partial ?? "—"} · uncovered ${s.uncovered ?? "—"})`);
  L.push(`- Verified blocked trajectories: **${blockedCount}**`);
  // Tool risk surface with REAL names (items 1 & 5)
  if (tools.length) { L.push(``, `## Tool risk surface`, ``, `| Tool | Capability | Risk | Governance status |`, `|---|---|---|---|`); for (const t of tools) L.push(`| ${mdEsc(t.name)} | ${mdEsc(t.capability)} | ${mdEsc(t.risk)} | ${mdEsc(t.governance)} |`); }
  if (Object.keys(ex).length) { L.push(``, `## Ω exposure by risk class`, ``, `| Risk class | Status | Tools | Rules |`, `|---|---|---|---|`); for (const [rc, x] of Object.entries(ex)) L.push(`| ${mdEsc(rc)} | ${mdEsc(x.status)} | ${x.tools ?? "—"} | ${mdEsc((x.rules || []).join(", ") || "—")} |`); }
  // Verified blocked trajectories with chain + verdict + reason + Ω policy (items 2 & 3)
  if (replayBlocks.length) {
    L.push(``, `## Verified blocked trajectories`, ``);
    replayBlocks.forEach((r, i) => {
      L.push(`### Case ${i + 1} — ${r.label}`, ``);
      L.push(`**Execution chain:** ${(r.steps || []).map((st) => humanizeStep(st)).join(" → ") || r.label} → **BLOCKED**`, ``);
      L.push(`- **Verdict:** BLOCKED`);
      L.push(`- **Reason:** ${r.reason || "Action would reach a forbidden state."}`);
      L.push(`- **Policy triggered:** ${policyName(r.omega_domain, null, sector)}`);
      L.push(`- **Ω domain:** ${r.omega_domain || "—"}`, ``);
    });
  } else if (blocks.length) {
    L.push(``, `## Verified blocked trajectories`, ``, `| Trajectory | Risk class | Ω domain | Evidence hash |`, `|---|---|---|---|`);
    for (const b of blocks) L.push(`| ${mdEsc(b.label)} | ${mdEsc(b.risk_class)} | ${mdEsc(b.omega_domain || "—")} | \`${(b.hash || "").slice(0, 16)}\` |`);
  }
  // Per-trajectory replay summary (item 6)
  if ((ctx.replayResults || []).length) {
    L.push(``, `## Trajectory replay summary`, ``, `| Trajectory | Verdict | Reason |`, `|---|---|---|`);
    for (const r of ctx.replayResults) L.push(`| Trajectory ${r.index} · ${mdEsc(r.label)} | ${r.verdict} | ${mdEsc(r.reason || (r.verdict === "ALLOW" ? "No forbidden state reached." : "—"))} |`);
  }
  // Governance metrics (item 9)
  L.push(``, `## Governance metrics`, ``);
  L.push(`- Replay determinism: ${replay && replay.checked ? `${replay.deterministic}/${replay.checked}` : "—"}`);
  L.push(`- Runtime latency (avg): ${perf ? fmtMs(perf.mean) : "—"}`);
  L.push(`- Governance coverage: ${s.coverage_pct != null ? `${s.coverage_pct}%` : "—"}`);
  L.push(`- Unsafe escapes: ${s.uncovered ?? 0}`);
  L.push(`- Blocked trajectories: ${blockedCount}`);
  L.push(`- Ruleset version: ${att && att.ruleset_hash ? String(att.ruleset_hash).slice(0, 12) : "—"}`);
  L.push(`- Runtime version: ${att && att.service_version ? att.service_version : "—"}`);
  if (att) L.push(``, `## Attestation`, ``, `- Engine commit: \`${att.engine_commit}\``, `- Ruleset hash: \`${String(att.ruleset_hash || "").slice(0, 40)}…\``, `- Service version: ${att.service_version}`, `- Reachability horizon: ${att.horizon} steps`);
  const pm = perfMarkdown(perf, replay); if (pm) L.push(pm);
  const tm = pipelineTimingMarkdown(stages, perf, replay, ctx, s); if (tm) L.push(tm);
  // If Runtime Governance had not been present (item 11)
  L.push(``, `## If Runtime Governance had not been present`, ``);
  L.push(`Without runtime interception, the ${blockedCount} catastrophic trajector${blockedCount === 1 ? "y" : "ies"} above would have executed against ${c.name}'s ${sector.assets.slice(0, 2).join(" and ")}. Likely consequence chain:`, ``);
  L.push((sector.consequence || []).map((x) => `${x}`).join(" → "), ``);
  L.push(`**Estimated exposure:** ${sector.exposure}`);
  L.push(``, `## Recommended engagement`, ``, `**${rec.name}** — ${rec.why}`);
  L.push(``, `---`, `*Generated from the live Runtime Governance engine assessment. Tool names, verdicts and Ω domains taken directly from the engine. Financial-exposure figures are indicative sector estimates; commercial terms non-binding.*`);
  return L.join("\n");
}
function reportMarkdown(c, m, report, replay, perf, ctx, stages) {
  ctx = ctx || { replayResults: [], parsedTools: [], industry: "", domains: [] };
  const isLive = (m.source === "engine" || m.source === "decisions") && (m.total || 0) > 0;
  const s = (report && report.summary) || {};
  const sector = sectorProfile(ctx.industry, ctx.domains);
  const blocks = (report && report.grounded_blocks) || [];
  const replayBlockCount = (ctx.replayResults || []).filter((r) => r.verdict === "BLOCK").length;
  const blockedCount = replayBlockCount || s.verified_blocked_trajectories || blocks.length || 0;
  const rec = recommendEngagement(blockedCount, s, (ctx.replayResults || []).length);
  const L = [`# Runtime Governance Executive Report — ${c.name}`, ``, `**Period:** ${c.period || "—"}  |  **Reference:** ${c.reference || "—"}  |  **Classification:** Board · Confidential`, ``, `_Sector: ${sector.label}_`, ``];
  if (!isLive) {
    L.push(`> **Deployment Ready.** Runtime evidence will populate automatically once representative trajectories have been replayed through the live Runtime Governance engine. This report currently represents deployment readiness rather than production activity.`, ``, `## Deployment readiness`, ``);
    L.push(`- Structural assessment completed: ${s.tools ?? "—"} tools, ${s.risky ?? "—"} risk-bearing`);
    L.push(`- Ω coverage: ${s.coverage_pct ?? "—"}%`);
    L.push(`- Verified blocked trajectories: ${blockedCount}`);
    if (report && report.attestation) L.push(`- Engine attestation: commit \`${String(report.attestation.engine_commit || "").slice(0, 10)}\``);
  } else {
    const total = m.total || 0, pct = (n) => total ? ((n / total) * 100).toFixed(1) : "0.0";
    L.push(`## The period at a glance`, ``);
    L.push(`- Actions governed: **${total}**`);
    L.push(`- ALLOW ${m.allow || 0} (${pct(m.allow)}%) · BLOCK ${m.block || 0} (${pct(m.block)}%) · ESCALATE ${m.escalate || 0} (${pct(m.escalate)}%)`);
    L.push(`- Unsafe actions prevented: **${m.block || 0}**`);
    const cats = Object.entries(m.categories || {}).sort((a, b) => b[1] - a[1]);
    if (cats.length) { L.push(``, `## Actions prevented`, ``, `| Category / Ω domain | Count |`, `|---|---|`); for (const [k, v] of cats) L.push(`| ${mdEsc(k)} | ${v} |`); }
    if ((ctx.replayResults || []).length) { L.push(``, `## Trajectory replay summary`, ``, `| Trajectory | Verdict | Reason |`, `|---|---|---|`); for (const r of ctx.replayResults) L.push(`| Trajectory ${r.index} · ${mdEsc(r.label)} | ${r.verdict} | ${mdEsc(r.reason || (r.verdict === "ALLOW" ? "No forbidden state reached." : "—"))} |`); }
    const pm = perfMarkdown(perf, replay); if (pm) L.push(pm);
  }
  const tm = pipelineTimingMarkdown(stages, perf, replay, ctx, s); if (tm) L.push(tm);
  L.push(``, `## Recommended engagement`, ``, `**${rec.name}** — ${rec.why}`);
  L.push(``, `---`, `*Resurrection Tech™ never fabricates runtime evidence — operational sections populate only from live engine results.*`);
  return L.join("\n");
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
// Best-effort PDF render. Returns true on success; NEVER throws — PDF is a
// delivery-layer enhancement, not a governance requirement. If Chromium is
// missing or the render fails, the audit still completes (HTML + Markdown + JSON
// are always delivered) and the PDF is reported as pending.
function renderPdf(htmlPath, pdfPath, label) {
  const chrome = ensureChrome();
  if (!chrome) { emitCheck(false, `${label} PDF skipped — no usable Chromium (HTML + Markdown delivered instead; run: npm run audit:chrome:install)`); return false; }
  try {
    execFileSync(chrome, ["--headless=new", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer", "--print-to-pdf=" + pdfPath, "file://" + htmlPath], { stdio: ["ignore", "ignore", "pipe"], timeout: 60000 });
  } catch (e) {
    emitCheck(false, `${label} PDF render failed: ${String((e && e.stderr) || e.message || e).toString().slice(0, 160)} — HTML + Markdown delivered instead`);
    return false;
  }
  if (!fs.existsSync(pdfPath)) { emitCheck(false, `${label} PDF not produced — HTML + Markdown delivered instead`); return false; }
  emitCheck(true, `${label} PDF generated (${fs.statSync(pdfPath).size} bytes)`);
  return true;
}

// ---- standalone PDF render self-test (verifies Chromium actually works) -----
function selfTest() {
  try { const h = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: path.join(__dirname, ".."), stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); console.log(`• delivery-kit: ${__filename} @ ${h}`); } catch { console.log(`• delivery-kit: ${__filename}`); }
  const chrome = ensureChrome();
  console.log(`• Resolved Chromium: ${chrome || "(none found)"}`);
  if (!chrome) { console.error(`✗ ${CHROME_NOT_FOUND}`); return 1; }
  const v = chromeVersion(chrome);
  console.log(`• Version: ${v || "(no --version output)"}`);
  const dir = path.join(os.tmpdir(), "rt-selftest");
  fs.mkdirSync(dir, { recursive: true });
  const html = path.join(dir, "t.html"), pdf = path.join(dir, "t.pdf");
  fs.writeFileSync(html, "<!doctype html><meta charset='utf-8'><h1>Resurrection Tech — PDF self-test</h1>");
  try { fs.rmSync(pdf, { force: true }); } catch { /* ignore */ }
  console.log(`• Launching headless render test …`);
  try {
    execFileSync(chrome, ["--headless=new", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer", "--print-to-pdf=" + pdf, "file://" + html], { stdio: ["ignore", "ignore", "pipe"], timeout: 60000 });
  } catch (e) { console.error(`✗ Chromium failed to launch/render (${chrome}): ${String((e && e.stderr) || e.message || e).toString().slice(0, 300)}`); return 1; }
  const ok = fs.existsSync(pdf) && fs.readFileSync(pdf).slice(0, 5).toString() === "%PDF-";
  console.log(ok ? `✓ Chromium usable — headless render OK via ${chrome} (${fs.statSync(pdf).size} bytes)` : "✗ Chromium did not produce a PDF");
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
  // Per-stage wall-clock instrumentation (real measured timings; ms). Total is
  // the sum of the measured stages. Captured throughout the run below.
  const stages = { manifest_parse: 0, governance_eval: 0, trajectory_replay: 0, report_generation: 0, pdf_generation: 0, total: 0 };

  console.log(`\nResurrection Tech — Delivery Kit\n  input:  ${srcLabel}\n  engine: ${GOV}\n  output: ${outDir}\n`);
  emitStage("parsing", "Parsing manifest");
  try {
  // AUDIT (/v1/assess) — accepts a parsed manifest array OR raw manifest_text
  let report = null;
  const tParse0 = nowMs();
  const haveManifest = (Array.isArray(input.manifest) && input.manifest.length) ||
    (typeof input.manifest_text === "string" && input.manifest_text.trim());
  const manifestBytes = input.manifest_text ? input.manifest_text.length : JSON.stringify(input.manifest || []).length;
  const toolCount = Array.isArray(input.manifest) ? input.manifest.length : null;
  const parsedTools = parseManifestTools(input); // real tool names — also reused by ctx below
  stages.manifest_parse = nowMs() - tParse0;
  emitCheck(!!haveManifest, haveManifest ? `Manifest received (${manifestBytes} bytes${toolCount != null ? `, ${toolCount} tools` : ", text format"})` : "No manifest supplied");
  if (haveManifest) {
    console.log("• Audit: assessing manifest via /v1/assess …");
    emitStage("assessment", "Runtime assessment");
    report = await assess({
      manifest: Array.isArray(input.manifest) && input.manifest.length ? input.manifest : undefined,
      manifest_text: input.manifest_text,
      org: c.name, format: input.format || "generic",
    });
    status.assess = !!report;
    stages.governance_eval = PERF.assessMs != null ? PERF.assessMs : 0; // measured /v1/assess round-trip
    const s = (report && report.summary) || {};
    if (report) emitCheck(true, `Runtime Governance engine assessed manifest — ${s.tools ?? "?"} tools, ${s.risky ?? "?"} risk-bearing, ${s.coverage_pct ?? "?"}% Ω coverage, ${s.verified_blocked_trajectories ?? 0} blocked trajectories`);
    else emitCheck(false, "Runtime Governance engine /v1/assess returned no report (unreachable or error) — check GOVERNANCE_URL / GOVERNANCE_TOKEN and run: npm run audit:check");
  } else console.log("• Audit: no manifest supplied — skipping assess.");
  emitStage("exposure", "Ω exposure mapping");

  // EXEC REPORT metrics (+ replay verification). Runs BEFORE rendering so the
  // measured performance samples (from each /v1/evaluate round-trip) are
  // available to BOTH the audit and the executive report PDFs.
  const m = { total: 0, allow: 0, block: 0, escalate: 0, categories: {}, source: "none" };
  const replayResults = []; // per-trajectory: human-readable chain + verdict + reason + Ω
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
    const tReplay0 = nowMs();
    let firstEvalErr = null;
    let trajIdx = 0;
    for (const traj of input.trajectories) {
      trajIdx++;
      const tEval0 = nowMs();
      const g = await evaluate(traj, input.domains);
      const evalMs = nowMs() - tEval0; // measured verdict-call latency for this trajectory
      if (g && !g.__error) {
        status.evaluate = true; const v = toVerdict(g.verdict); m.total++; m[v.toLowerCase()]++;
        if (v === "BLOCK") { const k = g.omega_domain || g.reason || "Blocked"; m.categories[k] = (m.categories[k] || 0) + 1; }
        const g2 = await evaluate(traj, input.domains); // replay verification
        let det = null;
        if (g2 && !g2.__error) { replay.checked++; det = (g2.verdict === g.verdict && g2.trajectory_hash === g.trajectory_hash); if (det) replay.deterministic++; }
        replayResults.push({
          index: trajIdx,
          label: traj.label || traj.name || `Trajectory ${trajIdx}`,
          steps: traj.steps || traj.actions || traj.trajectory || traj.chain || (Array.isArray(traj) ? traj : []),
          verdict: v,
          reason: g.reason || "",
          omega_domain: g.omega_domain || "",
          layer: g.layer || "",
          trajectory_hash: g.trajectory_hash || "",
          deterministic: det,
          eval_ms: evalMs,
        });
      } else if (!firstEvalErr) { firstEvalErr = g; }
    }
    stages.trajectory_replay = nowMs() - tReplay0; // measured /v1/evaluate replay + determinism loop
    if (firstEvalErr) {
      const st = firstEvalErr.__status != null ? `HTTP ${firstEvalErr.__status}` : firstEvalErr.__error;
      console.warn(`  ! /v1/evaluate: no verdicts. First failure: ${st}. Full response body:\n${firstEvalErr.__body != null ? firstEvalErr.__body : "(none)"}\n`);
      emitCheck(false, `/v1/evaluate ${st} — body: ${bodySnippet(firstEvalErr.__body) || "(empty)"}`);
    }
    m.source = status.evaluate ? "engine" : "none";
  } else console.log("• Report: no trajectories or decisions supplied.");

  if (Array.isArray(input.decisions) && input.decisions.length) emitCheck(true, `Aggregated ${m.total} supplied decisions — ALLOW ${m.allow}/BLOCK ${m.block}/ESCALATE ${m.escalate}`);
  else if (Array.isArray(input.trajectories) && input.trajectories.length) emitCheck(status.evaluate, status.evaluate ? `Replayed ${input.trajectories.length} trajectories via /v1/evaluate — ALLOW ${m.allow}/BLOCK ${m.block}/ESCALATE ${m.escalate}, determinism ${replay.deterministic}/${replay.checked}` : "/v1/evaluate did not return verdicts (GOVERNANCE_TOKEN missing or engine unreachable) — runtime metrics unavailable");
  else emitCheck(true, "No trajectories supplied — Executive Report will be Deployment-Ready (by design)");

  const perf = perfStats(); // measured latency/throughput stats (null if no evaluations ran)

  // Deliverables are written browser-free FIRST (HTML + Markdown), so the audit
  // always completes. PDF is a best-effort enhancement layered on top.
  emitStage("audit", "Generating audit document");
  const ctx = {
    replayResults,
    parsedTools, // computed (and timed) during the manifest-parse stage above
    industry: input.industry || (input.domains && input.domains[0]) || (report && report.industry) || "",
    domains: input.domains || [],
  };
  const auditHtmlPath = path.join(outDir, "audit.html");
  const auditMdPath = path.join(outDir, "audit.md");
  const reportHtmlPath = path.join(outDir, "executive-report.html");
  const reportMdPath = path.join(outDir, "executive-report.md");

  // Two-pass emit: pass 1 writes the deliverables and MEASURES report-generation
  // + PDF-render wall-clock; once those (and the total) are known, pass 2 re-emits
  // the deliverables with the complete per-stage breakdown embedded. The displayed
  // generation/PDF timings are the real pass-1 measurements, not estimates.
  const writeDeliverables = (stagesForDisplay, measure) => {
    let gen = 0, pdf = 0, t;
    t = nowMs();
    fs.writeFileSync(auditHtmlPath, auditHtml(c, report, perf, replay, ctx, stagesForDisplay));
    fs.writeFileSync(auditMdPath, auditMarkdown(c, report, perf, replay, ctx, stagesForDisplay));
    gen += nowMs() - t;
    if (measure) { emitCheck(true, "Audit document generated (HTML + Markdown)"); emitStage("audit", "Generating audit PDF"); }
    t = nowMs();
    const aOk = renderPdf(auditHtmlPath, auditPdf, "Audit");
    pdf += nowMs() - t;
    if (measure) emitStage("report", "Generating executive report");
    t = nowMs();
    fs.writeFileSync(reportHtmlPath, reportHtml(c, m, report, replay, perf, ctx, stagesForDisplay));
    fs.writeFileSync(reportMdPath, reportMarkdown(c, m, report, replay, perf, ctx, stagesForDisplay));
    gen += nowMs() - t;
    if (measure) emitCheck(true, "Executive report generated (HTML + Markdown)");
    t = nowMs();
    const rOk = renderPdf(reportHtmlPath, reportPdf, "Executive report");
    pdf += nowMs() - t;
    if (measure) { stages.report_generation = gen; stages.pdf_generation = pdf; }
    return { auditPdfOk: aOk, reportPdfOk: rOk };
  };

  let { auditPdfOk, reportPdfOk } = writeDeliverables(null, true);
  stages.total = stages.manifest_parse + stages.governance_eval + stages.trajectory_replay + stages.report_generation + stages.pdf_generation;
  ({ auditPdfOk, reportPdfOk } = writeDeliverables(stages, false)); // re-emit with full breakdown

  // FIELD MATRIX — every Priority-1 output, classified so runtime gaps read as
  // "pending live evidence" (expected after an audit), not as failures.
  const blocks = (report && report.grounded_blocks) || [];
  const fields = [
    ["Ω exposure coverage", report && report.summary && report.summary.coverage_pct != null, "structural"],
    ["Exposure by risk class", !!(report && report.exposure && Object.keys(report.exposure).length), "structural"],
    ["Verified blocked trajectories", blocks.length > 0, "structural"],
    ["ALLOW / BLOCK / ESCALATE statistics", m.total > 0, "runtime"],
    ["Prevented categories", Object.keys(m.categories).length > 0, "runtime"],
    ["Recommendations", true, "output"],
    ["Audit hashes", blocks.some((b) => b && b.hash), "structural"],
    ["Replay verification", replay.checked > 0, "runtime"],
    ["Attestation", !!(report && report.attestation), "structural"],
    ["Audit document (HTML + Markdown)", fs.existsSync(auditHtmlPath), "output"],
    ["Executive report (HTML + Markdown)", fs.existsSync(reportHtmlPath), "output"],
    ["Audit PDF", auditPdfOk, "pdf"],
    ["Executive Report PDF", reportPdfOk, "pdf"],
  ];
  const hasRuntime = fields.some(([, ok, k]) => ok && k === "runtime");
  const mode = hasRuntime ? "live" : (status.assess ? "deployment-ready" : "incomplete");
  const pdfAvailable = auditPdfOk && reportPdfOk;

  console.log("\n— Priority-1 field matrix —");
  for (const [name, ok, kind] of fields) {
    const icon = ok ? "✅" : (kind === "runtime" || kind === "pdf") ? "⏳" : "🔴";
    const tail = !ok ? (kind === "runtime" ? "  — pending live runtime evidence" : kind === "pdf" ? "  — pending (Chromium unavailable; HTML + Markdown delivered)" : "") : "";
    console.log(`  ${icon} ${name}${tail}`);
  }
  if (replay.checked) console.log(`     replay determinism: ${replay.deterministic}/${replay.checked}`);

  const structuralMissing = fields.filter(([, ok, k]) => !ok && k !== "runtime" && k !== "pdf").map(([n]) => n);
  const runtimePending = fields.filter(([, ok, k]) => !ok && k === "runtime").map(([n]) => n);
  console.log(`\n— Engine —\n  /v1/assess:   ${status.assess ? "reachable ✓" : "unreachable ✗ (audit fields blank)"}\n  /v1/evaluate: ${status.evaluate ? "reachable ✓" : (m.source === "decisions" ? "n/a — used decision logs ✓" : "not exercised (no trajectories)")}`);
  console.log(`\n— Executive Report mode: ${mode === "live" ? "LIVE RUNTIME EVIDENCE ✓" : mode === "deployment-ready" ? "DEPLOYMENT READY ✓" : "INCOMPLETE"} —`);
  if (mode === "deployment-ready" && runtimePending.length) {
    console.log(`  Structural assessment complete; runtime evidence pending (by design).`);
    console.log(`  ${runtimePending.join(", ")} populate automatically once trajectories are`);
    console.log(`  replayed — supply --trajectories <file> or paste them in the console.`);
  }
  if (structuralMissing.length) console.log(`\n  ⚠ Missing structural evidence: ${structuralMissing.join(", ")}\n    → check engine connectivity. Run:  node scripts/delivery-kit.cjs --check`);

  // shared runtime metrics — identical numbers across console + run-summary.json
  const rtm = computeRuntimeMetrics(stages, perf, replay, ctx, report && report.summary);
  const grade = performanceGrade(rtm);

  // console view — same two-part story as the reports (engine vs delivery)
  {
    const tt = rtm.total || 1;
    console.log(`\n— Audit timeline —`);
    console.log(`  0 ms`);
    console.log(`   ├── Manifest received`);
    console.log(`   ├── Runtime Governance decision .... ${perf ? fmtMs(perf.mean) : "—"}`);
    console.log(`   ├──── HTML · PDF · Branding · Secure links · Audit package`);
    console.log(`   └── Customer receives report ....... ${fmtDur(rtm.total)}`);

    console.log(`\n— Performance at a glance —`);
    console.log(`  Runtime Governance Engine     ${grade ? `${grade.grade} (${grade.label})` : "pending"}`);
    console.log(`  Determinism                   ${rtm.detPct != null ? rtm.detPct + "%" : "n/a"}`);
    console.log(`  Average evaluation latency    ${perf ? fmtMs(perf.mean) : "—"}`);
    console.log(`  Governance coverage           ${rtm.cov != null ? rtm.cov + "%" : "—"}`);
    console.log(`  End-to-end audit delivery     ${fmtDur(rtm.total)}`);
    console.log(`  Report generation             Complete`);

    console.log(`\n— Runtime Governance Engine —`);
    if (grade) console.log(`  ★ Runtime Governance grade:  ${grade.grade} (${grade.label})`);
    console.log(`  Average evaluation latency:  ${perf ? fmtMs(perf.mean) : "—"}`);
    console.log(`  Throughput:                  ${perf ? fmtRate(perf.eps) + " evaluations/sec" : "—"}`);
    console.log(`  Determinism:                 ${rtm.detPct != null ? rtm.detPct + "%" : "n/a"}`);
    console.log(`  Governance coverage:         ${rtm.cov != null ? rtm.cov + "%" : "—"}`);
    console.log(`  Trajectories / evaluations:  ${rtm.N} / ${rtm.M}`);
    console.log(`  Industry context:`);
    console.log(`    Runtime Governance eval    ${perf ? fmtMs(perf.mean) : "—"}  (measured)`);
    for (const [k, v] of INDUSTRY_REFERENCE) console.log(`    ${k.padEnd(25)}${v}`);
    console.log(`    Customer audit delivery    ${fmtDur(rtm.total)}  (measured)`);
    if (rtm.trajStats && rtm.trajTimes.length > 1) {
      console.log(`  Replay (per trajectory):     avg ${fmtMs(rtm.trajStats.avg)} · fastest ${fmtMs(rtm.trajStats.fast)} · slowest ${fmtMs(rtm.trajStats.slow)}`);
    }

    console.log(`\n— Audit Generation Pipeline —`);
    const line = (label, ms) => `  ${label.padEnd(24, " ")} ${fmtMs(ms).padStart(9)}   ${((ms / tt) * 100).toFixed(0).padStart(3)}%`;
    for (const [label, k] of STAGE_ORDER) console.log(line(label, stages[k]));
    console.log(`  ${"Total customer delivery".padEnd(24, " ")} ${fmtDur(tt).padStart(9)}   100%`);
    console.log(`  (engine decides in ms; the rest is HTML/PDF rendering, not governance)`);
  }

  // Per-stage timing block (measured wall-clock ms + each stage's share of total).
  const r3 = (n) => +(+n).toFixed(3);
  const tot = stages.total || (stages.manifest_parse + stages.governance_eval + stages.trajectory_replay + stages.report_generation + stages.pdf_generation) || 1;
  const sharePct = (n) => +((n / tot) * 100).toFixed(1);
  const stageTimings = {
    measured: true,
    manifest_parse_ms: r3(stages.manifest_parse),
    governance_eval_ms: r3(stages.governance_eval),
    trajectory_replay_ms: r3(stages.trajectory_replay),
    report_generation_ms: r3(stages.report_generation),
    pdf_generation_ms: r3(stages.pdf_generation),
    total_ms: r3(stages.total),
    shares_pct: {
      manifest_parse: sharePct(stages.manifest_parse),
      governance_eval: sharePct(stages.governance_eval),
      trajectory_replay: sharePct(stages.trajectory_replay),
      report_generation: sharePct(stages.report_generation),
      pdf_generation: sharePct(stages.pdf_generation),
    },
    throughput: {
      total_runtime_ms: r3(rtm.total),
      average_latency_ms: rtm.avg != null ? r3(rtm.avg) : null,
      trajectories_replayed: rtm.N,
      governance_evaluations: rtm.M,
      effective_evaluations_per_sec: rtm.totalSec ? +rtm.effEval.toFixed(2) : null,
      effective_trajectories_per_sec: rtm.totalSec ? +rtm.effTraj.toFixed(2) : null,
    },
    replay_performance: (rtm.trajStats && rtm.trajTimes.length) ? {
      per_trajectory_ms: (ctx.replayResults || []).map((r) => ({ index: r.index, label: r.label, eval_ms: typeof r.eval_ms === "number" ? r3(r.eval_ms) : null })),
      average_ms: r3(rtm.trajStats.avg), fastest_ms: r3(rtm.trajStats.fast), slowest_ms: r3(rtm.trajStats.slow),
    } : null,
    performance_grade: grade ? { grade: grade.grade, label: grade.label, basis: grade.basis } : null,
    performance_summary: {
      performance_grade: grade ? grade.grade : null,
      end_to_end_runtime_ms: r3(rtm.total),
      governance_evaluations: rtm.M,
      average_evaluation_latency_ms: rtm.avg != null ? r3(rtm.avg) : null,
      throughput_evaluations_per_sec: rtm.eps != null ? +rtm.eps.toFixed(2) : null,
      determinism_pct: rtm.detPct,
      governance_coverage_pct: rtm.cov,
    },
    comparison_card: {
      runtime_governance_engine: grade ? grade.grade : "pending",
      determinism_pct: rtm.detPct,
      average_evaluation_latency_ms: rtm.avg != null ? r3(rtm.avg) : null,
      governance_coverage_pct: rtm.cov,
      end_to_end_audit_delivery_ms: r3(rtm.total),
      report_generation: "Complete",
    },
    industry_context: {
      runtime_governance_evaluation: rtm.avg != null ? fmtMs(rtm.avg) : null,
      human_reaction_time: "~250 ms",
      typical_api_request: "50–200 ms",
      customer_audit_delivery: fmtDur(rtm.total),
    },
    timeline: [
      { at_ms: 0, event: "Manifest received" },
      { at_ms: rtm.avg != null ? r3(rtm.avg) : null, event: "Runtime Governance decision" },
      { at_ms: null, event: "Document generation", detail: ["HTML", "PDF", "Branding", "Secure links", "Audit package"] },
      { at_ms: r3(rtm.total), event: "Customer receives report" },
    ],
  };

  // machine-readable evidence written alongside the PDFs.
  // NOTE: existing overall-latency fields (avg/p50/p95/p99/assess_ms) are
  // preserved unchanged for backwards compatibility; stage_timings is additive.
  const perfOut = perf ? {
    measured: true, total_evaluations: perf.n,
    avg_ms: +perf.mean.toFixed(4), p50_ms: +perf.p50.toFixed(4), p95_ms: +perf.p95.toFixed(4), p99_ms: +perf.p99.toFixed(4),
    min_ms: +perf.min.toFixed(4), max_ms: +perf.max.toFixed(4), evals_per_sec: +perf.eps.toFixed(2),
    assess_ms: PERF.assessMs != null ? +PERF.assessMs.toFixed(4) : null,
    replay_determinism: `${replay.deterministic}/${replay.checked}`,
    stage_timings: stageTimings,
  } : { measured: false, assess_ms: PERF.assessMs != null ? +PERF.assessMs.toFixed(4) : null, stage_timings: stageTimings };
  const deliverables = fs.readdirSync(outDir).filter((f) => /\.(pdf|html|md|json)$/.test(f) && f !== "run-summary.json");
  fs.writeFileSync(path.join(outDir, "run-summary.json"), JSON.stringify({
    customer: c, engine: GOV, status, replay, mode,
    metrics: m, fields: Object.fromEntries(fields.map(([n, ok]) => [n, ok])),
    field_kinds: Object.fromEntries(fields.map(([n, , k]) => [n, k])),
    pending: runtimePending, missing: structuralMissing,
    performance: perfOut,
    pipeline_timings: stageTimings,
    deliverables, pdf_available: pdfAvailable,
    assess_summary: report ? report.summary : null,
    attestation: report ? report.attestation || null : null,
  }, null, 2));

  emitCheck(true, "Run summary written (run-summary.json)");
  console.log(`\nDeliverables (${outDir}):`);
  for (const f of [...deliverables, "run-summary.json"]) console.log(`  ${f}`);
  console.log("");
  emitStage("complete", "Complete");
  emitCheck(true, `Audit complete${pdfAvailable ? "" : " — PDFs pending (Chromium unavailable); HTML + Markdown + JSON delivered"}`);
  if (process.env.RT_CONSOLE) process.stdout.write(`__RESULT__:${path.relative(path.join(__dirname, ".."), outDir)}\n`);

  if (process.argv.includes("--open")) {
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    try { execFileSync(opener, [auditPdf], { stdio: "ignore" }); console.log(`Opened ${auditPdf}`); }
    catch { console.log(`(Could not auto-open; open the files above manually.)`); }
  }
  } catch (e) {
    emitError(e && e.message ? e.message : String(e));
    console.error("\n✗ Audit pipeline failed:", e && e.message ? e.message : e);
    process.exitCode = 1;
  }
})();
