/* ============================================================================
 * Guardian OS — Dynamic Runtime Governance Policy control plane.
 *
 * The foundation for self-service governance: author customer-specific Ω policies
 * as declarative data, validate them, and ACTIVATE them into the Runtime
 * Governance kernel AT RUNTIME (the engine reads active rows from
 * rg_governance_policies and compiles them — no code change, no redeploy). All
 * existing guarantees are preserved:
 *
 *   • DENY-BY-DEFAULT / baseline never weakened — a policy is a DENY-ONLY
 *     predicate (evaluateSpec returns block-or-not, never allow). Activating a
 *     policy can only ADD constraints.
 *   • VALIDATED BEFORE ACTIVATION — a policy must compile + pass a dry-run
 *     (no over-reach onto unrelated tools) before it can be activated.
 *   • VERSIONED + ROLLBACK — every edit is a new version under a stable name;
 *     activation supersedes the prior active version; rollback re-activates a
 *     prior version (or deactivates), all recorded.
 *   • EVIDENCE — every transition is written to the admin audit trail + events,
 *     and the engine's verdict attestation fingerprints the exact ruleset.
 *   • APPROVAL WORKFLOW UNCHANGED — activation is a privileged, operator-approved
 *     action (governed by ops_unauthorized_policy_activation); the agent drafts,
 *     a human activates.
 *
 * This module is the SINGLE writer; the engine (governance-service/dynamic_rules.py)
 * is a read-only consumer. The JS compiler here mirrors the Python compiler
 * exactly (same declarative contract), so validation + dry-run match enforcement.
 * ============================================================================ */
"use strict";
const crypto = require("node:crypto");
const rt = require("../runtime");
const store = rt.store;
const events = require("./events");
const immutable = require("../sovereign/immutable");

const STATUSES = ["draft", "validated", "active", "superseded", "rolled_back"];
// OmegaDomain values the kernel supports (kept in sync with the engine enum).
const DOMAINS = new Set(["enterprise", "compliance", "data_privacy", "finance", "banking", "fintech", "fraud", "cybersecurity", "healthcare"]);
const THRESHOLD_OPS = new Set([">", ">=", "<", "<=", "==", "!="]);

// ── Declarative compiler mirror (matches dynamic_rules.py semantics) ─────────
const toolOf = (s) => String((s && s.tool) || "").trim().toLowerCase();
const flagTrue = (s, keys) => (keys || []).some((k) => s[k] === true || String(s[k]).trim().toLowerCase() === "true");
function numOf(s, field) {
  const v = s[field];
  if (typeof v === "boolean") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") { const n = parseFloat(v.trim()); return Number.isNaN(n) ? null : n; }
  return null;
}
function thresholdViolated(s, th) {
  if (!th || !th.field || !THRESHOLD_OPS.has(th.op) || typeof th.value !== "number") return false;
  const n = numOf(s, String(th.field));
  if (n === null) return false;
  switch (th.op) {
    case ">": return n > th.value; case ">=": return n >= th.value;
    case "<": return n < th.value; case "<=": return n <= th.value;
    case "==": return n === th.value; case "!=": return n !== th.value;
    default: return false;
  }
}

/** DENY-ONLY evaluation: true = violation (BLOCK), false = no violation. Never
 *  grants allow. Mirrors compile_spec().check() in the engine. */
function evaluateSpec(spec, state) {
  const tools = new Set((((spec || {}).match || {}).tools || []).map((t) => String(t).trim().toLowerCase()));
  if (!tools.has(toolOf(state))) return false;
  const c = (spec && spec.conditions) || {};
  const unauthUnless = c.unauthorized_unless || [];
  const flagBlocks = c.flag_true_blocks || [];
  if (unauthUnless.length && !flagTrue(state, unauthUnless)) return true;
  if (flagBlocks.length && flagTrue(state, flagBlocks)) return true;
  if (c.threshold && thresholdViolated(state, c.threshold)) return true;
  if (!unauthUnless.length && !flagBlocks.length && !c.threshold) return true; // bare tool denylist
  return false;
}

class PolicySpecError extends Error {}

/** Structural + safety validation. Throws PolicySpecError; dry-runs against a
 *  probe to guarantee no over-reach onto unrelated tools. */
