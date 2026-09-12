/* ============================================================================
 * Phase-1 identity encoding.
 *
 * THE DISTINCTION THIS MODULE EXISTS TO KEEP:
 *
 *   AUTHENTICATED PRINCIPAL   `org:<org_id>` / tenant `<org_id>`
 *                             Derived by lib/runtime/admin.authenticate() from
 *                             the API key and forwarded to the engine as
 *                             x-governance-principal / x-governance-tenant,
 *                             honoured only when the gateway shared secret
 *                             matches (app.py _resolve_identity). This is the
 *                             ONLY identity the platform authenticates.
 *
 *   SELF-ASSERTED AGENT LABEL `A1`..`A5`, and the parent link
 *                             A free-text string the caller puts in the request
 *                             body. rg_decisions.agent is unindexed, never
 *                             queried, and never verified. The platform has no
 *                             authenticated agent identity and no parent/child
 *                             model at all.
 *
 * Every artefact this experiment produces must carry that distinction. P4's
 * `agent_label_spoof` probe exists to demonstrate it rather than assert it.
 *
 * No migration is performed. Identity rides in fields that already exist:
 *   agent               → rg_decisions.agent
 *   label               → rg_decisions.label
 *   context.session_id  → rg_execution_records.session_id
 *   context.scenario_id → rg_execution_records.scenario_id
 *   correlation_id      → rg_decisions.correlation_id + rg_execution_records
 *   idempotency_key     → rg_execution_records.idempotency_key
 * ============================================================================ */
"use strict";

const { PARENT_OF } = require("./scenarios.cjs");

/** One transition's correlation id. Stable, reconstructable offline, unique. */
function correlationIdFor({ runId, phase, agent, step, attempt = 1 }) {
  const suffix = attempt > 1 ? `-r${attempt}` : "";
  return `${runId}-${phase}-${agent}-s${step}${suffix}`;
}

/** Idempotency key. Deliberately equal to the correlation id: a repeat of the
 *  same logical transition is the same key, which is what P4 replays. */
function idempotencyKeyFor(parts) { return correlationIdFor(parts); }

/** The self-asserted label string written to rg_decisions.label.
 *  Compact and parseable so the analyser can recover attribution offline. */
function labelFor({ runId, phase, agent, step, claimedBy }) {
  const parent = PARENT_OF[agent] || "none";
  const fields = [
    `run=${runId}`,
    `phase=${phase}`,
    `agent=${agent}`,
    `parent=${parent}`,
    `step=${step}`,
    "identity=self_asserted",
  ];
  // Set only by the P4 spoof probe: the process that actually produced the
  // proposal, when it differs from the claimed agent label.
  if (claimedBy && claimedBy !== agent) fields.push(`actually_produced_by=${claimedBy}`);
  return fields.join(";");
}

function parseLabel(label) {
  const out = {};
  for (const pair of String(label || "").split(";")) {
    const index = pair.indexOf("=");
    if (index > 0) out[pair.slice(0, index)] = pair.slice(index + 1);
  }
  return out;
}

/** The full identity block attached to one governed transition. */
function identityFor({ runId, phase, agent, step, scenarioKind, attempt = 1, claimedBy = null }) {
  const correlation_id = correlationIdFor({ runId, phase, agent, step, attempt });
  return {
    agent,                                    // SELF-ASSERTED
    parent_agent: PARENT_OF[agent] || null,   // SELF-ASSERTED, no platform model
    label: labelFor({ runId, phase, agent, step, claimedBy }),
    correlation_id,
    idempotency_key: correlation_id,
    context: {
      session_id: runId,                      // the experiment run
      scenario_id: `${phase}/${scenarioKind}`,
    },
    authenticated_principal: null,            // filled in from the response, never claimed here
  };
}

/** Disclosure text that must accompany any exported Phase-1 artefact. */
const IDENTITY_DISCLOSURE = [
  "Agent identity in this experiment is SELF-ASSERTED, not authenticated.",
  "The API key authenticates the organisation (principal `org:<org_id>`, tenant `<org_id>`); it does not authenticate the agent.",
  "`agent`, `label` and the parent/child relation are free-text strings supplied by the caller and are not verified by Morrison.",
  "The platform has no authenticated agent identity and no parent/child relationship model.",
].join(" ");

module.exports = {
  correlationIdFor, idempotencyKeyFor, labelFor, parseLabel, identityFor,
  IDENTITY_DISCLOSURE,
};
