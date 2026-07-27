"use strict";

const crypto = require("node:crypto");
const store = require("./store");

const clean = (value, max = 500) => String(value == null ? "" : value).slice(0, max);

function connectorSecret(row) {
  if (!row || !row.secret_encrypted) return {};
  const raw = process.env.INTEGRATION_SECRET_KEY || "";
  if (!raw) {
    const error = new Error("INTEGRATION_SECRET_KEY is required to use stored integration secrets");
    error.code = "GOVERNANCE_UNAVAILABLE";
    throw error;
  }
  const [version, iv, tag, data] = String(row.secret_encrypted).split(".");
  if (version !== "v1" || !iv || !tag || !data) {
    const error = new Error("invalid encrypted integration secret");
    error.code = "GOVERNANCE_UNAVAILABLE";
    throw error;
  }
  const key = crypto.createHash("sha256").update(raw).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8"));
}

async function executeApprovedBedrockInvocation(input, integrationGateway, dependencies = {}) {
  const proposal = await store.findOne("ops_proposals", { id: input.proposal_id });
  if (!proposal || proposal.org_id !== input.org_id || proposal.environment_id !== input.environment_id) {
    const error = new Error("approved proposal not found for this organisation and environment");
    error.code = "APPROVAL_NOT_EXECUTABLE";
    throw error;
  }
  if (proposal.action_id !== "invoke_aws_bedrock_model" || proposal.status !== "executed" || !proposal.execution || proposal.execution.executed !== true || !proposal.execution.result || proposal.execution.result.authorized !== true) {
    const error = new Error("proposal has not reached an executable approved state");
    error.code = "APPROVAL_NOT_EXECUTABLE";
    throw error;
  }
  const bedrock = require("./connectors/aws-bedrock");
  const params = proposal.params || {};
  // Bind the approval to the payload that is about to be sent, not to a hash
  // the caller hands us. Re-hashing `input.request` here is what makes the
  // approval non-transferable: if the stored run payload changed after the
  // operator signed off, the recomputed hash no longer matches the approved
  // one and execution fails closed before AWS is reached.
  const requestHash = bedrock.hash(input.request || {});
  if (params.connector_id !== input.connector_id || params.model_id !== input.model_id || params.request_hash !== requestHash
    || (input.request_hash && input.request_hash !== requestHash)) {
    const error = new Error("approved proposal does not match the invocation request");
    error.code = "APPROVAL_REQUEST_MISMATCH";
    throw error;
  }
  const row = await store.findOne("integration_connectors", { id: input.connector_id });
  if (!row || row.org_id !== input.org_id || row.environment_id !== input.environment_id || row.type !== "aws-bedrock" || row.status === "disabled" || row.health !== "healthy") {
    const error = new Error("approved Bedrock connector is unavailable or unhealthy");
    error.code = "CONNECTOR_UNHEALTHY";
    throw error;
  }
  const configured = [
    ...(Array.isArray(row.config && row.config.model_ids) ? row.config.model_ids : []),
    ...(Array.isArray(row.config && row.config.inference_profiles) ? row.config.inference_profiles : []),
  ];
  if (configured.length && !configured.includes(input.model_id)) {
    const error = new Error("model or inference profile is no longer configured for this connector");
    error.code = "AWS_MODEL_NOT_ALLOWED";
    throw error;
  }
  // Resume through the same provider boundary the first-pass invocation uses,
  // so outbound endpoint policy and the credential provider registry still
  // apply after an approval (a sovereign deployment must not egress by a
  // shorter route just because a human approved the action).
  const providerInvoke = dependencies.invoke
    || (typeof integrationGateway.bedrockProviderInvoke === "function"
      ? integrationGateway.bedrockProviderInvoke({ org_id: input.org_id, environment_id: input.environment_id, connector_id: row.id }, dependencies)
      : bedrock.invoke);
  const started = Date.now();
  try {
    const result = await providerInvoke(row.config || {}, connectorSecret(row), input.request, dependencies);
    const timestamp = store.nowISO();
    await store.update("integration_connectors", row.id, {
      config: { ...(row.config || {}), last_successful_request: timestamp },
      health: "healthy", last_checked_at: timestamp, last_error: null, latency_ms: Date.now() - started,
    });
    const evidence = await integrationGateway.submitEvidence({
      org_id: input.org_id,
      environment_id: input.environment_id,
      type: "aws.bedrock.invocation.approved",
      actor: input.actor || "operator",
      evidence: {
        connector_id: row.id,
        request_hash: input.request_hash,
        proposal_id: proposal.id,
        governance_evidence_id: proposal.evidence_id || null,
        aws_request_id: result.aws_request_id || null,
        mode: result.mode,
        streaming: !!result.stream,
        attempts: result.attempts,
        outcome: "success",
      },
    });
    return { ...result, ok: true, governance: { proposal_id: proposal.id, evidence_id: proposal.evidence_id || null, status: proposal.status }, evidence };
  } catch (error) {
    const mapped = bedrock.mapError(error);
    await integrationGateway.submitEvidence({
      org_id: input.org_id,
      environment_id: input.environment_id,
      type: "aws.bedrock.failure.approved",
      actor: input.actor || "operator",
      evidence: {
        connector_id: row.id,
        request_hash: input.request_hash,
        proposal_id: proposal.id,
        code: mapped.code,
        aws_request_id: mapped.aws_request_id || null,
        outcome: "failure",
      },
    }).catch(() => null);
    return { ok: false, code: mapped.code, error: clean(mapped.message), retryable: mapped.retryable, governance: { proposal_id: proposal.id, evidence_id: proposal.evidence_id || null, status: proposal.status } };
  }
}

module.exports = { executeApprovedBedrockInvocation };
