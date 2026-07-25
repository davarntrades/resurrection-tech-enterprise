/* ============================================================================
 * Assert `guardian verify --json` ran correctly with NO network.
 *
 * This lives in a file rather than inline in the workflow on purpose. Nesting a
 * `node -e` script inside a single-quoted `sh -c` inside a YAML block scalar is
 * three layers of quoting, and the escaping breaks silently — which is exactly
 * how the sovereign workflow came to fail to parse and therefore never run a
 * single job. A governance proof that quietly stops running is worse than no
 * proof at all.
 *
 * Verification is EXPECTED to fail in this context: the air-gapped CI job has no
 * policy bundle configured and no engine listening. What is being proven is that
 * `guardian verify` RUNS offline and reports honestly — all eight checks
 * present, the egress check passing, and the profile it claims to be.
 *
 *   node scripts/sovereign/assert-verify-offline.cjs verify.json
 * ========================================================================== */
"use strict";
const path = require("node:path");

const file = path.resolve(process.argv[2] || "verify.json");
let v;
try { v = require(file); }
catch (e) { console.error(`cannot read ${file}: ${e.message}`); process.exit(1); }

const ids = (v.checks || []).map((c) => c.id);
if (ids.length !== 8) {
  console.error(`expected 8 checks, got ${ids.length}: ${ids.join(",")}`);
  process.exit(1);
}

const egress = v.checks.find((c) => c.id === "egress");
if (!egress || egress.status !== "pass") {
  console.error(`egress check did not pass offline: ${egress ? egress.detail : "check missing"}`);
  process.exit(1);
}

if (v.profile !== "air_gapped") {
  console.error(`expected the air_gapped profile, got ${v.profile}`);
  process.exit(1);
}

console.log("guardian verify ran offline:", JSON.stringify(v.summary), "| egress:", egress.detail);
