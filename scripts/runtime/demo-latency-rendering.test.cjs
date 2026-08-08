#!/usr/bin/env node
/* ============================================================================
 * Live-demo latency rendering — regression suite.
 *
 * The demo lost its latency display when /v1/govern began building its
 * response metadata from scratch and dropped `eval_time_ms`. Restoring it is
 * only half the job: the numbers must come from the ENFORCING endpoint and
 * must degrade honestly when the service does not report them.
 *
 * What these tests pin down:
 *
 *   · latency is read from /v1/govern metadata, never from the pre-kernel
 *     /v1/evaluate field (which measured the Ω compute alone — ~2% of a
 *     governed decision, so ~50x too small to present as "latency")
 *   · a missing measurement stays `undefined` and is never coerced to 0
 *   · a malformed payload cannot inject a fabricated 0 ms stage row
 *   · verdict mapping is untouched by any of this
 *
 * The real `lib/governance-client.ts` is exercised — not a reimplementation —
 * via a minimal TypeScript require hook, so a change to the module is caught
 * here rather than only at runtime in the browser.
 * ========================================================================== */
"use strict";
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

// ── TypeScript require hook ────────────────────────────────────────────────
// Transpile-only (no type check — `npm run typecheck` owns that) and resolve
// the project's "@/..." path alias, so the module graph loads exactly as it
// does in the app.
require.extensions[".ts"] = function compileTs(mod, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(outputText, filename);
};

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolveWithAlias(request, ...rest) {
  if (request.startsWith("@/")) {
    return originalResolve.call(this, path.join(ROOT, request.slice(2)), ...rest);
  }
  return originalResolve.call(this, request, ...rest);
};

const { mapGovernanceToEvalResult } = require("../../lib/governance-client.ts");

