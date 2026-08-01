#!/usr/bin/env node
/* ============================================================================
 * Runtime Governance — Runtime Assurance Status.
 *
 * The panel exists to replace an assumption with a reading. Its one job is to
 * never say a control is present when it has not established that, so the
 * assertions here are weighted towards the negative and unknown paths: an
 * assurance surface that is wrong in the reassuring direction is worse than no
 * surface at all, because it converts "I should check" into "I checked".
 *
 * Covers, as required: configured (active), degraded (inactive / not in force),
 * missing, and database-unavailable — plus the invariant that separates the two
 * positive states: a control whose evidence is self-reported can never read
 * VERIFIED, however it is configured.
 *
 * Fixtures and stubs only. No database, no network, no provider call.
 * ============================================================================ */
"use strict";
const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path");
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-assurance-"));

const store = require("../../lib/runtime/store");
const gateway = require("../../lib/runtime/integration-gateway");
const assurance = require("../../lib/runtime/assurance");
const { STATE, SOURCE, APPEND_ONLY_TABLES } = assurance;

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };
const by = (s, id) => s.controls.find((c) => c.id === id);

// ── Harness ─────────────────────────────────────────────────────────────────
const realRpc = store.rpcOptional;
const realBackend = store.backend;
const realDurable = store.durable;

/** Run status() with the environment, RPC result and store backend pinned. */
async function withEnv({ record, durable, rpc, backend, durableStore }, fn) {
  const prevR = process.env.RUNTIME_REQUIRE_RECORD;
  const prevD = process.env.RUNTIME_REQUIRE_DURABLE;
  if (record === undefined) delete process.env.RUNTIME_REQUIRE_RECORD; else process.env.RUNTIME_REQUIRE_RECORD = record;
  if (durable === undefined) delete process.env.RUNTIME_REQUIRE_DURABLE; else process.env.RUNTIME_REQUIRE_DURABLE = durable;
  if (rpc) store.rpcOptional = rpc;
  if (backend) store.backend = () => backend;
  if (durableStore !== undefined) store.durable = () => durableStore;
  try { return await fn(); }
  finally {
    store.rpcOptional = realRpc; store.backend = realBackend; store.durable = realDurable;
    if (prevR === undefined) delete process.env.RUNTIME_REQUIRE_RECORD; else process.env.RUNTIME_REQUIRE_RECORD = prevR;
    if (prevD === undefined) delete process.env.RUNTIME_REQUIRE_DURABLE; else process.env.RUNTIME_REQUIRE_DURABLE = prevD;
  }
}

const trigger = (t, over = {}) => ({ table_name: t, trigger_name: `${t}_no_update`, enabled: true, before_update: true, ...over });
const allTriggers = () => APPEND_ONLY_TABLES.map((t) => trigger(t));
const rpcOk = (data) => async () => ({ ok: true, reason: null, detail: null, data });
const rpcFail = (reason, detail) => async () => ({ ok: false, reason, detail: detail || null, data: null });

