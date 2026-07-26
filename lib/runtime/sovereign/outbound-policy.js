"use strict";

const { validateEndpoint } = require("./endpoints");
const { safeError } = require("./redaction");

const MODES = Object.freeze(["none", "approved_endpoints_only", "custom"]);

class OutboundPolicyError extends Error {
  constructor(code, message, details = {}) {
    super(message); this.name = "OutboundPolicyError"; this.code = code; this.status = 403;
    this.destination = details.destination || null; this.purpose = details.purpose || null;
  }
}

function normalizePolicy(input = {}, options = {}) {
  const mode = String(input.mode || process.env.GUARDIANOS_OUTBOUND_POLICY || "approved_endpoints_only").toLowerCase();
  if (!MODES.includes(mode)) throw new OutboundPolicyError("OUTBOUND_POLICY_INVALID", `unsupported outbound policy: ${mode}`);
  const validation = { allowPrivate: true, allowHttp: options.allowHttp === true || input.allow_http === true };
  const approved = (input.approved_endpoints || []).map((endpoint) => validateEndpoint(endpoint, validation));
  return Object.freeze({ mode, approved_endpoints: approved, custom: input.custom || null, allow_http: validation.allowHttp });
}

function sameDestination(left, right) {
  const a = new URL(left); const b = new URL(right);
  return a.protocol === b.protocol && a.hostname === b.hostname && a.port === b.port && a.pathname.startsWith(b.pathname);
}

async function authorize(policyInput, request = {}, governance = null) {
  const allowHttp = request.allow_http === true || (policyInput && policyInput.allow_http === true);
  const policy = normalizePolicy(policyInput, { allowHttp });
  const destination = validateEndpoint(request.url, { allowPrivate: true, allowHttp });
  const purpose = String(request.purpose || "unspecified");

  let allowed = false;
  if (policy.mode === "approved_endpoints_only") allowed = policy.approved_endpoints.some((item) => sameDestination(destination, item));
  if (policy.mode === "custom") {
    if (typeof policy.custom !== "function") throw new OutboundPolicyError("OUTBOUND_CUSTOM_HANDLER_REQUIRED", "custom outbound policy requires a local handler");
    allowed = !!(await policy.custom({ ...request, url: destination }));
  }
  if (policy.mode === "none") allowed = false;

  if (allowed && governance) {
    const verdict = await governance({ action: "outbound.request", destination, purpose, metadata: request.metadata || {} });
    allowed = !!verdict && verdict.status === "executed" && verdict.execution && verdict.execution.executed === true;
  }
  if (!allowed) throw new OutboundPolicyError("OUTBOUND_DENIED", "outbound request denied before network execution", { destination, purpose });
  return destination;
}

async function governedFetch(policy, request, governance, fetchImpl = global.fetch) {
  const url = await authorize(policy, request, governance);
  if (typeof fetchImpl !== "function") throw new OutboundPolicyError("OUTBOUND_CLIENT_UNAVAILABLE", "network client is unavailable");
  try { return await fetchImpl(url, request.init || {}); }
  catch (error) { const safe = safeError(error, "outbound request failed"); throw new OutboundPolicyError("OUTBOUND_REQUEST_FAILED", safe.message, { destination: url, purpose: request.purpose }); }
}

module.exports = { MODES, OutboundPolicyError, normalizePolicy, authorize, governedFetch };
