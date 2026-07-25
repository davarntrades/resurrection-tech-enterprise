/* ============================================================================
 * Guardian OS Sovereign — offline-clean build audit.
 *
 * A sovereign interface must not merely FAIL to reach the internet; it must not
 * ASK. A browser on a disconnected network does not error usefully on a font or
 * telemetry request — it stalls, falls back, and the operator sees a slow,
 * subtly wrong interface with no explanation. So this audit checks the emitted
 * artefacts, not the runtime behaviour:
 *
 *   1. every server-rendered page's HTML, for RESOURCE loads to external hosts
 *      (<script src>, <link rel=stylesheet|preconnect|preload>, <img src>,
 *      url() in inline CSS, fetch()/XHR/WebSocket literals);
 *   2. every client JS chunk Next.js emitted, for the same;
 *   3. the CSS bundle, for @import and url() pointing off-box.
 *
 * NAVIGATION IS NOT A FETCH. An <a href="https://…"> is a link a human may
 * click; it costs nothing on load and a disconnected browser simply reports it
 * cannot reach the site. Those are REPORTED (so an operator knows which links
 * will be dead on a private network) but do not fail the audit. Resource loads
 * do fail it — that is the actual distinction that matters at 3am on a
 * classified network.
 *
 *   node scripts/sovereign/offline-audit.cjs            # audit ./.next
 *   node scripts/sovereign/offline-audit.cjs --build    # build first, then audit
 *   node scripts/sovereign/offline-audit.cjs --baseline # expect a CLOUD build
 *                                                       # (proves the audit
 *                                                       #  actually detects)
 * ========================================================================== */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..", "..");
const NEXT_DIR = path.join(ROOT, ".next");
const BUILD = process.argv.includes("--build");
const BASELINE = process.argv.includes("--baseline");

// Hosts that may appear in a sovereign build. Each needs a reason — an
// allowlist without reasons decays into "whatever we happened to ship".
const INERT_ALLOW = [
  { host: "schema.org", why: "JSON-LD @context — an identifier, never fetched by a browser" },
  { host: "www.w3.org", why: "SVG/XML namespace URI — an identifier, never fetched" },
  { host: "localhost", why: "loopback" },
  { host: "127.0.0.1", why: "loopback" },
  { host: "0.0.0.0", why: "loopback" },
];
// Example/illustrative hostnames used INSIDE demo trajectory payloads. They are
// data shown to the user (an adversarial tool call), never a request.
const EXAMPLE_HOST = /(^|\.)(example|invalid|test|local|localdomain)$|(^|\.)example\.(com|org|net|ext)$|attacker|must-never-be-used/i;

