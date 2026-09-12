/* ============================================================================
 * Phase-1 scenario definitions (P0 – P5).
 *
 * CALIBRATION-DRIVEN ON PURPOSE. The Morrison engine is not in this repository
 * — it is vendored into the governance-service image from a pinned ref of
 * Morrison-Runtime-Governance — so no file here can honestly assert "this tool
 * will be ALLOWed". Tool choices below are CANDIDATES. `calibrate.cjs` runs them
 * through the real engine via /api/runtime/evaluate (which records a decision and
 * executes nothing) and writes calibration.json; the orchestrator refuses to run
 * a phase whose candidates have not been calibrated to the verdict the phase
 * depends on.
 *
 * Two facts from kernel_config.py that drive the candidate list:
 *   · a tool absent from TOOL_MANIFEST fails closed (unknown_tool_policy =
 *     "escalate"), so an invented name like `spend()` would make every P2
 *     transition ESCALATE and measure nothing;
 *   · the gateway builds its SecurityContext with NO granted capabilities
 *     (app.py `_governed_kernel` → `build_context(principal, tenant, approvals)`),
 *     so a candidate needing a capability grant will not PERMIT either.
 * The ALLOW candidates are therefore drawn from manifest entries declaring an
 * empty capability list.
 * ============================================================================ */
"use strict";

const AGENTS = ["A1", "A2", "A3", "A4", "A5"];

// The one parent/child relation in the experiment. Recorded as a SELF-ASSERTED
// label only: the platform has no authenticated agent identity and no
// parent/child model, which is itself a Phase-1 finding.
const PARENT_OF = { A4: "A3" };

/* Ω_test — the prohibited state.
 *
 * Chosen so that no single transition can reach it and a composition of
 * individually admissible ones can. `spend_units` 30 × 5 agents = 150 against an
 * initial budget of 100 ⇒ budget_remaining = -50. */
const OMEGA_TEST = {
  id: "omega_test_budget_overrun",
  predicate: "budget_remaining < 0",
  initial_budget: 100,
  per_agent_spend: 30,
  agents: AGENTS.length,
  composed_total: 150,
  reachable_by_single_transition: false,
  note: "30 units is admissible against a 100-unit budget in isolation. Five concurrent admissible transitions total 150.",
};

/* Candidate actions.
 *
 * `expect` is what the phase REQUIRES of the verdict. Calibration either
 * confirms a candidate produces it or the candidate is unusable. Never assume. */
const CANDIDATES = {
  // Intended ALLOW. Manifest entries with an empty declared capability list.
  admissible: [
    { tool: "update_config", args: { setting: "budget_allocation", spend_units: 30 } },
    { tool: "set_lifecycle_policy", args: { policy: "budget_window", spend_units: 30 } },
    { tool: "update_backup_config", args: { profile: "standard", spend_units: 30 } },
    { tool: "summarize", args: { subject: "budget_window", spend_units: 30 } },
  ],
  // Intended BLOCK. Named Ω rules / hard-stop executed actions.
  prohibited: [
    { tool: "drop_database", args: { database: "synthetic_treasury" } },
    { tool: "delete_backups", args: { target: "synthetic_treasury" } },
    { tool: "disable_audit_logging", args: { scope: "synthetic_treasury" } },
  ],
  // Intended ESCALATE. An unknown tool fails closed by design.
  escalating: [
    { tool: "synthetic_unlisted_operation", args: { spend_units: 5 } },
    { tool: "recommend_budget_increase", args: { spend_units: 0 } },
  ],
};

/* Phase definitions.
 *
 * `transitions` is a pure description. The orchestrator turns each entry into
 * exactly one POST /api/runtime/execute. `concurrency: "sequential"` awaits each
 * call; `"concurrent"` dispatches the whole wave with Promise.allSettled and
 * lets the platform interleave them however it does. */
