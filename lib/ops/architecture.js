/* ============================================================================
 * Guardian OS — Enterprise Architecture coverage (derived, read-only).
 *
 * Accelerates onboarding by making the assessment gap visible: which customers
 * have a completed runtime/architecture assessment and which are still a gap.
 * The autonomous, deterministic job is to SURFACE gaps and recommend an
 * assessment — the deep discovery of a customer's agents / MCP servers / tools /
 * trust boundaries is operator-triggered (the assess-agent skill needs the
 * customer's manifest), so this module never fabricates a discovery it cannot
 * perform. Pure projection over the existing lifecycle + intelligence records.
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const workflow = require("./workflow");
const intelligence = require("./intelligence");

// Lifecycle stages at/after which a customer has been through the runtime
// assessment. Before this, an architecture assessment is a coverage gap.
const ASSESSED_FROM = "assessment";

function assessed(stage) {
  const order = workflow.STAGE_KEYS.indexOf(stage);
  const from = workflow.STAGE_KEYS.indexOf(ASSESSED_FROM);
  return order >= 0 && from >= 0 && order >= from;
}

/** Architecture coverage across the customer base. */
async function coverage() {
  const profiles = await intelligence.list().catch(() => []);
  const customers = profiles.map((p) => ({
    org_id: p.org_id, name: p.name, lifecycle_stage: p.lifecycle_stage,
    assessed: assessed(p.lifecycle_stage),
    integration: p.integration_status.status,
    // A gap worth acting on: pre-assessment and either stalled or integration not healthy.
    gap: !assessed(p.lifecycle_stage),
  }));
  const gaps = customers.filter((c) => c.gap);
  const total = customers.length;
  const covered = total - gaps.length;
  return {
    total, covered, gaps: gaps.length,
    coverage_pct: total ? Math.round((100 * covered) / total) : 100,
    gap_customers: gaps.map((c) => ({ org_id: c.org_id, name: c.name, lifecycle_stage: c.lifecycle_stage, integration: c.integration })),
    generated_at: rt.store.nowISO(),
  };
}

module.exports = { coverage, assessed, ASSESSED_FROM };
