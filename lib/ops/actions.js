/* ============================================================================
 * Operations Agent — privileged action catalog + executor registry.
 *
 * Every action the Operations Agent can PROPOSE is registered here with:
 *   • an Ω tool name matching governance-service/operations_rules.py, so the
 *     Runtime Governance engine evaluates the proposal with dedicated rules
 *   • a risk level driving the local human-sign-off policy
 *   • the authorisation flags an operator approval attaches on re-evaluation
 *   • an executor that performs the action ONLY after an allow verdict —
 *     executors reuse the existing lib/runtime modules (extend, not replace)
 *
 * The catalog is deny-by-default: an action not registered here cannot be
 * proposed, evaluated, or executed. Two actions are registered as REFUSED —
 * evidence deletion and credential sharing have no executor by design and the
 * engine blocks them unconditionally; they exist in the catalog so the attempt
 * itself is governed, recorded, and visible in the Evidence Hub.
 * ============================================================================ */
"use strict";
const rt = require("../runtime");

const RISKS = ["low", "medium", "high", "critical"];
// Risk levels the agent may auto-execute after an engine PERMIT. High/critical
// always escalate to an operator even when the engine permits.
const AUTO_EXECUTE_RISKS = ["low", "medium"];

/* Shared executor for governed communication actions (Integration Gateway).
 * AUTHORIZES ONLY — it never contacts a provider. The permit is scope-bound to
 * the organisation, environment, connector and the EXACT message hash the
 * proposal carries, so an approval cannot be replayed against a different
 * recipient, mailbox, thread or body. */
async function authorizeCommunication(action_id, p = {}) {
  const adapters = require("../runtime/communication-adapters");
  const action = p.canonical_action || {};
  if (action.action_id !== action_id) throw new Error("canonical action type does not match the registered communication action");
  if (!p.org_id || !p.environment_id) throw new Error("organisation and environment are required");
  if (!p.connector_id) throw new Error("connector is required");
  if (!p.communication_run_id) throw new Error("communication run is required");
  if (!p.message_hash) throw new Error("message hash is required");
  const spec = adapters.operationFor(action_id);
  const row = await rt.store.findOne("integration_connectors", { id: p.connector_id });
  if (!row || row.org_id !== p.org_id || row.environment_id !== p.environment_id) throw new Error("connector not found for this organisation and environment");
  if (row.type !== spec.adapter.connector_type) throw new Error(`connector is not a ${spec.adapter.name} connector`);
  if (row.status === "disabled" || row.health !== "healthy") throw new Error("connector must be enabled and healthy before a message is authorized");
  return {
    authorized: true,
    action_type: action_id,
    communication_run_id: p.communication_run_id,
    org_id: p.org_id,
    environment_id: p.environment_id,
    connector_id: row.id,
    channel: spec.adapter.channel,
    provider: spec.adapter.provider,
    operation: spec.operation,
    delivers: spec.delivers,
    message_hash: p.message_hash,
    recipient_count: Number(p.recipient_count || 0),
  };
}

async function verifyCommunication(action_id, result, params = {}) {
  return {
    ok: !!(result && result.authorized
      && result.action_type === action_id
      && result.org_id === params.org_id
      && result.environment_id === params.environment_id
      && result.connector_id === params.connector_id
      && result.message_hash === params.message_hash),
    detail: `${action_id} authorized by Runtime Governance for the proposed organisation, environment, connector and message`,
  };
}

/* Each entry:
 *   tool            Ω tool name submitted to the governance engine
 *   risk            low | medium | high | critical
 *   approval_flags  flags attached to the trajectory when an operator approves
 *   execute(params) performs the action; returns a JSON-able result
 *   refuse          the platform never executes this action (attempts are
 *                   still evaluated + recorded as evidence)
 */