let pass = 0, fail = 0;
const failures = [];
function ok(condition, message, detail) {
  if (condition) { pass++; return; }
  fail++;
  failures.push(`${message}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}

const TRAJECTORY = [{ tool: "read_file", args: { path: "/app/x" } }];

/** A /v1/govern response with the metadata fields the kernel reports. */
function governResponse(metadata, verdict = "PERMIT") {
  return {
    verdict,
    permitted: verdict === "PERMIT",
    blocked: verdict === "BLOCK",
    requires_human_review: verdict === "ESCALATE",
    layer: "kernel",
    reason: "test decision",
    omega_domain: "enterprise",
    trajectory_hash: "abc123",
    reachability_distance: null,
    metadata,
  };
}

const FULL_METADATA = {
  rule: "test_rule",
  eval_time_ms: 0.5123,
  decision_time_ms: 0.5123,
  engine_time_ms: 0.0112,
  eval_number: 3,
  stage_timings_ms: {
    trajectory_analysis: 0.1731,
    capability_classification: 0.1633,
    evidence_sealing: 0.1002,
    policy_evaluation: 0.0678,
    trust_boundary: 0.0122,
    approval_verification: 0.0009,
    unattributed: 0.0,
  },
};

/* ── full metadata: every field surfaces ─────────────────────────────────── */

function testFullMetadataSurfacesEveryField() {
  const r = mapGovernanceToEvalResult(governResponse(FULL_METADATA), TRAJECTORY);
  ok(r.evalTimeMs === 0.5123, "eval_time_ms → evalTimeMs (governed decision latency)", r.evalTimeMs);
  ok(r.engineTimeMs === 0.0112, "engine_time_ms → engineTimeMs (engine compute)", r.engineTimeMs);
  ok(r.decisionTimeMs === 0.5123, "decision_time_ms → decisionTimeMs", r.decisionTimeMs);
  ok(r.evalNumber === 3, "eval_number → evalNumber", r.evalNumber);
  ok(r.stageTimingsMs && typeof r.stageTimingsMs === "object",
    "stage_timings_ms → stageTimingsMs", r.stageTimingsMs);
  ok(r.stageTimingsMs.trajectory_analysis === 0.1731,
    "stage values pass through unmodified", r.stageTimingsMs);
}

function testGovernedLatencyIsNotTheEngineComputeField() {
  // The regression that made the demo advertise ~0.01 ms for a decision that
  // actually took ~0.5 ms. The headline number must be the end-to-end governed
  // cost, not the Ω compute.
  const r = mapGovernanceToEvalResult(governResponse(FULL_METADATA), TRAJECTORY);
  ok(r.evalTimeMs !== r.engineTimeMs,
    "governed latency must not equal engine compute for a real decision",
    { evalTimeMs: r.evalTimeMs, engineTimeMs: r.engineTimeMs });
  ok(r.evalTimeMs > r.engineTimeMs,
    "governed latency must exceed engine compute", { e: r.evalTimeMs, g: r.engineTimeMs });
}

/* ── graceful degradation: missing fields ────────────────────────────────── */

function testMissingTimingFieldsStayUndefined() {
  // An older governance service reports only eval_time_ms. Nothing may be
  // invented for the fields it does not send.
  const r = mapGovernanceToEvalResult(
    governResponse({ rule: "test_rule", eval_time_ms: 0.4 }), TRAJECTORY);
  ok(r.evalTimeMs === 0.4, "present field still surfaces", r.evalTimeMs);
  for (const f of ["engineTimeMs", "decisionTimeMs", "evalNumber", "stageTimingsMs"]) {
    ok(r[f] === undefined, `${f} must be undefined when absent, never 0`, { field: f, value: r[f] });
    ok(r[f] !== 0, `${f} must never be coerced to 0`, r[f]);
  }
}

function testEntirelyAbsentMetadataDoesNotThrow() {
  for (const metadata of [null, undefined, {}]) {
    let r;
    assert.doesNotThrow(() => { r = mapGovernanceToEvalResult(governResponse(metadata), TRAJECTORY); },
      `metadata ${JSON.stringify(metadata)} must not throw`);
    ok(r.evalTimeMs === undefined, "no latency claimed when none reported", r.evalTimeMs);
    ok(r.stageTimingsMs === undefined, "no stage breakdown claimed when none reported", r.stageTimingsMs);
    ok(typeof r.verdict === "string", "verdict still produced without metadata", r.verdict);
  }
}

function testNonNumericTimingValuesAreRejected() {
  // A malformed or hostile payload must not become a displayed number.
  const r = mapGovernanceToEvalResult(governResponse({
    eval_time_ms: "0.5", engine_time_ms: null, decision_time_ms: NaN,
    eval_number: [], stage_timings_ms: "not-an-object",
  }), TRAJECTORY);
  ok(r.evalTimeMs === undefined, "string eval_time_ms rejected", r.evalTimeMs);
  ok(r.engineTimeMs === undefined, "null engine_time_ms rejected", r.engineTimeMs);
  ok(r.decisionTimeMs === undefined, "NaN decision_time_ms rejected", r.decisionTimeMs);
  ok(r.evalNumber === undefined, "array eval_number rejected", r.evalNumber);
  ok(r.stageTimingsMs === undefined, "string stage_timings_ms rejected", r.stageTimingsMs);
}

function testMalformedStageEntriesAreDroppedNotZeroed() {
  const r = mapGovernanceToEvalResult(governResponse({
    eval_time_ms: 0.5,
    stage_timings_ms: {
      trajectory_analysis: 0.17,
      capability_classification: "fast",   // must be dropped
      evidence_sealing: null,              // must be dropped
      policy_evaluation: 0.06,
    },
  }), TRAJECTORY);
  ok(r.stageTimingsMs.trajectory_analysis === 0.17, "numeric stage kept", r.stageTimingsMs);
  ok(r.stageTimingsMs.policy_evaluation === 0.06, "numeric stage kept", r.stageTimingsMs);
  ok(!("capability_classification" in r.stageTimingsMs),
    "non-numeric stage dropped, not coerced to 0", r.stageTimingsMs);
  ok(!("evidence_sealing" in r.stageTimingsMs),
    "null stage dropped, not coerced to 0", r.stageTimingsMs);
  ok(!Object.values(r.stageTimingsMs).some((v) => v === 0),
    "no fabricated 0 ms row may appear", r.stageTimingsMs);
}

function testEmptyStageObjectYieldsUndefinedNotEmptyTable() {
  const r = mapGovernanceToEvalResult(
    governResponse({ eval_time_ms: 0.5, stage_timings_ms: {} }), TRAJECTORY);
  ok(r.stageTimingsMs === undefined,
    "an empty stage object must not render an empty breakdown", r.stageTimingsMs);
}

function testZeroIsPreservedWhenGenuinelyReported() {
  // The inverse guard: a real measured 0 (an `unattributed` remainder that
  // rounds to zero) is a measurement and must survive. Only ABSENT values are
  // dropped.
  const r = mapGovernanceToEvalResult(governResponse({
    eval_time_ms: 0.5, stage_timings_ms: { unattributed: 0 },
  }), TRAJECTORY);
  ok(r.stageTimingsMs && r.stageTimingsMs.unattributed === 0,
    "a genuinely reported 0 must be preserved", r.stageTimingsMs);
}

/* ── verdict behaviour must be untouched ─────────────────────────────────── */

function testVerdictMappingUnchangedAcrossAllVerdicts() {
  const cases = [
    ["PERMIT", "PERMIT"], ["BLOCK", "BLOCK"], ["NO_VALID_SOLUTION", "BLOCK"],
    ["ESCALATE", "INCONCLUSIVE"], ["ENVIRONMENT_SENSITIVE", "INCONCLUSIVE"],
  ];
  for (const [engine, expected] of cases) {
    const r = mapGovernanceToEvalResult(governResponse(FULL_METADATA, engine), TRAJECTORY);
    ok(r.verdict === expected, `${engine} → ${expected}`, r.verdict);
  }
}

function testLatencyIsReportedForBlockWithoutImplyingExecution() {
  // A BLOCK still cost real time to decide, so its latency is shown — but the
  // verdict must remain BLOCK. Latency must never read as executable success.
  const r = mapGovernanceToEvalResult(governResponse(FULL_METADATA, "BLOCK"), TRAJECTORY);
  ok(r.verdict === "BLOCK", "BLOCK verdict preserved alongside latency", r.verdict);
  ok(r.evalTimeMs === 0.5123, "latency still reported for a BLOCK", r.evalTimeMs);
  ok(r.omegaReachable === true, "BLOCK still reports Ω as reached", r.omegaReachable);
}

function testInconclusiveIsNotPresentedAsSuccess() {
  const r = mapGovernanceToEvalResult(governResponse(FULL_METADATA, "ESCALATE"), TRAJECTORY);
  ok(r.verdict === "INCONCLUSIVE", "ESCALATE maps to INCONCLUSIVE", r.verdict);
  ok(r.verdict !== "PERMIT", "ESCALATE must never map to PERMIT", r.verdict);
}

/* ── UI contract: labels and unmeasured stages exist in the component ────── */

function testComponentDeclaresHonestUnmeasuredStages() {
  const src = fs.readFileSync(path.join(ROOT, "components/LiveDemoClient.tsx"), "utf8");
  ok(/UNMEASURED_STAGES/.test(src), "component declares UNMEASURED_STAGES");
  ok(/Provider call/.test(src) && /Provider response/.test(src),
    "provider legs are named in the breakdown");
  ok(/unmeasured/.test(src), "provider legs render as 'unmeasured'");
  ok(/Governed decision latency/.test(src), "headline label is 'Governed decision latency'");
  ok(/Engine compute/.test(src), "engine compute is labelled");
  ok(/<details/.test(src), "stage breakdown is behind an expandable element");
  // The pre-kernel field name must not be reintroduced as a display source.
  ok(!/metadata\?\.\s*eval_time_ms[\s\S]{0,40}v1\/evaluate/.test(src),
    "component does not read latency from the advisory endpoint");
}

function testStageLabelsCoverEveryKernelStage() {
  const src = fs.readFileSync(path.join(ROOT, "components/LiveDemoClient.tsx"), "utf8");
  for (const stage of ["canonicalization", "trust_boundary", "capability_classification",
                       "destination_resolution", "approval_verification",
                       "trajectory_analysis", "policy_evaluation", "evidence_sealing",
                       "unattributed"]) {
    ok(src.includes(stage), `STAGE_LABELS covers ${stage}`);
  }
}

/* ══════════════════════════════════════════════════════════════════════════ */

testFullMetadataSurfacesEveryField();
testGovernedLatencyIsNotTheEngineComputeField();
testMissingTimingFieldsStayUndefined();
testEntirelyAbsentMetadataDoesNotThrow();
testNonNumericTimingValuesAreRejected();
testMalformedStageEntriesAreDroppedNotZeroed();
testEmptyStageObjectYieldsUndefinedNotEmptyTable();
testZeroIsPreservedWhenGenuinelyReported();
testVerdictMappingUnchangedAcrossAllVerdicts();
testLatencyIsReportedForBlockWithoutImplyingExecution();
testInconclusiveIsNotPresentedAsSuccess();
testComponentDeclaresHonestUnmeasuredStages();
testStageLabelsCoverEveryKernelStage();

console.log(`\ndemo-latency-rendering: ${pass} passed, ${fail} failed`);
if (fail) { for (const f of failures) console.error(`  ✗ ${f}`); process.exit(1); }
