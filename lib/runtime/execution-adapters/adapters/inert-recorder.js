"use strict";
/*
 * INERT RECORDER — an execution adapter with no effect.
 *
 * It opens no socket, spawns no process and writes no file. "Executing" an
 * action means recording, in this process's memory, that the governed gate
 * released it, and keeping a counter per target as observable state. It exists
 * so a staging or demo deployment can exercise the whole execution boundary
 * (verdict → one-use grant → exact-action binding → adapter → outcome →
 * evidence) without any real-world side effect.
 *
 * State is per process and is lost on restart, by design: nothing here is
 * durable or external. Every receipt says `simulated: true`.
 */

const released = [];          // what the gate released, newest last (bounded)
const counters = new Map();   // target label -> count, the observable "state"
const MAX_RECORDS = 500;

function label(config = {}) { return String(config.label || config.endpoint || "inert"); }

const adapter = {
  id: "inert-recorder", name: "Inert recorder (no effect)", version: "1.0.0",
  inert: true,
  capabilities() {
    return {
      pre_execution_hook: true, state_read: true, state_write: true, state_diff: true,
      multi_step: true, execution_receipts: true, idempotency: false,
      deterministic_reset: false, http: false,
    };
  },
  validateConfiguration(config = {}) {
    const extra = Object.keys(config).filter((k) => !["label", "endpoint", "description"].includes(k));
    return extra.length ? { ok: false, errors: [`inert recorder accepts only label/endpoint/description, not: ${extra.join(", ")}`] }
      : { ok: true, errors: [] };
  },
  async health() { return { ok: true, status: "inert" }; },
  async observeState({ config }) { return { state: { target: label(config), released_count: counters.get(label(config)) || 0 } }; },
  async execute(input) {
    const target = label(input.config);
    counters.set(target, (counters.get(target) || 0) + 1);
    const entry = { at: new Date().toISOString(), target, decision_id: input.decision_id,
      correlation_id: input.correlation_id, tool: input.action && input.action.tool || null };
    released.push(entry);
    if (released.length > MAX_RECORDS) released.shift();
    return { ok: true, executed: true, simulated: true, result: { simulated: true, effect: null },
      receipt: { simulated: true, adapter: "inert-recorder", ...entry } };
  },
  normalizeResult(result) { return result; },
};

function recent(limit = 50) { return released.slice(-limit).reverse(); }

module.exports = { adapter, recent };
