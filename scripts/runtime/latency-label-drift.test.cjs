#!/usr/bin/env node
/* ============================================================================
 * Latency labels must match the field behind them.
 *
 * Two shipped mislabels, in opposite directions, motivated this:
 *
 *   demo          showed engine_time_ms as "latency"      understated ~50x
 *   Control Room  showed engine_compute_ms as "Avg engine" overstated ~19x
 *
 * Neither was wrong DATA. Both were wrong LABELS — and labels were not getting
 * the scrutiny the values were. This suite gives them the same scrutiny.
 *
 * THE FOUR MEASUREMENTS, which are not interchangeable:
 *
 *   engine_time_ms      Ω reachability compute alone
 *   decision_time_ms    the governed decision (kernel pipeline)
 *   engine_compute_ms   the whole /v1/govern service handler  (NAME IS A LIE,
 *                       kept only because store.chainCore binds it into the
 *                       decision hash chain and renaming breaks history)
 *   round_trip_ms       Node -> service -> Node, including network
 *
 * `engine_compute_ms` is the trap: its name says engine, its value is the
 * handler. Every rule below exists because of that field.
 * ========================================================================== */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

let pass = 0, fail = 0; const failures = [];
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++; failures.push(`${m}${d === undefined ? "" : ` — ${JSON.stringify(d)}`}`);
};

const SURFACES = [
  "components/LiveDemoClient.tsx",
  "components/admin/RuntimeAdminClient.tsx",
  "app/runtime-dashboard/page.tsx",
  "lib/runtime/reports.js",
];

/* ── Rule 1: no label may call the service handler "engine" ──────────────── */
// The exact strings that shipped, plus the generic shapes that would reintroduce
// the same claim.
const FORBIDDEN_ENGINE_LABELS = [
  "Avg engine", "Engine p95", "Mean engine compute", "p95 engine compute",
  "Mean engine decision time", "Mean engine compute time",
  "engine latency", "Engine latency", "avg engine", "engine avg",
];
for (const f of SURFACES) {
  const src = read(f);
  for (const bad of FORBIDDEN_ENGINE_LABELS) {
    ok(!src.includes(bad),
      `${f}: "${bad}" describes the service handler as engine compute`);
  }
}

/* ── Rule 2: an ambiguous bare "latency" label must not front the handler ── */
// "Live avg latency" backed by engine_compute_ms.mean read as governance
// latency and was ~10x too large for it.
{
  const admin = read("components/admin/RuntimeAdminClient.tsx");
  ok(!/"Live avg latency"/.test(admin),
    'a bare "Live avg latency" label must name which latency it means');
  ok(/Live avg service handler/.test(admin),
    "the overview KPI must name the service handler explicitly");
}

/* ── Rule 3: a label naming a statistic must match that statistic ────────── */
// Claiming p50 while rendering a mean is false precision. The demo's reference
// renders avg_ms; the benchmark file also carries a DIFFERENT p50_ms.
{
  const demo = read("components/LiveDemoClient.tsx");
  const auditBuilder = read("lib/live-demo-audit.ts");
  const bench = JSON.parse(read("public/benchmarks/latency.json"));
  const single = bench.classes.single_step;
  ok(single.avg_ms !== single.p50_ms,
    "avg and p50 genuinely differ, so the distinction is not academic",
    { avg: single.avg_ms, p50: single.p50_ms });
  ok(/average_ms:\s*reference\.avg_ms/.test(auditBuilder),
    "the shared v2 evidence builder sources the reference figure from avg_ms");
  ok(/CI avg/.test(demo), "…and is labelled as an average");
  ok(!/Reference benchmark p50|CI p50/.test(demo),
    "an average must not be labelled p50");
  // If the displayed field is ever switched to p50_ms, the label must move too.
  if (/benchRef\.p50_ms/.test(demo)) {
    ok(/CI p50|p50\)/.test(demo),
      "displaying p50_ms requires the label to say p50, not avg");
  }
}

/* ── Rule 4: a reference average must never read as a live measurement ───── */
{
  const demo = read("components/LiveDemoClient.tsx");
  ok(/Reference \(CI avg/.test(demo),
    "the benchmark figure must be labelled a reference, not a measurement");
  ok(/measured · this evaluation/.test(demo),
    "the live figure must be marked as measured for this evaluation");
  ok(/different hardware/.test(demo),
    "the on-page note must say the reference came from other hardware");
}

/* ── Rule 5: the four measurements stay distinct where all are shown ─────── */
{
  const admin = read("components/admin/RuntimeAdminClient.tsx");
  const expected = {
    "Governed decision": "d.decision_time_ms",
    "Engine compute": "d.engine_time_ms",
    "Service handler": "d.engine_compute_ms",
    "Round trip": "d.round_trip_ms",
  };
  for (const [label, field] of Object.entries(expected)) {
    ok(admin.includes(label), `decisions table must label "${label}"`);
    ok(admin.includes(field), `decisions table must render ${field}`);
  }
  // Order matters for reading: each is a superset of the one before it.
  const idx = (s) => admin.indexOf(s);
  ok(idx("d.decision_time_ms") < idx("d.engine_compute_ms"),
    "governed decision should precede the handler that contains it");
  ok(idx("d.engine_compute_ms") < idx("d.round_trip_ms"),
    "handler should precede the round trip that contains it");
}

/* ── Rule 6: absent must never render as 0 ───────────────────────────────── */
{
  const admin = read("components/admin/RuntimeAdminClient.tsx");
  for (const f of ["decision_time_ms", "engine_time_ms", "engine_compute_ms", "round_trip_ms"]) {
    ok(new RegExp(`d\\.${f} \\?\\? "—"`).test(admin),
      `${f} must use ?? so a genuine 0 renders as 0, not as a dash`);
    ok(!new RegExp(`d\\.${f} \\|\\| `).test(admin),
      `${f} must not use ||, which would hide a genuine 0`);
  }
}

/* ── Rule 7: the guard must detect the pattern it forbids ────────────────── */
// A scanner that matches nothing passes on any codebase.
{
  const sample = 'const x = <Stat label="Avg engine" value={lat.mean} />;';
  ok(FORBIDDEN_ENGINE_LABELS.some((b) => sample.includes(b)),
    "the forbidden-label list must actually match the string that shipped");
}

console.log(`\nlatency-label-drift: ${pass} passed, ${fail} failed`);
if (fail) { for (const f of failures) console.error(`  ✗ ${f}`); process.exit(1); }
