#!/usr/bin/env node
/* ============================================================================
 * Runtime Governance — connector evidence hashes must be verifiable, and
 * verification must never accuse the innocent.
 *
 * evidence_hash was written over JSON.stringify(evidence) in INSERTION order.
 * Postgres jsonb does not preserve key order, so that hash cannot be recomputed
 * from the stored row. Verifying it naively would report ordinary, untampered
 * production evidence as ALTERED — worse than not verifying at all, because it
 * destroys trust in the report it is meant to strengthen.
 *
 * So verification is three-valued: verified / unverifiable / mismatch. Only a
 * canonical hash is ever checked; a legacy row is reported as unverifiable, not
 * accused.
 * ============================================================================ */
"use strict";
const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path");
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-evhash-"));

const store = require("../../lib/runtime/store");
const gateway = require("../../lib/runtime/integration-gateway");
const audit = require("../../lib/runtime/connector-audit");

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };

const ORG = "org_hash";
const ENV = "env_hash";
const SINCE = "2026-06-01T00:00:00.000Z";
const UNTIL = "2026-07-01T00:00:00.000Z";
const AT = "2026-06-10T00:00:00.000Z";

const rowFor = (summary, id) => summary.register.find((r) => r.evidence_id === id) || {};

(async () => {
  await store.insert("orgs", { id: ORG, name: "Hash Co", status: "active" });
  await store.insert("environments", { id: ENV, org_id: ORG, kind: "production", mode: "enforce" });
  await store.insert("integration_connectors", {
    id: "int_b", org_id: ORG, environment_id: ENV, type: "aws-bedrock", name: "Bedrock", health: "healthy",
  });
  await store.insert("ops_proposals", {
    id: "ops_h", org_id: ORG, environment_id: ENV, action_id: "invoke_aws_bedrock_model",
    status: "executed", execution: { executed: true },
  });

  // ── The hash itself ────────────────────────────────────────────────────────
  const a = { b: 1, a: 2, nested: { z: 1, y: 2 }, list: [1, 2] };
  const reordered = { list: [1, 2], a: 2, nested: { y: 2, z: 1 }, b: 1 };
  ok(gateway.canonicalEvidenceHash(a) === gateway.canonicalEvidenceHash(reordered),
    "1. the canonical hash is independent of object key order (survives a jsonb round trip)");
  ok(gateway.canonicalEvidenceHash(a) !== gateway.canonicalEvidenceHash({ ...a, b: 99 }),
    "2. the canonical hash still changes when the content changes");
  ok(gateway.canonicalJson([1, 2]) !== gateway.canonicalJson([2, 1]),
    "3. array order is preserved — order is semantic in an array");

  // ── A freshly written row verifies ─────────────────────────────────────────
  const written = await gateway.submitEvidence({
    org_id: ORG, environment_id: ENV, type: "aws.bedrock.invocation",
    evidence: { connector_id: "int_b", proposal_id: "ops_h", outcome: "success", request_hash: "a".repeat(64) },
  });
  await store.update("integration_events", written.id, { occurred_at: AT, created_at: AT });
  let s = await audit.summary({ org_id: ORG, environment_id: ENV, since: SINCE, until: UNTIL });
  const fresh = rowFor(s, written.id);
  ok(fresh.evidence_hash_state === "verified" && fresh.evidence_hash_verified === true,
    `4. evidence written now is verifiable and verifies (got ${fresh.evidence_hash_state})`);
  ok(!s.findings.some((f) => f.kind === "evidence_hash_mismatch"),
    "5. an untouched row raises no mismatch finding");

  // ── The false-positive guard: key order changes, content does not ──────────
  const stored = await store.findOne("integration_events", { id: written.id });
  const shuffled = {};
  for (const k of Object.keys(stored.evidence).sort().reverse()) shuffled[k] = stored.evidence[k];
  await store.update("integration_events", written.id, { evidence: shuffled });
  s = await audit.summary({ org_id: ORG, environment_id: ENV, since: SINCE, until: UNTIL });
  ok(rowFor(s, written.id).evidence_hash_state === "verified",
    "6. re-serialising the SAME payload in a different key order still verifies — no false accusation");

  // ── A real alteration is caught ────────────────────────────────────────────
  await store.update("integration_events", written.id, {
    evidence: { ...shuffled, outcome: "blocked" },
  });
  s = await audit.summary({ org_id: ORG, environment_id: ENV, since: SINCE, until: UNTIL });
  const altered = rowFor(s, written.id);
  ok(altered.evidence_hash_state === "mismatch" && altered.evidence_hash_verified === false,
    `7. altering the payload is detected as a mismatch (got ${altered.evidence_hash_state})`);
  const mismatch = s.findings.find((f) => f.kind === "evidence_hash_mismatch" && f.evidence_id === written.id);
  ok(!!mismatch && mismatch.severity === "critical",
    "8. an altered payload raises a CRITICAL finding");
  ok(s.totals.evidence_hash_mismatched === 1, `9. the summary counts the mismatch (got ${s.totals.evidence_hash_mismatched})`);

  // ── A legacy row is unverifiable, NOT accused ──────────────────────────────
  const legacyEvidence = { connector_id: "int_b", proposal_id: "ops_h", outcome: "success" };
  await store.insert("integration_events", {
    id: "ev_legacy", org_id: ORG, environment_id: ENV, type: "aws.bedrock.invocation",
    actor: "customer", evidence: legacyEvidence,
    evidence_hash: store.sha256(JSON.stringify(legacyEvidence)),   // insertion-order hash
    evidence_hash_alg: null,                                        // predates canonical hashing
    immutable: true, occurred_at: AT, created_at: AT,
  });
  s = await audit.summary({ org_id: ORG, environment_id: ENV, since: SINCE, until: UNTIL });
  const legacy = rowFor(s, "ev_legacy");
  ok(legacy.evidence_hash_state === "unverifiable" && legacy.evidence_hash_verified === false,
    `10. a row predating canonical hashing is UNVERIFIABLE (got ${legacy.evidence_hash_state})`);
  ok(!s.findings.some((f) => f.kind === "evidence_hash_mismatch" && f.evidence_id === "ev_legacy"),
    "11. a legacy row is never accused of tampering — the decisive false-positive guard");
  ok(s.totals.evidence_hash_unverifiable >= 1, "12. the summary counts unverifiable rows separately from mismatches");

  // ── No hash at all ─────────────────────────────────────────────────────────
  await store.insert("integration_events", {
    id: "ev_nohash", org_id: ORG, environment_id: ENV, type: "aws.bedrock.invocation",
    actor: "customer", evidence: { connector_id: "int_b", proposal_id: "ops_h" },
    evidence_hash: null, immutable: true, occurred_at: AT, created_at: AT,
  });
  s = await audit.summary({ org_id: ORG, environment_id: ENV, since: SINCE, until: UNTIL });
  ok(rowFor(s, "ev_nohash").evidence_hash_state === "absent",
    "13. evidence with no hash reports as absent");
  ok(s.findings.some((f) => f.kind === "evidence_hash_absent" && f.evidence_id === "ev_nohash"),
    "14. missing integrity protection is itself a finding");

  ok(typeof s.totals.evidence_hash_verified === "number",
    "15. the executive summary reports how much evidence is cryptographically verified");

  console.log(`\nevidence hash verification test: ${pass} passed, ${fail} failed`);
  if (fail) { console.log("FAILURES:"); for (const f of fails) console.log("  ✗ " + f); }
  try { fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true }); } catch { /* */ }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("evidence hash test crashed:", e); process.exit(1); });
