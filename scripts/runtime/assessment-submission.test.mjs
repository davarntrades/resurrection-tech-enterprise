/**
 * Runtime Governance Assessment — submission contract.
 *
 * Guards the Stage 8 "Get my recommended pathway" blocker: a fully completed
 * questionnaire must submit, hidden conditional questions must never block it,
 * and anything the API rejects must come back as a participant-readable field
 * name attached to the stage that owns it — never an internal key, never a bare
 * "Please complete the required fields."
 *
 *   node --import ./scripts/testing/ts-resolve.mjs scripts/runtime/assessment-submission.test.mjs
 */
import assert from "node:assert/strict";

import { assessmentSchema } from "../../lib/assessmentValidation.ts";
import {
  FIELD_SPECS, FIELD_BY_KEY, SECTION_META, EMPTY_ASSESSMENT, blankAssessment,
  validateAssessment, issuesFromFieldErrors, sectionsForStep, summaryHeading,
  errorMapFrom, maxLengthOf, EMAIL_RE,
} from "../../lib/assessmentFields.ts";
import { score, recommend, crmSummary } from "../../lib/assessment.ts";

let failures = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (err) { failures++; console.error(`  ✗ ${name}\n      ${err.message}`); }
}
function section(name) { console.log(`\n${name}`); }

/** A fully completed enterprise assessment, as the questionnaire would send it. */
function completedAssessment(overrides = {}) {
  return {
    ...blankAssessment(),
    fullName: "Davarn Morrison",
    jobTitle: "Chief Executive Officer",
    companyName: "Resurrection Tech",
    email: "davarn@resurrection-tech.example",
    phone: "+44 7700 900000",
    industry: "Finance",
    companySize: "1000+",
    country: "United Kingdom",
    operatingRegions: ["uk", "eu", "north_america"],
    deploymentRegions: ["uk", "eu"],
    aiMaturityCurrent: "production",
    aiMaturityTarget: "enterprise_wide",
    agentsDeployed: "yes", customerFacing: "yes", connectedToTools: "yes",
    canTakeActions: "yes", multipleAgents: "yes", inProduction: "yes",
    toolAccess: ["customer_records", "financial_systems", "payment_systems", "email_systems", "cloud_infrastructure"],
    executionPermissions: ["execute_autonomously", "write_production", "financial_execution"],
    criticalSystems: "yes", downstreamAutomation: "yes",
    customersCurrent: "101_1000", customersFuture: "10k_100k",
    revenueExposureCurrent: "1m_10m", revenueExposureFuture: "10m_plus",
    deploymentModel: ["hosted_saas", "hybrid"],
    cloudProviders: ["aws", "azure"],
    modelStack: ["openai", "anthropic"],
    agentStack: ["langchain_langgraph", "mcp"],
    protectedEnvironments: "4_10", numAgents: "6–20", agentsExpected: "5x",
    agentCount: "14", businessUnits: "3",
    sharedMemory: "yes", sharedTools: "yes", autonomousCoordination: "yes", crossAgentComm: "yes",
    controls: ["human_approval", "logging", "monitoring", "rbac"],
    governanceOps: ["approval_workflows", "runtime_monitoring"],
    governanceTarget: "enforced_runtime",
    unsafePrevention: "Human approval on payment execution; allow-listed tools.",
    incidents: "One near miss in staging — an agent retried a settlement call.",
    compliance: ["eu_ai_act", "gdpr", "soc2", "fca"],
    evidenceRequirements: ["board_reporting", "regulator_submissions"],
    execOversight: "board_committee", execNeed: "need_advisory",
    intent: "production_deploy",
    stage: "pilot_ready", timeline: "this_quarter",
    successCriteria: ["reduce_risk", "regulatory_readiness", "deploy_safely"],
    successNotes: "Board deadline in Q4.",
    referralSource: "Direct / Unknown",
    ...overrides,
  };
}

/* ── Contract: state, specs, and schema describe the same questionnaire ──── */
section("Field contract");

