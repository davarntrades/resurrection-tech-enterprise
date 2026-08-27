"use strict";

const { normalizeCapabilities } = require("./capabilities");
const { AuthorizationInvariantError, InvalidAdapterConfigurationError } = require("./errors");

const REQUIRED = ["id", "name", "version", "capabilities", "validateConfiguration", "health", "execute", "normalizeResult"];

function validateAdapter(adapter) {
  const errors = [];
  if (!adapter || typeof adapter !== "object") return { ok: false, errors: ["adapter must be an object"] };
  for (const field of REQUIRED) {
    if (field === "id" || field === "name" || field === "version") {
      if (!String(adapter[field] || "").trim()) errors.push(`${field} is required`);
    } else if (field === "capabilities") {
      if (!(typeof adapter.capabilities === "object" || typeof adapter.capabilities === "function")) errors.push("capabilities must be an object or function");
    } else if (typeof adapter[field] !== "function") errors.push(`${field}() is required`);
  }
  return { ok: errors.length === 0, errors };
}

function capabilitiesFor(adapter, config = {}, dependencies = {}) {
  const raw = typeof adapter.capabilities === "function" ? adapter.capabilities(config, dependencies) : adapter.capabilities;
  return normalizeCapabilities(raw);
}

// The gate gives registry-returned adapters an unforgeable, one-use, in-memory
// grant. It prevents accidental/direct invocation through platform routes. It
// is not claimed as a cryptographic boundary against arbitrary trusted code in
// this Node process; that trust boundary is documented explicitly.
function createExecutionGate() {
  const grants = new WeakMap();

  function issue(decision, binding = {}) {
    if (!decision || decision.verdict !== "ALLOW" || !decision.decision_id || decision.recorded !== true) {
      throw new AuthorizationInvariantError();
    }
    const grant = Object.freeze({});
    grants.set(grant, {
      decision_id: decision.decision_id,
      adapter_id: binding.adapter_id,
      correlation_id: binding.correlation_id,
      operation: binding.operation || "execute",
      expires_at: Date.now() + Math.max(1000, Number(binding.ttl_ms || 30000)),
      consumed: false,
    });
    return grant;
  }

  function guard(adapter) {
    const contract = validateAdapter(adapter);
    if (!contract.ok) throw new InvalidAdapterConfigurationError(contract.errors);
    const guarded = {
      ...adapter,
      async execute(input = {}) {
        const meta = grants.get(input.authorization);
        if (!meta || meta.consumed || meta.expires_at < Date.now()
            || meta.operation !== "execute"
            || meta.adapter_id !== adapter.id
            || meta.decision_id !== input.decision_id
            || meta.correlation_id !== input.correlation_id) {
          throw new AuthorizationInvariantError();
        }
        // Consume before dispatch. A thrown timeout is not permission to retry
        // because the remote side may already have acted.
        meta.consumed = true;
        return adapter.execute(input);
      },
    };
    if (typeof adapter.reset === "function") guarded.reset = async (input = {}) => {
      const meta = grants.get(input.authorization);
      if (!meta || meta.consumed || meta.expires_at < Date.now()
          || meta.operation !== "reset" || meta.adapter_id !== adapter.id
          || meta.decision_id !== input.decision_id || meta.correlation_id !== input.correlation_id) {
        throw new AuthorizationInvariantError("Morrison ALLOW authorization bound to reset is required");
      }
      meta.consumed = true;
      return adapter.reset(input);
    };
    return Object.freeze(guarded);
  }

  return Object.freeze({ issue, guard });
}

module.exports = { validateAdapter, capabilitiesFor, createExecutionGate };