function validateSpec(spec) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw new PolicySpecError("spec must be an object");
  if (!String(spec.name || "").trim()) throw new PolicySpecError("spec.name is required");
  if (!DOMAINS.has(String(spec.domain || "").trim().toLowerCase())) throw new PolicySpecError(`unknown Ω domain ${JSON.stringify(spec.domain)}`);
  const tools = (((spec.match || {}).tools) || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  if (!tools.length) throw new PolicySpecError("match.tools must list at least one tool");
  const c = spec.conditions || {};
  if (c.threshold !== undefined && c.threshold !== null) {
    const th = c.threshold;
    if (typeof th !== "object" || !th.field || !THRESHOLD_OPS.has(th.op) || typeof th.value !== "number") {
      throw new PolicySpecError("conditions.threshold must be {field, op in <>=, value:number}");
    }
  }
  for (const key of ["unauthorized_unless", "flag_true_blocks"]) {
    if (c[key] !== undefined && !Array.isArray(c[key])) throw new PolicySpecError(`conditions.${key} must be an array`);
  }
  // Over-reach dry-run: an unrelated tool must NEVER be blocked by this policy.
  if (evaluateSpec(spec, { tool: "__unrelated_probe__" }) !== false) throw new PolicySpecError("policy blocks unrelated tools — refusing");
  return true;
}

const hashSpec = (spec) => crypto.createHash("sha256").update(canonical(spec)).digest("hex").slice(0, 32);
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

function shape(p) {
  if (!p) return null;
  return {
    id: p.id, name: p.name, scope: p.scope || "global", domain: p.domain, spec: p.spec || null,
    version: p.version || 1, status: p.status || "draft", hash: p.hash || null,
    parent_version: p.parent_version || null, superseded_by: p.superseded_by || null, notes: p.notes || null,
    created_by: p.created_by || null, validated_by: p.validated_by || null, validated_at: p.validated_at || null,
    activated_by: p.activated_by || null, activated_at: p.activated_at || null,
    created_at: p.created_at, updated_at: p.updated_at || p.created_at,
  };
}

async function get(id) { return shape(await store.findOne("governance_policies", { id })); }

async function list({ status, name, scope, limit = 200 } = {}) {
  const where = {};
  if (status) where.status = status;
  if (name) where.name = name;
  if (scope) where.scope = scope;
  const rows = await store.find("governance_policies", where);
  rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return rows.slice(0, Math.max(1, Math.min(500, limit))).map(shape);
}

async function history(name, scope = "global") {
  const rows = (await store.find("governance_policies", { name, scope })).map(shape);
  rows.sort((a, b) => (a.version || 0) - (b.version || 0));
  return rows;
}

/** The set the engine loads: one active version per (name, scope). */
async function active({ scope } = {}) {
  const where = { status: "active" };
  if (scope) where.scope = scope;
  return (await store.find("governance_policies", where)).map(shape);
}

async function nextVersion(name, scope) {
  const rows = await store.find("governance_policies", { name, scope });
  return rows.reduce((m, r) => Math.max(m, r.version || 0), 0) + 1;
}

/** Draft a new policy version (validated structurally; nothing loads yet). */
async function draft({ name, scope = "global", domain, spec, notes = null, created_by = "operator" }) {
  immutable.assertMutable("policy authoring");
  const full = { ...(spec || {}), name, domain };
  validateSpec(full); // fail early on a malformed draft
  const version = await nextVersion(name, scope);
  const row = await store.insert("governance_policies", {
    name, scope, domain, spec: full, version, status: "draft", hash: hashSpec(full),
    parent_version: version > 1 ? version - 1 : null, superseded_by: null, notes,
    created_by, validated_by: null, validated_at: null, activated_by: null, activated_at: null, updated_at: store.nowISO(),
  });
  await rt.adminaudit.record({ action: "gov_policy_drafted", actor: created_by, via: "ops", target: null, meta: { id: row.id, name, version } });
  await events.emit("gov_policy.drafted", { id: row.id, name, version });
  return shape(row);
}

/** Validate a draft: compile + dry-run. Only a validated policy may be activated. */
async function validate(id, { actor = "operator" } = {}) {
  const p = await get(id);
  if (!p) throw new Error("policy not found");
  validateSpec(p.spec);
  await store.update("governance_policies", id, { status: "validated", validated_by: actor, validated_at: store.nowISO(), updated_at: store.nowISO() });
  await rt.adminaudit.record({ action: "gov_policy_validated", actor, via: "ops", target: null, meta: { id, name: p.name, version: p.version } });
  await events.emit("gov_policy.validated", { id, name: p.name, version: p.version });
  return get(id);
}

