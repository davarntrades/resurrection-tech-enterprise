"use strict";

const MODES = Object.freeze(["hosted", "private", "sovereign"]);

class DeploymentConfigurationError extends Error {
  constructor(code, message) { super(message); this.name = "DeploymentConfigurationError"; this.code = code; }
}

function deploymentPolicy(env = process.env) {
  const mode = String(env.GUARDIANOS_DEPLOYMENT_MODE || "hosted").toLowerCase();
  if (!MODES.includes(mode)) throw new DeploymentConfigurationError("DEPLOYMENT_MODE_INVALID", `unsupported deployment mode: ${mode}`);
  const sovereign = mode === "sovereign";
  const outbound = String(env.GUARDIANOS_OUTBOUND_POLICY || (sovereign ? "approved_endpoints_only" : "approved_endpoints_only")).toLowerCase();
  return Object.freeze({
    mode,
    sovereign,
    outbound_policy: outbound,
    resurrection_control_plane_required: false,
    external_evidence_delivery: !sovereign && /^(1|true|yes)$/i.test(String(env.GUARDIANOS_EXTERNAL_EVIDENCE_DELIVERY || "")),
    telemetry_enabled: !sovereign && /^(1|true|yes)$/i.test(String(env.GUARDIANOS_TELEMETRY_ENABLED || "")),
  });
}

function validateStartup(env = process.env) {
  const policy = deploymentPolicy(env);
  if (policy.sovereign) {
    const forbidden = [
      ["RESURRECTION_CONTROL_PLANE_REQUIRED", "mandatory Resurrection Tech control plane"],
      ["GUARDIANOS_MANDATORY_REMOTE_EVIDENCE", "mandatory remote evidence export"],
      ["GUARDIANOS_MANDATORY_TELEMETRY", "mandatory telemetry"],
    ];
    for (const [key, label] of forbidden) {
      if (/^(1|true|yes)$/i.test(String(env[key] || "")))
        throw new DeploymentConfigurationError("SOVEREIGN_EXTERNAL_DEPENDENCY", `sovereign mode cannot start with ${label}`);
    }
  }
  return policy;
}

module.exports = { MODES, DeploymentConfigurationError, deploymentPolicy, validateStartup };
