/* ============================================================================
 * Runtime Governance — authoritative production configuration audit.
 *
 * Compatibility facade retained for existing Control Room/API/CLI callers.
 * The actual readiness logic lives in production-readiness.js so UI and CLI
 * cannot drift into different definitions of READY.
 * ============================================================================ */
"use strict";
const readiness = require("./production-readiness");

const PASS = readiness.CHECK.PASS;
const FAIL = readiness.CHECK.FAIL;
const WARN = readiness.CHECK.WARN;
const UNKNOWN = readiness.CHECK.UNKNOWN;

async function configAudit() {
  return readiness.productionReadiness();
}

async function sovereignAudit(options = {}) {
  return readiness.sovereignReadiness(options);
}

module.exports = { configAudit, sovereignAudit, PASS, FAIL, WARN, UNKNOWN };
