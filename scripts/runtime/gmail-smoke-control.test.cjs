"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const control = require("../../lib/runtime/gmail-smoke-control");

function fakeStore(rows) {
  return {
    async findOptional(_collection, where) {
      return rows.filter((row) => row.environment_id === where.environment_id);
    },
    async findOne(_collection, where) {
      return rows.find((row) => row.id === where.id) || null;
    },
    async update(_collection, id, patch) {
      const row = rows.find((item) => item.id === id);
      Object.assign(row, patch);
    },
  };
}

(async () => {
  const rows = [{
    id: "gmail_1", org_id: "org_1", environment_id: "env_1", type: "gmail",
    status: "active", config: { mailbox: "operator@example.com" },
  }];
  const store = fakeStore(rows);

  assert.equal((await control.status("env_1", { store })).enabled, false, "missing setting must default OFF");
  await control.set({ org_id: "org_1", connector_id: "gmail_1", enabled: true }, { store });
  assert.equal((await control.status("env_1", { store })).enabled, true, "explicit ON must be visible to CI");
  assert.equal(rows[0].config.mailbox, "operator@example.com", "toggle must preserve connector configuration");
  await control.set({ org_id: "org_1", connector_id: "gmail_1", enabled: false }, { store });
  assert.equal((await control.status("env_1", { store })).enabled, false, "explicit OFF must stop CI delivery");
  await assert.rejects(() => control.set({ org_id: "other", connector_id: "gmail_1", enabled: true }, { store }), /not found/i);
  await assert.rejects(() => control.set({ org_id: "org_1", connector_id: "gmail_1", enabled: "yes" }, { store }), /boolean/i);

  const root = path.resolve(__dirname, "../..");
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/e2e-production.yml"), "utf8");
  const ui = fs.readFileSync(path.join(root, "components/admin/IntegrationGatewayPanel.tsx"), "utf8");
  assert.match(workflow, /api\/runtime\/admin\/gmail-smoke-control/, "workflow must read the Control Room switch");
  assert.match(workflow, /if \.enabled == true then "true" else "false" end/, "workflow must fail closed unless enabled is exactly true");
  assert.match(ui, /role="switch"/, "Control Room must expose an accessible toggle");
  assert.match(ui, /defaults to <strong>OFF<\/strong>/, "Control Room must explain the safe default");

  console.log("gmail-smoke-control: 10 passed, 0 failed");
})().catch((error) => { console.error(error); process.exit(1); });
