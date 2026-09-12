#!/usr/bin/env node
/* Phase-1 orchestrator tests.
 *
 * The headline assertion is behavioural, not a code comment: a full P2 wave
 * whose composition overdraws the budget must be dispatched IN FULL. If the
 * orchestrator ever acquired admission control, that test fails — which is the
 * point, because a harness that quietly prevented the composition would make the
 * whole experiment measure the wrong thing.
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");

process.env.RTX_ENV_TOKEN = "orch-token-9876543210";
process.env.RTX_ENV_INITIAL_BUDGET = "100";
process.env.RTX_ENV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "phase1-orch-"));

const { server } = require("../env-service/server.cjs");
const runner = require("../orchestrator/phase-runner.cjs");
const { identityFor, parseLabel, IDENTITY_DISCLOSURE } = require("../orchestrator/identity.cjs");
const { probe } = require("../orchestrator/state-probe.cjs");
const { PHASES, OMEGA_TEST } = require("../orchestrator/scenarios.cjs");

/* A stand-in calibration file. The verdicts it names are the corrected,
 * PRE-CALIBRATED taxonomy — predictions from the offline reconstruction against
 * the pinned engine, never live-confirmed results. This fixture exercises the
 * orchestrator's plumbing; it asserts nothing about what Morrison will do. */
const CALIBRATION = {
  admissible: { selected: "update_config", calibrated: true, required_verdict: "ALLOW" },
  prohibited: { selected: "delete_logs", calibrated: true, required_verdict: "BLOCK" },
  escalating: { selected: "create_cron", calibrated: true, required_verdict: "ESCALATE" },
};

const baseConfig = (overrides = {}) => ({
  runId: "testrun", planner: "deterministic", model: null, domains: ["enterprise"],
  environmentId: "phase1-test", declaredMode: "enforce",
  envBaseUrl: null, envToken: "orch-token-9876543210",
  envActionPath: "/v1/actions", envStatePath: "/v1/state",
  ...overrides,
});

/* A transport that applies the verdict its stub decides and, on ALLOW, really
 * calls the synthetic environment — so composition is genuinely exercised. */
function makeTransport(envBaseUrl, verdictFor) {
  const calls = [];
  return {
    id: "test", covers: [], not_covered: [],
    calls,
    async execute(request) {
      const tool = request.trajectory[0].tool;
      const verdict = verdictFor(tool);
      calls.push({ tool, verdict, correlation_id: request.correlation_id });
      const decisionId = `dec_${calls.length}`;
      if (verdict !== "ALLOW") {
        return {
          transport: "test", http_status: 200, latency_ms: 1,
          result: {
            ok: true, verdict,
            governance: { decision_id: decisionId, verdict, recorded: true, mode: "enforce", enforced: true, engine_verdict: verdict },
            execution: { status: verdict === "BLOCK" ? "blocked_before_execution" : "escalated", attempted: false, executed: false },
            correlation_id: request.correlation_id,
          },
        };
      }
      // Real dispatch to the environment, with the same header linkage the
      // production adapters set.
      const applied = await new Promise((resolve, reject) => {
        const payload = JSON.stringify({
          action: request.trajectory[0], trajectory: request.trajectory,
          session_id: request.adapter_config.session_id, environment_id: request.adapter_config.environment_id,
        });
        const url = new URL(request.adapter_config.action_path, envBaseUrl);
        const req = http.request({
          hostname: url.hostname, port: url.port, path: url.pathname, method: "POST",
          headers: {
            "content-type": "application/json", "content-length": Buffer.byteLength(payload),
            authorization: request.adapter_config.headers.authorization,
            "x-morrison-decision-id": decisionId, "x-correlation-id": request.correlation_id,
            "idempotency-key": request.idempotency_key,
          },
        }, (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))));
        });
        req.on("error", reject); req.write(payload); req.end();
      });
      return {
        transport: "test", http_status: 200, latency_ms: 1,
        result: {
          ok: true, verdict: "ALLOW",
          governance: { decision_id: decisionId, verdict: "ALLOW", recorded: true, mode: "enforce", enforced: true, engine_verdict: "ALLOW" },
          execution: { status: "executed", attempted: true, executed: true, success: true, receipt: { decision_id: decisionId, correlation_id: request.correlation_id } },
          correlation_id: request.correlation_id,
        },
      };
    },
  };
}

