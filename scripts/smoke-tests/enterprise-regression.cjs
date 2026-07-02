#!/usr/bin/env node
/* ============================================================================
 * Enterprise regression — full-stack, multi-sector.
 *
 * Two layers:
 *   1) Unit  (always) — deterministic sector detection + anti-contamination
 *      (sector-detection.test.cjs). No engine required.
 *   2) Live  (when GOVERNANCE_URL + GOVERNANCE_TOKEN are set) — every sector
 *      pack is driven through the real delivery kit (/v1/assess + /v1/evaluate
 *      + Chromium PDF), then each run is asserted against its expectations.
 *
 * For every scenario the live layer verifies:
 *   • correct sector selected + correct threat-model headline rendered
 *   • correct Ω-domain attribution (primary sector dominates; no foreign Ω)
 *   • Executive Report PDF renders (valid %PDF)
 *   • Technical Audit PDF renders (valid %PDF)
 *   • runtime evidence populated from the live engine (source: engine)
 *   • ALLOW/BLOCK verdict matches the expected result per trajectory
 *   • no cross-sector contamination (no other sector's Ω in the report)
 *
 * Fails immediately (non-zero exit) if any of the above breaks — including the
 * four named guards: finance-report-for-supply-chain, healthcare-in-cyber,
 * wrong Ω domain, headline≠sector.
 *
 *   node scripts/smoke-tests/enterprise-regression.cjs
 * ============================================================================ */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const K = require("../delivery-kit.cjs");

const ROOT = path.join(__dirname, "..", "..");
const PACK_DIR = __dirname;
const GOV = process.env.GOVERNANCE_URL;
const TOK = process.env.GOVERNANCE_TOKEN;

const C = { grn: (s) => `\x1b[32m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m` };
const slug = (s) => String(s || "customer").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "customer";
const isPdf = (p) => { try { return fs.readFileSync(p).slice(0, 4).toString() === "%PDF"; } catch { return false; } };
const norm = (v) => { v = String(v || "").toUpperCase(); return /BLOCK|DENY/.test(v) ? "BLOCK" : /PERMIT|ALLOW/.test(v) ? "PERMIT" : v; };

function evaluate(trajectory, domains) {
  const body = JSON.stringify({ trajectory, domains });
  const out = execFileSync("curl", ["-s", "-X", "POST", `${GOV.replace(/\/$/, "")}/v1/evaluate`,
    "-H", "Content-Type: application/json", "-H", `Authorization: Bearer ${TOK}`, "-d", body], { encoding: "utf8", timeout: 20000 });
  return JSON.parse(out);
}

const packs = fs.readdirSync(PACK_DIR).filter((f) => /^\d+.*\.json$/.test(f)).sort()
  .map((f) => ({ file: f, ...JSON.parse(fs.readFileSync(path.join(PACK_DIR, f), "utf8")) }));

// ── Layer 1: unit regression (always) ───────────────────────────────────────
console.log(C.bold("\n[1/2] Unit regression — deterministic sector detection + anti-contamination"));
let unitOk = true;
try { execFileSync("node", [path.join(PACK_DIR, "sector-detection.test.cjs")], { stdio: "inherit" }); }
catch { unitOk = false; }

// Also assert every pack's declared sector is what detection selects (headline guard, no engine needed).
console.log(C.bold("\n      Pack headline guard (detection vs declared sector)"));
const headerRows = [];
for (const p of packs) {
  const want = p._smoke.scenario;
  const industry = p.industry || (p.domains && p.domains[0]) || "";
  const gotId = K.sectorIdFor(industry, p.domains, p.sector);
  const label = K.sectorProfile(industry, p.domains, p.sector).label;
  const pass = gotId === want;
  unitOk = unitOk && pass;
  headerRows.push({ scenario: want, detected: gotId, label, pass });
  console.log(`      ${pass ? C.grn("PASS") : C.red("FAIL")}  ${want.padEnd(15)} → ${gotId.padEnd(15)} [${label}]`);
}

