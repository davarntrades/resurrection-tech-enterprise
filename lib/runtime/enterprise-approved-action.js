/* Approved continuation for governed Salesforce/ServiceNow mutations.
 * Re-validates proposal scope and payload hash before touching the provider. */
"use strict";

const crypto = require("node:crypto");
const store = require("./store");
const adapters = require("./enterprise-action-adapters");

function fail(code, message) { const error = new Error(message); error.code = code; return error; }
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
async function executeApprovedEnterpriseAction(input, integrationGateway, dependencies = {}) {
  const spec = adapters.operationFor(input.action_id);
  if (!spec.mutates) throw fail("APPROVAL_NOT_EXECUTABLE", "approved continuation is only valid for mutations");
  const proposal = await store.findOne("ops_proposals", { id: input.proposal_id });
  if (!proposal || proposal.org_id !== input.org_id || proposal.environment_id !== input.environment_id
    || proposal.action_id !== input.action_id || proposal.status !== "executed"
    || !proposal.execution || proposal.execution.executed !== true
    || !proposal.execution.result || proposal.execution.result.authorized !== true) {
    throw fail("APPROVAL_NOT_EXECUTABLE", "proposal has not reached an executable approved state");
  }
  const row = await store.findOne("integration_connectors", { id: input.connector_id });
  if (!row || row.org_id !== input.org_id || row.environment_id !== input.environment_id
    || row.type !== spec.adapter.connector_type || row.status === "disabled" || row.health !== "healthy") {
    throw fail("CONNECTOR_UNHEALTHY", "approved enterprise connector is unavailable or unhealthy");
  }
  const payloadHash = adapters.payloadHash(input.action_id, row.config || {}, input.input || {});
  const params = proposal.params || {};
  if (params.connector_id !== input.connector_id || params.payload_hash !== payloadHash
    || (input.payload_hash && input.payload_hash !== payloadHash)
    || params.enterprise_action_run_id !== input.enterprise_action_run_id) {
    throw fail("APPROVAL_PAYLOAD_MISMATCH", "approved proposal does not match the record operation about to execute");
  }
  // Re-apply capability, object/table and field policy after approval.
  adapters.normaliseInput(input.action_id, row.config || {}, input.input || {});
  const started = Date.now();
  try {
    const result = await (dependencies.enterpriseExecute || adapters.execute)(
      input.action_id, row.config || {}, connectorSecret(row), input.input || {}, dependencies);
    const timestamp = store.nowISO();
    await store.update("integration_connectors", row.id, {
      config: { ...(row.config || {}), last_successful_request: timestamp },
      health: "healthy", last_checked_at: timestamp, last_error: null,
      latency_ms: Date.now() - started,
    });
    const evidence = await integrationGateway.submitEvidence({
      org_id: input.org_id, environment_id: input.environment_id,
      type: "enterprise.record.mutated.approved", actor: input.actor || "operator",
      evidence: {
        connector_id: row.id, action_id: input.action_id, provider: spec.adapter.provider,
        operation: spec.operation, payload_hash: payloadHash, proposal_id: proposal.id,
        governance_evidence_id: proposal.evidence_id || null,
        external_record_id: result.external_record_id || null, outcome: "success",
      },
    });
    return {
      ...result, ok: true, provider_invoked: true, payload_hash: payloadHash,
      governance: { proposal_id: proposal.id, evidence_id: proposal.evidence_id || null, status: proposal.status },
      evidence,
    };
  } catch (error) {
    const mapped = adapters.mapError(input.action_id, error);
    await integrationGateway.submitEvidence({
      org_id: input.org_id, environment_id: input.environment_id,
      type: "enterprise.action.failed.approved", actor: input.actor || "operator",
      evidence: {
        connector_id: row.id, action_id: input.action_id, payload_hash: payloadHash,
        proposal_id: proposal.id, code: mapped.code, outcome: "failure",
      },
    }).catch(() => null);
    return {
      ok: false, code: mapped.code, error: String(mapped.message || "provider request failed").slice(0, 500),
      provider_invoked: true,
      retryable: !!mapped.retryable, payload_hash: payloadHash,
      governance: { proposal_id: proposal.id, evidence_id: proposal.evidence_id || null, status: proposal.status },
    };
  }
}
module.exports = { executeApprovedEnterpriseAction };
