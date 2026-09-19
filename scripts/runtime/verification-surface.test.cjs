#!/usr/bin/env node
/* ============================================================================
 * Runtime Governance — finite-model verification surface.
 *
 * Checks the properties the surface exists to hold, using a real artifact
 * produced by the Python verifier:
 *
 *   - with nothing ingested it reads UNKNOWN, never green;
 *   - the four evidence classes are populated and stay SEPARATE;
 *   - there is no aggregate "overall status" field, by design;
 *   - tampering with stored bytes reads DEGRADED;
 *   - configuration drift produces the operator wording, verbatim;
 *   - BLOCK and ESCALATE are reported separately and never summed;
 *   - no universal / open-world safety language appears anywhere.
 *
 *   node scripts/runtime/verification-surface.test.cjs [path/to/artifact.json]
 * ========================================================================== */
"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-ver-test-"));
const rt = require("../../lib/runtime");
const store = require("../../lib/runtime/store");

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; } else { fail++; fails.push(m); } };

const ARTIFACT = process.argv[2] ||
  path.join(__dirname, "fixtures", "verification-artifact.json");

(async () => {
  /* 1 — nothing ingested must not read as reassurance. */
  const empty = await rt.verification.status({});
  ok(empty.classes.verification.state === "unknown",
     `empty deployment: verification state is ${empty.classes.verification.state}, want unknown`);
  ok(empty.classes.integrity_drift.revalidation_required === true,
     "empty deployment: revalidation must be required when nothing was verified");
  ok(empty.classes.counterexamples.state === "unknown",
     "empty deployment: counterexamples unknown");

  /* The rule that matters most: no single overall indicator. */
  for (const forbidden of ["status", "overall", "overall_status", "safe", "ok"]) {
    ok(!(forbidden in empty),
       `surface must not expose an aggregate '${forbidden}' field`);
  }
  ok(Array.isArray(empty.separation_notice) && empty.separation_notice.length >= 4,
     "surface must state how the classes differ");

  if (!fs.existsSync(ARTIFACT)) {
    console.log(`\nSKIP artifact-backed checks — no fixture at ${ARTIFACT}`);
    console.log(`${pass} passed, ${fail} failed`);
    fails.forEach((f) => console.log("  FAIL " + f));
    process.exit(fail ? 1 : 0);
  }

  /* 2 — ingest a real artifact and read the four classes. */
  const raw = fs.readFileSync(ARTIFACT, "utf8");
  const doc = JSON.parse(raw);
  const digest = crypto.createHash("sha256").update(Buffer.from(raw, "utf8")).digest("hex");
  const base = {
    id: store.id(), org_id: "org-test", environment_id: "env-test",
    verification_id: doc.verification_id,
    model_hash: doc.environment.model_hash,
    ruleset_hash: doc.governance.ruleset_hash,
    verdict: doc.finite_verification.verdict,
    ingested_at: store.nowISO(),
    verified_tools: ["read_secret", "access_external_network"],
    verified_permissions: ["vault:read"],
    content_sha256: digest,
    artifact: raw,
  };
  await store.insert("verification_artifacts", base);

  const live = {
    ruleset_hash: doc.governance.ruleset_hash,
    engine_version: doc.governance.engine_version,
    model_hash: doc.environment.model_hash,
    environment_id: "env-test",
    tools: ["read_secret", "access_external_network"],
    permissions: ["vault:read"],
  };
  const good = await rt.verification.status({ org_id: "org-test", environment_id: "env-test", live });

  ok(good.classes.verification.state === "verified",
     `stored-bytes integrity should be verified, got ${good.classes.verification.state}`);
  const a = good.classes.verification.artifact;
  ok(a.verification_id === doc.verification_id, "verification id surfaced");
  ok(a.model_identity.model_hash === doc.environment.model_hash, "model hash surfaced");
  ok(a.ruleset_hash === doc.governance.ruleset_hash, "ruleset hash surfaced");
  ok(a.repository_commit === doc.verifier.repository_commit, "repository commit surfaced");
  ok(a.verdict === doc.finite_verification.verdict, "verdict surfaced");
  ok(a.complete_enumeration === doc.finite_verification.complete_enumeration,
     "completeness surfaced");
  ok(Array.isArray(a.assumptions) && a.assumptions.length > 0, "assumptions surfaced");
  ok(Array.isArray(a.limitations) && a.limitations.length > 0, "limitations surfaced");
  ok(a.last_verification, "last verification time surfaced");

  /* The producer's own integrity claim must be labelled, not adopted. */
  ok(good.classes.verification.producer_reported.note.includes("NOT re-checked"),
     "producer-reported integrity must be labelled as not re-checked here");
  ok(good.classes.verification.independent_recheck.matches_ingested_hash === true,
     "independent byte recheck should pass for an untampered artifact");

  /* 3 — drift. */
  ok(good.classes.integrity_drift.revalidation_required === false,
     "matching configuration must not demand revalidation");
  const drifted = await rt.verification.status({
    org_id: "org-test", environment_id: "env-test",
    live: { ...live, ruleset_hash: "0".repeat(64) },
  });
  ok(drifted.classes.integrity_drift.revalidation_required === true,
     "a changed ruleset must demand revalidation");
  ok(drifted.classes.integrity_drift.summary ===
     "Verification no longer matches current configuration — revalidation required.",
     "operator wording must be exact");
  const unread = await rt.verification.status({
    org_id: "org-test", environment_id: "env-test", live: { ...live, tools: null },
  });
  ok(unread.classes.integrity_drift.revalidation_required === true,
     "an unreadable dimension must not pass as unchanged");

  /* 4 — counterexamples, and BLOCK vs ESCALATE kept apart. */
  const ce = good.classes.counterexamples;
  ok(ce.modelled !== null, "modelled counterexample section present");
  ok("escalations_denied" in ce.modelled && "escalations_approved_and_executed" in ce.modelled,
     "escalation outcomes reported separately");
  ok(!("blocked_or_escalated" in ce.modelled) && !("refusals" in ce.modelled),
     "BLOCK and ESCALATE must never be summed into one figure");

  /* 5 — tampering with stored bytes. */
  const tampered = { ...base, id: store.id(), artifact: raw.replace(
    '"verdict"', '"verdict_tampered"') };
  await store.remove("verification_artifacts", { id: base.id });
  await store.insert("verification_artifacts", tampered);
  const bad = await rt.verification.status({ org_id: "org-test", environment_id: "env-test", live });
  ok(bad.classes.verification.state === "degraded",
     `tampered artifact should read degraded, got ${bad.classes.verification.state}`);
  ok(bad.classes.verification.summary.includes("untrustworthy"),
     "tampered artifact must be called untrustworthy");

  /* 6 — language. */
  const text = JSON.stringify(good).toLowerCase();
  // Affirmative claims only. The surface is REQUIRED to mention universal
  // safety in order to disclaim it, so a bare substring match would be wrong.
  for (const phrase of ["is globally safe", "is universally safe", "is provably safe",
                        "guaranteed safe", "the ai is safe", "production safe",
                        "unsafe behaviour is impossible", "unsafe behavior is impossible"]) {
    ok(!text.includes(phrase), `surface must not assert "${phrase}"`);
  }
  ok(text.includes("claim of universal or open-world safety"),
     "surface must explicitly disclaim universal safety");
  ok(text.includes("within") && text.includes("declared model"),
     "surface must state that a finite-model verdict is scoped to its declared model");

  console.log(`\n${pass} passed, ${fail} failed`);
  fails.forEach((f) => console.log("  FAIL " + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
