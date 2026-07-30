import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import * as rt from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function operator(req: NextRequest) {
  return rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
}
function governance(proposal: any) {
  return {
    proposal_id: proposal?.id,
    evidence_id: proposal?.evidence_id,
    status: proposal?.status,
    // Surfaced so an operator can see WHY a governed administrative operation
    // was blocked or escalated, rather than only that it did not complete.
    verdict: proposal?.decision?.verdict ?? null,
    policy: proposal?.decision?.policy ?? null,
    rule: proposal?.decision?.rule ?? null,
    reason: proposal?.decision?.reason ?? null,
    safe_failure_reason: proposal?.execution?.executed === false ? (proposal?.execution?.error ?? null) : null,
  };
}

export async function GET(req: NextRequest) {
  const op = operator(req);
  if (!op.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  const org_id = new URL(req.url).searchParams.get("org_id") || null;
  const [summary, organisations] = await Promise.all([
    (rt.integrationGateway as any).overview(org_id),
    rt.overview.customers(),
  ]);
  if (!org_id) return NextResponse.json({
    summary, organisations,
    connector_definitions: (rt.integrationGateway as any).CONNECTOR_DEFINITIONS,
    sdk_methods: (rt.integrationGateway as any).SDK_METHODS,
    bedrock_sdk_methods: (rt.integrationGateway as any).BEDROCK_SDK_METHODS,
  }, { headers: { "cache-control": "no-store" } });
  const [connectors, webhooks, deliveries, deployments, credentials, bedrock, enterpriseExecutions, enterpriseDashboard] = await Promise.all([
    (rt.integrationGateway as any).listConnectors(org_id),
    (rt.integrationGateway as any).listWebhooks(org_id),
    (rt.integrationGateway as any).listDeliveries(org_id),
    (rt.integrationGateway as any).listDeployments(org_id),
    rt.admin.listApiKeys(org_id),
    (rt.integrationGateway as any).bedrockOverview(org_id),
    (rt.enterpriseActionRuns as any).recentRuns(org_id, null, 25),
    (rt.enterpriseActionRuns as any).aggregate(org_id),
  ]);
  return NextResponse.json({
    summary, organisations, connectors, webhooks, deliveries, deployments, credentials, bedrock,
    enterprise_executions: enterpriseExecutions, enterprise_dashboard: enterpriseDashboard,
    connector_definitions: (rt.integrationGateway as any).CONNECTOR_DEFINITIONS,
    sdk_methods: (rt.integrationGateway as any).SDK_METHODS,
    bedrock_sdk_methods: (rt.integrationGateway as any).BEDROCK_SDK_METHODS,
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const op = operator(req);
  if (!op.ok) return NextResponse.json({ error: "operator authentication required" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON body required" }, { status: 400 }); }
  const org_id = String(body.org_id || "");
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  const org = await rt.admin.getOrg(org_id);
  if (!org) return NextResponse.json({ error: "organisation not found" }, { status: 404 });

  try {
    let proposal: any;
    if (body.operation === "connector.create") {
      const secret_ref = body.secret ? await (rt.integrationGateway as any).stageSecret(org_id, body.secret, "connector") : null;
      proposal = await (rt.integrationGateway as any).governed("configure_integration", {
        org_id, environment_id: body.environment_id, actor: op.identity,
        params: { type: body.type, name: body.name, endpoint: body.endpoint, config: body.config || {}, secret_ref },
      });
      return NextResponse.json({ ok: (rt.integrationGateway as any).executed(proposal), governance: governance(proposal), result: proposal.execution?.result || null });
    }
    if (body.operation === "connector.status") {
      const row = await rt.store.findOne("integration_connectors", { id: body.connector_id });
      if (!row || row.org_id !== org_id) return NextResponse.json({ error: "connector not found" }, { status: 404 });
      proposal = await (rt.integrationGateway as any).governed("manage_integration_connector", {
        org_id, environment_id: row.environment_id, actor: op.identity,
        params: { connector_id: row.id, status: body.status },
      });
      return NextResponse.json({ ok: (rt.integrationGateway as any).executed(proposal), governance: governance(proposal), result: proposal.execution?.result || null });
    }
    if (body.operation === "connector.check") {
      const row = await rt.store.findOne("integration_connectors", { id: body.connector_id });
      if (!row || row.org_id !== org_id) return NextResponse.json({ error: "connector not found" }, { status: 404 });
      proposal = await (rt.integrationGateway as any).governed("check_integration_connector", {
        org_id, environment_id: row.environment_id, actor: op.identity, params: { connector_id: row.id },
      });
      return NextResponse.json({ ok: (rt.integrationGateway as any).executed(proposal), governance: governance(proposal), result: proposal.execution?.result || null });
    }
    if (body.operation === "gmail.credentials.rotate") {
      const row = await rt.store.findOne("integration_connectors", { id: body.connector_id });
      if (!row || row.org_id !== org_id || row.type !== "gmail")
        return NextResponse.json({ error: "Gmail connector not found" }, { status: 404 });
      if (!body.credentials) return NextResponse.json({ error: "replacement Gmail OAuth credentials are required" }, { status: 400 });
      // Plaintext is staged for minutes, sealed on consumption, and never
      // reaches the proposal — the governed action receives only a reference.
      const secret_ref = await (rt.integrationGateway as any).stageSecret(
        org_id, body.credentials, "gmail-credential-rotation");
      proposal = await (rt.integrationGateway as any).governed("rotate_gmail_credentials", {
        org_id, environment_id: row.environment_id, actor: op.identity,
        params: { connector_id: row.id, config: body.config || {}, secret_ref },
      });
      return NextResponse.json({
        ok: (rt.integrationGateway as any).executed(proposal),
        governance: governance(proposal), result: proposal.execution?.result || null,
      });
    }
    if (body.operation === "gmail.credentials.revoke") {
      const row = await rt.store.findOne("integration_connectors", { id: body.connector_id });
      if (!row || row.org_id !== org_id || row.type !== "gmail")
        return NextResponse.json({ error: "Gmail connector not found" }, { status: 404 });
      proposal = await (rt.integrationGateway as any).governed("revoke_gmail_credentials", {
        org_id, environment_id: row.environment_id, actor: op.identity,
        params: { connector_id: row.id },
      });
      return NextResponse.json({
        ok: (rt.integrationGateway as any).executed(proposal),
        governance: governance(proposal), result: proposal.execution?.result || null,
      });
    }
    if (body.operation === "gmail.credentials.check") {
      const row = await rt.store.findOne("integration_connectors", { id: body.connector_id });
      if (!row || row.org_id !== org_id || row.type !== "gmail")
        return NextResponse.json({ error: "Gmail connector not found" }, { status: 404 });
      const requestId = req.headers.get("x-vercel-id") || null;
      console.log(JSON.stringify({
        level: "info", event: "gmail_connector_validation_started",
        route: "/api/runtime/admin/integration-gateway", request_id: requestId,
        org_id, environment_id: row.environment_id, connector_id: row.id,
      }));
      const result = await (rt.integrationGateway as any).checkCommunicationHealthRaw({
        org_id, environment_id: row.environment_id, connector_id: row.id, connector_type: "gmail",
      });
      console.log(JSON.stringify({
        level: result.ok ? "info" : "error", event: "gmail_connector_validation_completed",
        route: "/api/runtime/admin/integration-gateway", request_id: requestId,
        org_id, environment_id: row.environment_id, connector_id: row.id,
        ok: !!result.ok, code: result.code || null, error: result.error || null,
        latency_ms: result.latency_ms ?? null,
      }));
      return NextResponse.json({ ok: !!result.ok, result });
    }
    if (["salesforce.credentials.check", "servicenow.credentials.check"].includes(body.operation)) {
      const connectorType = body.operation.split(".")[0];
      const row = await rt.store.findOne("integration_connectors", { id: body.connector_id });
      if (!row || row.org_id !== org_id || row.type !== connectorType)
        return NextResponse.json({ error: `${connectorType} connector not found` }, { status: 404 });
      const result = await (rt.integrationGateway as any).checkEnterpriseConnectorHealthRaw({
        org_id, environment_id: row.environment_id, connector_id: row.id, connector_type: connectorType,
      });
      return NextResponse.json({ ok: !!result.ok, result });
    }
    if (["salesforce.credentials.rotate", "servicenow.credentials.rotate"].includes(body.operation)) {
      const connectorType = body.operation.split(".")[0];
      const row = await rt.store.findOne("integration_connectors", { id: body.connector_id });
      if (!row || row.org_id !== org_id || row.type !== connectorType)
        return NextResponse.json({ error: `${connectorType} connector not found` }, { status: 404 });
      if (!body.credentials) return NextResponse.json({ error: "replacement OAuth credentials are required" }, { status: 400 });
      const secret_ref = await (rt.integrationGateway as any).stageSecret(
        org_id, body.credentials, `${connectorType}-credential-rotation`);
      proposal = await (rt.integrationGateway as any).governed("rotate_enterprise_connector_credentials", {
        org_id, environment_id: row.environment_id, actor: op.identity,
        params: { connector_id: row.id, connector_type: connectorType, config: body.config || {}, secret_ref },
      });
      return NextResponse.json({
        ok: (rt.integrationGateway as any).executed(proposal),
        governance: governance(proposal), result: proposal.execution?.result || null,
      });
    }
    if (body.operation === "bedrock.credentials.rotate") {
      const row = await rt.store.findOne("integration_connectors", { id: body.connector_id });
      if (!row || row.org_id !== org_id || row.type !== "aws-bedrock")
        return NextResponse.json({ error: "Bedrock connector not found" }, { status: 404 });
      if (!body.credentials) return NextResponse.json({ error: "replacement AWS credentials are required" }, { status: 400 });
      const secret_ref = await (rt.integrationGateway as any).stageSecret(
        org_id, body.credentials, "aws-bedrock-credential-rotation");
      proposal = await (rt.integrationGateway as any).governed("rotate_aws_bedrock_credentials", {
        org_id, environment_id: row.environment_id, actor: op.identity,
        params: { connector_id: row.id, config: body.config || {}, secret_ref },
      });
      return NextResponse.json({
        ok: (rt.integrationGateway as any).executed(proposal),
        governance: governance(proposal), result: proposal.execution?.result || null,
      });
    }
    if (body.operation === "webhook.create") {
      const signing_secret = crypto.randomBytes(32).toString("hex");
      const secret_ref = await (rt.integrationGateway as any).stageSecret(org_id, { secret: signing_secret }, "webhook-signing");
      proposal = await (rt.integrationGateway as any).governed("register_integration_webhook", {
        org_id, environment_id: body.environment_id, actor: op.identity,
        params: { url: body.url, name: body.name, events: body.events, capture_payloads: !!body.capture_payloads, secret_ref },
      });
      const ok = (rt.integrationGateway as any).executed(proposal);
      return NextResponse.json({ ok, governance: governance(proposal), result: proposal.execution?.result || null, ...(ok ? { signing_secret, secret_notice: "Shown once." } : {}) });
    }
    if (body.operation === "webhook.replay") {
      const prior = await rt.store.findOne("integration_webhook_deliveries", { id: body.delivery_id });
      if (!prior || prior.org_id !== org_id) return NextResponse.json({ error: "delivery not found" }, { status: 404 });
      proposal = await (rt.integrationGateway as any).replayDelivery({ org_id, delivery_id: body.delivery_id, actor: op.identity });
      return NextResponse.json({ ok: (rt.integrationGateway as any).executed(proposal), governance: governance(proposal), result: proposal.execution?.result || null });
    }
    if (body.operation === "webhook.status") {
      const row = await rt.store.findOne("integration_webhooks", { id: body.webhook_id });
      if (!row || row.org_id !== org_id) return NextResponse.json({ error: "webhook not found" }, { status: 404 });
      proposal = await (rt.integrationGateway as any).governed("manage_integration_webhook", {
        org_id, environment_id: row.environment_id, actor: op.identity,
        params: { webhook_id: row.id, status: body.status },
      });
      return NextResponse.json({ ok: (rt.integrationGateway as any).executed(proposal), governance: governance(proposal), result: proposal.execution?.result || null });
    }
    if (body.operation === "deployment.create") {
      proposal = await (rt.integrationGateway as any).governed("create_integration_deployment", {
        org_id, environment_id: body.environment_id, actor: op.identity,
        params: { name: body.name, target: body.target, model: body.model, version: body.version },
      });
      return NextResponse.json({ ok: (rt.integrationGateway as any).executed(proposal), governance: governance(proposal), result: proposal.execution?.result || null });
    }
    if (["credential.issue", "credential.rotate", "credential.revoke"].includes(body.operation)) {
      if (body.operation !== "credential.issue") {
        if (!body.key_id) return NextResponse.json({ error: "key_id required" }, { status: 400 });
        const target = await rt.store.findOne("api_keys", { id: body.key_id });
        if (!target || target.org_id !== org_id) return NextResponse.json({ error: "credential not found" }, { status: 404 });
      }
      const action = body.operation === "credential.issue" ? "issue_integration_credential"
        : body.operation === "credential.rotate" ? "rotate_integration_credential" : "revoke_integration_credential";
      proposal = await (rt.integrationGateway as any).governed(action, {
        org_id, environment_id: body.environment_id || null, actor: op.identity, params: { key_id: body.key_id || null },
      });
      if (!(rt.integrationGateway as any).executed(proposal))
        return NextResponse.json({ ok: false, governance: governance(proposal), error: proposal.decision?.reason || proposal.status }, { status: proposal.status === "escalated" ? 202 : 403 });
      if (body.operation === "credential.revoke") {
        const target = await rt.store.findOne("api_keys", { id: body.key_id });
        if (!target || target.org_id !== org_id) return NextResponse.json({ error: "credential not found" }, { status: 404 });
        await rt.admin.revokeApiKey(body.key_id);
        await rt.adminaudit.record({ action: "integration_revoke_key", actor: op.identity, via: op.via, target: org_id, meta: { key_id: body.key_id, proposal_id: proposal.id } });
        return NextResponse.json({ ok: true, governance: governance(proposal), revoked: body.key_id });
      }
      const opts = {
        role: body.role || (body.operation === "credential.issue" ? "ingest" : undefined),
        label: body.label || (body.operation === "credential.issue" ? "integration credential" : undefined),
        scopes: body.scopes || null, expires_at: body.expires_at || null,
      };
      const issued = body.operation === "credential.rotate"
        ? await rt.admin.rotateApiKey(body.key_id, opts)
        : await rt.admin.issueApiKey({ org_id, environment_id: body.environment_id || null, ...opts });
      await rt.adminaudit.record({ action: body.operation === "credential.rotate" ? "integration_rotate_key" : "integration_issue_key", actor: op.identity, via: op.via, target: org_id, meta: { credential_id: issued.record.id, proposal_id: proposal.id } });
      return NextResponse.json({ ok: true, governance: governance(proposal), credential: issued.record, key: issued.key, key_notice: "Shown once." });
    }
    return NextResponse.json({ error: "unsupported operation" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "integration operation failed" }, { status: 400 });
  }
}
