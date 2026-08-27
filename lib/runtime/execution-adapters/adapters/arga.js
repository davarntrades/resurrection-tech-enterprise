"use strict";

const sandbox = require("./sandbox").adapter;

// Arga's public transport contract is not documented in this repository. The
// adapter therefore declares no capability by default and executes only when
// an operator supplies confirmed transport paths AND an explicit capability
// manifest obtained from Arga. No endpoint or reset guarantee is invented.
const adapter = {
  ...sandbox,
  id: "arga", name: "Arga Labs sandbox", version: "0.1.0-shell",
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
