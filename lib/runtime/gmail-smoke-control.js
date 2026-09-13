"use strict";

const store = require("./store");

const CONFIG_KEY = "production_smoke_enabled";

async function status(environment_id, dependencies = {}) {
  const persistence = dependencies.store || store;
  const rows = await persistence.findOptional("integration_connectors", { environment_id });
  const gmail = rows.filter((row) => row.type === "gmail");
  const enabled = gmail.find((row) => row.status !== "disabled" && row.config?.[CONFIG_KEY] === true);
  return {
    enabled: !!enabled,
    default: false,
    source: enabled ? "connector_configuration" : "default_off",
    connector_id: enabled?.id || null,
    gmail_connectors: gmail.length,
  };
}

async function set({ org_id, connector_id, enabled }, dependencies = {}) {
  const persistence = dependencies.store || store;
  if (typeof enabled !== "boolean") throw new Error("enabled must be a boolean");
  const row = await persistence.findOne("integration_connectors", { id: connector_id });
  if (!row || row.org_id !== org_id || row.type !== "gmail") throw new Error("Gmail connector not found");
  await persistence.update("integration_connectors", row.id, {
    config: { ...(row.config || {}), [CONFIG_KEY]: enabled },
  });
  return { enabled, connector_id: row.id, environment_id: row.environment_id };
}

module.exports = { CONFIG_KEY, status, set };
