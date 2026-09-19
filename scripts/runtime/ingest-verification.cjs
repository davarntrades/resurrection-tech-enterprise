#!/usr/bin/env node
/* ============================================================================
 * Ingest finite-model verification artifacts into the runtime store.
 *
 * CI produces artifacts and archives them; nothing moved them anywhere the
 * Control Room could read. This does, and it is deliberately the only writer:
 * the application never generates a verification result of its own.
 *
 * It refuses more than it accepts. An artifact is not ingested if it is not
 * the expected schema, if it cannot be identified (no verification id, model
 * hash, ruleset hash or commit), or if it claims SAFE_WITHIN_MODEL on an
 * incomplete enumeration. Ingesting a claim that cannot be checked later is
 * worse than having no row at all, because the panel would render it.
 *
 * What this cannot do: confirm the enumeration happened. That needs re-running
 * the verifier at the recorded commit. The producer's own validation result is
 * carried verbatim as a REPORTED claim and is never adopted as this
 * deployment's own.
 *
 *   node scripts/runtime/ingest-verification.cjs \
 *     --org ORG --environment ENV --path DIR_OR_FILE \
 *     [--summary verification-summary.json] \
 *     [--tools a,b] [--permissions c,d] [--dry-run]
 * ========================================================================== */
"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const store = require("../../lib/runtime/store");

const EXPECTED_SCHEMA = "mrg.global-verification.v2";

function args(argv) {
  const out = { tools: null, permissions: null, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--org") out.org = argv[++i];
    else if (a === "--environment") out.environment = argv[++i];
    else if (a === "--path") out.path = argv[++i];
    else if (a === "--summary") out.summary = argv[++i];
    else if (a === "--tools") out.tools = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--permissions") out.permissions = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
  }
  return out;
}

function artifactFiles(p) {
  if (fs.statSync(p).isDirectory()) {
    return fs.readdirSync(p)
      .filter((n) => n.endsWith(".json") && !n.startsWith("verification-summary"))
      .sort()
      .map((n) => path.join(p, n));
  }
  return [p];
}

/** Everything that must hold before a row is written. Fail-closed. */
function admissible(doc) {
  const problems = [];
  if (doc.schema_version !== EXPECTED_SCHEMA) {
    problems.push(`schema ${doc.schema_version} (expected ${EXPECTED_SCHEMA})`);
  }
  const env = doc.environment || {}, gov = doc.governance || {}, ver = doc.verifier || {};
  const fv = doc.finite_verification || {};
  if (!doc.verification_id) problems.push("no verification_id");
  if (!env.model_hash) problems.push("no model_hash");
  if (!gov.ruleset_hash) problems.push("no ruleset_hash");
  if (!gov.rules_logic_hash) {
    problems.push("no rules_logic_hash — cannot be compared with a deployment ruleset");
  }
  if (!ver.repository_commit) problems.push("no repository_commit");
  // Strictly false. `null` means the verifier could not establish the tree
  // state, and unknown is not clean.
  if (ver.repository_dirty !== false) {
    problems.push(ver.repository_dirty === true
      ? "produced from a dirty working tree; the commit does not describe the code that ran"
      : "the verifier could not establish whether its tree was clean");
  }
  if (!fv.verdict) problems.push("no verdict");
  if (fv.verdict === "SAFE_WITHIN_MODEL" && fv.complete_enumeration !== true) {
    problems.push("SAFE_WITHIN_MODEL on an incomplete enumeration");
  }
  if (!(doc.artifact_integrity || {}).artifact_hash) problems.push("no artifact_hash");
  return problems;
}

(async () => {
  const a = args(process.argv);
  if (!a.org || !a.environment || !a.path) {
    console.error("usage: --org ORG --environment ENV --path DIR_OR_FILE " +
                  "[--summary FILE] [--tools a,b] [--permissions c,d] [--dry-run]");
    process.exit(2);
  }

  let producerValidation = null;
  if (a.summary) {
    try {
      const s = JSON.parse(fs.readFileSync(a.summary, "utf8"));
      producerValidation = {
        source: "ci_gate", status: s.status, passed: s.passed, total: s.total,
        verifier: s.verifier || null,
        note: "Reported by the producing system. Not re-checked by this deployment.",
      };
    } catch (e) {
      console.error(`could not read --summary: ${e.message}`);
      process.exit(2);
    }
  }

  const files = artifactFiles(a.path);
  let ingested = 0, skipped = 0, refused = 0;

  for (const file of files) {
    const raw = fs.readFileSync(file);
    let doc;
    try { doc = JSON.parse(raw.toString("utf8")); }
    catch (e) { console.log(`REFUSE ${path.basename(file)} — not valid JSON`); refused++; continue; }

    const problems = admissible(doc);
    if (problems.length) {
      console.log(`REFUSE ${path.basename(file)} — ${problems.join("; ")}`);
      refused++;
      continue;
    }

    const content_sha256 = crypto.createHash("sha256").update(raw).digest("hex");
    const existing = await store.findOptional("verification_artifacts", {
      environment_id: a.environment,
      verification_id: doc.verification_id,
      content_sha256,
    });
    if (Array.isArray(existing) && existing.length) {
      console.log(`skip   ${path.basename(file)} — already ingested`);
      skipped++;
      continue;
    }

    const row = {
      id: store.id(),
      org_id: a.org,
      environment_id: a.environment,
      verification_id: doc.verification_id,
      model_hash: doc.environment.model_hash,
      transition_relation_id: doc.environment.transition_relation_id || null,
      ruleset_hash: doc.governance.ruleset_hash,
      rules_logic_hash: doc.governance.rules_logic_hash,
      engine_version: doc.governance.engine_version || null,
      repository_commit: doc.verifier.repository_commit,
      verifier_version: doc.verifier.verifier_version || null,
      verdict: doc.finite_verification.verdict,
      complete_enumeration: doc.finite_verification.complete_enumeration === true,
      escalations_admitted: (doc.traversal || {}).escalation_outcomes_admitted || [],
      verified_tools: a.tools,
      verified_permissions: a.permissions,
      content_sha256,
      artifact: raw.toString("utf8"),
      producer_validation: producerValidation,
      ingested_at: store.nowISO(),
    };

    if (a.dryRun) {
      console.log(`would ingest ${path.basename(file)} — ${row.verdict} ${row.verification_id}`);
    } else {
      await store.insert("verification_artifacts", row);
      console.log(`ok     ${path.basename(file)} — ${row.verdict} ${row.verification_id}`);
    }
    ingested++;
  }

  console.log(`\n${ingested} ingested, ${skipped} already present, ${refused} refused` +
              (a.dryRun ? " (dry run — nothing written)" : ""));
  // A refusal is a failure: the caller asked for these to be ingested.
  process.exit(refused ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
