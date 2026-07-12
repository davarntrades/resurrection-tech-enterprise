#!/usr/bin/env node
"use strict";
const ea = require("../../lib/runtime/enterpriseassessment");

let failed = 0;
const ok = (value, label) => value ? console.log(`PASS: ${label}`) : (failed++, console.error(`FAIL: ${label}`));

const environments = [
  { id: "prod", kind: "production", mode: "enforce" },
  { id: "stage", kind: "staging", mode: "shadow" },
];
const assessed = environments.map((environment) => ({ environment }));
const readiness = ea.readinessModel({
  environments, assessed,
  totals: { risky: 10, covered: 10, partial: 0, uncovered: 0 },
  chains: [{ ok: true }, { ok: true }], telemetryTotal: 20,
});
ok(readiness.score === 100, `readiness uses the documented weighted evidence model (got ${readiness.score})`);
ok(readiness.components.length === 5, "readiness exposes all scoring components");

const exposure = ea.aggregateExposure([
  { environment: environments[0], exposure: { "Privilege Escalation": { status: "Covered", tools: 2, rules: ["role_change"] } } },
  { environment: environments[1], exposure: { "Privilege Escalation": { status: "Partial", tools: 1, rules: ["role_change", "admin_grant"] } } },
]);
ok(exposure["Privilege Escalation"].status === "Partial", "aggregate exposure preserves the least-safe status");
ok(exposure["Privilege Escalation"].tools === 3 && exposure["Privilege Escalation"].environment_count === 2, "aggregate exposure counts tools and environments");
ok(exposure["Privilege Escalation"].rules.length === 2, "aggregate exposure de-duplicates rules");

const gaps = ea.controlGaps({
  environments,
  assessed: [{ environment: environments[0] }],
  totals: { uncovered: 2, partial: 1 }, telemetryTotal: 0, replayReady: false,
});
ok(gaps.some((x) => x.title === "Incomplete estate manifest coverage"), "missing environment manifests are disclosed");
ok(gaps.some((x) => x.severity === "Critical"), "uncovered pathways create a critical control gap");
ok(gaps.some((x) => /replay/i.test(x.title)), "missing replay evidence is disclosed, not fabricated");

const compliance = ea.complianceMappings({ totals: { risky: 5, covered: 5, uncovered: 0 }, telemetryTotal: 0, replayReady: false });
ok(compliance.some((x) => x.control.includes("Article 12") && x.status === "Not evidenced"), "record-keeping is not claimed without telemetry");
ok(compliance.some((x) => x.control.includes("Article 14") && /validation required/i.test(x.status)), "human oversight requires stakeholder validation");

if (failed) process.exit(1);
console.log("enterprise assessment model test passed");
