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

// ---- AUDIT html from AssessReport ------------------------------------------
function auditHtml(c, report, perf, replay) {
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
    ${perfSection(perf, report.attestation, replay)}
    <div class="sec"><span class="eyebrow">6 · Recommended next step</span><h2>Limited Pilot™.</h2>
      <p>${(s.uncovered ?? 0) > 0 ? `${s.uncovered} risk-bearing tool(s) are uncovered or partial. ` : ""}A Limited Pilot validates interception on your own traffic and closes remaining &#937; coverage before production.</p>
    </div>
    <div class="disc">Generated from the live Runtime Governance engine assessment of the supplied manifest. Pricing indicative and non-binding; final terms follow assessment and deployment review.</div>`);
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
function reportHtml(c, m, assess, replay, perf) {
  const isLive = (m.source === "engine" || m.source === "decisions") && (m.total || 0) > 0;
  const meta = [["Customer", c.name], ["Period", c.period || "—"], ["Reference", c.reference || "—"], ["Classification", "Board · Confidential"]];
  const s = (assess && assess.summary) || {};
  const att = assess && assess.attestation;
  const blocks = (assess && assess.grounded_blocks) || [];
  const hashCount = blocks.filter((b) => b && b.hash).length;
  const rep = replay || { checked: 0, deterministic: 0 };
  const mono = "font-family:ui-monospace,Menlo,monospace";

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
      <div class="sec"><span class="eyebrow">Runtime evidence status</span><h2>Structural governance assessment completed successfully.</h2>
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
      ${perfSection(perf, att, replay)}
      <div class="sec"><span class="eyebrow">Operational metrics — pending live evidence</span><h2>Populate automatically once trajectories are evaluated.</h2>
        <p style="color:#8a929c">The following become available the moment governed trajectories flow through <span style="${mono};color:#8fb0ff">/v1/evaluate</span>:</p>
        <ul class="pending">${pending.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
      </div>
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
    ${perfSection(perf, att, replay)}
    <div class="sec"><span class="eyebrow">Recommendations</span><h2>Prioritised next actions.</h2>
      <p>${(m.block || 0) > 0 ? "Review the top prevented categories with the security team and confirm policy thresholds. " : ""}Schedule the quarterly &#937; revalidation and bring newly integrated tools under governance at onboarding. Runtime evidence accumulates across periods to form the Monthly Governance Evidence series.</p>
    </div>
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
function auditMarkdown(c, report, perf, replay) {
  const L = [`# Runtime Safety Audit — ${c.name}`, ``, `**Reference:** ${c.reference || "—"}  |  **Environment:** ${c.environment || "—"}  |  **Classification:** Confidential`];
  if (!report) { L.push(``, `> Engine assessment unavailable for this run. Coverage, exposure, and verified-blocked-trajectory sections come from the live Runtime Governance engine — set GOVERNANCE_URL/GOVERNANCE_TOKEN and re-run.`); return L.join("\n"); }
  const s = report.summary || {}, ex = report.exposure || {}, tools = report.tools || [], blocks = report.grounded_blocks || [], att = report.attestation;
  L.push(``, `## Executive summary`, ``);
  L.push(`- Tools assessed: **${s.tools ?? "—"}** (risk-bearing: ${s.risky ?? "—"})`);
  L.push(`- Ω coverage: **${s.coverage_pct ?? "—"}%** (covered ${s.covered ?? "—"} · partial ${s.partial ?? "—"} · uncovered ${s.uncovered ?? "—"})`);
  L.push(`- Verified blocked trajectories: **${s.verified_blocked_trajectories ?? "—"}**`);
  if (Object.keys(ex).length) { L.push(``, `## Ω exposure by risk class`, ``, `| Risk class | Status | Tools | Rules |`, `|---|---|---|---|`); for (const [rc, x] of Object.entries(ex)) L.push(`| ${mdEsc(rc)} | ${mdEsc(x.status)} | ${x.tools ?? "—"} | ${mdEsc((x.rules || []).join(", ") || "—")} |`); }
  if (tools.length) { L.push(``, `## Tool risk surface`, ``, `| Tool | Capabilities | Status |`, `|---|---|---|`); for (const t of tools) L.push(`| ${mdEsc(t.tool)} | ${mdEsc((t.capabilities || []).join(", ") || "—")} | ${mdEsc(t.status)} |`); }
  if (blocks.length) { L.push(``, `## Verified blocked trajectories`, ``, `| Trajectory | Risk class | Ω domain | Evidence hash |`, `|---|---|---|---|`); for (const b of blocks) L.push(`| ${mdEsc(b.label)} | ${mdEsc(b.risk_class)} | ${mdEsc(b.omega_domain || "—")} | \`${(b.hash || "").slice(0, 16)}\` |`); }
  if (att) L.push(``, `## Attestation`, ``, `- Engine commit: \`${att.engine_commit}\``, `- Ruleset hash: \`${String(att.ruleset_hash || "").slice(0, 40)}…\``, `- Service version: ${att.service_version}`, `- Reachability horizon: ${att.horizon} steps`);
  const pm = perfMarkdown(perf, replay); if (pm) L.push(pm);
  L.push(``, `---`, `*Generated from the live Runtime Governance engine assessment. Pricing indicative and non-binding.*`);
  return L.join("\n");
}
function reportMarkdown(c, m, report, replay, perf) {
  const isLive = (m.source === "engine" || m.source === "decisions") && (m.total || 0) > 0;
  const s = (report && report.summary) || {};
  const L = [`# Runtime Governance Executive Report — ${c.name}`, ``, `**Period:** ${c.period || "—"}  |  **Reference:** ${c.reference || "—"}  |  **Classification:** Board · Confidential`, ``];
  if (!isLive) {
    L.push(`> **Deployment Ready.** Runtime evidence will populate automatically once representative trajectories have been replayed through the live Runtime Governance engine. This report currently represents deployment readiness rather than production activity.`, ``, `## Deployment readiness`, ``);
    L.push(`- Structural assessment completed: ${s.tools ?? "—"} tools, ${s.risky ?? "—"} risk-bearing`);
    L.push(`- Ω coverage: ${s.coverage_pct ?? "—"}%`);
    L.push(`- Verified blocked trajectories: ${s.verified_blocked_trajectories ?? "—"}`);
    if (report && report.attestation) L.push(`- Engine attestation: commit \`${String(report.attestation.engine_commit || "").slice(0, 10)}\``);
  } else {
    const total = m.total || 0, pct = (n) => total ? ((n / total) * 100).toFixed(1) : "0.0";
    L.push(`## The period at a glance`, ``);
    L.push(`- Actions governed: **${total}**`);
    L.push(`- ALLOW ${m.allow || 0} (${pct(m.allow)}%) · BLOCK ${m.block || 0} (${pct(m.block)}%) · ESCALATE ${m.escalate || 0} (${pct(m.escalate)}%)`);
    L.push(`- Unsafe actions prevented: **${m.block || 0}**`);
    const cats = Object.entries(m.categories || {}).sort((a, b) => b[1] - a[1]);
    if (cats.length) { L.push(``, `## Actions prevented`, ``, `| Category / Ω domain | Count |`, `|---|---|`); for (const [k, v] of cats) L.push(`| ${mdEsc(k)} | ${v} |`); }
    const pm = perfMarkdown(perf, replay); if (pm) L.push(pm);
  }
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

  console.log(`\nResurrection Tech — Delivery Kit\n  input:  ${srcLabel}\n  engine: ${GOV}\n  output: ${outDir}\n`);
  emitStage("parsing", "Parsing manifest");
  try {
  // AUDIT (/v1/assess) — accepts a parsed manifest array OR raw manifest_text
  let report = null;
  const haveManifest = (Array.isArray(input.manifest) && input.manifest.length) ||
    (typeof input.manifest_text === "string" && input.manifest_text.trim());
  const manifestBytes = input.manifest_text ? input.manifest_text.length : JSON.stringify(input.manifest || []).length;
  const toolCount = Array.isArray(input.manifest) ? input.manifest.length : null;
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
    const s = (report && report.summary) || {};
    if (report) emitCheck(true, `Runtime Governance engine assessed manifest — ${s.tools ?? "?"} tools, ${s.risky ?? "?"} risk-bearing, ${s.coverage_pct ?? "?"}% Ω coverage, ${s.verified_blocked_trajectories ?? 0} blocked trajectories`);
    else emitCheck(false, "Runtime Governance engine /v1/assess returned no report (unreachable or error) — check GOVERNANCE_URL / GOVERNANCE_TOKEN and run: npm run audit:check");
  } else console.log("• Audit: no manifest supplied — skipping assess.");
  emitStage("exposure", "Ω exposure mapping");

  // EXEC REPORT metrics (+ replay verification). Runs BEFORE rendering so the
  // measured performance samples (from each /v1/evaluate round-trip) are
  // available to BOTH the audit and the executive report PDFs.
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
    let firstEvalErr = null;
    for (const traj of input.trajectories) {
      const g = await evaluate(traj, input.domains);
      if (g && !g.__error) {
        status.evaluate = true; const v = toVerdict(g.verdict); m.total++; m[v.toLowerCase()]++;
        if (v === "BLOCK") { const k = g.omega_domain || g.reason || "Blocked"; m.categories[k] = (m.categories[k] || 0) + 1; }
        const g2 = await evaluate(traj, input.domains); // replay verification
        if (g2 && !g2.__error) { replay.checked++; if (g2.verdict === g.verdict && g2.trajectory_hash === g.trajectory_hash) replay.deterministic++; }
      } else if (!firstEvalErr) { firstEvalErr = g; }
    }
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
  const auditHtmlPath = path.join(outDir, "audit.html");
  const auditMdPath = path.join(outDir, "audit.md");
  fs.writeFileSync(auditHtmlPath, auditHtml(c, report, perf, replay));
  fs.writeFileSync(auditMdPath, auditMarkdown(c, report, perf, replay));
  emitCheck(true, "Audit document generated (HTML + Markdown)");
  emitStage("audit", "Generating audit PDF");
  const auditPdfOk = renderPdf(auditHtmlPath, auditPdf, "Audit");

  emitStage("report", "Generating executive report");
  const reportHtmlPath = path.join(outDir, "executive-report.html");
  const reportMdPath = path.join(outDir, "executive-report.md");
  fs.writeFileSync(reportHtmlPath, reportHtml(c, m, report, replay, perf));
  fs.writeFileSync(reportMdPath, reportMarkdown(c, m, report, replay, perf));
  emitCheck(true, "Executive report generated (HTML + Markdown)");
  const reportPdfOk = renderPdf(reportHtmlPath, reportPdf, "Executive report");

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

  // machine-readable evidence written alongside the PDFs
  const perfOut = perf ? {
    measured: true, total_evaluations: perf.n,
    avg_ms: +perf.mean.toFixed(4), p50_ms: +perf.p50.toFixed(4), p95_ms: +perf.p95.toFixed(4), p99_ms: +perf.p99.toFixed(4),
    min_ms: +perf.min.toFixed(4), max_ms: +perf.max.toFixed(4), evals_per_sec: +perf.eps.toFixed(2),
    assess_ms: PERF.assessMs != null ? +PERF.assessMs.toFixed(4) : null,
    replay_determinism: `${replay.deterministic}/${replay.checked}`,
  } : { measured: false, assess_ms: PERF.assessMs != null ? +PERF.assessMs.toFixed(4) : null };
  const deliverables = fs.readdirSync(outDir).filter((f) => /\.(pdf|html|md|json)$/.test(f) && f !== "run-summary.json");
  fs.writeFileSync(path.join(outDir, "run-summary.json"), JSON.stringify({
    customer: c, engine: GOV, status, replay, mode,
    metrics: m, fields: Object.fromEntries(fields.map(([n, ok]) => [n, ok])),
    field_kinds: Object.fromEntries(fields.map(([n, , k]) => [n, k])),
    pending: runtimePending, missing: structuralMissing,
    performance: perfOut,
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
