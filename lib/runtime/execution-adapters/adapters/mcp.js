"use strict";

const adapter = {
  id: "mcp", name: "Model Context Protocol", version: "0.1.0",
  capabilities: { pre_execution_hook: true, state_write: true, multi_step: true, execution_receipts: true, mcp: true },
  validateConfiguration(config = {}, dependencies = {}) {
    const errors = [];
    if (!config.server_id) errors.push("server_id required");
    if (!dependencies || !dependencies.client || typeof dependencies.client.callTool !== "function") errors.push("trusted server MCP client binding is required");
    if (!dependencies || !Array.isArray(dependencies.policy_allowed_tools) || !dependencies.policy_allowed_tools.length) errors.push("trusted server policy_allowed_tools is required");
    return { ok: errors.length === 0, errors };
  },
  async health({ dependencies = {} }) {
    if (!dependencies.client) return { ok: false, status: "client_not_bound" };
    return typeof dependencies.client.health === "function" ? dependencies.client.health() : { ok: true, status: "client_bound" };
  },
  async execute(input) {
    const client = input.dependencies && input.dependencies.client;
    if (!client || typeof client.callTool !== "function") throw new Error("MCP client is not bound by the trusted server configuration");
    const action = input.action || {};
    if (!input.dependencies.policy_allowed_tools.includes(action.tool)) throw new Error("MCP tool is not permitted by trusted server policy");
    const result = await client.callTool({ name: action.tool, arguments: action.args || {}, correlationId: input.correlation_id });
    return { ok: true, executed: true, result, receipt: { transport: "mcp", server_id: input.config.server_id, tool: action.tool, decision_id: input.decision_id, correlation_id: input.correlation_id } };
  },
  normalizeResult(result) { return result; },
};

module.exports = { adapter };
