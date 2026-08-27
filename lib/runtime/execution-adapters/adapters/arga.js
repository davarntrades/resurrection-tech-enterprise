"use strict";

const sandbox = require("./sandbox").adapter;

// Arga documents how customers authenticate, install its CLI and provision a
// twin run. That onboarding surface is descriptive metadata only: the action,
// state and receipt transport still fails closed until trusted server config
// confirms the exact integration contract. No endpoint or capability is
// inferred merely because a twin can be provisioned.
const adapter = {
  ...sandbox,
  id: "arga", name: "Arga Labs service twins", version: "0.2.0-shell",
  provisioning: {
    available: true,
    status: "documented_manual_handoff",
    credential_modes: ["api_key", "device_authorization"],
    setup_transports: ["cli", "mcp", "http_api"],
    lifecycle: {
      catalog: true, provision: true, seed: true, status: true, reset: true,
      extend: true, lock: true, teardown: true, structured_output: true,
    },
    commands: [
      { id: "install_uv", label: "Install CLI (uv)", command: "uv tool install arga-cli" },
      { id: "install_pipx", label: "Install CLI (pipx)", command: "pipx install arga-cli" },
      { id: "login", label: "Authenticate", command: "arga login" },
      { id: "wizard", label: "Start a twin run", command: "arga wizard", purpose: "Provision twins and wire returned provider endpoints into the target application." },
      { id: "wizard_alias", label: "Compatibility command", command: "arga wizard init" },
      { id: "mcp", label: "Install MCP tools", command: "arga mcp install" },
    ],
    endpoint_handoff: "Use provider-compatible URLs and environment variables returned by the provisioned twin run as adapter configuration; never treat them as Morrison authorization.",
    documentation_url: "https://docs.argalabs.com/cli-and-mcp",
    notes: [
      "Setup commands are displayed for operators and are never executed by Morrison.",
      "Reset availability does not establish deterministic or comparable state without verified reset evidence.",
    ],
  },
  capabilities(_config = {}, dependencies = {}) { return dependencies.confirmed_capabilities || {}; },
  validateConfiguration(config = {}, dependencies = {}) {
    const errors = [];
    if (!dependencies.integration_surface_confirmed) errors.push("Arga integration surface is unconfirmed by trusted server configuration");
    if (!dependencies.confirmed_capabilities || typeof dependencies.confirmed_capabilities !== "object") errors.push("trusted confirmed_capabilities required from Arga technical documentation");
    const base = sandbox.validateConfiguration(config); errors.push(...base.errors);
    return { ok: errors.length === 0, errors };
  },
};

module.exports = { adapter };
