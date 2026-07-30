/* ============================================================================
 * GuardianOS Integration Gateway — governed communication adapter registry.
 *
 * The provider-neutral seam of the communication path. Everything above this
 * file (canonical action → proposal → Runtime Governance → permit → execution →
 * evidence) is identical for every channel; everything below it is one vendor
 * SDK boundary. Adding Outlook, Slack, Teams or ServiceNow is a new entry here
 * plus a connector module — never a new governance path.
 *
 * Deny-by-default: an adapter, a connector type or a canonical action absent
 * from this registry cannot be executed. Registration here makes an action
 * DISPATCHABLE; it never makes it permitted — that remains the engine's
 * decision, taken before this file is reached.
 * ============================================================================ */
"use strict";

/* Each canonical action declares whether it DELIVERS (leaves the platform).
 * `delivers` drives the deployment's risk posture: delivering actions are
 * registered in lib/ops/actions.js against the outbound-delivery Ω vocabulary
 * and require operator authorisation; a draft delivers nothing and does not. */
const ADAPTERS = Object.freeze({
  gmail: Object.freeze({
    id: "gmail",
    name: "Gmail",
    channel: "email",
    connector_type: "gmail",
    provider: "gmail",
    actions: Object.freeze({
      "gmail.send_email": Object.freeze({ operation: "send", delivers: true }),
      "gmail.reply_email": Object.freeze({ operation: "reply", delivers: true }),
      "gmail.create_draft": Object.freeze({ operation: "draft", delivers: false }),
    }),
    load: () => require("./connectors/gmail"),
  }),
});

const ACTION_INDEX = Object.freeze(Object.entries(ADAPTERS).reduce((index, [id, adapter]) => {
  for (const action_id of Object.keys(adapter.actions)) index[action_id] = id;
  return index;
}, {}));

function fail(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function adapterFor(connector_type) {
  const adapter = ADAPTERS[String(connector_type || "")];
  if (!adapter) throw fail("COMMUNICATION_ADAPTER_UNSUPPORTED", `no governed communication adapter is registered for connector type ${JSON.stringify(String(connector_type || ""))}`);
  return adapter;
}

function adapterForAction(action_id) {
  const id = ACTION_INDEX[String(action_id || "")];
  if (!id) throw fail("COMMUNICATION_ACTION_UNSUPPORTED", `${JSON.stringify(String(action_id || ""))} is not a registered governed communication action`);
  return ADAPTERS[id];
}

/** The adapter operation a canonical action maps to, with its delivery posture. */
function operationFor(action_id) {
  const adapter = adapterForAction(action_id);
  return { adapter, ...adapter.actions[action_id] };
}

/** Canonical action ids this deployment can dispatch, for capability reporting. */
function listActions() {
  return Object.entries(ADAPTERS).flatMap(([id, adapter]) =>
    Object.entries(adapter.actions).map(([action_id, spec]) => ({
      action_id, adapter: id, channel: adapter.channel, provider: adapter.provider,
      connector_type: adapter.connector_type, delivers: spec.delivers,
    })));
}

function listAdapters() {
  return Object.values(ADAPTERS).map((adapter) => ({
    id: adapter.id, name: adapter.name, channel: adapter.channel,
    connector_type: adapter.connector_type, provider: adapter.provider,
    actions: Object.keys(adapter.actions),
  }));
}

/** Provider-neutral identity of the exact message an approval is bound to. */
function messageHash(action_id, message) {
  return adapterForAction(action_id).load().messageHash(message);
}

function normaliseMessage(action_id, message) {
  return adapterForAction(action_id).load().normaliseMessage(message);
}

/** Validate a message against the adapter AND the connector configuration,
 * without contacting the provider. Used before a proposal is ever created, so
 * an unsendable message never consumes a governance decision. */
function assertSendable(action_id, config, message) {
  const { adapter, operation } = operationFor(action_id);
  const provider = adapter.load();
  const normalised = provider.normaliseMessage(message);
  provider.validateConfig(config || {});
  provider.assertRecipientsAllowed(config || {}, message);
  if (operation === "reply" && !normalised.thread_id) throw fail("COMMUNICATION_THREAD_REQUIRED", "a thread id is required to reply");
  return normalised;
}

/**
 * Execute one canonical communication action at the provider boundary.
 * Called ONLY after an executable Runtime Governance permit — this function
 * has no governance authority and performs no verdict check of its own.
 */
async function execute(action_id, config, secret, message, dependencies = {}) {
  const { adapter, operation, delivers } = operationFor(action_id);
  const provider = adapter.load();
  const call = operation === "send" ? provider.send : operation === "reply" ? provider.reply : provider.createDraft;
  const result = await call(config || {}, secret || {}, message, dependencies);
  return {
    ...result,
    adapter: adapter.id,
    channel: adapter.channel,
    provider: adapter.provider,
    action_id,
    operation,
    delivered: !!delivers && !!result.ok,
  };
}

function mapError(action_id, error) {
  try { return adapterForAction(action_id).load().mapError(error); }
  catch { return error; }
}

module.exports = {
  ADAPTERS, adapterFor, adapterForAction, operationFor, listActions, listAdapters,
  messageHash, normaliseMessage, assertSendable, execute, mapError,
};