test("every questionnaire field has a spec, and every spec is in form state", () => {
  const stateKeys = Object.keys(EMPTY_ASSESSMENT).sort();
  const specKeys = FIELD_SPECS.map((f) => String(f.key)).sort();
  assert.deepEqual(specKeys, stateKeys, "field specs and form state disagree");
});

test("every spec key is validated by the API schema (and vice versa)", () => {
  const schemaKeys = Object.keys(assessmentSchema.shape)
    .filter((k) => k !== "company_url_confirm").sort();
  const specKeys = FIELD_SPECS.map((f) => String(f.key)).sort();
  assert.deepEqual(schemaKeys, specKeys, "API schema and field specs disagree");
});

test("every spec belongs to a real section and carries a participant-facing label", () => {
  const sections = new Set(SECTION_META.map((s) => s.key));
  for (const f of FIELD_SPECS) {
    assert.ok(sections.has(f.section), `${String(f.key)} has an unknown section`);
    assert.ok(f.label && f.label.length > 1, `${String(f.key)} has no label`);
    assert.ok(!/[_.]/.test(f.label), `${String(f.key)} label leaks an internal key: ${f.label}`);
  }
});

test("client and API agree on every character cap", () => {
  for (const f of FIELD_SPECS) {
    if (f.kind === "list" || f.kind === "yesno") continue;
    const long = "x".repeat((f.max ?? 0) + 1);
    const parsed = assessmentSchema.safeParse(completedAssessment({ [f.key]: long }));
    assert.equal(parsed.success, false, `${String(f.key)}: API accepted a value over its cap`);
    const issues = validateAssessment(completedAssessment({ [f.key]: long }));
    if (!f.internal && !f.askedWhen) {
      assert.ok(
        issues.some((i) => i.key === String(f.key)),
        `${String(f.key)}: API rejects over-cap values but the questionnaire does not`,
      );
    }
  }
});

/* ── A valid, fully completed assessment submits ────────────────────────── */
section("Valid submission");

test("a fully completed assessment passes client validation", () => {
  assert.deepEqual(validateAssessment(completedAssessment()), []);
});

test("a fully completed assessment passes the API schema", () => {
  const parsed = assessmentSchema.safeParse(completedAssessment());
  assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
});

test("a fully completed assessment produces a recommended pathway and CRM export", () => {
  const data = assessmentSchema.parse(completedAssessment());
  const scores = score(data);
  const rec = recommend(data, scores);
  assert.ok(rec.id && rec.title, "no pathway recommended");
  assert.ok(rec.why.length > 0, "pathway has no rationale");
  assert.ok(rec.summary?.startsWith("Based on your responses"), "no personalised narrative");
  const crm = crmSummary(data, scores, rec, "ASMT-TEST-2026", "now");
  assert.match(crm, /Resurrection Tech/);
  assert.match(crm, /RECOMMENDED PATHWAY/);
});

test("arrays and multi-select answers survive the schema unchanged", () => {
  const data = completedAssessment();
  const parsed = assessmentSchema.parse(data);
  for (const f of FIELD_SPECS.filter((x) => x.kind === "list")) {
    assert.ok(Array.isArray(parsed[f.key]), `${String(f.key)} is not an array after parsing`);
    assert.deepEqual(parsed[f.key], data[f.key], `${String(f.key)} lost entries`);
  }
  assert.deepEqual(parsed.toolAccess, data.toolAccess);
  assert.equal(parsed.compliance.length, 4);
});

test("every multi-select can be fully selected without exceeding its cap", () => {
  const data = completedAssessment({
    operatingRegions: ["uk", "eu", "north_america", "middle_east", "asia_pacific", "africa", "latam", "global"],
    toolAccess: ["customer_records", "financial_systems", "payment_systems", "healthcare_data",
      "internal_documents", "email_systems", "cloud_infrastructure", "security_systems",
      "source_code", "third_party_apis"],
    compliance: ["eu_ai_act", "hipaa", "gdpr", "soc2", "iso27001", "nist", "fca", "internal_governance", "other"],
  });
  assert.deepEqual(validateAssessment(data), []);
  assert.ok(assessmentSchema.safeParse(data).success);
});