/** Activate a validated policy into the kernel. Supersedes the prior active
 *  version for (name, scope). Re-validates defensively. Evidence-backed. */
async function activate(id, { actor = "operator" } = {}) {
  immutable.assertMutable("policy activation");
  const p = await get(id);
  if (!p) throw new Error("policy not found");
  if (!["validated", "superseded", "rolled_back"].includes(p.status)) {
    throw new Error(`policy is ${p.status}; only a validated (or previously-active) version can be activated`);
  }
  validateSpec(p.spec); // never activate an unsafe spec, even if flagged validated
  const priorActive = (await store.find("governance_policies", { name: p.name, scope: p.scope, status: "active" }));
  for (const prev of priorActive) {
    await store.update("governance_policies", prev.id, { status: "superseded", superseded_by: id, updated_at: store.nowISO() });
  }
  await store.update("governance_policies", id, { status: "active", activated_by: actor, activated_at: store.nowISO(), superseded_by: null, updated_at: store.nowISO() });
  await rt.adminaudit.record({ action: "gov_policy_activated", actor, via: "ops", target: null, meta: { id, name: p.name, version: p.version, superseded: priorActive.map((x) => x.id) } });
  await events.emit("gov_policy.activated", { id, name: p.name, version: p.version, scope: p.scope });
  rt.log.info("gov_policy_activated", { id, name: p.name, version: p.version, scope: p.scope });
  return get(id);
}

/** Roll back the active policy for (name, scope): deactivate the current active
 *  version and (optionally) re-activate a prior version. Evidence-backed.
 *
 *  DELIBERATELY NOT immutability-guarded — see lib/sovereign/immutable.js. The
 *  lock stops silent drift and unsigned ADDITIONS; taking away the operator's
 *  ability to STOP enforcement would be a worse failure than the drift it
 *  prevents. Under an immutable runtime the brake is recorded extra-loudly
 *  rather than removed. */
async function rollback({ name, scope = "global", to_version = null, actor = "operator" } = {}) {
  if (immutable.locked()) {
    rt.log.warn("gov_policy_rollback_under_immutable_runtime", {
      name, scope, to_version, actor,
      note: "the emergency brake was pulled on a locked runtime — expected to be rare and always investigated",
    });
    await events.emit("gov_policy.rollback_under_immutable", { name, scope, to_version, actor }).catch(() => {});
  }
  const current = (await store.find("governance_policies", { name, scope, status: "active" }))[0];
  if (current) {
    await store.update("governance_policies", current.id, { status: "rolled_back", updated_at: store.nowISO() });
  }
  let reactivated = null;
  if (to_version != null) {
    const target = (await store.find("governance_policies", { name, scope })).find((r) => r.version === Number(to_version));
    if (!target) throw new Error(`version ${to_version} not found for ${name}`);
    validateSpec(target.spec);
    await store.update("governance_policies", target.id, { status: "active", activated_by: actor, activated_at: store.nowISO(), superseded_by: null, updated_at: store.nowISO() });
    reactivated = target.id;
  }
  await rt.adminaudit.record({ action: "gov_policy_rolled_back", actor, via: "ops", target: null, meta: { name, scope, from: current ? current.id : null, to_version, reactivated } });
  await events.emit("gov_policy.rolled_back", { name, scope, from: current ? current.id : null, to_version });
  rt.log.warn("gov_policy_rollback", { name, scope, to_version });
  return { name, scope, deactivated: current ? current.id : null, reactivated };
}

async function summary() {
  const rows = await store.find("governance_policies", {}).catch(() => []);
  const by = {}; for (const s of STATUSES) by[s] = 0;
  const names = new Set();
  for (const r of rows) { if (by[r.status] !== undefined) by[r.status] += 1; names.add(`${r.scope || "global"}:${r.name}`); }
  return { total: rows.length, by_status: by, policies: names.size, active: by.active };
}

module.exports = {
  STATUSES, DOMAINS, evaluateSpec, validateSpec, PolicySpecError, hashSpec,
  draft, validate, activate, rollback, get, list, history, active, summary, shape,
};
