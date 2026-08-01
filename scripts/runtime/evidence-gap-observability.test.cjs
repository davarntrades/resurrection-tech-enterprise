#!/usr/bin/env node
/* ============================================================================
 * Runtime Governance — an evidence gap must never be silent.
 *
 * A refusal has already been decided by the time evidence is written, so an
 * evidence-store fault must not fail the caller a second time — that would turn
 * an evidence outage into an availability outage. The swallow is deliberate.
 *
 * What was wrong was doing it in SILENCE. Every refusal path in the Integration
 * Gateway used a bare `.catch(() => {})`, so the record of a BLOCK could vanish
 * leaving no log, no alert and no counter. "Prove you blocked it" is the
 * auditor's question, so losing that record must be as loud as losing a
 * decision — which the decision path (gateway.js) already makes it.
 * ============================================================================ */
"use strict";
const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path");
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-evgap-"));
process.env.RUNTIME_LOG_SILENT = "1";

const store = require("../../lib/runtime/store");
const log = require("../../lib/runtime/log");
const alerts = require("../../lib/runtime/alerts");
const gateway = require("../../lib/runtime/integration-gateway");

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };

const ORG = "org_gap";
const ENV = "env_gap";

(async () => {
  await store.insert("orgs", { id: ORG, name: "Gap Co", status: "active" });
  await store.insert("environments", { id: ENV, org_id: ORG, kind: "production", mode: "enforce" });

  // ── The happy path is unchanged ────────────────────────────────────────────
  const recorded = await gateway.submitEvidence({
    org_id: ORG, environment_id: ENV, type: "aws.bedrock.governance.decision",
    evidence: { connector_id: "int_x", proposal_id: "ops_x", outcome: "blocked" },
  });
  ok(recorded && recorded.id && recorded.evidence_hash,
    "1. a healthy evidence write still returns an id and hash");

  // ── Now break the store and drive a refusal-path evidence write ────────────
  const realInsert = store.insert;
  store.insert = async (collection, row) => {
    if (collection === "integration_events") throw new Error("evidence store unavailable");
    return realInsert(collection, row);
  };
  const raised = [];
  const realRaise = alerts.raise;
  alerts.raise = async (a) => { raised.push(a); return null; };
  const before = log.counters()["connector_evidence_record_failed"] || 0;

  let threw = null;
  let result;
  try {
    result = await gateway.submitEvidenceOrFlag({
      org_id: ORG, environment_id: ENV, type: "aws.bedrock.governance.decision",
      evidence: { connector_id: "int_blocked", proposal_id: "ops_blocked", outcome: "blocked" },
    });
  } catch (e) { threw = e; }

  store.insert = realInsert;
  alerts.raise = realRaise;

  // The request path must be unchanged: the refusal already happened.
  ok(threw === null, `2. an evidence-store fault does not throw into the governed path (threw: ${threw && threw.message})`);
  ok(result === null, "3. the caller can see the evidence write did not produce a record");

  // …but it must be loud.
  const after = log.counters()["connector_evidence_record_failed"] || 0;
  ok(after === before + 1, `4. the evidence gap increments a counter (${before} → ${after})`);

  const entry = log.recent(20).find((r) => r.event === "connector_evidence_record_failed");
  ok(!!entry && entry.level === "error", "5. the evidence gap emits a structured error event");
  ok(entry && entry.connector_id === "int_blocked" && entry.proposal_id === "ops_blocked" && entry.outcome === "blocked",
    `6. the event names the connector, proposal and outcome that lost its evidence (got ${JSON.stringify({ c: entry && entry.connector_id, p: entry && entry.proposal_id, o: entry && entry.outcome })})`);

  const alert = raised.find((a) => a.kind === "record_failure");
  ok(!!alert, "7. the evidence gap raises a record_failure alert");
  ok(alert && alert.org_id === ORG && alert.environment_id === ENV,
    "8. the alert is attributed to the organisation and environment");
  ok(alert && /Connector evidence not recorded/.test(alert.message),
    `9. the alert says what was lost (got ${alert && alert.message})`);

  // ── No silent catch may remain on an evidence write ────────────────────────
  const src = fs.readFileSync(require.resolve("../../lib/runtime/integration-gateway.js"), "utf8");
  const silent = src.split("\n")
    .map((l, i) => [i + 1, l])
    .filter(([, l]) => /submitEvidence\b/.test(l) === false && /\}\)\.catch\(\(\) => (\{\}|null)\);/.test(l));
  const evidenceSilent = [];
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (!/await submitEvidence\(\{/.test(lines[i])) continue;
    for (let j = i; j < Math.min(lines.length, i + 25); j += 1) {
      if (/\}\)\.catch\(\(\) => (\{\}|null)\);/.test(lines[j])) { evidenceSilent.push(i + 1); break; }
      if (/^\s*\}\);\s*$/.test(lines[j])) break;
    }
  }
  ok(evidenceSilent.length === 0,
    `10. no evidence write silently swallows its failure (silent at lines: ${evidenceSilent.join(", ") || "none"})`);
  void silent;

  console.log(`\nevidence gap observability test: ${pass} passed, ${fail} failed`);
  if (fail) { console.log("FAILURES:"); for (const f of fails) console.log("  ✗ " + f); }
  try { fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true }); } catch { /* */ }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("evidence gap test crashed:", e); process.exit(1); });
