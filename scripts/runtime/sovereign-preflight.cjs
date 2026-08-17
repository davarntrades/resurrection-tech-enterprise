#!/usr/bin/env node
"use strict";

const rt = require("../../lib/runtime");
const json = process.argv.includes("--json");
function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }

function render(result) {
  if (json) { process.stdout.write(JSON.stringify(result, null, 2) + "\n"); return; }
  console.log("\nGuardian OS — Sovereign Preflight");
  console.log("=================================");
  console.log(`SOVEREIGN_POSTURE: ${result.status}`);
  console.log(`Verified: ${result.checked_at}`);
  console.log("");
  for (const c of result.checks || []) console.log(`${String(c.status).padEnd(7)} ${String(c.name).padEnd(30)} ${c.detail || ""}`);
  if (result.sovereign) {
    console.log("\nSovereign boundary:");
    for (const [k, v] of Object.entries(result.sovereign)) console.log(`  ${k}: ${v}`);
  }
  if (!result.ready) console.log("\nSovereign activation is BLOCKED until every required invariant is proven.");
}

(async () => {
  const result = await rt.productionReadiness.sovereignReadiness({
    sovereign_profile: arg("--profile") || "sovereign_private",
    customer_secret_store: arg("--secret-store") || process.env.GUARDIAN_CUSTOMER_SECRET_STORE,
    customer_evidence_store: arg("--evidence-store") || process.env.GUARDIAN_CUSTOMER_EVIDENCE_STORE,
  });
  render(result);
  process.exit(result.ready ? 0 : 1);
})().catch((error) => {
  const result = { status: "BLOCKED", ready: false, error: error?.message || String(error), checked_at: new Date().toISOString() };
  if (json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  else console.error("Sovereign preflight failed:", result.error);
  process.exit(2);
});
