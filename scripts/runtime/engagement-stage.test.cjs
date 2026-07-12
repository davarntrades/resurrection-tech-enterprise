#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-stage-"));
const engagement = require("../../lib/runtime/engagement");

let failed = 0;
const ok = (value, label) => value ? console.log(`PASS: ${label}`) : (failed++, console.error(`FAIL: ${label}`));

(async () => {
  const org = "org_stage_test";
  const initial = await engagement.get(org);
  ok(initial.stage === "prospect" && initial.stage_label === "Prospect", "new customers default to Prospect");
  ok(engagement.STAGE_KEYS.includes("limited_pilot"), "Limited Pilot is an authoritative stage");
  ok(engagement.STAGE_KEYS.includes("enterprise_integration"), "Enterprise Integration is an authoritative stage");

  const pilot = await engagement.set(org, { stage: "limited_pilot" });
  ok(pilot.stage === "limited_pilot" && pilot.stage_label === "Limited Pilot", "operator can move a customer to Limited Pilot");
  const integration = await engagement.set(org, { stage: "enterprise_integration" });
  ok(integration.stage === "enterprise_integration" && integration.stage_label === "Enterprise Integration", "operator can move a customer to Enterprise Integration");

  let rejected = false;
  try { await engagement.set(org, { stage: "made_up_stage" }); } catch (e) { rejected = /invalid engagement stage/.test(e.message); }
  ok(rejected, "unknown stages fail closed");
  ok((await engagement.get(org)).stage === "enterprise_integration", "rejected updates do not change the stored stage");

  try { fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true }); } catch { /* best effort */ }
  if (failed) process.exit(1);
  console.log("engagement stage test passed");
})().catch((e) => { console.error(e); process.exit(1); });