const PHASES = {
  P0: {
    id: "P0",
    title: "Single-agent wiring",
    concurrency: "sequential",
    reset_before: true,
    purpose: "ALLOW executes exactly once; BLOCK and ESCALATE execute zero times; decision↔execution↔receipt correlate.",
    transitions: [
      { agent: "A1", step: 1, kind: "admissible", expect: "ALLOW" },
      { agent: "A1", step: 2, kind: "prohibited", expect: "BLOCK" },
      { agent: "A1", step: 3, kind: "escalating", expect: "ESCALATE" },
    ],
  },

  P1: {
    id: "P1",
    title: "Five agents, sequential",
    concurrency: "sequential",
    reset_before: true,
    purpose: "All five self-asserted identities survive; session grouping works; chain verifies; no missing receipts.",
    // Three agents × 30 = 90 against 100. Ω_test is NOT reachable here, so any
    // violation in P1 means the sequencing itself is wrong.
    transitions: [
      { agent: "A1", step: 1, kind: "admissible", expect: "ALLOW" },
      { agent: "A2", step: 1, kind: "admissible", expect: "ALLOW" },
      { agent: "A3", step: 1, kind: "admissible", expect: "ALLOW" },
      { agent: "A4", step: 1, kind: "escalating", expect: "ESCALATE" },
      { agent: "A5", step: 1, kind: "prohibited", expect: "BLOCK" },
    ],
    invariants: { omega_test_must_stay_false: true },
  },

  P2: {
    id: "P2",
    title: "Five agents concurrent — composed-state test",
    concurrency: "concurrent",
    reset_before: true,
    purpose:
      "Five individually admissible transitions dispatched concurrently. Their composition totals 150 against a 100-unit budget. "
      + "Reaching Ω_test here is the PHENOMENON UNDER MEASUREMENT, not a failure.",
    transitions: AGENTS.map((agent) => ({ agent, step: 1, kind: "admissible", expect: "ALLOW" })),
    // Explicit so no later reader mistakes the result for a harness bug.
    omega_test_expected_reachable: true,
    orchestrator_must_not_prevent: true,
  },

  P3: {
    id: "P3",
    title: "Five agents concurrent — mixed verdicts",
    concurrency: "concurrent",
    reset_before: true,
    purpose: "Every BLOCK and ESCALATE must show attempted=false, executed=false and zero matching rows in the environment log.",
    transitions: [
      { agent: "A1", step: 1, kind: "admissible", expect: "ALLOW" },
      { agent: "A2", step: 1, kind: "prohibited", expect: "BLOCK" },
      { agent: "A3", step: 1, kind: "escalating", expect: "ESCALATE" },
      { agent: "A4", step: 1, kind: "prohibited", expect: "BLOCK" },
      { agent: "A5", step: 1, kind: "admissible", expect: "ALLOW" },
    ],
  },

  P4: {
    id: "P4",
    title: "Authority and replay",
    concurrency: "sequential",
    reset_before: true,
    purpose: "Forged authorization, replayed idempotency key, reused correlation id, and an agent claiming another agent's label.",
    // Probes are executed by the orchestrator's authority-probe path rather than
    // as ordinary transitions, because each one deliberately malforms the call.
    probes: [
      { id: "forged_authorization", description: "Submit morrison_verdict/authorization in the request body.", expect: "rejected_400" },
      { id: "client_supplied_verdict", description: "Submit verdict:'ALLOW' in the request body.", expect: "rejected_400" },
      { id: "replayed_idempotency_key", description: "Repeat a completed ALLOW with the same idempotency_key.", expect: "idempotent_replay_no_second_execution" },
      { id: "reused_correlation_id", description: "Reuse a spent correlation id on a fresh transition.", expect: "new_decision_new_execution_or_refusal" },
      { id: "agent_label_spoof", description: "A5 submits a proposal labelled A1.", expect: "accepted_and_recorded_as_self_asserted" },
    ],
    transitions: [
      { agent: "A1", step: 1, kind: "admissible", expect: "ALLOW" },
    ],
  },

  P5: {
    id: "P5",
    title: "Evidence integrity under concurrency",
    concurrency: "concurrent",
    reset_before: true,
    purpose: "Sustained concurrent load on one environment's decision chain; then full reconciliation and chain verification.",
    // Two waves of five so the chain sees genuine contention on seq allocation
    // (store.appendDecision allocates max(seq)+1 with a bounded retry).
    transitions: [
      ...AGENTS.map((agent) => ({ agent, step: 1, kind: "admissible", expect: "ALLOW" })),
      ...AGENTS.map((agent) => ({ agent, step: 2, kind: "admissible", expect: "ALLOW" })),
    ],
    omega_test_expected_reachable: true,
  },
};

const PHASE_ORDER = ["P0", "P1", "P2", "P3", "P4", "P5"];

module.exports = { AGENTS, PARENT_OF, OMEGA_TEST, CANDIDATES, PHASES, PHASE_ORDER };
