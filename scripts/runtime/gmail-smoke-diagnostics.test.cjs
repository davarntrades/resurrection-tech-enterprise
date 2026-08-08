#!/usr/bin/env node
/* ============================================================================
 * The governed Gmail smoke must explain WHY it failed — correctly.
 *
 * preview-e2e was habitually red and its log said only:
 *
 *     Runtime Governance did not permit execution: blocked
 *     Executable permit was not issued (approval_status=not_approved)
 *
 * with no rule, no verdict, no reason. From outside, three completely
 * different situations look identical:
 *
 *   · governance refused on a policy rule        -> a policy question
 *   · the action is awaiting operator approval   -> a workflow question
 *   · the engine or connector is unavailable     -> an infrastructure question
 *
 * WHAT THE FIRST FIX GOT WRONG
 *
 * Printing the fields was necessary but not sufficient. The first classifier
 * branched on `runtime_governance_decision === "blocked"` FIRST — and the
 * gateway records "blocked" for an unreachable engine too (correctly: refusing
 * to execute is a block). So every outage was reported as "GOVERNANCE REFUSED
 * (policy) — see rule above" while printing "Governance rule: none recorded"
 * directly above it. That is worse than silence: it sends an engineer to read
 * a policy that never ran.
 *
 * The bug survived the first test suite because that suite asserted the
 * *strings existed in the source*, never that the classification was right.
 * So these tests execute the classifier against the payload an actually
 * failing CI run produced.
 * ========================================================================== */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { classifyRefusal } = require("./governance-refusal-class.cjs");

const SRC = fs.readFileSync(
  path.resolve(__dirname, "gmail-production-smoke.cjs"), "utf8");

let pass = 0, fail = 0; const failures = [];
const ok = (c, m) => { if (c) pass++; else { fail++; failures.push(m); } };
const eq = (actual, expected, m) =>
  ok(actual === expected, `${m} (expected ${expected}, got ${actual})`);

/* ── 1. The real failing run ────────────────────────────────────────────────
 * Verbatim from run 31265408828, communication run cmr_00c799fc9da83abbe2.
 * Note decision === "blocked" while verdict and rule are null: this is the
 * exact shape the old classifier called a policy refusal. */
const OUTAGE_RUN = {
  runtime_governance_decision: "blocked",
  runtime_governance_evaluated: false,
  governance_verdict: null,
  governance_rule: null,
  approval_status: "not_approved",
  workflow_status: "blocked",
  safe_failure_reason:
    "governance_unavailable | GOVERNANCE_UNAVAILABLE: Runtime Governance unavailable; the message was not sent",
};
eq(classifyRefusal(OUTAGE_RUN).class, "infrastructure",
  "an unreachable engine recorded as decision=blocked must classify as infrastructure");
ok(/infrastructure/i.test(classifyRefusal(OUTAGE_RUN).label),
  "the operator-facing label for an outage must say infrastructure");
ok(!/policy/i.test(classifyRefusal(OUTAGE_RUN).label),
  "an outage must NOT be reported as a policy refusal — no rule was evaluated");

/* ── 2. A genuine policy refusal must still read as policy ─────────────────
 * Same decision value; what differs is that the engine actually ran and named
 * a rule, and the failure reason classifies as a governance DECISION. */
const POLICY_RUN = {
  runtime_governance_decision: "blocked",
  runtime_governance_evaluated: true,
  governance_verdict: "BLOCK",
  governance_rule: "ops_unauthorized_report_delivery",
  approval_status: "not_approved",
  workflow_status: "blocked",
  safe_failure_reason:
    "governance_decision | GOVERNANCE_BLOCKED: refused by ops_unauthorized_report_delivery",
};
eq(classifyRefusal(POLICY_RUN).class, "policy",
  "an evaluated refusal naming a rule must classify as policy");

/* ── 3. Escalation is a workflow state, not a refusal ──────────────────────── */
eq(classifyRefusal({
  runtime_governance_decision: "escalated",
  approval_status: "awaiting_approval",
  workflow_status: "awaiting_approval",
  safe_failure_reason: null,
}).class, "approval", "an escalated run awaiting a human must classify as approval");

/* ── 4. Unknown shapes must not be guessed into a category ─────────────────── */
eq(classifyRefusal({}).class, "unclassified",
  "an empty run must classify as unclassified rather than be guessed");
eq(classifyRefusal({ runtime_governance_decision: "executed" }).class, "unclassified",
  "a non-refusal decision must not be forced into a refusal category");

/* ── 5. Ordering regression guard ───────────────────────────────────────────
 * The precise inversion that shipped: infrastructure must win over the
 * decision field, never the other way round. */
eq(classifyRefusal({
  runtime_governance_decision: "blocked",
  approval_status: "escalated",
  safe_failure_reason: "governance_unavailable | GOVERNANCE_UNAVAILABLE: engine unreachable",
}).class, "infrastructure",
  "infrastructure must be ruled out BEFORE the decision field and before approval state");

/* ── 6. The failure branch must still surface every diagnostic field ───────── */
for (const [label, needle] of [
  ["governance verdict", "Governance verdict:"],
  ["governance rule", "Governance rule:"],
  ["governance reason", "Governance reason:"],
  ["approval status", "Approval status:"],
  ["connector health", "Connector health:"],
  ["likely cause classification", "Likely cause:"],
]) {
  ok(SRC.includes(needle), `failure output must print the ${label}`);
}

/* ── 7. The machine-readable artefact must carry the distinction ───────────── */
ok(/governance_refusal_class/.test(SRC),
  "the JSON artefact must record the refusal class, not only the collapsed outcome");

/* ── 8. Diagnostics must never soften the gate ───────────────────────────────
 * Every class above is still a failure. A check that explains itself while
 * quietly passing would be worse than the silent one it replaced. */
ok(/throw new Error\(`Required governed Gmail delivery was not achieved/.test(SRC),
  "unmet requirements must still throw — diagnostics must not soften the gate");
ok(!/process\.exitCode\s*=\s*0/.test(SRC),
  "the smoke must not force a success exit code");
ok(!/governance_refusal_class[^\n]*(?:return|continue|skip)/.test(SRC),
  "the refusal class must never be used to skip or pass a failing run");

console.log(`\ngmail-smoke-diagnostics: ${pass} passed, ${fail} failed`);
if (fail) { for (const f of failures) console.error(`  ✗ ${f}`); process.exit(1); }
