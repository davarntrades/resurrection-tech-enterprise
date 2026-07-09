#!/usr/bin/env node
/* ============================================================================
 * Runtime Governance — publish a generated audit pack to the Control Room store.
 *
 * The audit generator (scripts/delivery-kit.cjs, run from the console where
 * Chromium lives) writes a deliverables/<slug>/ directory. This uploads those
 * files to object storage and records them under a customer environment, so they
 * appear in the Operator Control Room with Preview / Download / Share Securely.
 * The generator is NOT rebuilt — this only wires its output into the store.
 *
 *   set -a; source .env.production; set +a       # Supabase + engine config
 *   node scripts/runtime/publish-audit.cjs \
 *     --org <org_id> --env <environment_id> \
 *     --dir deliverables/<slug> [--name "48-Hour Audit"] [--reference RT-...]
 *
 *   node scripts/runtime/publish-audit.cjs --list-envs        # find org/env ids
 * ============================================================================ */
"use strict";
const rt = require("../../lib/runtime");

function arg(name) { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : undefined; }

(async () => {
  if (process.argv.includes("--list-envs")) {
    const orgs = await rt.admin.listOrgs();
    console.log(`\nStore backend: ${rt.store.backend()}${rt.store.durable() ? " (durable)" : " (NON-DURABLE)"}\n`);
    for (const o of orgs) {
      console.log(`● ${o.name}  [org ${o.id}]`);
      for (const e of await rt.admin.listEnvironments(o.id)) console.log(`    ${e.kind.padEnd(11)} id=${e.id}`);
    }
    console.log("\nPublish:  node scripts/runtime/publish-audit.cjs --org <org_id> --env <env_id> --dir deliverables/<slug>\n");
    return;
  }

  const org_id = arg("org"), environment_id = arg("env"), dir = arg("dir");
  if (!org_id || !environment_id || !dir) {
    console.error("usage: --org <org_id> --env <env_id> --dir deliverables/<slug> [--name ..] [--reference ..]   (or --list-envs)");
    process.exit(2);
  }
  if (!rt.store.durable()) console.warn("⚠ store is NON-DURABLE (file store) — deliverables will be published locally, not to Supabase. Configure Supabase for shared access.");

  const { pack, deliverables } = await rt.deliverables.publishPack({
    org_id, environment_id, name: arg("name"), reference: arg("reference"), dir,
  });
  console.log(`\n✅ Published audit pack ${pack.id} to ${org_id} / ${environment_id}`);
  console.log(`   ${deliverables.length} deliverables:`);
  for (const d of deliverables) console.log(`     ${d.filename.padEnd(22)} ${d.kind.padEnd(22)} ${d.size} bytes`);
  console.log(`\nThey now appear in the Operator Control Room under that customer's environment.\n`);
})().catch((e) => { console.error("publish failed:", e && e.message ? e.message : e); process.exit(1); });
