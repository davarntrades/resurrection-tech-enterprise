#!/usr/bin/env node
/* Runtime Governance — alerting unit test (file store; no engine needed).
 * Covers raise/persist/list, the in-process cooldown, and evaluate() conditions
 * (store_non_durable always on the file store; block_spike over threshold). */
"use strict";
const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path");

for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RUNTIME_ALERT_WEBHOOK", "RUNTIME_ALERT_EMAIL_TO"]) delete process.env[k];
process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-alert-"));
process.env.RUNTIME_ALERT_BLOCK_SPIKE = "2";
process.env.RUNTIME_ALERT_COOLDOWN_MIN = "5";
process.env.RUNTIME_LOG_SILENT = "1";
const store = require("../../lib/runtime/store");
const alerts = require("../../lib/runtime/alerts");

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };

(async () => {
  // 1) raise → persists + list returns it.
  const a = await alerts.raise({ org_id: "org_a", environment_id: "env_a", kind: "record_failure", message: "boom" });
  ok(a && a.kind === "record_failure" && a.severity === "critical", "record_failure raises as critical");
  let recent = await alerts.list({ limit: 10 });
  ok(recent.length === 1 && recent[0].message === "boom", "alert is persisted + listable");

  // 2) cooldown suppresses a duplicate kind+scope within the window.
  const dup = await alerts.raise({ org_id: "org_a", environment_id: "env_a", kind: "record_failure", message: "boom again" });
  ok(dup === null, "duplicate alert within cooldown is suppressed");
  recent = await alerts.list({ limit: 10 });
  ok(recent.length === 1, "suppressed alert is not persisted");

  // 3) a different scope is NOT suppressed.
  const other = await alerts.raise({ org_id: "org_a", environment_id: "env_b", kind: "record_failure", message: "different env" });
  ok(other && other.environment_id === "env_b", "different scope is not suppressed");

  // 4) evaluate(): store_non_durable is always firing on the file store.
  const globals = await alerts.evaluate({});
  ok(globals.some((c) => c.kind === "store_non_durable"), "evaluate flags non-durable file store");

  // 5) block_spike over threshold.
  for (let i = 0; i < 3; i++) await store.appendDecision({ org_id: "org_s", environment_id: "env_s", engine_verdict: "BLOCK", verdict: "BLOCK", omega_domain: "finance", rule: "r" });
  const conds = await alerts.evaluate({ org_id: "org_s", environment_id: "env_s" });
  const spike = conds.find((c) => c.kind === "block_spike");
  ok(!!spike && spike.meta.blocks >= 2, `block_spike fires over threshold (blocks=${spike && spike.meta.blocks})`);

  // 6) sweep() runs and returns a shape, without throwing.
  const swept = await alerts.sweep();
  ok(typeof swept.raised === "number" && Array.isArray(swept.kinds), "sweep returns a summary");

  console.log(`\nalerts unit test: ${pass} passed, ${fail} failed`);
  if (fail) { console.log("FAILURES:"); for (const f of fails) console.log("  ✗ " + f); }
  try { fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true }); } catch { /* */ }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("alerts test crashed:", e); process.exit(1); });
