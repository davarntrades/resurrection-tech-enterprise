#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const safety = require("../../lib/runtime/validation-safety");
const { FIXTURES } = require("./level2-validation-fixtures.cjs");

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "artifacts", "level2-live-validation");
const DB_URL = process.env.VALIDATION_DATABASE_URL || "";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: { ...process.env, ...(options.env || {}) },
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (options.capture) fs.writeFileSync(options.capture, String(result.stdout || "") + String(result.stderr || ""));
  if (result.status !== 0 && !options.allowFailure) {
    const error = new Error(`${command} ${args.join(" ")} failed with exit ${result.status}: ${String(result.stderr || result.stdout || "").trim()}`);
    error.status = result.status;
    throw error;
  }
  return result;
}

function psql(file, outputName, { allowFailure = false } = {}) {
  if (!DB_URL) throw new Error("VALIDATION_DATABASE_URL is required for live Level-2 database validation");
  return run("psql", [DB_URL, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-f", path.join(ROOT, file)], {
    capture: outputName ? path.join(OUT, outputName) : undefined,
    allowFailure,
  });
}

function requireCommand(name, probeArgs = ["--version"]) {
  const probe = spawnSync(name, probeArgs, { encoding: "utf8" });
  if (probe.error && probe.error.code === "ENOENT") throw new Error(`${name} is required on the validation runner`);
}

function jsonLines(text) {
  return String(text || "").split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
}

function assertChainAttacks(text) {
  const records = jsonLines(text);
  const byCase = Object.fromEntries(records.map((record) => [record.case, record.result]));
  const needed = ["clean_chain_initial","middle_record_mutation","middle_record_delete","newest_record_delete","prev_hash_corruption","sequence_gap","legacy_pre_chain","clean_chain_final"];
  for (const name of needed) assert.ok(byCase[name], `missing chain attack result ${name}`);
  assert.equal(byCase.clean_chain_initial.status, "VERIFIED");
  assert.equal(byCase.clean_chain_initial.ok, true);
  assert.equal(byCase.middle_record_mutation.status, "BROKEN");
  assert.equal(byCase.middle_record_delete.status, "BROKEN");
  assert.equal(byCase.newest_record_delete.status, "BROKEN");
  assert.equal(byCase.newest_record_delete.reason, "chain_head_mismatch");
  assert.equal(byCase.prev_hash_corruption.status, "BROKEN");
  assert.equal(byCase.sequence_gap.status, "BROKEN");
  assert.notEqual(byCase.legacy_pre_chain.status, "VERIFIED");
  assert.equal(byCase.legacy_pre_chain.ok, false);
  assert.equal(byCase.clean_chain_final.status, "VERIFIED");
  assert.equal(byCase.clean_chain_final.ok, true);
  return byCase;
}

function writeJson(name, value) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(value, null, 2) + "\n");
}

