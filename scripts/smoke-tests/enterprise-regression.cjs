#!/usr/bin/env node
/* ============================================================================
 * Enterprise regression — full-stack, multi-sector, baseline-gated.
 *
 * Layers
 *   1) Unit (always, no engine): deterministic sector detection + anti-
 *      contamination (sector-detection.test.cjs) and overlap/adversarial
 *      robustness (overlap-adversarial.test.cjs). Also a per-pack headline
 *      guard (detected sector === declared scenario).
 *   2) Live (when GOVERNANCE_URL + GOVERNANCE_TOKEN are set): every sector pack
 *      is driven through the real delivery kit (/v1/assess + /v1/evaluate +
 *      Chromium PDF) and asserted, per scenario, for:
 *        correct sector · threat-model headline · Ω attribution · recommendation
 *        engine · Executive Report PDF · Technical Audit PDF · runtime evidence
 *        (source: engine) · engine_compute_ms · deterministic replay (verdict +
 *        trajectory_hash stable) · ALLOW/BLOCK/ESCALATE verdicts · no cross-
 *        sector contamination.
 *   3) Baseline CI gate: current live results are diffed against a committed
 *      baseline.json. The build FAILS if sector detection, Ω attribution, a
 *      verdict, a trajectory_hash (replay), the headline, the recommendation,
 *      a PDF size (± tolerance), or the FP/FN counts drift. Regenerate the
 *      baseline intentionally with --update-baseline.
 *
 * Flags
 *   --update-baseline   (re)write baseline.json from the current live run
 *   --report [file]     write the markdown validation report (default:
 *                       deliverables/ENTERPRISE-VALIDATION-REPORT.md)
 *   --no-baseline       skip the baseline gate (still runs all assertions)
 *
 *   node scripts/smoke-tests/enterprise-regression.cjs [flags]
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
const ARGV = process.argv.slice(2);
const UPDATE_BASELINE = ARGV.includes("--update-baseline");
const NO_BASELINE = ARGV.includes("--no-baseline");
const WANT_REPORT = ARGV.includes("--report");
const REPORT_PATH = (() => {
  const i = ARGV.indexOf("--report");
  return (i >= 0 && ARGV[i + 1] && !ARGV[i + 1].startsWith("--")) ? ARGV[i + 1]
    : path.join(PACK_DIR, "VALIDATION-REPORT.md");
})();
const BASELINE_PATH = path.join(PACK_DIR, "baseline.json");
const PDF_TOLERANCE = 0.4;   // ±40% PDF-size band (absorbs timestamp jitter, catches breakage)

const C = { grn: (s) => `\x1b[32m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m`, yel: (s) => `\x1b[33m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m` };
const slug = (s) => String(s || "customer").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "customer";
const pdfSize = (p) => { try { const b = fs.readFileSync(p); return b.slice(0, 4).toString() === "%PDF" ? b.length : 0; } catch { return 0; } };
const norm = (v) => { v = String(v || "").toUpperCase(); if (/BLOCK|DENY/.test(v)) return "BLOCK"; if (/PERMIT|ALLOW/.test(v)) return "PERMIT"; if (/ESCALATE|HUMAN_REVIEW|REVIEW/.test(v)) return "ESCALATE"; return v; };

function evaluate(trajectory, domains) {
  const out = execFileSync("curl", ["-s", "-X", "POST", `${GOV.replace(/\/$/, "")}/v1/evaluate`,
    "-H", "Content-Type: application/json", "-H", `Authorization: Bearer ${TOK}`,
    "-d", JSON.stringify({ trajectory, domains })], { encoding: "utf8", timeout: 20000, maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(out);
}

const packs = fs.readdirSync(PACK_DIR).filter((f) => /^\d+.*\.json$/.test(f)).sort()
  .map((f) => ({ file: f, ...JSON.parse(fs.readFileSync(path.join(PACK_DIR, f), "utf8")) }));

// ── Layer 1: unit ────────────────────────────────────────────────────────────
console.log(C.bold("\n[1/3] Unit — deterministic detection, anti-contamination, adversarial robustness"));
let unitOk = true;
for (const t of ["sector-detection.test.cjs", "overlap-adversarial.test.cjs"]) {
  try { execFileSync("node", [path.join(PACK_DIR, t)], { stdio: "inherit" }); }
  catch { unitOk = false; }
}
console.log(C.bold("\n      Pack headline guard (detected sector === declared scenario)"));
for (const p of packs) {
  const want = p._smoke.scenario;
  const got = K.sectorIdFor(p.industry || (p.domains && p.domains[0]) || "", p.domains, p.sector);
  const label = K.sectorProfile(p.industry || "", p.domains, p.sector).label;
  const pass = got === want;
  unitOk = unitOk && pass;
  console.log(`      ${pass ? C.grn("PASS") : C.red("FAIL")}  ${want.padEnd(16)} → ${got.padEnd(16)} [${label}]`);
}

// ── Layer 2: live ────────────────────────────────────────────────────────────
const results = [];
if (!GOV || !TOK) {
  console.log(C.dim("\n[2/3] Live regression SKIPPED — set GOVERNANCE_URL + GOVERNANCE_TOKEN for the full stack + baseline gate."));
} else {
  console.log(C.bold(`\n[2/3] Live — driving ${packs.length} sector packs through the delivery kit @ ${GOV}`));
  for (const p of packs) {
    const scn = p._smoke.scenario;
    const checks = [];
    const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail || "" });

    let ran = true, runErr = "";
    try {
      execFileSync("node", [path.join(ROOT, "scripts", "delivery-kit.cjs"), path.join(PACK_DIR, p.file)],
        { env: { ...process.env, GOVERNANCE_URL: GOV, GOVERNANCE_TOKEN: TOK }, stdio: "ignore", timeout: 120000 });
    } catch (e) { ran = false; runErr = (e && e.message || String(e)).slice(0, 120); }
    add("audit runs", ran, runErr);

    const outDir = path.join(ROOT, "deliverables", `${slug(p.customer.name)}-${slug(p.customer.period || p.customer.reference || "report")}`);
    const readIf = (f) => { try { return fs.readFileSync(path.join(outDir, f), "utf8"); } catch { return ""; } };
    const summary = (() => { try { return JSON.parse(readIf("run-summary.json")); } catch { return null; } })();
    const auditMd = readIf("audit.md");
    const execMd = readIf("executive-report.md");

    // Sector + threat-model headline (ground truth = declared scenario).
    const expectLabel = (K.SECTORS[scn] || K.SECTORS.default).label;
    const headline = ((auditMd.match(/Assessed against the ([^.]+?) threat model/i) || [])[1] || "").trim();
    add("correct threat-model headline", headline.toLowerCase() === expectLabel.toLowerCase(), `headline="${headline}" want="${expectLabel}"`);
    const foreignHeadline = Object.values(K.SECTORS).map((s) => s.label.toLowerCase())
      .filter((l) => l !== expectLabel.toLowerCase() && l !== "enterprise").some((l) => headline.toLowerCase() === l);
    add("no cross-sector headline", !foreignHeadline);

    // Recommendation engine.
    const recommendation = ((execMd.match(/## Recommended engagement — (.+)/) || [])[1] || "").trim();
    add("recommendation engine produced a recommendation", !!recommendation, recommendation);

    // PDFs.
    const auditPdf = pdfSize(path.join(outDir, "audit.pdf"));
    const execPdf = pdfSize(path.join(outDir, "executive-report.pdf"));
    add("technical audit PDF renders", auditPdf > 1000, `${auditPdf} bytes`);
    add("executive report PDF renders", execPdf > 1000, `${execPdf} bytes`);

    // Runtime evidence + engine compute.
    const src = summary && summary.metrics && summary.metrics.source;
    add("runtime evidence (source: engine)", src === "engine", `source=${src}`);
    const st = (summary && summary.performance && summary.performance.stage_timings) || {};
    add("engine_compute_ms measured", st.engine_compute_measured === true, st.governance_engine_compute_ms != null ? st.governance_engine_compute_ms + "ms" : "");
    const replayCount = summary && summary.replay ? summary.replay.checked : 0;
    const replayDet = summary && summary.replay ? summary.replay.deterministic : 0;
    add("deterministic replay (kit N/N)", replayCount > 0 && replayCount === replayDet, `${replayDet}/${replayCount}`);

    // Per-trajectory verdicts + Ω + trajectory_hash + within-run replay stability.
    const expByIdx = Object.fromEntries((p._smoke.expected || []).map((e) => [e.index, e]));
    const traj = [];
    let verdictOk = true, fp = 0, fn = 0, escMiss = 0, hashStable = true;
    const foreignOmega = new Set();
    const counts = { PERMIT: 0, BLOCK: 0, ESCALATE: 0 };
    for (let i = 0; i < p.trajectories.length; i++) {
      let r1, r2;
      try { r1 = evaluate(p.trajectories[i], p.domains); r2 = evaluate(p.trajectories[i], p.domains); }
      catch { verdictOk = false; continue; }
      const got = norm(r1.verdict);
      const want = norm((expByIdx[i] || {}).verdict);
      counts[got] = (counts[got] || 0) + 1;
      if (got !== want) {
        verdictOk = false;
        if (want === "PERMIT" && (got === "BLOCK" || got === "ESCALATE")) fp++;
        else if (want === "BLOCK" && (got === "PERMIT" || got === "ESCALATE")) fn++;
        else if (want === "ESCALATE") escMiss++;
      }
      // within-run determinism: same verdict + hash on immediate replay
      if (norm(r2.verdict) !== got || r2.trajectory_hash !== r1.trajectory_hash) hashStable = false;
      // cross-sector Ω contamination on BLOCKs
      if (got === "BLOCK" && r1.omega_domain) {
        const bs = K.blockSectorId({ omega_domain: r1.omega_domain });
        const adj = K.SECTOR_ADJACENT[scn] || new Set();
        if (bs && bs !== scn && !adj.has(bs)) foreignOmega.add(`${r1.omega_domain}→${bs}`);
      }
      traj.push({ index: i, want, got, omega: r1.omega_domain || null, hash: r1.trajectory_hash || null });
    }
    add("verdicts match expected (no FP/FN, no missed escalation)", verdictOk, verdictOk ? "" : `fp=${fp} fn=${fn} escMiss=${escMiss}`);
    add("deterministic replay (verdict + trajectory_hash stable)", hashStable);
    add("trajectory hashes present", traj.every((t) => t.hash), "");
    add("no cross-sector Ω contamination", foreignOmega.size === 0, [...foreignOmega].join(", "));

    const pass = checks.every((c) => c.ok);
    results.push({
      scenario: scn, company: p.customer.name, sector: K.sectorIdFor(p.industry || "", p.domains, p.sector),
      headline, recommendation, counts, fp, fn, escMiss,
      pdfs: { audit: auditPdf, exec: execPdf },
      runtimeEvidence: src === "engine", engineComputeMs: st.governance_engine_compute_ms ?? null,
      replay: `${replayDet}/${replayCount}`, traj, checks, pass,
    });

    console.log(`\n  ${pass ? C.grn("PASS") : C.red("FAIL")} ${C.bold(scn)} — ${p.customer.name}  ${C.dim(`(A${counts.PERMIT}/E${counts.ESCALATE}/B${counts.BLOCK})`)}`);
    for (const c of checks) if (!c.ok) console.log(`      ${C.red("✗")} ${c.name}${c.detail ? C.dim("  (" + c.detail + ")") : ""}`);
  }
}

// ── Layer 3: baseline CI gate ────────────────────────────────────────────────
let baselineOk = true;
const baselineDrift = [];
if (results.length && !NO_BASELINE) {
  if (UPDATE_BASELINE) {
    const baseline = {
      _comment: "Golden baseline for the enterprise regression CI gate. Regenerate intentionally with `npm run smoke:baseline`. A diff here fails the build.",
      generated_at: new Date().toISOString().slice(0, 10),
      sectors: results.map((r) => ({
        scenario: r.scenario, sector: r.sector, headline: r.headline, recommendation: r.recommendation,
        counts: r.counts, fp: r.fp, fn: r.fn, escMiss: r.escMiss,
        pdf: { audit: r.pdfs.audit, exec: r.pdfs.exec },
        trajectories: r.traj.map((t) => ({ index: t.index, verdict: t.got, omega: t.omega, hash: t.hash })),
      })),
    };
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n");
    console.log(C.bold(`\n[3/3] Baseline WRITTEN → ${path.relative(ROOT, BASELINE_PATH)} (${baseline.sectors.length} sectors)`));
  } else if (!fs.existsSync(BASELINE_PATH)) {
    console.log(C.yel(`\n[3/3] No baseline yet — run \`npm run smoke:baseline\` to establish one. (gate skipped)`));
  } else {
    console.log(C.bold("\n[3/3] Baseline CI gate — diffing current run against baseline.json"));
    const base = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
    const byScn = Object.fromEntries(base.sectors.map((s) => [s.scenario, s]));
    for (const r of results) {
      const b = byScn[r.scenario];
      if (!b) { baselineDrift.push(`${r.scenario}: NEW sector not in baseline`); continue; }
      const drift = (what, cur, was) => { if (JSON.stringify(cur) !== JSON.stringify(was)) baselineDrift.push(`${r.scenario}: ${what} changed  ${JSON.stringify(was)} → ${JSON.stringify(cur)}`); };
      drift("sector detection", r.sector, b.sector);
      drift("headline", r.headline, b.headline);
      drift("recommendation", r.recommendation, b.recommendation);
      drift("verdict counts", r.counts, b.counts);
      // FP/FN must never INCREASE vs baseline.
      if (r.fp > (b.fp || 0)) baselineDrift.push(`${r.scenario}: FALSE POSITIVES increased ${b.fp} → ${r.fp}`);
      if (r.fn > (b.fn || 0)) baselineDrift.push(`${r.scenario}: FALSE NEGATIVES increased ${b.fn} → ${r.fn}`);
      // Per-trajectory verdict + Ω + hash (replay integrity).
      const bT = Object.fromEntries((b.trajectories || []).map((t) => [t.index, t]));
      for (const t of r.traj) {
        const bt = bT[t.index]; if (!bt) { baselineDrift.push(`${r.scenario}[${t.index}]: new trajectory`); continue; }
        if (t.got !== bt.verdict) baselineDrift.push(`${r.scenario}[${t.index}]: VERDICT ${bt.verdict} → ${t.got}`);
        if ((t.omega || null) !== (bt.omega || null)) baselineDrift.push(`${r.scenario}[${t.index}]: Ω ${bt.omega} → ${t.omega}`);
        if ((t.hash || null) !== (bt.hash || null)) baselineDrift.push(`${r.scenario}[${t.index}]: trajectory_hash changed (replay drift)`);
      }
      // PDFs differ unexpectedly → size outside ± tolerance of baseline.
      for (const kind of ["audit", "exec"]) {
        const cur = r.pdfs[kind], was = (b.pdf || {})[kind] || 0;
        if (was && cur && Math.abs(cur - was) / was > PDF_TOLERANCE)
          baselineDrift.push(`${r.scenario}: ${kind} PDF size ${was}→${cur} (>${Math.round(PDF_TOLERANCE * 100)}% drift)`);
        if (was && !cur) baselineDrift.push(`${r.scenario}: ${kind} PDF failed to render (was ${was} bytes)`);
      }
    }
    baselineOk = baselineDrift.length === 0;
    if (baselineOk) console.log(C.grn("      ✓ no drift — sector, Ω, verdicts, hashes, recommendation, PDFs all match baseline"));
    else { console.log(C.red(`      ✗ ${baselineDrift.length} baseline drift(s):`)); for (const d of baselineDrift) console.log("        " + C.red("• " + d)); }
  }
}

// ── Validation report + summary ──────────────────────────────────────────────
const liveOk = results.every((r) => r.pass);
const allOk = unitOk && liveOk && baselineOk;
const totals = results.reduce((a, r) => {
  a.traj += r.traj.length; a.allow += r.counts.PERMIT || 0; a.block += r.counts.BLOCK || 0;
  a.esc += r.counts.ESCALATE || 0; a.fp += r.fp; a.fn += r.fn; a.escMiss += r.escMiss;
  a.pdfs += (r.pdfs.audit > 1000 ? 1 : 0) + (r.pdfs.exec > 1000 ? 1 : 0); return a;
}, { traj: 0, allow: 0, block: 0, esc: 0, fp: 0, fn: 0, escMiss: 0, pdfs: 0 });

if (WANT_REPORT || UPDATE_BASELINE) writeReport();
function writeReport() {
  const L = [];
  L.push(`# Enterprise Validation Report`, ``);
  L.push(`_Generated ${new Date().toISOString().slice(0, 19).replace("T", " ")} · engine \`${GOV || "(unit-only)"}\`_`, ``);
  L.push(`## Overall enterprise readiness: ${allOk ? "✅ READY" : "❌ NOT READY"}`, ``);
  L.push(`| Metric | Value |`, `|---|---|`);
  L.push(`| Sectors tested | ${results.length || packs.length} |`);
  L.push(`| Trajectories tested | ${totals.traj} |`);
  L.push(`| Verdicts | ALLOW ${totals.allow} · ESCALATE ${totals.esc} · BLOCK ${totals.block} |`);
  L.push(`| False positives | ${totals.fp} |`);
  L.push(`| False negatives | ${totals.fn} |`);
  L.push(`| Missed escalations | ${totals.escMiss} |`);
  L.push(`| PDFs generated | ${totals.pdfs} |`);
  L.push(`| Unit (detection + adversarial) | ${unitOk ? "PASS" : "FAIL"} |`);
  L.push(`| Baseline CI gate | ${NO_BASELINE ? "skipped" : baselineOk ? "PASS (no drift)" : "FAIL (" + baselineDrift.length + " drift)"} |`);
  L.push(`| Deterministic replay | ${results.every((r) => r.checks.find((c) => /trajectory_hash stable/.test(c.name))?.ok) ? "STABLE" : "n/a"} |`, ``);
  if (results.length) {
    L.push(`## Per-sector results`, ``);
    L.push(`| Sector | Status | Headline | Recommendation | ALLOW | ESC | BLOCK | FP | FN | Replay | PDFs |`);
    L.push(`|---|---|---|---|---|---|---|---|---|---|---|`);
    for (const r of results) {
      const pdfs = (r.pdfs.audit > 1000 ? 1 : 0) + (r.pdfs.exec > 1000 ? 1 : 0);
      L.push(`| ${r.scenario} | ${r.pass ? "PASS" : "FAIL"} | ${r.headline} | ${r.recommendation} | ${r.counts.PERMIT || 0} | ${r.counts.ESCALATE || 0} | ${r.counts.BLOCK || 0} | ${r.fp} | ${r.fn} | ${r.replay} | ${pdfs}/2 |`);
    }
    L.push(``);
  }
  L.push(`## Regression coverage`, ``);
  L.push(`- **Sectors:** ${packs.map((p) => p._smoke.scenario).join(", ")}`);
  L.push(`- **Verdict tiers:** safe (ALLOW), suspicious (ESCALATE), unsafe (BLOCK) per sector`);
  L.push(`- **Per-sector checks:** sector detection · Ω attribution · threat-model headline · executive report · technical audit · recommendation engine · PDF generation · runtime evidence · deterministic replay · trajectory hashes · no cross-sector contamination`);
  L.push(`- **Overlap + adversarial:** confusing terminology across sectors; mixed-sector / misleading-keyword / nested / malformed / duplicated / reordered / large (5000-tool) manifests — parser stays deterministic and never throws`);
  L.push(`- **Stress:** 1 / 10 / 100 / 500 / 1000 tools — engine compute, transport, report generation, memory, deterministic replay (see \`npm run smoke:stress\`)`);
  L.push(`- **CI gate:** build fails on drift in sector detection, Ω attribution, verdicts, trajectory hashes, headline, recommendation, PDF size, or any FP/FN increase`, ``);
  if (baselineDrift.length) { L.push(`## Baseline drift (build-failing)`, ``); for (const d of baselineDrift) L.push(`- ${d}`); L.push(``); }
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, L.join("\n") + "\n");
  console.log(C.dim(`\n  Validation report → ${path.relative(ROOT, REPORT_PATH)}`));
}

console.log(C.bold("\n══════════════════════════════════════════════════════════════════════"));
console.log(C.bold(" ENTERPRISE VALIDATION SUMMARY"));
console.log(C.bold("══════════════════════════════════════════════════════════════════════"));
console.log(` Unit (detection + adversarial): ${unitOk ? C.grn("PASS") : C.red("FAIL")}`);
if (results.length) {
  console.log(` ${"Sector".padEnd(15)}${"Status".padEnd(7)}${"ALLOW".padEnd(6)}${"ESC".padEnd(5)}${"BLOCK".padEnd(6)}${"FP".padEnd(4)}${"FN".padEnd(4)}Recommendation`);
  for (const r of results) {
    console.log(` ${r.scenario.padEnd(15)}${(r.pass ? "PASS" : "FAIL").padEnd(7)}${String(r.counts.PERMIT || 0).padEnd(6)}${String(r.counts.ESCALATE || 0).padEnd(5)}${String(r.counts.BLOCK || 0).padEnd(6)}${String(r.fp).padEnd(4)}${String(r.fn).padEnd(4)}${r.recommendation}`);
  }
  console.log(`\n Totals: ${totals.traj} trajectories · ALLOW ${totals.allow} · ESCALATE ${totals.esc} · BLOCK ${totals.block} · FP ${totals.fp} · FN ${totals.fn} · PDFs ${totals.pdfs}`);
  console.log(` Baseline gate: ${NO_BASELINE ? C.dim("skipped") : baselineOk ? C.grn("PASS (no drift)") : C.red("FAIL (" + baselineDrift.length + " drift)")}`);
}
const parts = ["unit " + (unitOk ? "PASS" : "FAIL")];
if (results.length) parts.push("live " + (liveOk ? "PASS" : "FAIL"), "baseline " + (NO_BASELINE ? "skip" : baselineOk ? "PASS" : "FAIL"));
else parts.push("live skipped");
console.log(C.bold("\n RESULT: " + (allOk ? C.grn("PASS") : C.red("FAIL")) + "  (" + parts.join(", ") + ")\n"));
process.exit(allOk ? 0 : 1);
