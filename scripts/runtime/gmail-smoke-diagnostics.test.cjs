#!/usr/bin/env node
/* ============================================================================
 * The governed Gmail smoke must explain WHY it failed.
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
 * An engineer could not tell which without downloading the Job Summary
 * artifact, so the check became noise — and a check people ignore hides the
 * run that matters. The fields were already collected; they were simply never
 * printed to the console the CI log shows.
 *
 * These assertions keep them printed.
 * ========================================================================== */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const SRC = fs.readFileSync(
  path.resolve(__dirname, "gmail-production-smoke.cjs"), "utf8");

let pass = 0, fail = 0; const failures = [];
const ok = (c, m) => { if (c) pass++; else { fail++; failures.push(m); } };

// The failure branch must surface each diagnostic field.
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

// The three causes must be distinguished, not collapsed into one message.
for (const [label, needle] of [
  ["policy refusal", "GOVERNANCE REFUSED (policy)"],
  ["awaiting approval", "AWAITING OPERATOR APPROVAL"],
  ["infrastructure", "GOVERNANCE OR CONNECTOR UNAVAILABLE"],
  ["unclassified fallback", "UNCLASSIFIED"],
]) {
  ok(SRC.includes(needle), `cause classification must distinguish ${label}`);
}

// The smoke must still FAIL on an unmet requirement. Diagnostics are an
// addition to the gate, never a softening of it — a check that explains itself
// while quietly passing would be worse than the silent one it replaced.
ok(/throw new Error\(`Required governed Gmail delivery was not achieved/.test(SRC),
  "unmet requirements must still throw — diagnostics must not soften the gate");
ok(!/process\.exitCode\s*=\s*0/.test(SRC),
  "the smoke must not force a success exit code");

console.log(`\ngmail-smoke-diagnostics: ${pass} passed, ${fail} failed`);
if (fail) { for (const f of failures) console.error(`  ✗ ${f}`); process.exit(1); }
