/* ============================================================================
 * Operations Agent — Autonomy Control (Phase 4, Executive Command).
 *
 * A single global autonomy MODE plus per-agent pauses, gating the AUTONOMOUS
 * council path only — operator-initiated actions always work, in every mode.
 *
 * Modes, from least to most autonomous:
 *   emergency_pause    the council halts — nothing proposed or executed
 *   observe            assess + observe, but propose nothing
 *   recommend          propose, but everything is HELD for operator approval
 *   execute_low_risk   low/medium auto-execute after PERMIT; high escalate  (default)
 *   governed_autonomy  execute_low_risk + coordination ingest (drain handoffs)
 *
 * SAFETY ASYMMETRY: lowering autonomy (toward emergency_pause) is always allowed
 * and audited — a fail-safe brake that can never be blocked, even with the
 * engine down. Raising autonomy requires governance approval (enforced by the
 * caller via the governed set_autonomy_mode action). Changing the mode is always
 * recorded in the admin audit trail.
 *
 * Default (no stored row) = execute_low_risk → today's behaviour byte-for-byte.
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const store = rt.store;
const events = require("./events");

// Ordered by autonomy level (index = how much the council may do).
const MODES = ["emergency_pause", "observe", "recommend", "execute_low_risk", "governed_autonomy"];
const DEFAULT_MODE = "execute_low_risk";
const LABELS = {
  emergency_pause: "Emergency pause", observe: "Observe only", recommend: "Recommend",
  execute_low_risk: "Execute low-risk", governed_autonomy: "Governed autonomy",
};
const level = (m) => Math.max(0, MODES.indexOf(m));
const isValid = (m) => MODES.includes(m);
const isRaise = (from, to) => level(to) > level(from);

// What a mode permits on the autonomous path.
function policy(mode) {
  switch (mode) {
    case "emergency_pause": return { mode, proposes: false, autoExecutes: false, coordinates: false, holds: false, halted: true };
    case "observe": return { mode, proposes: false, autoExecutes: false, coordinates: false, holds: false };
    case "recommend": return { mode, proposes: true, autoExecutes: false, coordinates: false, holds: true };
    case "governed_autonomy": return { mode, proposes: true, autoExecutes: true, coordinates: true, holds: false };
    case "execute_low_risk": default: return { mode, proposes: true, autoExecutes: true, coordinates: false, holds: false };
  }
}

const SINGLETON = "current";
async function row() { return store.findOne("ops_autonomy", { id: SINGLETON }).catch(() => null); }

/** Current autonomy state. Defaults to execute_low_risk when unset. */
async function current() {
  const r = await row();
  const mode = r && isValid(r.mode) ? r.mode : DEFAULT_MODE;
  const paused_agents = (r && Array.isArray(r.paused_agents) ? r.paused_agents : []);
  return { mode, label: LABELS[mode], paused_agents, policy: policy(mode), updated_by: r ? r.updated_by : null, updated_at: r ? r.updated_at : null, default: !r };
}

async function save(patch, actor) {
  const r = await row();
  if (r) return store.update("ops_autonomy", r.id, { ...patch, updated_by: actor || r.updated_by, updated_at: store.nowISO() });
  return store.insert("ops_autonomy", { id: SINGLETON, mode: DEFAULT_MODE, paused_agents: [], updated_by: actor || null, updated_at: store.nowISO(), ...patch });
}

/** Persist a new mode + audit + event. Enforcement of the raise/lower asymmetry
 *  lives in the caller (the API/set_autonomy_mode action); this records it. */
async function setMode(mode, { actor = "operator" } = {}) {
  if (!isValid(mode)) throw new Error(`invalid autonomy mode ${JSON.stringify(mode)}`);
  const before = (await current()).mode;
  await save({ mode }, actor);
  await rt.adminaudit.record({ action: "ops_autonomy_mode_changed", actor, via: "ops", target: null, meta: { from: before, to: mode, raised: isRaise(before, mode) } });
  await events.emit("autonomy.mode_changed", { from: before, to: mode, actor });
  rt.log.info("ops_autonomy_mode", { from: before, to: mode, actor });
  return current();
}

async function pauseAgent(agent_id, { actor = "operator" } = {}) {
  const st = await current();
  if (st.paused_agents.includes(agent_id)) return st;
  await save({ paused_agents: st.paused_agents.concat(agent_id) }, actor);
  await rt.adminaudit.record({ action: "ops_agent_paused", actor, via: "ops", target: null, meta: { agent_id } });
  await events.emit("autonomy.agent_paused", { agent_id, actor });
  return current();
}
async function resumeAgent(agent_id, { actor = "operator" } = {}) {
  const st = await current();
  if (!st.paused_agents.includes(agent_id)) return st;
  await save({ paused_agents: st.paused_agents.filter((a) => a !== agent_id) }, actor);
  await rt.adminaudit.record({ action: "ops_agent_resumed", actor, via: "ops", target: null, meta: { agent_id } });
  await events.emit("autonomy.agent_resumed", { agent_id, actor });
  return current();
}
const isPaused = async (agent_id) => (await current()).paused_agents.includes(agent_id);

module.exports = { MODES, DEFAULT_MODE, LABELS, level, isValid, isRaise, policy, current, setMode, pauseAgent, resumeAgent, isPaused };