/* ── Hidden / conditional questions ─────────────────────────────────────── */
section("Hidden and conditional questions");

test("partner-only questions are not asked for a non-partner intent", () => {
  const data = completedAssessment({ intent: "production_deploy" });
  assert.deepEqual(validateAssessment(data), []);
  assert.ok(assessmentSchema.safeParse(data).success);
});

test("partner-only questions left blank never block submission", () => {
  const data = completedAssessment({
    intent: "partnership", partnerType: "", customerReach: "",
    customerReachPotential: "", customerBase: "",
  });
  assert.deepEqual(validateAssessment(data), [], "a hidden/optional partner question blocked submit");
  assert.ok(assessmentSchema.safeParse(data).success);
});

test("a stale partner answer does not block after the triggering answer changes", () => {
  // Chose "partnership", answered the partner questions, then switched intent.
  const data = completedAssessment({
    intent: "production_deploy",
    partnerType: "msp_mssp",
    customerReach: "50_250",
    customerBase: "Mid-market financial-services clients.",
  });
  assert.deepEqual(validateAssessment(data), []);
  assert.ok(assessmentSchema.safeParse(data).success);
});

/* ── Genuinely missing answers get specific, human-readable errors ──────── */
section("Missing and invalid answers");

test("a missing required answer names the field and its section", () => {
  const issues = validateAssessment(completedAssessment({ companyName: "" }));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].label, "Company name");
  assert.equal(issues[0].sectionLabel, "Organisation");
  assert.equal(issues[0].step, 0);
  assert.equal(issues[0].missing, true);
});

test("the summary reads like the participant-facing example", () => {
  const issues = validateAssessment(completedAssessment({ companyName: "", timeline: "" }))
    .concat(issuesFromFieldErrors({ timeline: "required" }, completedAssessment({ timeline: "" })));
  const lines = issues.map((i) => `• ${i.sectionLabel} — ${i.label}`);
  assert.ok(lines.includes("• Organisation — Company name"), lines.join("\n"));
  assert.ok(lines.includes("• Commercial — Engagement timeline"), lines.join("\n"));
  assert.equal(summaryHeading(issues), "Please complete the following required fields:");
});

test("no internal field key is ever exposed to the participant", () => {
  const keys = FIELD_SPECS.map((f) => String(f.key));
  const issues = [
    ...validateAssessment(blankAssessment()),
    ...issuesFromFieldErrors(Object.fromEntries(keys.map((k) => [k, "bad"])), blankAssessment()),
  ];
  assert.ok(issues.length > 0);
  const camelOrSnake = /\b[a-z]+(?:[A-Z][a-z]*|_[a-z]+)+\b/;
  for (const i of issues) {
    const rendered = `${i.sectionLabel} — ${i.label} ${i.message}`;
    // Internal keys are camelCase/snake_case identifiers; labels are prose.
    assert.ok(!camelOrSnake.test(rendered), `issue text reads like an internal key: ${rendered}`);
    assert.ok(!keys.includes(i.label), `label is a raw field key: ${i.label}`);
  }
});

test("an unknown key from the API is never rendered to the participant", () => {
  const issues = issuesFromFieldErrors({ some_internal_key: "boom" }, completedAssessment());
  assert.deepEqual(issues, []);
});

test("an over-long answer is reported against its own stage, not Stage 1", () => {
  const data = completedAssessment({ unsafePrevention: "x".repeat(4001) });
  const issues = validateAssessment(data);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].label, "How unsafe actions are prevented");
  assert.equal(issues[0].sectionLabel, "Governance");
  assert.equal(issues[0].step, 4, "the participant would be sent to the wrong stage");
  assert.equal(issues[0].missing, false);
  assert.match(issues[0].message, /4000 characters or fewer/);
});

test("the API's field errors map back to the same named fields and stages", () => {
  const data = completedAssessment({ unsafePrevention: "x".repeat(4001) });
  const parsed = assessmentSchema.safeParse(data);
  assert.equal(parsed.success, false);
  const fieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".") || "form";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  const issues = issuesFromFieldErrors(fieldErrors, data);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].sectionLabel, "Governance");
  assert.equal(issues[0].label, "How unsafe actions are prevented");
  assert.equal(issues[0].step, 4);
});