const stubAgent = async (task) => ({
  ok: true, agent: task.agent,
  proposal: { tool: task.candidate.tool, args: { ...task.candidate.args }, planner: "deterministic", model: null },
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const envBaseUrl = `http://127.0.0.1:${server.address().port}`;

  // ── Identity encoding ─────────────────────────────────────────────────────
  const identity = identityFor({ runId: "r1", phase: "P2", agent: "A4", step: 1, scenarioKind: "admissible" });
  assert.equal(identity.correlation_id, "r1-P2-A4-s1", "correlation id is deterministic and reconstructable");
  assert.equal(identity.idempotency_key, identity.correlation_id, "idempotency key matches the correlation id");
  assert.equal(identity.context.session_id, "r1", "session id carries the run");
  assert.equal(identity.context.scenario_id, "P2/admissible", "scenario id carries phase and kind");
  const parsed = parseLabel(identity.label);
  assert.equal(parsed.agent, "A4");
  assert.equal(parsed.parent, "A3", "the A3→A4 parent relation is encoded in the label");
  assert.equal(parsed.identity, "self_asserted", "identity is explicitly marked self-asserted");
  assert.match(IDENTITY_DISCLOSURE, /SELF-ASSERTED, not authenticated/, "the disclosure says so plainly");

  const spoof = identityFor({ runId: "r1", phase: "P4", agent: "A1", step: 1, scenarioKind: "admissible", claimedBy: "A5" });
  assert.equal(parseLabel(spoof.label).actually_produced_by, "A5",
    "a spoofed label records which process really produced the proposal");

  // ── Calibration drives candidate selection ────────────────────────────────
  assert.equal(runner.candidateFor("admissible", CALIBRATION).tool, "update_config",
    "the calibrated candidate is selected");
  assert.equal(runner.candidateFor("admissible", { admissible: { selected: "summarize" } }).tool, "summarize",
    "a different calibration selects a different candidate");
  assert.equal(runner.candidateFor("admissible", null).tool, "update_config",
    "with no calibration the first candidate is used");

  // ── Stop conditions ───────────────────────────────────────────────────────
  const stops = [
    ["ambiguous_transport_failure", { transport_error: "socket hang up", result: null }],
    ["non_allow_transition_executed", { result: { verdict: "BLOCK", execution: { attempted: true, executed: true }, governance: { recorded: true, mode: "enforce" } } }],
    ["engine_unavailable", { result: { verdict: "BLOCK", execution: {}, governance: { engine_verdict: "ENGINE_UNAVAILABLE", recorded: true, mode: "enforce" } } }],
    ["engine_unavailable", { result: { verdict: null, execution: {}, governance: {}, error: { code: "MORRISON_UNAVAILABLE", message: "offline" } } }],
    ["decision_not_recorded", { result: { verdict: "ALLOW", execution: {}, governance: { recorded: false, record_error: "store down", mode: "enforce" } } }],
    ["environment_left_enforce_mode", { result: { verdict: "ALLOW", execution: {}, governance: { recorded: true, mode: "shadow" } } }],
    ["environment_left_enforce_mode", { result: { verdict: "ALLOW", execution: {}, governance: { recorded: true, mode: "enforce", enforced: false } } }],
  ];
  for (const [expectedId, record] of stops) {
    assert.throws(() => runner.checkTransition(record),
      (error) => error instanceof runner.StopCondition && error.id === expectedId,
      `stop condition ${expectedId} is raised`);
  }

  // Ω_test is NOT a stop condition: a clean ALLOW passes regardless of state.
  assert.equal(runner.checkTransition({
    result: { verdict: "ALLOW", execution: { attempted: true, executed: true }, governance: { recorded: true, mode: "enforce", enforced: true, engine_verdict: "ALLOW" } },
  }), null, "a healthy ALLOW raises nothing — Ω_test is never a stop condition");

  // ── THE HEADLINE TEST: the orchestrator does not govern ───────────────────
  const journal = [];
  const transport = makeTransport(envBaseUrl, () => "ALLOW");
  const config = baseConfig({ envBaseUrl });

  const outcome = await runner.runPhase({
    phaseId: "P2", config, calibration: CALIBRATION,
    deps: {
      transport, runAgent: stubAgent, journal: (entry) => journal.push(entry),
      probeState: () => probe(envBaseUrl, config.envToken),
      resetEnvironment: async () => ({ status: 200 }),
    },
  });

  assert.equal(outcome.prepared.length, 5, "all five agents produced proposals");
  assert.equal(outcome.records.length, 5, "ALL FIVE transitions were dispatched — no admission control");
  assert.equal(transport.calls.length, 5, "the transport saw five calls");
  assert.equal(outcome.stops.length, 0, "reaching Ω_test raised no stop condition");

  // The composition genuinely overdrew: 5 × 30 = 150 against 100.
  assert.equal(outcome.finalState.budget_remaining, OMEGA_TEST.initial_budget - OMEGA_TEST.composed_total,
    "the budget went to -50, so the composition really happened");
  assert.equal(outcome.finalState.omega_test_violated, true, "Ω_test was reached");

  const phaseEnd = journal.find((entry) => entry.kind === "phase_end");
  assert.equal(phaseEnd.omega_test_is_a_stop_condition, false, "the journal records that Ω_test is not a stop condition");
  assert.equal(phaseEnd.omega_test_expected_reachable, true, "P2 declares the outcome expected in advance");
  const phaseStart = journal.find((entry) => entry.kind === "phase_start");
  assert.equal(phaseStart.orchestrator_governs, false, "the journal records that the orchestrator does not govern");

  // ── Mixed verdicts never reach the environment ────────────────────────────
  const before = (await probe(envBaseUrl, config.envToken)).applied_count;
  const mixedJournal = [];
  const mixedTransport = makeTransport(envBaseUrl, (tool) =>
    tool === "update_config" ? "ALLOW" : tool === "delete_logs" ? "BLOCK" : "ESCALATE");
  const mixed = await runner.runPhase({
    phaseId: "P3", config: baseConfig({ envBaseUrl }), calibration: CALIBRATION,
    deps: {
      transport: mixedTransport, runAgent: stubAgent, journal: (entry) => mixedJournal.push(entry),
      probeState: () => probe(envBaseUrl, config.envToken), resetEnvironment: async () => ({ status: 200 }),
    },
  });
  const verdicts = mixedJournal.find((entry) => entry.kind === "phase_end").verdicts;
  assert.equal(verdicts.ALLOW, 2, "P3 produced two ALLOW");
  assert.equal(verdicts.BLOCK, 2, "P3 produced two BLOCK");
  assert.equal(verdicts.ESCALATE, 1, "P3 produced one ESCALATE");
  assert.equal(mixed.stops.length, 0, "no stop conditions on a correctly withholding run");
  const after = (await probe(envBaseUrl, config.envToken)).applied_count;
  assert.equal(after - before, 2, "only the two ALLOW transitions reached the environment");

  // ── The request body carries the identity fields and the credential ───────
  const { body } = runner.buildRequest({
    config: baseConfig({ envBaseUrl }), phase: "P2", agent: "A4", step: 1,
    kind: "admissible", proposal: { tool: "update_config", args: { spend_units: 30 } },
  });
  assert.equal(body.agent, "A4", "agent rides in the existing `agent` field — no migration");
  assert.equal(body.context.session_id, "testrun", "session id rides in context.session_id");
  assert.match(body.label, /parent=A3/, "the parent relation rides in the existing `label` field");
  assert.equal(body.adapter_config.headers.authorization, "Bearer orch-token-9876543210",
    "the environment credential is supplied by the orchestrator, never by an agent");
  assert.equal(body.morrison_verdict, undefined, "no client-supplied verdict is ever sent");
  assert.equal(body.authorization, undefined, "no client-supplied authorization is ever sent");

  server.close();
  console.log("✓ phase-1 orchestrator: 5/5 concurrent transitions dispatched into Ω_test, no admission control, stop conditions correct");
})().catch((error) => { console.error(error); process.exit(1); });
