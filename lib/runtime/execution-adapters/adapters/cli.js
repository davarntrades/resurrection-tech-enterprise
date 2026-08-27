"use strict";

const { spawn } = require("node:child_process");

function defaultRunner(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const out = [], err = []; let size = 0; const cap = options.max_output_bytes || 65536;
    const collect = (target) => (chunk) => { if (size < cap) { const b = Buffer.from(chunk).subarray(0, cap - size); target.push(b); size += b.length; } };
    child.stdout.on("data", collect(out)); child.stderr.on("data", collect(err));
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal, stdout: Buffer.concat(out).toString(), stderr: Buffer.concat(err).toString(), truncated: size >= cap }));
  });
}

const adapter = {
  id: "cli", name: "CLI environment", version: "0.1.0",
  capabilities: { pre_execution_hook: true, state_write: true, execution_receipts: true, cli: true },
  validateConfiguration(config = {}, dependencies = {}) {
    const allowed = dependencies.policy_allowed_commands;
    const errors = [];
    if (!Array.isArray(allowed) || !allowed.length) errors.push("trusted server policy_allowed_commands is required");
    if (!dependencies || typeof dependencies.validateInvocation !== "function") errors.push("trusted server validateInvocation policy is required");
    if (!config.command) errors.push("command required");
    if (Array.isArray(allowed) && !allowed.includes(config.command)) errors.push("command is not permitted by server policy");
    if (config.cwd && (!Array.isArray(dependencies.policy_allowed_cwds) || !dependencies.policy_allowed_cwds.includes(config.cwd))) errors.push("cwd is not permitted by server policy");
    return { ok: errors.length === 0, errors };
  },
  async health({ config, dependencies = {} }) { const v = this.validateConfiguration(config, dependencies); return { ok: v.ok, status: v.ok ? "configured" : "invalid", errors: v.errors }; },
  async execute(input) {
    const valid = this.validateConfiguration(input.config, input.dependencies || {}); if (!valid.ok) throw new Error(valid.errors.join("; "));
    const runner = input.dependencies && input.dependencies.runner || defaultRunner;
    const args = Array.isArray(input.config.args) ? input.config.args.map(String) : [];
    if (await input.dependencies.validateInvocation({ command: input.config.command, args, cwd: input.config.cwd || null }) !== true) throw new Error("CLI invocation is not permitted by trusted server policy");
    const result = await runner(input.config.command, args, { cwd: input.config.cwd || input.dependencies.cwd, env: input.dependencies && input.dependencies.env, max_output_bytes: input.config.max_output_bytes });
    return { ok: result.code === 0, executed: true, result, receipt: { transport: "cli", command: input.config.command, args_count: args.length, exit_code: result.code, signal: result.signal, decision_id: input.decision_id, correlation_id: input.correlation_id } };
  },
  normalizeResult(result) { return result; },
};

module.exports = { adapter, defaultRunner };