(async () => {
  // ══ 1. The two switches — CONFIGURED (set) ══════════════════════════════
  await withEnv({ record: "1", durable: "true", rpc: rpcOk(allTriggers()), backend: "supabase", durableStore: true }, async () => {
    const s = await assurance.status();
    ok(by(s, "require_record").state === STATE.CONFIGURED, "1a. RUNTIME_REQUIRE_RECORD=1 reports CONFIGURED, not verified");
    ok(by(s, "require_durable").state === STATE.CONFIGURED, "1b. RUNTIME_REQUIRE_DURABLE=true reports CONFIGURED, not verified");
    // The value must never cross the boundary, only the derived state.
    const blob = JSON.stringify(s);
    ok(!/"value"\s*:/.test(blob), "1c. no control emits a raw `value` field");
    ok(by(s, "require_record").env_var === "RUNTIME_REQUIRE_RECORD" && !("value" in by(s, "require_record")),
      "1d. the switch names the variable it reflects without echoing its contents");
  });

  // "yes" and "TRUE" are accepted by gateway.js, so the panel must agree with
  // the code it is reporting on — a panel that disagrees with the enforcement
  // path is worse than no panel.
  await withEnv({ record: "yes", durable: "YES", rpc: rpcOk(allTriggers()), backend: "supabase", durableStore: true }, async () => {
    const s = await assurance.status();
    ok(by(s, "require_record").state === STATE.CONFIGURED, "1e. 'yes' reads as configured, matching gateway.js's own parsing");
    ok(by(s, "require_durable").state === STATE.CONFIGURED, "1f. 'YES' reads as configured, case-insensitively");
  });

  // ══ 2. The two switches — DEGRADED (unset / off / inert) ════════════════
  await withEnv({ rpc: rpcOk(allTriggers()), backend: "supabase", durableStore: true }, async () => {
    const s = await assurance.status();
    ok(by(s, "require_record").state === STATE.DEGRADED, "2a. an unset RUNTIME_REQUIRE_RECORD reports degraded — the control is not in force");
    ok(by(s, "require_durable").state === STATE.DEGRADED, "2b. an unset RUNTIME_REQUIRE_DURABLE reports degraded");
    ok(/^Not set\./.test(by(s, "require_record").summary),
      "2c. the degraded summary opens by saying it is NOT SET, so nobody reads it as a fault");
  });

  // A value that is neither empty nor truthy ("0", "off") must not read as on.
  await withEnv({ record: "0", durable: "off", rpc: rpcOk(allTriggers()), backend: "supabase", durableStore: true }, async () => {
    const s = await assurance.status();
    ok(by(s, "require_record").state === STATE.DEGRADED, "2d. '0' reads as degraded, not as 'set therefore on'");
    ok(by(s, "require_durable").state === STATE.DEGRADED, "2e. 'off' reads as degraded");
  });

  // Set-but-non-durable is the combination worth naming rather than flattening.
  await withEnv({ durable: "1", rpc: rpcOk(allTriggers()), backend: "file", durableStore: false }, async () => {
    const s = await assurance.status();
    ok(by(s, "require_durable").state === STATE.DEGRADED,
      "2f. REQUIRE_DURABLE set while the store is non-durable reports degraded, not configured");
  });

  // ══ 3. Append-only — VERIFIED ════════════════════════════════════════════
  await withEnv({ rpc: rpcOk(allTriggers()), backend: "supabase", durableStore: true }, async () => {
    const a = by(await assurance.status(), "append_only");
    ok(a.state === STATE.VERIFIED, "3a. all three triggers enabled and BEFORE UPDATE reports verified");
    ok(APPEND_ONLY_TABLES.every((t) => a.tables[t].protected), "3b. every evidence table is reported protected");
    ok(/deletion is deliberately still permitted/i.test(a.summary),
      "3c. the verified summary still states that DELETE is permitted, so 'verified' is not read as immutable");
  });

  // ══ 4. Append-only — MISSING migration (a confirmed negative) ══════════
  await withEnv({ rpc: rpcOk([]), backend: "supabase", durableStore: true }, async () => {
    const a = by(await assurance.status(), "append_only");
    ok(a.state === STATE.DEGRADED, "4a. no triggers at all reports degraded — a confirmed negative, not unknown and not verified");
    ok(/evidence_append_only\.sql/.test(a.summary), "4b. it names the migration to apply");
    ok(APPEND_ONLY_TABLES.every((t) => a.tables[t].protected === false), "4c. every table is reported unprotected");
  });

  // ══ 5. Append-only — DEGRADED (partial, disabled, or wrong timing) ═══════
  await withEnv({ rpc: rpcOk([trigger("rg_decisions")]), backend: "supabase", durableStore: true }, async () => {
    const a = by(await assurance.status(), "append_only");
    ok(a.state === STATE.DEGRADED, "5a. one of three tables protected reports degraded");
    ok(a.tables.rg_integration_events.protected === false && a.tables.rg_ops_evidence.protected === false,
      "5b. the unprotected tables are identified by name");
  });

  // A DISABLED trigger is present but inert. Counting rows would call this
  // verified; that is the failure this assertion exists to prevent.
  await withEnv({ rpc: rpcOk(APPEND_ONLY_TABLES.map((t) => trigger(t, { enabled: false }))), backend: "supabase", durableStore: true }, async () => {
    const a = by(await assurance.status(), "append_only");
    ok(a.state === STATE.DEGRADED, "5c. three DISABLED triggers report degraded, not verified");
    ok(/DISABLED/i.test(a.tables.rg_decisions.note || ""), "5d. the disabled state is named in the per-table note");
  });

  // A trigger that fires AFTER UPDATE blocks nothing, however it is named.
  await withEnv({ rpc: rpcOk(APPEND_ONLY_TABLES.map((t) => trigger(t, { before_update: false }))), backend: "supabase", durableStore: true }, async () => {
    const a = by(await assurance.status(), "append_only");
    ok(a.state === STATE.DEGRADED, "5e. AFTER UPDATE triggers report degraded — the name is not the control");
    ok(/BEFORE UPDATE/.test(a.tables.rg_ops_evidence.note || ""), "5f. the wrong-timing reason is stated");
  });

  // ══ 6. Append-only — DATABASE UNAVAILABLE ═══════════════════════════════
  for (const [reason, label] of [["rpc_error", "the database rejected the call"], ["rpc_threw", "the call threw"]]) {
    await withEnv({ rpc: rpcFail(reason, "connection refused"), backend: "supabase", durableStore: true }, async () => {
      const a = by(await assurance.status(), "append_only");
      ok(a.state === STATE.UNKNOWN, `6. ${label} reports unknown, never verified [${reason}]`);
      ok(a.reason === reason && a.tables === null, `6b. the failure reason is surfaced rather than swallowed [${reason}]`);
    });
  }

  // The introspection function itself not being deployed must NOT be read as
  // "no triggers" — absence of a reading is not a reading of absence.
  await withEnv({ rpc: rpcFail("function_missing"), backend: "supabase", durableStore: true }, async () => {
    const a = by(await assurance.status(), "append_only");
    ok(a.state === STATE.UNKNOWN, "6c. a missing introspection function reports unknown, not degraded");
    ok(/assurance_status\.sql/.test(a.summary) && /NOT assumed/i.test(a.summary),
      "6d. it names the migration and states explicitly that presence is not assumed");
  });

  // The file backend has no triggers at all; that is not a failure.
  await withEnv({ rpc: rpcFail("no_cloud_backend", "store backend is file"), backend: "file", durableStore: false }, async () => {
    const a = by(await assurance.status(), "append_only");
    ok(a.state === STATE.UNKNOWN, "6e. the file backend reports unknown for a database-only control");
    ok(/does not apply/i.test(a.summary), "6f. it explains that the control is inapplicable rather than broken");
  });

  // ══ 7. Evidence hash ════════════════════════════════════════════════════
  const ORG = "org_assurance", ENV = "env_assurance";
  await store.insert("orgs", { id: ORG, name: "Assurance", status: "active" });
  await store.insert("environments", { id: ENV, org_id: ORG, name: "prod", kind: "production" });

  // Empty store → unknown, and explicitly not a failure.
  await withEnv({ rpc: rpcOk(allTriggers()), backend: "supabase", durableStore: true }, async () => {
    const h = by(await assurance.status(), "evidence_hash");
    ok(h.state === STATE.UNKNOWN, "7a. no evidence yet reports unknown, not verified");
    ok(/not a failure/i.test(h.summary), "7b. it distinguishes absence of evidence from a bad result");
  });

  const canonical = (id, evidence) => store.insert("integration_events", {
    id, org_id: ORG, environment_id: ENV, type: "aws.bedrock.invocation", actor: "customer",
    evidence, evidence_hash: gateway.canonicalEvidenceHash(evidence),
    evidence_hash_alg: gateway.EVIDENCE_HASH_ALG,
    immutable: true, occurred_at: "2026-07-01T00:00:00.000Z", created_at: "2026-07-01T00:00:00.000Z",
  });

  await canonical("ev_good_1", { connector_id: "int_b", outcome: "success" });
  await canonical("ev_good_2", { connector_id: "int_b", outcome: "blocked" });

  await withEnv({ rpc: rpcOk(allTriggers()), backend: "supabase", durableStore: true }, async () => {
    const h = by(await assurance.status(), "evidence_hash");
    ok(h.state === STATE.VERIFIED, "7c. records that recompute to their stored hash report verified");
    ok(h.counts.verified === 2 && h.counts.mismatch === 0, "7d. the sample counts are reported");
  });

  // A legacy record (no algorithm marker) is unverifiable — never a tamper claim.
  await store.insert("integration_events", {
    id: "ev_legacy", org_id: ORG, environment_id: ENV, type: "aws.bedrock.invocation", actor: "customer",
    evidence: { connector_id: "int_b" }, evidence_hash: "legacy-hash", evidence_hash_alg: null,
    immutable: true, occurred_at: "2026-07-02T00:00:00.000Z", created_at: "2026-07-02T00:00:00.000Z",
  });
  await withEnv({ rpc: rpcOk(allTriggers()), backend: "supabase", durableStore: true }, async () => {
    const h = by(await assurance.status(), "evidence_hash");
    ok(h.state === STATE.DEGRADED, "7e. a mix of verified and unverifiable reports degraded");
    ok(h.counts.unverifiable === 1 && h.counts.mismatch === 0,
      "7f. a legacy record counts as unverifiable and NEVER as a mismatch");
    ok(/not a tamper finding/i.test(h.summary), "7g. the summary says so in words, not just in a count");
  });

  // A genuinely altered payload must surface as a mismatch.
  await store.update("integration_events", "ev_good_1", { evidence: { connector_id: "int_b", outcome: "TAMPERED" } });
  await withEnv({ rpc: rpcOk(allTriggers()), backend: "supabase", durableStore: true }, async () => {
    const h = by(await assurance.status(), "evidence_hash");
    ok(h.state === STATE.DEGRADED, "7h. an altered payload reports degraded");
    ok(h.counts.mismatch === 1, "7i. the altered record is counted as a mismatch");
    ok(/Generate a report/i.test(h.summary), "7j. it points at the report as the authoritative finding");
  });

  // ══ 8. Latest report verification ═══════════════════════════════════════
  await withEnv({ rpc: rpcOk(allTriggers()), backend: "supabase", durableStore: true }, async () => {
    const r = by(await assurance.status(), "report_verification");
    ok(r.state === STATE.UNKNOWN, "8a. no report yet reports unknown");
  });

  await store.insert("reports", {
    id: "rep_clean", org_id: ORG, environment_id: ENV, period: "monthly",
    generated_at: "2026-07-01T00:00:00.000Z",
    window: { since: "2026-06-01T00:00:00.000Z", until: "2026-07-01T00:00:00.000Z" },
    connector_activity: { available: true, findings: [], register_total: 12 },
  });
  await withEnv({ rpc: rpcOk(allTriggers()), backend: "supabase", durableStore: true }, async () => {
    const r = by(await assurance.status(), "report_verification");
    ok(r.state === STATE.VERIFIED, "8b. a report with no findings reports verified");
    ok(r.report_id === "rep_clean" && r.register_total === 12, "8c. the report is identified so the claim is traceable");
  });

  await store.insert("reports", {
    id: "rep_findings", org_id: ORG, environment_id: ENV, period: "monthly",
    generated_at: "2026-08-01T00:00:00.000Z",
    window: { since: "2026-07-01T00:00:00.000Z", until: "2026-08-01T00:00:00.000Z" },
    connector_activity: { available: true, register_total: 40, findings: [{ severity: "critical", kind: "evidence_hash_mismatch", detail: "x" }] },
  });
  await withEnv({ rpc: rpcOk(allTriggers()), backend: "supabase", durableStore: true }, async () => {
    const r = by(await assurance.status(), "report_verification");
    ok(r.state === STATE.DEGRADED, "8d. the MOST RECENT report drives the result, and findings report degraded");
    ok(r.report_id === "rep_findings", "8e. the newest report is the one reported on");
    ok(r.severities && r.severities.critical === 1, "8f. severities are broken out");
  });

  // A report whose projection could not build must not read as a clean result.
  await store.insert("reports", {
    id: "rep_unavail", org_id: ORG, environment_id: ENV, period: "monthly",
    generated_at: "2026-09-01T00:00:00.000Z",
    connector_activity: { available: false, unavailable_reason: "projection unavailable", findings: [], register_total: 0 },
  });
  await withEnv({ rpc: rpcOk(allTriggers()), backend: "supabase", durableStore: true }, async () => {
    const r = by(await assurance.status(), "report_verification");
    ok(r.state === STATE.UNKNOWN, "8g. a report whose projection failed reports unknown, not verified-with-zero-findings");
    ok(/projection unavailable/.test(r.summary), "8h. the underlying reason is carried through");
  });

  // ══ 8b. Verification source, and the invariant it enforces ══════════════
  // The point of separating `configured` from `verified` is that they rest on
  // different evidence. That only holds if every control says which, and if the
  // weaker source structurally cannot produce the stronger word.
  const EXPECTED_SOURCE = {
    require_record: SOURCE.ENVIRONMENT,
    require_durable: SOURCE.ENVIRONMENT_AND_STORE,
    append_only: SOURCE.POSTGRES_TRIGGER,
    evidence_hash: SOURCE.EVIDENCE_RECOMPUTE,
    report_verification: SOURCE.INTEGRITY_REPORT,
  };

  // Which sources count as independent is hard-coded here on purpose. Comparing
  // a control against SOURCE.X only proves the two agree — it cannot catch
  // SOURCE.X itself being relabelled independent, which is the single edit that
  // would let an environment variable start reporting VERIFIED. These literals
  // are the fixed point that edit has to fight.
  const EXPECTED_INDEPENDENCE = {
    environment: false,
    "environment+runtime_store": false,
    postgres_pg_trigger: true,
    evidence_recompute: true,
    integrity_report: true,
  };
  for (const [id, expected] of Object.entries(EXPECTED_INDEPENDENCE)) {
    const src = Object.values(SOURCE).find((x) => x.id === id);
    ok(src && src.independent === expected,
      `8b-src-${id}. is declared independent=${expected} — self-reported sources must not drift to independent`);
  }
  ok(Object.keys(EXPECTED_INDEPENDENCE).length === Object.keys(SOURCE).length,
    "8b-src. every declared source has a pinned independence expectation, so a new one cannot slip in unclassified");

  await withEnv({ record: "1", durable: "1", rpc: rpcOk(allTriggers()), backend: "supabase", durableStore: true }, async () => {
    const s = await assurance.status();
    for (const c of s.controls) {
      const expected = EXPECTED_SOURCE[c.id];
      ok(c.verification_source === expected.label,
        `8b-${c.id}. states its verification source as "${expected.label}"`);
      ok(c.verification_source_id === expected.id,
        `8b-${c.id}. carries a machine-readable source id`);
    }
    // The environment-sourced switches are set here and everything else is
    // healthy, so this is exactly the state where a careless implementation
    // would promote them to "verified".
    ok(by(s, "require_record").state === STATE.CONFIGURED && by(s, "require_record").independently_verified === false,
      "8b-1. a set environment switch is CONFIGURED and explicitly not independently verified");
    ok(by(s, "require_durable").independently_verified === false,
      "8b-2. the durable switch is not independently verified either, despite the runtime store cross-check");
    ok(by(s, "append_only").state === STATE.VERIFIED && by(s, "append_only").independently_verified === true,
      "8b-3. a database-sourced control that passes IS flagged independently verified");
    ok(s.controls.filter((c) => c.state === STATE.VERIFIED).every((c) => c.independently_verified),
      "8b-4. nothing reports VERIFIED without an independent source");
    ok(s.controls.filter((c) => c.state !== STATE.VERIFIED).every((c) => c.independently_verified === false),
      "8b-4b. independently_verified is never true for a control that is not verified");
  });

  // The invariant is enforced in code, not merely observed by the cases above.
  // Patching a source to claim it is self-reported is the shape a regression
  // would actually take, and append_only would otherwise be VERIFIED here.
  //
  // The guard throws, and status()'s per-check catch turns that into UNKNOWN.
  // That combination is the point: a programming error in this module degrades
  // to "could not establish", never to a false pass.
  {
    const original = SOURCE.POSTGRES_TRIGGER.independent;
    SOURCE.POSTGRES_TRIGGER.independent = false;
    try {
      await withEnv({ rpc: rpcOk(allTriggers()), backend: "supabase", durableStore: true }, async () => {
        const a = by(await assurance.status(), "append_only");
        ok(a.state !== STATE.VERIFIED,
          "8b-5. VERIFIED is refused when the source is marked self-reported — enforced in code, not by convention");
        ok(a.state === STATE.UNKNOWN,
          "8b-6. the refusal degrades to UNKNOWN, so a bug in this module can never read as a passing control");
      });
    } finally { SOURCE.POSTGRES_TRIGGER.independent = original; }
  }

  // ══ 9. Whole-panel invariants ═══════════════════════════════════════════
  await withEnv({ rpc: rpcFail("rpc_threw", "boom"), backend: "supabase", durableStore: true }, async () => {
    const s = await assurance.status();
    ok(s.controls.length === 5, "9a. all five controls are reported even when one cannot be established");
    ok(s.controls.every((c) => Object.values(STATE).includes(c.state)),
      "9b. every control carries one of the four defined states");
    ok(!Object.values(STATE).includes("active") && !Object.values(STATE).includes("inactive"),
      "9b2. the generic active/inactive states are gone — evidence strength is not flattened");
    ok(s.legend && s.legend.configured && s.legend.verified && s.legend.degraded && s.legend.unknown,
      "9b3. the payload carries a legend, so a client rendering only the state word cannot lose the distinction");
    ok(/self-reported/i.test(s.legend.configured) && /independently confirmed/i.test(s.legend.verified),
      "9b4. the legend states plainly which state is self-reported and which is independent");
    ok(s.notes.some((n) => /self-reported can never read VERIFIED/i.test(n)),
      "9b5. the invariant is stated to the reader, not only enforced in code");
    ok(s.controls.every((c) => typeof c.verification_source === "string" && c.verification_source.length > 0),
      "9b6. every control names its verification source, including on the failure path");
    ok(s.notes.some((n) => /stored evidence hash only/i.test(n)) && s.notes.some((n) => /report/i.test(n)),
      "9c. the panel states that the gateway event list shows the stored hash only and reports do the verification");
    ok(s.notes.some((n) => /read-only/i.test(n) && /cannot be changed/i.test(n)),
      "9d. the panel states that it cannot change these controls");
  });

  // The module must expose no way to change anything. A setter appearing here
  // later is the regression this pins.
  const exported = Object.keys(require("../../lib/runtime/assurance"));
  ok(!exported.some((k) => /^(set|enable|disable|update|apply|write|install)/i.test(k)),
    "9e. the assurance module exports no mutating entry point");

  // The route must be GET-only.
  const routeSrc = fs.readFileSync(path.join(__dirname, "..", "..", "app", "api", "runtime", "admin", "assurance", "route.ts"), "utf8");
  ok(/export async function GET/.test(routeSrc), "9f. the route exposes GET");
  ok(!/export async function (POST|PUT|PATCH|DELETE)/.test(routeSrc),
    "9g. the route exposes no mutating method");
  ok(/authorize\(req\)/.test(routeSrc) && /401/.test(routeSrc), "9h. the route is behind operator auth");

  // ══ 10. The migration is read-only ══════════════════════════════════════
  const sql = fs.readFileSync(path.join(__dirname, "..", "..", "supabase", "assurance_status.sql"), "utf8");
  ok(/create or replace function public\.rg_assurance_append_only/.test(sql), "10a. the introspection function is defined");
  ok(/\bstable\b/.test(sql), "10b. the function is declared STABLE — it cannot write");
  ok(!/\b(create|alter|drop)\s+trigger\b/i.test(sql), "10c. the migration creates, alters or drops no trigger");
  // Strip line comments AND single-quoted literals before looking for DML: the
  // function's own COMMENT ON describes what it does and legitimately contains
  // the word UPDATE, which a naive scan reads as a write.
  const sqlCode = sql.replace(/--[^\n]*/g, "").replace(/'(?:[^']|'')*'/g, "''");
  ok(!/\binsert\s+into\b|\bupdate\s+[\w.]+\s+set\b|\bdelete\s+from\b|\btruncate\b/i.test(sqlCode),
    "10d. the migration contains no data-modifying statement");
  ok(!/\bsecurity\s+definer\b(?![\s\S]*set\s+search_path)/i.test(sqlCode),
    "10f. the security-definer function pins an empty search_path");
  ok(/grant execute[\s\S]{0,80}service_role/i.test(sql) && /revoke all[\s\S]{0,60}from public/i.test(sql),
    "10e. execute is granted to service_role only, revoked from public");

  console.log(`\nruntime assurance status test: ${pass} passed, ${fail} failed`);
  if (fail) { console.log("FAILURES:"); for (const f of fails) console.log("  ✗ " + f); }
  try { fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true }); } catch { /* */ }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("assurance status test crashed:", e); process.exit(1); });
