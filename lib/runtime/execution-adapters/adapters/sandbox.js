"use strict";

const { performHttpRequest } = require("./generic-http");

function endpoint(config, path) { return new URL(String(path || ""), String(config.base_url || "")).toString(); }
function required(config = {}) {
  const errors = [];
  if (!config.base_url) errors.push("base_url required");
  if (!config.action_path) errors.push("action_path required");
  if (!config.environment_id && !config.twin_id) errors.push("environment_id or twin_id required");
  return errors;
}

const adapter = {
  id: "sandbox", name: "Generic stateful sandbox", version: "1.0.0",
  capabilities(config = {}) {
    return {
      pre_execution_hook: true, state_read: !!config.state_path, state_write: true,
      state_diff: !!config.state_path, replay: !!config.replay_path, multi_step: true,
      deterministic_reset: !!config.reset_path && config.reset_is_deterministic === true,
      execution_receipts: true, idempotency: true, http: true,
    };
  },
  validateConfiguration(config = {}) {
    const errors = required(config);
    try { if (config.base_url) new URL(config.base_url); } catch { errors.push("base_url must be a valid URL"); }
    return { ok: errors.length === 0, errors };
  },
  async health({ config, request_id = "health" }) {
    const valid = this.validateConfiguration(config); if (!valid.ok) return { ok: false, status: "invalid", errors: valid.errors };
    if (!config.health_path) return { ok: true, status: "configured_not_probed" };
    const result = await performHttpRequest({ ...config, endpoint: endpoint(config, config.health_path), method: "GET" }, { decision_id: "health-check", correlation_id: request_id, request_id }, { method: "GET", body: null });
    return { ok: result.ok, status: result.status };
  },
  async observeState(input) {
    const result = await performHttpRequest({ ...input.config, endpoint: endpoint(input.config, input.config.state_path), method: "GET" }, input, { method: "GET", body: null });
    let state = result.response_body; try { state = JSON.parse(state); } catch { /* text state is valid */ }
    return { state, receipt: result.receipt };
  },
  async execute(input) {
    const body = {
      session_id: input.config.session_id || null,
      environment_id: input.config.environment_id || null,
      twin_id: input.config.twin_id || null,
      action: input.action, trajectory: input.trajectory,
    };
    return performHttpRequest({ ...input.config, endpoint: endpoint(input.config, input.config.action_path), method: input.config.action_method || "POST" }, input, { body });
  },
  normalizeResult(result) { return result; },
  async reset(input) {
    return performHttpRequest({ ...input.config, endpoint: endpoint(input.config, input.config.reset_path), method: "POST" }, input, { body: { session_id: input.config.session_id, environment_id: input.config.environment_id, twin_id: input.config.twin_id } });
  },
};

module.exports = { adapter };
