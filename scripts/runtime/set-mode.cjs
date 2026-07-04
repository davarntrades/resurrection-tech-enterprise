#!/usr/bin/env node
/* ============================================================================
 * Runtime Governance — enable/disable enforcement on an environment.
 *
 * Enforcement is NOT an env var, feature flag, or HTTP route — it is the `mode`
 * field on an environment (shadow → observe-only, enforce → authoritative).
 * This CLI flips it via the platform admin API, against whatever store is
 * configured (Supabase in production, file store locally). The next
 * /api/runtime/evaluate call — which re-authenticates per request — enforces.
 *
 *   node scripts/runtime/set-mode.cjs --list                 # list orgs + environments + ids
 *   node scripts/runtime/set-mode.cjs <environment_id> enforce
 *   node scripts/runtime/set-mode.cjs <environment_id> shadow   # rollback
 *
 * Load your production env first so it targets the real (Supabase) store, e.g.
 *   set -a; source .env.production; set +a; node scripts/runtime/set-mode.cjs --list
 * ============================================================================ */
"use strict";
const rt = require("../../lib/runtime");

(async () => {
  const args = process.argv.slice(2);
  const backend = rt.store.backend();

  if (args[0] === "--list" || args.length === 0) {
    const orgs = await rt.admin.listOrgs();
    console.log(`\nStore backend: ${backend}${rt.store.durable() ? " (durable)" : " (NON-DURABLE file store)"}\n`);
    if (!orgs.length) { console.log("No organisations found."); process.exit(0); }
    for (const org of orgs) {
      console.log(`● ${org.name}  [org ${org.id}]`);
      const envs = await rt.admin.listEnvironments(org.id);
      for (const e of envs) {
        console.log(`    ${e.kind.padEnd(11)} mode=${String(e.mode).padEnd(8)} id=${e.id}${e.mode_changed_at ? `  (changed ${e.mode_changed_at})` : ""}`);
      }
    }
    console.log("\nTo enforce:  node scripts/runtime/set-mode.cjs <environment_id> enforce\n");
    process.exit(0);
  }

  const [envId, mode] = args;
  if (!envId || !["shadow", "enforce"].includes(mode)) {
    console.error("usage: node scripts/runtime/set-mode.cjs <environment_id> <shadow|enforce>   (or --list)");
    process.exit(2);
  }

  const before = await rt.admin.getEnvironment(envId);
  if (!before) { console.error(`No environment found with id ${envId}. Run --list to see valid ids.`); process.exit(1); }
  if (before.mode === mode) { console.log(`Environment ${envId} is already in "${mode}" mode. No change.`); process.exit(0); }

  const after = await rt.admin.setMode(envId, mode);
  console.log(`\n✅ ${before.kind} environment ${envId}`);
  console.log(`   mode: ${before.mode} → ${after.mode}   (store: ${backend})`);
  console.log(mode === "enforce"
    ? "   Enforcement is now authoritative — the next evaluate call will BLOCK unsafe trajectories.\n"
    : "   Rolled back to observe-only — agents run uninterrupted.\n");
  process.exit(0);
})().catch((e) => { console.error("set-mode failed:", e && e.message ? e.message : e); process.exit(1); });