async function main() {
  const target = safety.assertNonProductionTarget(process.env, { destructive: true });
  safety.printTarget(target);
  requireCommand("psql");
  requireCommand(process.execPath, ["--version"]);
  fs.mkdirSync(OUT, { recursive: true });

  const metadata = {
    status: "RUNNING",
    started_at: new Date().toISOString(),
    classification: "GENERAL-PRODUCTION VALIDATION INCOMPLETE",
    target,
    fixtures: { org_a: FIXTURES.orgA.id, org_b: FIXTURES.orgB.id, env_a: FIXTURES.envA.id, env_b: FIXTURES.envB.id },
    steps: [],
  };
  writeJson("run.json", metadata);

  let fixturesCreated = false;
  try {
    metadata.steps.push({ id: "schema", status: "RUNNING" });
    psql("scripts/runtime/level2-schema-verification.sql", "schema-verification.jsonl");
    metadata.steps.at(-1).status = "PASS";

    metadata.steps.push({ id: "target_empty", status: "RUNNING" });
    psql("scripts/runtime/level2-target-safety.sql", "target-safety.jsonl");
    metadata.steps.at(-1).status = "PASS";

    metadata.steps.push({ id: "fixtures", status: "RUNNING" });
    psql("scripts/runtime/level2-fixture-setup.sql", "fixture-setup.jsonl");
    fixturesCreated = true;
    metadata.steps.at(-1).status = "PASS";

    metadata.steps.push({ id: "tenant_rls", status: "RUNNING" });
    const tenantResult = run(process.execPath, ["scripts/runtime/level2-tenant-live.cjs"], {
      capture: path.join(OUT, "tenant-isolation.json"),
      env: {
        PRODUCTION_RLS_TEST_ORG_A: FIXTURES.orgA.id,
        PRODUCTION_RLS_TEST_ORG_B: FIXTURES.orgB.id,
      },
    });
    metadata.steps.at(-1).status = "PASS";
    metadata.steps.at(-1).exit = tenantResult.status;

    metadata.steps.push({ id: "connector_chain_attacks", status: "RUNNING" });
    const chain = psql("scripts/runtime/level2-live-database.sql", "connector-chain-attacks.jsonl");
    const chainEvidence = assertChainAttacks(chain.stdout);
    writeJson("connector-chain-assertions.json", chainEvidence);
    metadata.steps.at(-1).status = "PASS";

    metadata.steps.push({ id: "source_health", status: "RUNNING" });
    const sourceHealth = run(process.execPath, ["scripts/runtime/source-health-state.test.cjs"], { capture: path.join(OUT, "source-health-semantics.txt") });
    metadata.steps.at(-1).status = "PASS";
    metadata.steps.at(-1).note = "application state semantics executed; destructive live source-state permutations remain recorded in LIVE-VALIDATION-PENDING until separately exercised on this target";
    metadata.steps.at(-1).exit = sourceHealth.status;

    metadata.steps.push({ id: "production_preflight", status: "RUNNING" });
    const production = run(process.execPath, ["scripts/runtime/production-preflight.cjs", "--json"], { capture: path.join(OUT, "production-preflight.json"), allowFailure: true, env: {
      PRODUCTION_RLS_TEST_ORG_A: FIXTURES.orgA.id,
      PRODUCTION_RLS_TEST_ORG_B: FIXTURES.orgB.id,
    } });
    const productionResult = (() => { try { return JSON.parse(production.stdout); } catch { return null; } })();
    metadata.steps.at(-1).status = productionResult?.ready ? "PASS" : "BLOCKED";
    metadata.steps.at(-1).posture = productionResult?.status || "UNKNOWN";
    if (!productionResult?.ready) throw new Error(`production preflight is ${productionResult?.status || "UNKNOWN"}; Level-2 validation cannot pass`);

    metadata.steps.push({ id: "control_room_live_states", status: "PENDING_EXTERNAL_ENDPOINT" });
    metadata.steps.push({ id: "sovereign_private_target", status: "PENDING_REPRESENTATIVE_BOUNDARY" });
    metadata.steps.push({ id: "vendor_outage_target", status: "PENDING_REPRESENTATIVE_BOUNDARY" });

    metadata.status = "PARTIAL_PASS_LIVE_DATABASE";
    metadata.completed_at = new Date().toISOString();
    writeJson("run.json", metadata);
    console.log(JSON.stringify(metadata, null, 2));
    console.error("Live database proof completed, but representative sovereign and any still-pending real Control Room state forcing remain mandatory before Level 2.");
    process.exitCode = 1;
  } catch (error) {
    metadata.status = "FAIL_OR_BLOCKED";
    metadata.error = error.message;
    metadata.completed_at = new Date().toISOString();
    writeJson("run.json", metadata);
    throw error;
  } finally {
    if (fixturesCreated) {
      const cleanup = psql("scripts/runtime/level2-fixture-cleanup.sql", "fixture-cleanup.jsonl", { allowFailure: true });
      if (cleanup.status !== 0) {
        console.error("VALIDATION CLEANUP FAILED — target remains disposable-only; inspect validation fixture IDs before any reuse.");
        process.exitCode = 1;
      }
    }
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "FAIL_OR_BLOCKED", error: error.message }, null, 2));
  process.exit(1);
});
