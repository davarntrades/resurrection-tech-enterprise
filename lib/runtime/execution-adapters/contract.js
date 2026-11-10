"use strict";

const { normalizeCapabilities } = require("./capabilities");
const { normalizeProvisioning } = require("./provisioning");
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

function provisioningFor(adapter, config = {}, dependencies = {}) {
  const raw = typeof adapter.provisioning === "function" ? adapter.provisioning(config, dependencies) : adapter.provisioning;
  return normalizeProvisioning(raw);
}

function actionDigest(action) {
  const { hashValue } = require("./evidence");
  return action === undefined || action === null ? null : hashValue(action);
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
    // A shadow ALLOW is an observation, not an authorisation: enforcement was
    // inactive when it was issued, so it can never release an effect.
    if (decision.enforcement_active !== true) {
      throw new AuthorizationInvariantError("execution requires an ALLOW issued with enforcement active");
    }
    if (!binding.action_digest) {
      throw new AuthorizationInvariantError("execution grant must be bound to the governed action");
    }
    const grant = Object.freeze({});
    grants.set(grant, {
      action_digest: binding.action_digest,
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
        // EXACT-ACTION BINDING. The action handed to the adapter must be the
        // action that was governed, byte for byte under canonical JSON.
        if (actionDigest(input.action) !== meta.action_digest) {
          meta.consumed = true;   // a mismatched attempt spends the grant
          throw new AuthorizationInvariantError("action differs from the governed action; execution refused");
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

module.exports = { validateAdapter, capabilitiesFor, provisioningFor, createExecutionGate, actionDigest };
