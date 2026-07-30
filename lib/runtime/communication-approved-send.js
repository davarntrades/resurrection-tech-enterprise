/* ============================================================================
 * GuardianOS Integration Gateway — approved communication continuation.
 *
 * The resume path for a message that Runtime Governance ESCALATED. It executes
 * only when the operator's approval has been re-evaluated by the engine and the
 * proposal itself reached `executed`; an approval is never a bypass, and this
 * module never re-decides a verdict.
 *
 * The approval is bound to the exact message: the payload about to be sent is
 * re-hashed here and compared with the hash the operator signed off. If the
 * stored message changed after sign-off — a different recipient, subject,
 * thread or body — the hashes diverge and execution fails closed before the
 * provider is reached. An approval is therefore non-transferable.
 * ============================================================================ */
"use strict";

const crypto = require("node:crypto");
const store = require("./store");
const adapters = require("./communication-adapters");

const clean = (value, max = 500) => String(value == null ? "" : value).slice(0, max);

/* Same sealed-secret format the Integration Gateway writes (AES-256-GCM under
 * INTEGRATION_SECRET_KEY). Opened here rather than imported so the approval
 * continuation never depends on gateway module load order. */
function connectorSecret(row) {
  if (!row || !row.secret_encrypted) return {};
  const raw = process.env.INTEGRATION_SECRET_KEY || "";
  if (!raw) throw fail("GOVERNANCE_UNAVAILABLE", "INTEGRATION_SECRET_KEY is required to use stored integration secrets");
  const [version, iv, tag, data] = String(row.secret_encrypted).split(".");
  if (version !== "v1" || !iv || !tag || !data) throw fail("GOVERNANCE_UNAVAILABLE", "invalid encrypted integration secret");
  const key = crypto.createHash("sha256").update(raw).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8"));
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function executeApprovedCommunication(input, integrationGateway, dependencies = {}) {
  const spec = adapters.operationFor(input.action_id);
  const proposal = await store.findOne("ops_proposals", { id: input.proposal_id });
  if (!proposal || proposal.org_id !== input.org_id || proposal.environment_id !== input.environment_id) {
    throw fail("APPROVAL_NOT_EXECUTABLE", "approved proposal not found for this organisation and environment");
  }
  if (proposal.action_id !== input.action_id || proposal.status !== "executed"
    || !proposal.execution || proposal.execution.executed !== true
    || !proposal.execution.result || proposal.execution.result.authorized !== true) {
    throw fail("APPROVAL_NOT_EXECUTABLE", "proposal has not reached an executable approved state");
  }
  const params = proposal.params || {};
  const messageHash = adapters.messageHash(input.action_id, input.message);
  if (params.connector_id !== input.connector_id || params.message_hash !== messageHash
    || (input.message_hash && input.message_hash !== messageHash)) {
    throw fail("APPROVAL_MESSAGE_MISMATCH", "approved proposal does not match the message about to be sent");
  }
  const row = await store.findOne("integration_connectors", { id: input.connector_id });
  if (!row || row.org_id !== input.org_id || row.environment_id !== input.environment_id
    || row.type !== spec.adapter.connector_type || row.status === "disabled" || row.health !== "healthy") {
    throw fail("CONNECTOR_UNHEALTHY", "approved communication connector is unavailable or unhealthy");
  }
  // Re-apply the connector's own recipient allowlist after the approval: the
  // deployment policy may have narrowed while the message waited for sign-off.
  adapters.assertSendable(input.action_id, row.config || {}, input.message);

  const secret = connectorSecret(row);
  const started = Date.now();
  try {
    const result = await (dependencies.communicationExecute || adapters.execute)(
      input.action_id, row.config || {}, secret, input.message, dependencies);
    const timestamp = store.nowISO();
    await store.update("integration_connectors", row.id, {
      config: { ...(row.config || {}), last_successful_request: timestamp },
      health: "healthy", last_checked_at: timestamp, last_error: null, latency_ms: Date.now() - started,
    });
    const evidence = await integrationGateway.submitEvidence({
      org_id: input.org_id, environment_id: input.environment_id,
      type: "communication.message.sent.approved",
      actor: input.actor || "operator",
      evidence: {
        connector_id: row.id, action_id: input.action_id, channel: spec.adapter.channel,
        provider: spec.adapter.provider, operation: spec.operation, delivered: !!result.delivered,
        message_hash: messageHash, proposal_id: proposal.id,
        governance_evidence_id: proposal.evidence_id || null,
        gmail_message_id: result.gmail_message_id || null,
        gmail_thread_id: result.gmail_thread_id || null,
        gmail_draft_id: result.gmail_draft_id || null,
        recipient_count: Number(params.recipient_count || 0), outcome: "success",
      },
    });
    return {
      ...result, ok: true, message_hash: messageHash,
      governance: { proposal_id: proposal.id, evidence_id: proposal.evidence_id || null, status: proposal.status },
      evidence,
    };
  } catch (error) {
    const mapped = adapters.mapError(input.action_id, error);
    await integrationGateway.submitEvidence({
      org_id: input.org_id, environment_id: input.environment_id,
      type: "communication.message.failed.approved",
      actor: input.actor || "operator",
      evidence: { connector_id: row.id, action_id: input.action_id, message_hash: messageHash, proposal_id: proposal.id, code: mapped.code, outcome: "failure" },
    }).catch(() => null);
    return {
      ok: false, code: mapped.code, error: clean(mapped.message), retryable: !!mapped.retryable,
      message_hash: messageHash,
      governance: { proposal_id: proposal.id, evidence_id: proposal.evidence_id || null, status: proposal.status },
    };
  }
}

module.exports = { executeApprovedCommunication };