const CATALOG = {
  // ── Internal, low-risk operations (auto-executable after PERMIT) ──────────
  create_recommendation: {
    title: "Raise a governance recommendation for a customer",
    tool: "raise_recommendation", // proposal-verb name: inert to Ω hard-stops
    risk: "low",
    approval_flags: {},
    execute: async (p) => {
      const rec = await rt.recommendations.create({
        org_id: p.org_id,
        title: p.title,
        detail: p.detail || "",
        severity: p.severity || "medium",
        source: p.source || "operations_agent",
      });
      return { recommendation_id: rec.id, status: rec.status };
    },
  },
  raise_alert: {
    title: "Raise an operational alert",
    tool: "raise_alert",
    risk: "low",
    approval_flags: {},
    execute: async (p) => {
      const alert = await rt.alerts.raise({
        org_id: p.org_id || null,
        environment_id: p.environment_id || null,
        kind: p.kind || "ops_agent_alert",
        severity: p.severity || "warning",
        message: p.message,
        meta: { source: "operations_agent", ...(p.meta || {}) },
      });
      return { raised: !!alert, suppressed: !alert };
    },
  },
  notify_operator: {
    title: "Notify the operator (Control Room work item)",
    tool: "notify_operator",
    risk: "low",
    approval_flags: {},
    execute: async (p) => {
      // Ride the alerts channel (webhook/email if configured) at info severity.
      const alert = await rt.alerts.raise({
        org_id: p.org_id || null,
        kind: "ops_operator_notice",
        severity: "warning",
        message: p.message,
        meta: { source: "operations_agent" },
      });
      return { delivered: !!alert };
    },
  },
  generate_report: {
    title: "Generate a governance evidence report",
    tool: "generate_report",
    risk: "medium",
    approval_flags: {},
    execute: async (p) => {
      const rep = await rt.reports.generate({ org_id: p.org_id, period: p.period || "weekly" });
      return { report_id: rep && rep.id ? rep.id : null, period: p.period || "weekly" };
    },
  },

  // ── Governed internal executors (Phase 2) — low-risk, INTERNAL only. Each
  // carries a verify() the platform runs after execution; the Ω rule
  // `ops_internal_action_external_reach` blocks them if they ever carry an
  // external destination, so the "internal" classification is engine-enforced.
  open_incident: {
    title: "Open an operations incident (internal work item)",
    tool: "open_incident",
    risk: "low",
    approval_flags: {},
    execute: async (p) => {
      const incidents = require("./incidents");
      const inc = await incidents.open({ severity: p.severity || "warning", kind: p.kind || "ops_incident", summary: p.summary || "", org_id: p.org_id || null, source_ref: p.source_ref || null, opened_by: p.opened_by || "operations_agent" });
      return { incident_id: inc.id, status: inc.status };
    },
    verify: async (result) => {
      const incidents = require("./incidents");
      const inc = result && result.incident_id ? await incidents.get(result.incident_id) : null;
      return { ok: !!(inc && inc.status === "open"), detail: inc ? `incident ${inc.id} open` : "incident not found" };
    },
  },
  refresh_customer_intelligence: {
    title: "Refresh + snapshot a customer's intelligence profile",
    tool: "refresh_customer_intelligence",
    risk: "low",
    approval_flags: {},
    execute: async (p) => {
      const intelligence = require("./intelligence");
      const detail = await intelligence.detail(p.org_id);
      if (!detail) throw new Error("organisation not found");
      const snap = await rt.store.insert("ops_intel_snapshots", {
        org_id: p.org_id, health: detail.scores.health.score, health_band: detail.scores.health.band,
        scores: detail.scores, lifecycle_stage: detail.lifecycle_stage, taken_at: rt.store.nowISO(),
      });
      return { snapshot_id: snap.id, org_id: p.org_id, health: detail.scores.health.score };
    },
    verify: async (result, p) => {
      if (!result || !result.snapshot_id) return { ok: false, detail: "no snapshot produced" };
      const snap = await rt.store.findOne("ops_intel_snapshots", { id: result.snapshot_id }).catch(() => null);
      return { ok: !!(snap && snap.org_id === p.org_id), detail: snap ? "snapshot written" : "snapshot missing" };
    },
  },
  schedule_internal_review: {
    title: "Schedule an internal review (set next review date)",
    tool: "schedule_internal_review",
    risk: "low",
    approval_flags: {},
    execute: async (p) => {
      const date = String(p.next_review_date || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("next_review_date must be YYYY-MM-DD");
      await rt.engagement.set(p.org_id, { next_review_date: date });
      return { org_id: p.org_id, next_review_date: date };
    },
    verify: async (result, p) => {
      const eng = await rt.engagement.get(p.org_id).catch(() => null);
      return { ok: !!(eng && eng.next_review_date === result.next_review_date), detail: eng ? `next review ${eng.next_review_date}` : "engagement missing" };
    },
  },

  // ── Lifecycle transitions (Pillar 3 — governed state-machine steps) ───────
  // Executors produce the evidence the workflow.derive() reads (engagement
  // stage + records), so a governed transition deterministically advances the
  // lifecycle. Low/medium → auto-execute after an engine PERMIT; the privileged
  // ones (pilot, deployment, renewal) escalate for operator approval.
  record_questionnaire: {
    title: "Record a completed questionnaire (Lead → Questionnaire)",
    tool: "record_questionnaire",
    risk: "low",
    approval_flags: {},
    execute: async (p) => {
      await rt.engagement.set(p.org_id, { stage: "audit" });
      await rt.engagement.addNote(p.org_id, "Questionnaire received — lifecycle advanced to Questionnaire").catch(() => {});
      return { org_id: p.org_id, stage: "audit" };
    },
  },
  complete_assessment: {
    title: "Complete the runtime assessment (Questionnaire → Assessment)",
    tool: "complete_assessment",
    risk: "medium",
    approval_flags: {},
    execute: async (p) => {
      const eng = await rt.engagement.set(p.org_id, { stage: "enterprise_assessment" });
      return { org_id: p.org_id, stage: (eng && eng.stage) || "enterprise_assessment" };
    },
  },
  activate_monitoring: {
    title: "Activate runtime monitoring (Deployment → Runtime Monitoring)",
    tool: "activate_monitoring",
    risk: "medium",
    approval_flags: {},
    execute: async (p) => {
      // Records that monitoring is authorised/active. The lifecycle reaches
      // Runtime Monitoring once real governed evaluations are observed — that
      // observed traffic is the honest signal, not a flag.
      await rt.adminaudit.record({ action: "ops_monitoring_activated", actor: "operations_agent", via: "ops", target: p.org_id, meta: {} });
      await rt.engagement.addNote(p.org_id, "Runtime monitoring activated — awaiting governed traffic").catch(() => {});
      return { org_id: p.org_id, monitoring: "authorised" };
    },
  },
  initiate_renewal: {
    title: "Initiate renewal / expansion (Runtime Monitoring → Renewal)",
    tool: "initiate_renewal",
    risk: "high",
    approval_flags: {},
    execute: async (p) => {
      const eng = await rt.engagement.set(p.org_id, { stage: "managed_service" });
      await rt.engagement.addNote(p.org_id, "Renewal / expansion initiated").catch(() => {});
      return { org_id: p.org_id, stage: (eng && eng.stage) || "managed_service" };
    },
  },

  // ── Privileged operations (engine-ruled + operator sign-off) ──────────────
  send_confidential_report: {
    title: "Deliver a confidential enterprise report to a customer",
    tool: "send_confidential_report",
    risk: "high",
    approval_flags: { report_delivery_authorized: true },
    execute: async (p) => {
      // Delivery itself remains an operator action in the Control Room (share
      // link / hub publish). Execution here records the authorised work item.
      await rt.adminaudit.record({
        action: "ops_report_delivery_authorized", actor: "operations_agent",
        via: "ops", target: p.org_id, meta: { report_id: p.report_id || null },
      });
      return { queued: true, next: "operator delivers via Evidence Hub / secure share" };
    },
  },
  create_organisation: {
    title: "Onboard a new customer organisation",
    tool: "create_organisation",
    risk: "high",
    approval_flags: { onboarding_verified: true, operator_approved: true },
    execute: async (p) => {
      const res = await rt.admin.onboardCustomer({ name: p.name, slug: p.slug, plan: p.plan || "pilot" });
      return { org_id: res.org.id, environment_id: res.production.id };
    },
  },
  promote_to_pilot: {
    title: "Promote a customer engagement to pilot",
    tool: "promote_to_pilot",
    risk: "high",
    approval_flags: { pilot_approved: true, operator_approved: true },
    execute: async (p) => {
      // Engagement stage keys come from rt.engagement.STAGES ("limited_pilot"
      // is the pilot stage in the existing engagement model).
      const stage = p.stage && rt.engagement.STAGE_KEYS.includes(p.stage) ? p.stage : "limited_pilot";
      const eng = await rt.engagement.set(p.org_id, { stage });
      return { org_id: p.org_id, stage: (eng && eng.stage) || stage };
    },
  },
  modify_customer: {
    title: "Modify a customer record",
    tool: "modify_customer",
    risk: "high",
    approval_flags: { change_authorized: true, operator_approved: true },
    execute: async (p) => {
      await rt.store.update("orgs", p.org_id, p.patch || {});
      return { org_id: p.org_id, patched: Object.keys(p.patch || {}) };
    },
  },
  export_documents: {
    title: "Export customer documents (internal destination only)",
    tool: "export_documents",
    risk: "high",
    approval_flags: { export_authorized: true, destination_internal: true },
    execute: async (p) => {
      await rt.adminaudit.record({
        action: "ops_export_authorized", actor: "operations_agent",
        via: "ops", target: p.org_id, meta: { scope: p.scope || "deliverables" },
      });
      return { queued: true, next: "operator performs export from Control Room" };
    },
  },
  deploy_runtime: {
    title: "Trigger a runtime deployment",
    tool: "deploy_runtime",
    risk: "critical",
    approval_flags: { deployment_approved: true, change_approved: true },
    execute: async (p) => {
      // This runs only after operator approval (deploy_runtime is critical +
      // Ω-ruled), so advancing the lifecycle to Deployment is authorised.
      await rt.engagement.set(p.org_id, { stage: "enterprise_integration" }).catch(() => {});
      // Actual rollout requires an explicitly configured deploy hook
      // (Railway/Vercel). Without it, the approved deployment stays a manual step.
      const hook = process.env.OPS_DEPLOY_WEBHOOK || "";
      if (!hook) return { executed: true, deployment: "recorded", rollout: "manual — OPS_DEPLOY_WEBHOOK not configured", org_id: p.org_id, stage: "enterprise_integration" };
      const res = await fetch(hook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "operations_agent", target: p.target || "runtime", ref: p.ref || null }),
      }).catch((e) => ({ ok: false, statusText: e.message }));
      return { executed: !!res.ok, status: res.status || null, org_id: p.org_id, stage: "enterprise_integration" };
    },
  },

  // ── GuardianOS Integration Gateway ───────────────────────────────────────
  // These actions mutate the enterprise onboarding layer, never the Runtime
  // Governance engine. They still travel through proposal → Ω → execution →
  // verification → evidence. Production activation remains the critical
  // deploy_runtime action above; creating a deployment record is inert.
  configure_integration: {
    title: "Configure an enterprise connector",
    tool: "configure_integration",
    risk: "medium",
    approval_flags: {},
    execute: async (p) => require("../runtime/integration-gateway").createConnectorRaw(p),
    verify: async (result, p) => {
      const row = result && result.id ? await rt.store.findOne("integration_connectors", { id: result.id }).catch(() => null) : null;
      return { ok: !!(row && row.org_id === p.org_id && row.environment_id === p.environment_id), detail: row ? `connector ${row.id} configured` : "connector missing" };
    },
  },
  register_integration_webhook: {
    title: "Register a signed enterprise webhook",
    tool: "register_integration_webhook",
    risk: "medium",
    approval_flags: {},
    execute: async (p) => require("../runtime/integration-gateway").registerWebhookRaw(p),
    verify: async (result, p) => {
      const id = result && result.webhook && result.webhook.id;
      const row = id ? await rt.store.findOne("integration_webhooks", { id }).catch(() => null) : null;
      return { ok: !!(row && row.org_id === p.org_id && row.status === "active"), detail: row ? `webhook ${row.id} active` : "webhook missing" };
    },
  },
  manage_integration_connector: {
    title: "Enable or disable an enterprise connector",
    tool: "manage_integration_connector",
    risk: "medium",
    approval_flags: {},
    execute: async (p) => require("../runtime/integration-gateway").setConnectorStatusRaw(p),
    verify: async (result, p) => ({ ok: !!(result && result.status === (p.status === "active" ? "configured" : p.status)), detail: result ? `connector ${result.id} ${result.status}` : "connector missing" }),
  },
  check_integration_connector: {
    title: "Check enterprise connector health",
    tool: "check_integration_connector",
    risk: "low",
    approval_flags: {},
    execute: async (p) => {
      try { return await require("../runtime/integration-gateway").checkConnectorHealthRaw(p); }
      catch (e) {
        if (e && e.code) throw new Error(`${e.code}: ${e.message}`);
        throw e;
      }
    },
    verify: async (result) => ({ ok: !!(result && result.last_checked_at), detail: result ? `connector ${result.id} ${result.health}` : "health result missing" }),
  },
  rotate_aws_bedrock_credentials: {
    title: "Rotate encrypted Amazon Bedrock connector credentials",
    tool: "rotate_aws_bedrock_credentials",
    risk: "medium",
    approval_flags: {},
    execute: async (p) => {
      try { return await require("../runtime/integration-gateway").rotateBedrockCredentialsRaw(p); }
      catch (e) {
        if (e && e.code) throw new Error(`${e.code}: ${e.message}`);
        throw e;
      }
    },
    verify: async (result, p) => {
      const row = result && result.id ? await rt.store.findOne("integration_connectors", { id: result.id }).catch(() => null) : null;
      return {
        ok: !!(row && row.org_id === p.org_id && row.environment_id === p.environment_id && row.type === "aws-bedrock" && row.health === "healthy"),
        detail: row ? `Bedrock connector ${row.id} credentials validated and rotated` : "Bedrock connector missing",
      };
    },
  },
  invoke_aws_bedrock_model: {
    title: "Authorize an Amazon Bedrock model invocation",
    tool: "invoke_aws_bedrock_model",
    risk: "medium",
    approval_flags: {},
    // The API handler invokes AWS only after this authorization proposal has
    // executed. Keeping provider output outside proposal execution prevents
    // prompts and model responses from being copied into governance evidence.
    execute: async (p) => ({ authorized: true, connector_id: p.connector_id, request_hash: p.request_hash }),
    verify: async (result) => ({ ok: !!(result && result.authorized), detail: "Bedrock invocation authorized by Runtime Governance" }),
  },
  govern_aws_bedrock_agent_action: {
    title: "Govern an Amazon Bedrock Agent action-group invocation",
    tool: "govern_aws_bedrock_agent_action",
    risk: "medium",
    approval_flags: {},
    // This executor authorizes only. The Bedrock-compatible response is built
    // after an ALLOW; blocked or unresolved proposals never call a tool.
    execute: async (p) => ({ authorized: true, connector_id: p.connector_id, request_hash: p.request_hash }),
    verify: async (result) => ({ ok: !!(result && result.authorized), detail: "Bedrock Agent action authorized by Runtime Governance" }),
  },
  // ── Governed communication (Integration Gateway) ─────────────────────────
  // Sending a message is the platform's only irreversible EXTERNAL effect, so
  // delivering actions ride the existing outbound-delivery Ω vocabulary in
  // operations_rules.py (OPS_REPORT_DELIVERY). `ops_unauthorized_report_delivery`
  // is deny-by-default and sits in governor.AUTHORIZATION_RULES: an unapproved
  // send is BLOCKED by the engine and escalates to an operator; only an approval
  // — which attaches report_delivery_authorized and is RE-EVALUATED by the
  // engine — yields a permit. Nothing is ever sent on a local decision.
  //
  // `high` risk additionally trips the deployment's human-sign-off floor, so a
  // permit alone still escalates. The two controls are independent on purpose.
  //
  // Every executor AUTHORIZES ONLY. The provider API is reached afterwards by
  // the Integration Gateway communication path, so message bodies and provider
  // responses never enter governance evidence.
  "gmail.send_email": {
    title: "Send an email through the governed Gmail connector",
    tool: "email_report",
    risk: "high",
    approval_flags: { report_delivery_authorized: true },
    execute: async (p) => authorizeCommunication("gmail.send_email", p),
    verify: async (result, params = {}) => verifyCommunication("gmail.send_email", result, params),
  },
  "gmail.reply_email": {
    title: "Reply to an email thread through the governed Gmail connector",
    tool: "send_report",
    risk: "high",
    approval_flags: { report_delivery_authorized: true },
    execute: async (p) => authorizeCommunication("gmail.reply_email", p),
    verify: async (result, params = {}) => verifyCommunication("gmail.reply_email", result, params),
  },
  // A draft delivers nothing — it is written into the operator's own mailbox and
  // leaves the platform only if a human later presses send in Gmail. It is
  // therefore an INTERNAL action under the same Ω vocabulary the Operations
  // Agent already uses, and `ops_internal_action_external_reach` still blocks it
  // if the trajectory ever carries an external destination.
  "gmail.create_draft": {
    title: "Create an email draft through the governed Gmail connector",
    tool: "prepare_draft_reply",
    risk: "low",
    approval_flags: {},
    execute: async (p) => authorizeCommunication("gmail.create_draft", p),
    verify: async (result, params = {}) => verifyCommunication("gmail.create_draft", result, params),
  },
  // Canonical action of the governed Customer Support Assistant workflow. The
  // workflow proposes this BEFORE any provider call; an action absent from this
  // catalog is blocked as `unknown_action` by governor.evaluate without ever
  // reaching the engine, so registration here is what makes the action
  // EVALUABLE — it does not decide the verdict. The Ω tool is the existing
  // internal draft-reply vocabulary in operations_rules.py
  // (OPS_INTERNAL_ACTIONS), so ops_internal_action_external_reach keeps
  // applying: drafting a customer reply is permitted, carrying it to an
  // external destination is blocked by the engine.
  //
  // The executor AUTHORIZES ONLY — it never calls Amazon Bedrock. The provider
  // invocation stays behind its own `invoke_aws_bedrock_model` proposal on the
  // existing governed Bedrock path, so a permit here authorises exactly one
  // canonical support response for one org/environment/connector/model and
  // nothing else. Prompt and model output are never copied into evidence.
  "customer_support_assistant.respond": {
    title: "Authorize a governed Customer Support Assistant response",
    tool: "prepare_draft_reply",
    risk: "medium",
    approval_flags: {},
    execute: async (p) => {
      const action = p.canonical_action || {};
      if (action.action_id !== "customer_support_assistant.respond") {
        throw new Error("canonical action type does not match the registered customer support action");
      }
      if (action.workflow !== "customer_support_assistant") throw new Error("canonical action is not a customer support workflow action");
      if (!p.org_id || !p.environment_id) throw new Error("organisation and environment are required");
      if (!p.workflow_run_id) throw new Error("workflow run is required");
      if (!p.connector_id || !p.model_id) throw new Error("connector and model are required");
      // Scope the permit to a connector that is already eligible for this
      // organisation AND environment, and to a model configured on it. Reuses
      // the existing Bedrock eligibility check — no new trust surface.
      const connectors = await rt.bedrockInvocationRuns.listEligibleConnectors(p.org_id, p.environment_id);
      const connector = connectors.find((row) => row.id === p.connector_id);
      if (!connector) throw new Error("connector is not an eligible Amazon Bedrock connector for this organisation and environment");
      if (!connector.models.includes(p.model_id)) throw new Error("model is not configured for this connector");
      return {
        authorized: true,
        action_type: action.action_id,
        workflow_run_id: p.workflow_run_id,
        org_id: p.org_id,
        environment_id: p.environment_id,
        connector_id: connector.id,
        model_id: p.model_id,
        provider: "amazon-bedrock",
        canonical_action_hash: p.canonical_action_hash || null,
      };
    },
    verify: async (result, params = {}) => ({
      ok: !!(result && result.authorized
        && result.action_type === "customer_support_assistant.respond"
        && result.org_id === params.org_id
        && result.environment_id === params.environment_id
        && result.connector_id === params.connector_id
        && result.model_id === params.model_id),
      detail: "Customer Support response authorized by Runtime Governance for the proposed organisation, environment, connector and model",
    }),
  },
  manage_integration_webhook: {
    title: "Pause, resume or revoke an enterprise webhook",
    tool: "manage_integration_webhook",
    risk: "medium",
    approval_flags: {},
    execute: async (p) => require("../runtime/integration-gateway").setWebhookStatusRaw(p),
    verify: async (result, p) => ({ ok: !!(result && result.status === p.status), detail: result ? `webhook ${result.id} ${result.status}` : "webhook missing" }),
  },
  rotate_integration_credential: {
    title: "Rotate a scoped organisation credential",
    tool: "rotate_integration_credential",
    risk: "medium",
    approval_flags: {},
    // Authorisation only: the actual issue/rotation occurs in the request
    // handler after this governed permit so plaintext credentials never enter a
    // proposal or evidence row.
    execute: async (p) => ({ authorized: true, operation: "rotate", key_id: p.key_id, org_id: p.org_id }),
    verify: async (result) => ({ ok: !!(result && result.authorized), detail: "credential rotation authorised; secret issuance remains outside evidence" }),
  },
  issue_integration_credential: {
    title: "Issue a scoped organisation credential",
    tool: "issue_integration_credential",
    risk: "medium",
    approval_flags: {},
    execute: async (p) => ({ authorized: true, operation: "issue", org_id: p.org_id, environment_id: p.environment_id }),
    verify: async (result) => ({ ok: !!(result && result.authorized), detail: "credential issuance authorised; plaintext is never evidence" }),
  },
  revoke_integration_credential: {
    title: "Revoke an organisation credential",
    tool: "revoke_integration_credential",
    risk: "low",
    approval_flags: {},
    execute: async (p) => ({ authorized: true, operation: "revoke", key_id: p.key_id, org_id: p.org_id }),
    verify: async (result) => ({ ok: !!(result && result.authorized), detail: "credential revocation authorised" }),
  },
  create_integration_deployment: {
    title: "Create an integration deployment record",
    tool: "create_integration_deployment",
    risk: "medium",
    approval_flags: {},
    execute: async (p) => require("../runtime/integration-gateway").createDeploymentRaw(p),
    verify: async (result, p) => {
      const row = result && result.id ? await rt.store.findOne("integration_deployments", { id: result.id }).catch(() => null) : null;
      return { ok: !!(row && row.org_id === p.org_id), detail: row ? `deployment ${row.id} ${row.status}` : "deployment missing" };
    },
  },
  submit_integration_evidence: {
    title: "Submit immutable customer integration evidence",
    tool: "submit_integration_evidence",
    risk: "low",
    approval_flags: {},
    execute: async (p) => require("../runtime/integration-gateway").submitEvidence(p),
    verify: async (result, p) => {
      const row = result && result.id ? await rt.store.findOne("integration_events", { id: result.id }).catch(() => null) : null;
      return { ok: !!(row && row.org_id === p.org_id && row.immutable === true), detail: row ? `evidence ${row.id} recorded` : "evidence missing" };
    },
  },
  deliver_integration_webhook: {
    title: "Deliver a signed governed webhook event",
    tool: "deliver_integration_webhook",
    risk: "medium",
    approval_flags: {},
    execute: async (p) => require("../runtime/integration-gateway").deliverWebhookRaw(p),
    verify: async (result) => ({
      ok: !!(result && result.delivery_id && result.delivered),
      detail: result && result.delivered ? `delivery ${result.delivery_id} accepted` : (result && result.error) || "webhook delivery failed",
    }),
  },

  // ── Executive Command (Phase 4) — governed autonomy raise ─────────────────
  // Changing the enterprise autonomy MODE. Only RAISING autonomy flows through
  // this governed action: the proposal carries `raising_autonomy: true`, the Ω
  // rule `ops_unauthorized_autonomy_change` BLOCKs it without an operator
  // approval, so it escalates for sign-off. Lowering autonomy never uses this
  // path — it is applied directly + audited by the API as an always-available
  // fail-safe brake (the safety asymmetry).
  set_autonomy_mode: {
    title: "Raise the enterprise autonomy mode",
    tool: "set_autonomy_mode",
    risk: "high",
    approval_flags: { autonomy_change_approved: true, operator_approved: true },
    execute: async (p) => {
      const autonomy = require("./autonomy");
      const st = await autonomy.setMode(p.mode, { actor: p.actor || "operator" });
      return { mode: st.mode, label: st.label };
    },
    verify: async (result, p) => {
      const autonomy = require("./autonomy");
      const cur = await autonomy.current();
      return { ok: cur.mode === p.mode, detail: cur.mode === p.mode ? `autonomy mode ${cur.mode}` : `mode is ${cur.mode}, expected ${p.mode}` };
    },
  },

  // ── Guardian OS — Policy Engineering (Phase: departments) ─────────────────
  // draft_policy is INTERNAL + low-risk: it produces an inert policy draft that
  // changes nothing about the running kernel. activate_policy is CRITICAL and
  // operator-only (Ω rule ops_unauthorized_policy_activation): it records an
  // AUTHORISED activation — the live kernel edit stays a deliberate human step.
  // The agent is chartered for draft_policy only; it never activates policy.
  draft_policy: {
    title: "Draft a governance policy (inert artifact — never active)",
    tool: "draft_policy",
    risk: "low",
    approval_flags: {},
    execute: async (p) => {
      const policies = require("./policies");
      const d = await policies.draft({ kind: p.kind, title: p.title, spec: p.spec || null, rationale: p.rationale || "", target_domain: p.target_domain || "enterprise", created_by: p.created_by || "policy_engineering" });
      return { policy_id: d.id, status: d.status, title: d.title };
    },
    verify: async (result) => {
      const policies = require("./policies");
      const d = result && result.policy_id ? await policies.get(result.policy_id) : null;
      return { ok: !!(d && d.status === "draft"), detail: d ? `policy draft ${d.id}` : "draft not found" };
    },
  },
  activate_policy: {
    title: "Activate a drafted governance policy (operator sign-off required)",
    tool: "activate_policy",
    risk: "critical",
    approval_flags: { policy_activation_approved: true, operator_approved: true },
    execute: async (p) => {
      const policies = require("./policies");
      const d = await policies.authorizeActivation(p.policy_id, { actor: p.actor || "operator" });
      await rt.adminaudit.record({ action: "ops_policy_activation_authorized", actor: p.actor || "operator", via: "ops", target: null, meta: { policy_id: p.policy_id } });
      return { policy_id: p.policy_id, status: d ? d.status : null, next: "operator deploys the rule to the governance service — the kernel is never edited by the agent" };
    },
    verify: async (result, p) => {
      const policies = require("./policies");
      const d = await policies.get(p.policy_id).catch(() => null);
      return { ok: !!(d && d.status === "activation_authorized"), detail: d ? `policy ${d.id} ${d.status}` : "policy not found" };
    },
  },

  // ── Dynamic runtime governance policy — governed activation ───────────────
  // Activating a customer Ω policy INTO the running kernel is a privileged
  // action (it adds a live governance constraint). Critical + operator-only,
  // guarded by ops_unauthorized_policy_activation. Drafting/validating a policy
  // is operator-direct; ADDING it to the kernel requires approval — while
  // ROLLING BACK is always allowed (the safety asymmetry). The agent never
  // activates policy; this action is not in any agent charter.
  activate_governance_policy: {
    title: "Activate a runtime governance policy into the kernel",
    tool: "activate_governance_policy",
    risk: "critical",
    approval_flags: { policy_activation_approved: true, operator_approved: true },
    execute: async (p) => {
      const govpolicy = require("./govpolicy");
      const pol = await govpolicy.activate(p.policy_id, { actor: p.actor || "operator" });
      return { policy_id: pol.id, name: pol.name, version: pol.version, status: pol.status };
    },
    verify: async (result, p) => {
      const govpolicy = require("./govpolicy");
      const pol = await govpolicy.get(p.policy_id).catch(() => null);
      return { ok: !!(pol && pol.status === "active"), detail: pol ? `policy ${pol.name} v${pol.version} ${pol.status}` : "policy not found" };
    },
  },

  // ── Never-execute actions (governed refusals) ─────────────────────────────
  delete_evidence: {
    title: "Delete governance evidence (never permitted)",
    tool: "delete_evidence",
    risk: "critical",
    approval_flags: {}, // no flag combination unblocks this in the engine
    refuse: true,
  },
  share_credentials: {
    title: "Share credentials (never permitted)",
    tool: "share_credentials",
    risk: "critical",
    approval_flags: {},
    refuse: true,
  },
};

const get = (action_id) => CATALOG[action_id] || null;
const list = () =>
  Object.entries(CATALOG).map(([id, a]) => ({
    id, title: a.title, tool: a.tool, risk: a.risk, refuse: !!a.refuse,
    auto_executable: !a.refuse && AUTO_EXECUTE_RISKS.includes(a.risk),
  }));
const autoExecutable = (action) => !!action && !action.refuse && AUTO_EXECUTE_RISKS.includes(action.risk);

module.exports = { CATALOG, RISKS, AUTO_EXECUTE_RISKS, get, list, autoExecutable };
