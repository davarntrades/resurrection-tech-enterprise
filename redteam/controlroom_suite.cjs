/* Run the ORIGINAL 83-scenario suite against the REAL Control Room route.
 *
 * The Control Room's production path is:
 *   app/admin/runtime → RuntimeAdminClient → POST /api/runtime/evaluate
 *     → rt.admin.authenticate()  → rt.gateway.govern()
 *
 * The API route is a thin wrapper: it authenticates, then calls govern().
 * This harness drives govern() directly with a real authenticated org +
 * environment, so it exercises the actual code path rather than a
 * reimplementation of it.
 *
 *   GOVERNANCE_URL=http://127.0.0.1:8300 \
 *   GOVERNANCE_GATEWAY_SECRET=gw-secret \
 *   node redteam/controlroom_suite.cjs [--mode enforce|shadow] [--out file.json]
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const REPO = path.resolve(__dirname, "..");
const rt = require(path.join(REPO, "lib/runtime"));
const SCENARIOS = JSON.parse(fs.readFileSync(path.join(__dirname, "scenarios.json"), "utf8"));

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const MODE = arg("--mode", "enforce");
const OUT = arg("--out", null);

// The Control Room reports ALLOW/BLOCK/ESCALATE; normalise ALLOW -> PERMIT so
// the comparison against the other surfaces is like-for-like.
const norm = (v) => (v === "ALLOW" ? "PERMIT" : v);

(async () => {
  const ob = await rt.admin.onboardCustomer({ name: "surface-suite-" + Date.now() });
  const org = ob.org || ob;
  const envs = await rt.admin.listEnvironments(org.id);
  const prod = envs.find((e) => e.kind === "production");
  console.log(`# default production mode on a fresh org: ${prod.mode}`);
  if (prod.mode !== MODE) await rt.admin.setMode(prod.id, MODE);
  const env = await rt.admin.getEnvironment(prod.id);
  console.log(`# surface=control-room  mode=${env.mode}  scenarios=${SCENARIOS.length}\n`);

  const auth = { org, environment: env, role: "ingest", key_id: "k-surface" };
  const results = [];
  for (const sc of SCENARIOS) {
    let verdict, engineVerdict, enforced, ruleset_hash;
    try {
      const r = await rt.gateway.govern({ auth, trajectory: sc.steps, label: sc.id });
      verdict = norm(r.verdict);
      engineVerdict = norm(r.engine_verdict);
      enforced = r.enforced;
      ruleset_hash = r.ruleset_hash;
    } catch (e) { verdict = "ERROR:" + e.message; }

    const permitted = verdict === "PERMIT";
    let outcome;
    if (sc.legit) outcome = permitted ? "PASS" : "FALSE_POSITIVE";
    else if (permitted) outcome = "FAIL";
    else if (verdict === "ESCALATE") outcome = "ESCALATED";
    else outcome = "PASS";

    results.push({ id: sc.id, cls: sc.cls, scenario: sc.scenario, legit: sc.legit,
                   verdict, engine_verdict: engineVerdict, enforced, ruleset_hash, outcome });
    const tag = { PASS: "PASS ", FAIL: "FAIL!", ESCALATED: "ESCL ", FALSE_POSITIVE: "FPOS " }[outcome];
    console.log(`[${tag}] ${sc.id.padEnd(8)} ${sc.cls.padEnd(22)} ${String(verdict).padEnd(9)} ${sc.scenario.slice(0, 44)}`);
  }

  const c = {};
  for (const r of results) c[r.outcome] = (c[r.outcome] || 0) + 1;
  const prevented = (c.PASS || 0) + (c.ESCALATED || 0);
  console.log("\n" + "=".repeat(78));
  console.log(`surface=control-room  mode=${env.mode}  total=${results.length}  ` +
              `PASS=${c.PASS || 0}  ESCALATED=${c.ESCALATED || 0}  ` +
              `FAIL=${c.FAIL || 0}  FALSE_POS=${c.FALSE_POSITIVE || 0}`);
  console.log(`prevented = ${prevented}/${results.length} (${Math.round(100 * prevented / results.length)}%)`);
  if (c.FAIL) {
    console.log("\nFAILURES:");
    results.filter((r) => r.outcome === "FAIL")
      .forEach((r) => console.log(`  ${r.id.padEnd(8)} ${r.cls.padEnd(22)} ${r.scenario.slice(0, 56)}`));
  }
  if (c.FALSE_POSITIVE) {
    console.log("\nFALSE POSITIVES:");
    results.filter((r) => r.outcome === "FALSE_POSITIVE")
      .forEach((r) => console.log(`  ${r.id.padEnd(8)} ${r.scenario.slice(0, 56)}`));
  }
  const hashes = [...new Set(results.map((r) => r.ruleset_hash).filter(Boolean))];
  console.log(`ruleset_hash values observed: ${hashes.length} → ${hashes[0] || "(none)"}`);

  // A hard verdict must never be downgraded, in EITHER mode.
  const downgraded = results.filter((r) =>
    (r.engine_verdict === "BLOCK" || r.engine_verdict === "ESCALATE") && r.verdict === "PERMIT");
  console.log(`engine BLOCK/ESCALATE downgraded to PERMIT: ${downgraded.length}`);

  if (OUT) { fs.writeFileSync(OUT, JSON.stringify(results, null, 1)); console.log(`written ${OUT}`); }
  process.exit((c.FAIL || 0) + downgraded.length ? 1 : 0);
})().catch((e) => { console.error("ERR:", e.stack); process.exit(1); });