// ── Layer 2: live regression (when engine configured) ───────────────────────
const results = [];
if (!GOV || !TOK) {
  console.log(C.dim(`\n[2/2] Live regression SKIPPED — set GOVERNANCE_URL + GOVERNANCE_TOKEN to run the full stack (PDFs, runtime evidence, verdicts).`));
} else {
  console.log(C.bold(`\n[2/2] Live regression — driving ${packs.length} sector packs through the delivery kit @ ${GOV}`));
  for (const p of packs) {
    const scn = p._smoke.scenario;
    const checks = [];
    const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail || "" });

    // Run the full audit (both PDFs, runtime evidence, run-summary).
    let ran = true, runErr = "";
    try {
      execFileSync("node", [path.join(ROOT, "scripts", "delivery-kit.cjs"), path.join(PACK_DIR, p.file)],
        { env: { ...process.env, GOVERNANCE_URL: GOV, GOVERNANCE_TOKEN: TOK }, stdio: "ignore", timeout: 120000 });
    } catch (e) { ran = false; runErr = (e && e.message || String(e)).slice(0, 120); }
    add("audit runs", ran, runErr);

    const outDir = path.join(ROOT, "deliverables", `${slug(p.customer.name)}-${slug(p.customer.period || p.customer.reference || "report")}`);
    const summaryPath = path.join(outDir, "run-summary.json");
    const summary = fs.existsSync(summaryPath) ? JSON.parse(fs.readFileSync(summaryPath, "utf8")) : null;

    // Correct sector + threat-model headline in the rendered audit. Ground
    // truth is the pack's DECLARED scenario (_smoke.scenario) — not whatever
    // detection/override produced — so a wrong override or detection drift both
    // fail here, not just at the unit layer.
    const auditMd = fs.existsSync(path.join(outDir, "audit.md")) ? fs.readFileSync(path.join(outDir, "audit.md"), "utf8") : "";
    const expectLabel = (K.SECTORS[scn] || K.SECTORS.default).label;
    const headline = (auditMd.match(/Assessed against the ([^.]+?) threat model/i) || [])[1] || "";
    add("correct threat-model headline", headline.trim().toLowerCase() === expectLabel.toLowerCase(), `headline="${headline.trim()}" want="${expectLabel}"`);

    // FAIL-FAST: headline must not be a DIFFERENT known sector (e.g. finance for supply chain).
    const foreignHeadline = Object.values(K.SECTORS).map((s) => s.label.toLowerCase())
      .filter((l) => l !== expectLabel.toLowerCase() && l !== "enterprise")
      .some((l) => headline.trim().toLowerCase() === l);
    add("no cross-sector headline", !foreignHeadline, foreignHeadline ? `headline "${headline}" belongs to another sector` : "");

    // PDFs render.
    add("executive report PDF", isPdf(path.join(outDir, "executive-report.pdf")));
    add("technical audit PDF", isPdf(path.join(outDir, "audit.pdf")));

    // Runtime evidence from the live engine.
    const src = summary && summary.metrics && summary.metrics.source;
    add("runtime evidence (engine)", src === "engine", `source=${src}`);
    add("engine_compute_ms measured", summary && summary.performance && summary.performance.stage_timings && summary.performance.stage_timings.engine_compute_measured === true);

    // Per-trajectory verdicts match expectation (ALLOW/BLOCK).
    let verdictOk = true, fp = 0, fn = 0;
    const foreignOmega = new Set();
    const expByIdx = Object.fromEntries((p._smoke.expected || []).map((e) => [e.index, e]));
    for (let i = 0; i < p.trajectories.length; i++) {
      let res; try { res = evaluate(p.trajectories[i], p.domains); } catch { verdictOk = false; continue; }
      const want = norm((expByIdx[i] || {}).verdict);
      const got = norm(res.verdict);
      if (got !== want) { verdictOk = false; if (want === "PERMIT" && got === "BLOCK") fp++; if (want === "BLOCK" && got === "PERMIT") fn++; }
      // Collect Ω domains that fired on BLOCKs, to check for foreign contamination.
      if (got === "BLOCK" && res.omega_domain) {
        const bs = K.blockSectorId({ omega_domain: res.omega_domain });
        // A fired Ω is "foreign" only if it maps to a different, non-adjacent sector.
        const adj = K.SECTOR_ADJACENT[scn] || new Set();
        if (bs && bs !== scn && !adj.has(bs)) foreignOmega.add(`${res.omega_domain}→${bs}`);
      }
    }
    add("verdicts match expected (no FP/FN)", verdictOk, verdictOk ? "" : `false_positives=${fp} false_negatives=${fn}`);

    // No cross-sector Ω contamination (e.g. healthcare Ω in a cyber report).
    add("no cross-sector Ω contamination", foreignOmega.size === 0, foreignOmega.size ? [...foreignOmega].join(", ") : "");

    const passAll = checks.every((c) => c.ok);
    results.push({ scenario: scn, company: p.customer.name, checks, pass: passAll,
      allow: summary && summary.metrics ? summary.metrics.allow : "-", block: summary && summary.metrics ? summary.metrics.block : "-", fp, fn,
      cats: summary && summary.metrics ? summary.metrics.categories : {}, headline: headline.trim() });

    console.log(`\n  ${passAll ? C.grn("PASS") : C.red("FAIL")} ${C.bold(scn)} — ${p.customer.name}`);
    for (const c of checks) console.log(`      ${c.ok ? C.grn("✓") : C.red("✗")} ${c.name}${c.detail ? C.dim("  (" + c.detail + ")") : ""}`);
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(C.bold("\n══════════════════════════════════════════════════════════════════════"));
console.log(C.bold(" ENTERPRISE REGRESSION SUMMARY"));
console.log(C.bold("══════════════════════════════════════════════════════════════════════"));
console.log(` Unit (detection + anti-contamination): ${unitOk ? C.grn("PASS") : C.red("FAIL")}`);
if (results.length) {
  console.log(` ${"Sector".padEnd(15)}${"Status".padEnd(8)}${"Perm".padEnd(6)}${"Block".padEnd(6)}${"FP".padEnd(4)}${"FN".padEnd(4)}Headline`);
  for (const r of results) {
    console.log(` ${r.scenario.padEnd(15)}${(r.pass ? "PASS" : "FAIL").padEnd(8)}${String(r.allow).padEnd(6)}${String(r.block).padEnd(6)}${String(r.fp).padEnd(4)}${String(r.fn).padEnd(4)}${r.headline}`);
  }
} else {
  console.log(C.dim(" Live layer skipped (no engine configured)."));
}
const liveOk = results.every((r) => r.pass);
const allOk = unitOk && liveOk;
const liveWord = results.length ? ("live " + (liveOk ? "PASS" : "FAIL")) : "live skipped";
const unitWord = "unit " + (unitOk ? "PASS" : "FAIL");
console.log(C.bold("\n RESULT: " + (allOk ? C.grn("PASS") : C.red("FAIL")) + "  (" + unitWord + ", " + liveWord + ")\n"));
process.exit(allOk ? 0 : 1);
