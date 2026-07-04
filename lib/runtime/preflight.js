/* ============================================================================
 * Runtime Governance — production configuration audit (shared).
 *
 * The non-mutating half of the deployment preflight: reads the real environment
 * + live engine and returns a PASS/FAIL/WARN check list. Used by the admin
 * dashboard readiness card (GET /api/runtime/admin/preflight) and available to
 * the CLI. Non-mutating and safe to run against production.
 * ============================================================================ */
"use strict";
const engine = require("./engine");
const store = require("./store");

const PASS = "PASS", FAIL = "FAIL", WARN = "WARN";

// Returns { ready, summary, checks:[{ name, status, detail, required }] }.
async function configAudit() {
  const checks = [];
  const add = (name, status, detail, required = true) => {
    if (status === FAIL && !required) status = WARN;
    checks.push({ name, status, detail: detail || "", required });
  };

  add("GOVERNANCE_URL", process.env.GOVERNANCE_URL ? PASS : WARN,
    process.env.GOVERNANCE_URL || `unset — using built-in default ${engine.ENGINE_URL}`, false);
  add("GOVERNANCE_TOKEN", process.env.GOVERNANCE_TOKEN ? PASS : FAIL,
    process.env.GOVERNANCE_TOKEN ? "set (engine authentication configured)" : "empty — engine calls are unauthenticated");
  add("RUNTIME_ADMIN_KEY", process.env.RUNTIME_ADMIN_KEY ? PASS : FAIL,
    process.env.RUNTIME_ADMIN_KEY ? "set (admin/onboarding protected)" : "unset — admin endpoints return 401");

  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  add("Supabase configuration", sbUrl && sbKey ? PASS : FAIL,
    sbUrl && sbKey ? "NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set"
      : `missing ${[!sbUrl && "NEXT_PUBLIC_SUPABASE_URL", !sbKey && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean).join(" + ")}`);

  const eng = await engine.health();
  add("Engine reachability", eng.ok ? PASS : FAIL,
    eng.ok ? `reachable at ${engine.ENGINE_URL}${eng.json && eng.json.engine_commit ? ` (commit ${eng.json.engine_commit})` : ""}`
      : `NOT reachable — ${eng.error || "HTTP " + eng.status}`);

  const durable = store.durable();
  add("Durable evidence storage", durable ? PASS : FAIL,
    durable ? `backend=${store.backend()} (durable + concurrency-safe)`
      : `backend=${store.backend()} — NON-DURABLE; configure Supabase`);

  const fails = checks.filter((c) => c.status === FAIL).length;
  const warns = checks.filter((c) => c.status === WARN).length;
  return {
    ready: fails === 0,
    summary: { pass: checks.filter((c) => c.status === PASS).length, fail: fails, warn: warns },
    checks,
  };
}

module.exports = { configAudit, PASS, FAIL, WARN };