const RESOURCE_PATTERNS = [
  { kind: "script", re: /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi },
  { kind: "stylesheet", re: /<link\b[^>]*\brel\s*=\s*["'](?:stylesheet|preconnect|preload|dns-prefetch|prefetch)["'][^>]*\bhref\s*=\s*["']([^"']+)["']/gi },
  { kind: "stylesheet", re: /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\brel\s*=\s*["'](?:stylesheet|preconnect|preload|dns-prefetch|prefetch)["']/gi },
  { kind: "image", re: /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi },
  { kind: "css-url", re: /url\(\s*["']?(https?:\/\/[^)"']+)["']?\s*\)/gi },
  { kind: "css-import", re: /@import\s+(?:url\()?["']?(https?:\/\/[^)"';]+)["']?/gi },
  { kind: "fetch", re: /\bfetch\(\s*["'`](https?:\/\/[^"'`]+)["'`]/gi },
  { kind: "xhr", re: /\.open\(\s*["'][A-Z]+["']\s*,\s*["'`](https?:\/\/[^"'`]+)["'`]/gi },
  { kind: "websocket", re: /new\s+WebSocket\(\s*["'`](wss?:\/\/[^"'`]+)["'`]/gi },
  { kind: "importScripts", re: /importScripts\(\s*["'`](https?:\/\/[^"'`]+)["'`]/gi },
];
const ANCHOR = /<a\b[^>]*\bhref\s*=\s*["'](https?:\/\/[^"']+)["']/gi;

function hostOf(u) {
  try { return new URL(u).host.toLowerCase(); } catch { return null; }
}
// A registrable host has a dot and a TLD, or is an IP literal. Vendored
// URL-parser fixtures inside JS chunks contain strings like `https://a#б` and
// `https://тест` — data, not endpoints. Requiring a real host keeps the audit
// signal clean; anything that could actually resolve still trips it.
function registrable(host) {
  if (!host) return false;
  const bare = host.replace(/:\d+$/, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(bare) || bare.startsWith("[")) return true;
  return /\.[a-z]{2,}$/i.test(bare) || /\.xn--/i.test(bare);
}

function allowed(host) {
  if (!host) return true;
  if (!registrable(host)) return true;
  if (INERT_ALLOW.some((a) => host === a.host || host.endsWith(`.${a.host}`))) return true;
  if (EXAMPLE_HOST.test(host)) return true;
  return false;
}

function scan(text, source) {
  const resources = [];
  const links = [];
  for (const { kind, re } of RESOURCE_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const url = m[1];
      if (!/^(https?:)?\/\//i.test(url) && !/^wss?:/i.test(url)) continue;   // relative = on-box
      const host = hostOf(url.startsWith("//") ? `https:${url}` : url);
      if (allowed(host)) continue;
      resources.push({ kind, host, url: url.slice(0, 140), source });
    }
  }
  ANCHOR.lastIndex = 0;
  let a;
  while ((a = ANCHOR.exec(text)) !== null) {
    const host = hostOf(a[1]);
    if (!allowed(host)) links.push({ host, url: a[1].slice(0, 140), source });
  }
  return { resources, links };
}

function walk(dir, filter, out = []) {
  let items = [];
  try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const it of items) {
    const p = path.join(dir, it.name);
    if (it.isDirectory()) walk(p, filter, out);
    else if (filter(p)) out.push(p);
  }
  return out;
}

function main() {
  if (BUILD) {
    console.log(`\nBuilding (${BASELINE ? "cloud baseline" : "sovereign"})…`);
    execFileSync("npm", ["run", BASELINE ? "build" : "build:sovereign"], {
      cwd: ROOT, stdio: "inherit",
      env: { ...process.env, ...(BASELINE ? { SOVEREIGN_BUILD: "0", NEXT_PUBLIC_SOVEREIGN_BUILD: "0" } : {}) },
    });
  }
  if (!fs.existsSync(NEXT_DIR)) {
    console.error("no .next build found — run with --build, or `npm run build:sovereign` first");
    process.exit(2);
  }

  // Prerendered HTML + the emitted client chunks + the CSS bundle.
  const targets = [
    ...walk(path.join(NEXT_DIR, "server"), (p) => p.endsWith(".html") || p.endsWith(".rsc")),
    ...walk(path.join(NEXT_DIR, "static"), (p) => p.endsWith(".js") || p.endsWith(".css")),
  ];

  const resources = [];
  const links = [];
  for (const f of targets) {
    let text;
    try { text = fs.readFileSync(f, "utf8"); } catch { continue; }
    const r = scan(text, path.relative(ROOT, f));
    resources.push(...r.resources);
    links.push(...r.links);
  }

  const byHost = {};
  for (const r of resources) (byHost[r.host] = byHost[r.host] || []).push(r);
  const linkHosts = [...new Set(links.map((l) => l.host))].sort();

  console.log(`\nOffline-clean audit — ${targets.length} artefact(s) scanned`);
  console.log(`  mode: ${BASELINE ? "CLOUD BASELINE (external hosts EXPECTED)" : "SOVEREIGN (external hosts FORBIDDEN)"}\n`);

  if (Object.keys(byHost).length) {
    console.log("  External RESOURCE loads (these are fetched on page load):");
    for (const [host, hits] of Object.entries(byHost).sort()) {
      const kinds = [...new Set(hits.map((h) => h.kind))].join(", ");
      console.log(`    ${host}  (${hits.length}× — ${kinds})`);
      console.log(`      e.g. ${hits[0].source}: ${hits[0].url}`);
    }
  } else {
    console.log("  External RESOURCE loads: none");
  }

  if (linkHosts.length) {
    console.log(`\n  Outbound LINKS (navigation only — not fetched, but dead on a private network):`);
    console.log(`    ${linkHosts.join(", ")}`);
  }

  // The baseline run exists so the audit cannot pass vacuously: if a CLOUD build
  // shows zero external resources, the scanner is broken, not the build clean.
  if (BASELINE) {
    const ok = Object.keys(byHost).length > 0;
    console.log(ok
      ? `\n  ✓ baseline detected ${Object.keys(byHost).length} external host(s) — the audit does discriminate\n`
      : "\n  ✗ baseline found NO external hosts — the scanner is not detecting anything, so a sovereign pass would be meaningless\n");
    process.exit(ok ? 0 : 1);
  }

  const ok = Object.keys(byHost).length === 0;
  console.log(ok
    ? "\n  ✓ the sovereign build makes no external resource request.\n"
    : `\n  ✗ ${resources.length} external resource load(s) across ${Object.keys(byHost).length} host(s) — this build is NOT offline-clean.\n`);
  process.exit(ok ? 0 : 1);
}

main();
