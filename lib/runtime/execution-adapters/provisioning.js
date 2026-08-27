"use strict";

const SETUP_TRANSPORTS = Object.freeze(["manual", "http_api", "cli", "mcp"]);
const LIFECYCLE = Object.freeze([
  "catalog", "provision", "seed", "status", "reset", "extend", "lock",
  "teardown", "structured_output",
]);

function normalizeProvisioning(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const transports = Array.isArray(source.setup_transports)
    ? source.setup_transports.filter((value) => SETUP_TRANSPORTS.includes(value)) : [];
  const lifecycle = source.lifecycle && typeof source.lifecycle === "object" ? source.lifecycle : {};
  const commands = Array.isArray(source.commands) ? source.commands
    .filter((item) => item && typeof item === "object" && String(item.command || "").trim())
    .map((item) => ({
      id: String(item.id || "command"), label: String(item.label || item.id || "Command"),
      command: String(item.command), purpose: item.purpose ? String(item.purpose) : null,
    })) : [];
  return {
    available: source.available === true,
    status: String(source.status || "not_documented"),
    credential_modes: Array.isArray(source.credential_modes) ? source.credential_modes.map(String) : [],
    setup_transports: [...new Set(transports)],
    lifecycle: Object.fromEntries(LIFECYCLE.map((key) => [key, lifecycle[key] === true])),
    commands,
    endpoint_handoff: source.endpoint_handoff ? String(source.endpoint_handoff) : null,
    documentation_url: source.documentation_url ? String(source.documentation_url) : null,
    notes: Array.isArray(source.notes) ? source.notes.map(String) : [],
  };
}

function provisioningFor(adapter, config = {}, dependencies = {}) {
  const raw = typeof adapter.provisioning === "function"
    ? adapter.provisioning(config, dependencies) : adapter.provisioning;
  return normalizeProvisioning(raw);
}

module.exports = { SETUP_TRANSPORTS, LIFECYCLE, normalizeProvisioning, provisioningFor };