test("client and API agree on which email addresses are acceptable", () => {
  const cases = [
    ["davarn@resurrection-tech.com", true],
    ["first.last@sub.company.co.uk", true],
    ["name+tag@example.io", true],
    ["o'brien@example.com", true],
    ["not-an-email", false],
    ["double..dot@example.com", false],
    [".leading@example.com", false],
    ["short@domain.c", false],
    ["spaced out@example.com", false],
  ];
  for (const [value, ok] of cases) {
    assert.equal(EMAIL_RE.test(value), ok, `client regex disagrees for ${value}`);
    const parsed = assessmentSchema.safeParse(completedAssessment({ email: value }));
    assert.equal(parsed.success, ok, `API disagrees for ${value}`);
    const issues = validateAssessment(completedAssessment({ email: value }));
    assert.equal(issues.length === 0, ok, `questionnaire disagrees for ${value}`);
  }
});

test("inline field errors are keyed so each stage can mark its own inputs", () => {
  const issues = validateAssessment(completedAssessment({ companyName: "", email: "nope" }));
  const map = errorMapFrom(issues);
  // The input already shows its own label, so the inline message drops it.
  assert.equal(map.companyName, "Required");
  assert.equal(map.email, "Enter a valid email address");
});

/* ── Persisted progress ─────────────────────────────────────────────────── */
section("Persisted progress (localStorage)");

test("answers restored from localStorage still validate and submit", () => {
  const original = completedAssessment();
  // Exactly what the questionnaire writes, then reads back, on refresh.
  const saved = JSON.parse(JSON.stringify({ data: original, step: 7 }));
  const restored = { ...blankAssessment(), ...saved.data };
  assert.deepEqual(validateAssessment(restored), [], "restored answers failed client validation");
  const parsed = assessmentSchema.safeParse(restored);
  assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
  assert.deepEqual(parsed.data.toolAccess, original.toolAccess, "multi-select lost entries across a refresh");
  assert.equal(parsed.data.incidents, original.incidents);
});

test("a partially saved older payload is filled in, not left undefined", () => {
  // A stored payload from before a field existed must not crash validation.
  const partial = { fullName: "Davarn Morrison", toolAccess: ["customer_records"] };
  const restored = { ...blankAssessment(), ...partial };
  const issues = validateAssessment(restored);
  assert.ok(issues.every((i) => typeof i.label === "string"));
  assert.ok(issues.some((i) => i.label === "Company name"), "missing answers were not detected");
  assert.deepEqual(restored.deploymentModel, [], "list field was left undefined");
});

/* ── Per-stage gate ─────────────────────────────────────────────────────── */
section("Per-stage validation");

test("the Continue gate only checks the stage the participant is on", () => {
  const data = completedAssessment({ companyName: "" });
  assert.equal(validateAssessment(data, sectionsForStep(0)).length, 1, "Stage 1 gate missed a blank required field");
  assert.equal(validateAssessment(data, sectionsForStep(4)).length, 0, "a later stage was blocked by a Stage 1 field");
});

test("each section maps to exactly one stage", () => {
  const steps = SECTION_META.map((s) => s.step);
  assert.deepEqual(steps, [...new Set(steps)].sort((a, b) => a - b));
  for (const s of SECTION_META) assert.deepEqual(sectionsForStep(s.step), [s.key]);
});

test("required answers are exactly the Organisation core (unchanged routing)", () => {
  const required = FIELD_SPECS.filter((f) => f.required).map((f) => String(f.key)).sort();
  assert.deepEqual(required, [
    "companyName", "companySize", "country", "email", "fullName", "industry", "jobTitle",
  ]);
  assert.ok(FIELD_BY_KEY.timeline && !FIELD_BY_KEY.timeline.required);
  assert.equal(maxLengthOf("companyName"), 200);
});

console.log(failures ? `\n${failures} failing test(s)\n` : "\nAll assessment submission tests passed.\n");
process.exit(failures ? 1 : 0);
