/* Provider-neutral registry for governed CRM and ITSM record operations.
 * Registration makes an action dispatchable, never permitted. Runtime
 * Governance remains the sole authority and executes before this boundary. */
"use strict";

const ADAPTERS = Object.freeze({
  salesforce: Object.freeze({
    id: "salesforce", name: "Salesforce", provider: "salesforce", connector_type: "salesforce",
    actions: Object.freeze({
      "salesforce.get_record": { operation: "get_record", reads: true },
      "salesforce.search_records": { operation: "search_records", reads: true },
      "salesforce.create_lead": { operation: "create_lead", mutates: true },
      "salesforce.update_lead": { operation: "update_lead", mutates: true },
      "salesforce.create_case": { operation: "create_case", mutates: true },
      "salesforce.update_case": { operation: "update_case", mutates: true },
      "salesforce.add_case_comment": { operation: "add_case_comment", mutates: true },
      "salesforce.create_task": { operation: "create_task", mutates: true },
    }),
    load: () => require("./connectors/salesforce"),
  }),
  servicenow: Object.freeze({
    id: "servicenow", name: "ServiceNow", provider: "servicenow", connector_type: "servicenow",
    actions: Object.freeze({
      "servicenow.get_record": { operation: "get_record", reads: true },
      "servicenow.list_incidents": { operation: "list_incidents", reads: true },
      "servicenow.list_change_requests": { operation: "list_change_requests", reads: true },
      "servicenow.create_incident": { operation: "create_incident", mutates: true },
      "servicenow.update_incident": { operation: "update_incident", mutates: true },
      "servicenow.add_work_note": { operation: "add_work_note", mutates: true },
      "servicenow.assign_incident": { operation: "assign_incident", mutates: true },
      "servicenow.create_change_request": { operation: "create_change_request", mutates: true },
      "servicenow.update_change_request": { operation: "update_change_request", mutates: true },
    }),
    load: () => require("./connectors/servicenow"),
  }),
});
const ACTION_INDEX = Object.freeze(Object.entries(ADAPTERS).reduce((index, [id, adapter]) => {
  for (const action_id of Object.keys(adapter.actions)) index[action_id] = id;
  return index;
}, {}));
function fail(code, message, status = 400) {
  const error = new Error(message); error.code = code; error.status = status; return error;
}
function adapterFor(connector_type) {
  const adapter = ADAPTERS[String(connector_type || "")];
  if (!adapter) throw fail("ENTERPRISE_ADAPTER_UNSUPPORTED", `no governed enterprise adapter is registered for connector type ${JSON.stringify(String(connector_type || ""))}`);
  return adapter;
}
function adapterForAction(action_id) {
  const adapter = ADAPTERS[ACTION_INDEX[String(action_id || "")]];
  if (!adapter) throw fail("ENTERPRISE_ACTION_UNSUPPORTED", `${JSON.stringify(String(action_id || ""))} is not a registered governed enterprise action`);
  return adapter;
}
function operationFor(action_id) {
  const adapter = adapterForAction(action_id);
  return { adapter, ...adapter.actions[action_id] };
}
function listAdapters() {
  return Object.values(ADAPTERS).map((a) => ({
    id: a.id, name: a.name, provider: a.provider, connector_type: a.connector_type,
    actions: Object.keys(a.actions),
  }));
}
function listActions() {
  return Object.values(ADAPTERS).flatMap((adapter) => Object.entries(adapter.actions).map(([action_id, spec]) => ({
    action_id, adapter: adapter.id, provider: adapter.provider,
    connector_type: adapter.connector_type, operation: spec.operation,
    reads: !!spec.reads, mutates: !!spec.mutates,
  })));
}
function normaliseInput(action_id, config, input) {
  const { adapter, operation } = operationFor(action_id);
  return adapter.load().normaliseInput(operation, input || {}, config || {});
}
function payloadHash(action_id, config, input) {
  const { adapter, operation } = operationFor(action_id);
  return adapter.load().requestHash(operation, input || {}, config || {});
}
async function execute(action_id, config, secret, input, dependencies = {}) {
  const { adapter, operation, reads, mutates } = operationFor(action_id);
  const result = await adapter.load().execute(operation, config || {}, secret || {}, input || {}, dependencies);
  return { ...result, adapter: adapter.id, provider: adapter.provider, action_id, operation, reads: !!reads, mutates: !!mutates };
}
function mapError(action_id, error) {
  try { return adapterForAction(action_id).load().mapError(error); } catch { return error; }
}

module.exports = {
  ADAPTERS, adapterFor, adapterForAction, operationFor, listAdapters, listActions,
  normaliseInput, payloadHash, execute, mapError,
};
