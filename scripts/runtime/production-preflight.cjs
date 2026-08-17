#!/usr/bin/env node
"use strict";

const rt = require("../../lib/runtime");
const json = process.argv.includes("--json");

function render(result) {
  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }
  console.log("\nGuardian OS — General Production Preflight");
  console.log("=========================================");
  console.log(`PRODUCTION_POSTURE: ${result.status}`);
  console.log(`Verified: ${result.checked_at}`);
  console.log("");
  for (const c of result.checks || []) {
    console.log(`${String(c.status).padEnd(7)} ${String(c.name).padEnd(24)} ${c.detail || ""}`);
  }
  console.log("");
  console.log(`Result: ${result.summary?.pass || 0} PASS · ${result.summary?.fail || 0} FAIL · ${result.summary?.warn || 0} WARN · ${result.summary?.unknown || 0} UNKNOWN`);
  if (!result.ready) console.log("Production activation is BLOCKED until the backend posture is READY.");
}

(async () => {
  const result = await rt.productionReadiness.productionReadiness();
  render(result);
  process.exit(result.ready ? 0 : 1);
})().catch((error) => {
  const result = { status: "BLOCKED", ready: false, error: error?.message || String(error), checked_at: new Date().toISOString() };
  if (json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  else console.error("Production preflight failed:", result.error);
  process.exit(2);
});
