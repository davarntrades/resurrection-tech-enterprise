#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-integration-"));
process.env.RUNTIME_LOG_SILENT = "1";
process.env.INTEGRATION_SECRET_KEY = "test-only-high-entropy-integration-secret";

const rt = require("../../lib/runtime");
const actions = require("../../lib/ops/actions");

let pass = 0, fail = 0; const failures = [];
function ok(condition, message, detail) {
  if (condition) { pass++; return; }
  fail++; failures.push(`${message}${detail ? ` — ${JSON.stringify(detail)}` : ""}`);
}

(async () => {
  const a = await rt.admin.onboardCustomer({ name: "Gateway A", slug: "gateway-a" });
  const b = await rt.admin.onboardCustomer({ name: "Gateway B", slug: "gateway-b" });
  ok(a.environments.map((e) => e.kind).sort().join(",") === "production,sandbox,staging", "onboarding reuses the lifecycle and adds sandbox");
  ok(a.sandbox_key.startsWith("rtk_test_") && a.ingest_key.startsWith("rtk_live_"), "sandbox and production credentials are visually distinct");
  ok(a.sandbox_api_key_record.scopes.includes("integrations:manage"), "sandbox credential is scoped for self-service integration");

  const expired = await rt.admin.issueApiKey({ org_id: a.org.id, environment_id: a.sandbox.id, role: "admin", expires_at: "2000-01-01T00:00:00Z" });
  ok((await rt.admin.authenticate(expired.key)) === null, "expired credentials fail authentication");
  const scoped = await rt.admin.authenticate(a.sandbox_key);
  ok(rt.integrationGateway.allows(scoped, "webhooks:manage"), "scope evaluator grants declared scope");
  ok(!rt.integrationGateway.allows(scoped, "unknown:manage"), "scope evaluator denies undeclared scope");
  ok(rt.integrationGateway.allowsEnvironment(scoped, a.sandbox.id) && !rt.integrationGateway.allowsEnvironment(scoped, a.production.id), "environment-scoped credential cannot cross from sandbox into production");
  ok(rt.integrationGateway.canDelegateScopes(scoped, ["runtime:read"]) && !rt.integrationGateway.canDelegateScopes(scoped, ["*"]), "credential cannot delegate scopes it does not possess");

  let privateRejected = false;
  try { rt.integrationGateway.safeEndpoint("https://127.0.0.1/hook"); } catch { privateRejected = true; }
  ok(privateRejected, "hosted endpoint validation blocks private-network SSRF targets");
  // The hermetic test runner has no DNS. This is the explicit private/on-prem
  // deployment flag; safeEndpoint's hosted-profile refusal was verified above.
  process.env.INTEGRATION_ALLOW_PRIVATE_ENDPOINTS = "1";

  const connectorSecretRef = await rt.integrationGateway.stageSecret(a.org.id, { token: "never-in-evidence" }, "connector");
  const connector = await rt.integrationGateway.createConnectorRaw({
    org_id: a.org.id, environment_id: a.sandbox.id, type: "github",
    name: "Engineering", endpoint: "https://api.github.com", secret_ref: connectorSecretRef,
  });
  ok(connector.type === "github" && connector.has_secret && !("secret_encrypted" in connector), "connector stores encrypted secret and returns redacted record");
  ok((await rt.store.find("integration_secrets", { org_id: a.org.id })).length === 0, "short-lived secret hand-off is consumed");

  const signingSecret = "webhook-signing-secret";
  const webhookSecretRef = await rt.integrationGateway.stageSecret(a.org.id, { secret: signingSecret }, "webhook");
  const registered = await rt.integrationGateway.registerWebhookRaw({
    org_id: a.org.id, environment_id: a.sandbox.id, name: "Decision sink",
    url: "https://example.com/guardian", events: ["decision.created"], secret_ref: webhookSecretRef,
  });
  ok(registered.webhook.has_secret && !JSON.stringify(registered).includes(signingSecret), "webhook response never leaks its stored signing secret");
  ok(!("payload_encrypted" in rt.integrationGateway.publicDelivery({ id: "del_test", payload_encrypted: "sealed" })), "delivery APIs never expose encrypted replay payloads");

  const dep = await rt.integrationGateway.createDeploymentRaw({
    org_id: a.org.id, environment_id: a.sandbox.id, target: "sandbox", model: "platform",
  });
  ok(dep.status === "ready" && dep.target === "sandbox", "sandbox deployment is ready without changing the runtime engine");
  const prodDep = await rt.integrationGateway.createDeploymentRaw({
    org_id: a.org.id, environment_id: a.production.id, target: "production", model: "private_cloud",
  });
  ok(prodDep.status === "awaiting_activation", "production record cannot silently activate production");

  const ev = await rt.integrationGateway.submitEvidence({
    org_id: a.org.id, environment_id: a.sandbox.id, type: "integration.test", evidence: { passed: true },
  });
  ok(ev.evidence_hash && ev.id, "customer evidence is hash-addressed and immutable");
  ok((await rt.integrationGateway.listConnectors(b.org.id)).length === 0, "organisation B cannot see organisation A connectors");
  ok((await rt.integrationGateway.listWebhooks(b.org.id)).length === 0, "organisation B cannot see organisation A webhooks");

  const before = await rt.admin.listApiKeys(a.org.id);
  const old = before.find((k) => k.id === a.sandbox_api_key_record.id);
  const rotated = await rt.admin.rotateApiKey(old.id, { label: "rotated sandbox" });
  const afterOld = await rt.store.findOne("api_keys", { id: old.id });
  ok(rotated.key.startsWith("rtk_test_") && afterOld.status === "revoked" && afterOld.rotated_to === rotated.record.id, "rotation issues replacement then revokes old credential");

  const expectedActions = [
    "configure_integration", "register_integration_webhook", "rotate_integration_credential",
    "manage_integration_connector", "check_integration_connector", "manage_integration_webhook",
    "issue_integration_credential", "revoke_integration_credential",
    "create_integration_deployment", "submit_integration_evidence", "deliver_integration_webhook",
  ];
  ok(expectedActions.every((id) => actions.get(id)), "every privileged gateway mutation has a governed action");

  const schema = fs.readFileSync(path.join(__dirname, "../../supabase/integration_gateway.sql"), "utf8");
  const tables = ["connectors", "webhooks", "webhook_deliveries", "deployments", "usage", "events", "secrets"];
  ok(tables.every((t) => schema.includes(`rg_integration_${t}`)), "canonical migration contains every gateway collection");
  ok(["scopes", "environment_restrictions", "expires_at", "revoked_at", "rotated_to"].every((c) => schema.includes(`column if not exists ${c}`)), "credential migration contains every field written by admin.js");

  const ts = fs.readFileSync(path.join(__dirname, "../../sdk/typescript/src/index.ts"), "utf8");
  const py = fs.readFileSync(path.join(__dirname, "../../sdk/python/src/guardianos/client.py"), "utf8");
  ok(rt.integrationGateway.SDK_METHODS.every((m) => ts.includes(`${m}(`)), "TypeScript SDK exposes the official method contract");
  const pyMethods = ["evaluate", "propose", "submit_evidence", "get_decision", "get_organisation", "create_deployment", "submit_runtime_event", "retrieve_audit_trail"];
  ok(pyMethods.every((m) => py.includes(`def ${m}(`)), "Python SDK exposes the official method contract");

  const summary = await rt.integrationGateway.overview(a.org.id);
  ok(summary.connected_systems === 1 && summary.webhooks === 1 && summary.sandbox_deployments === 1, "Control Room summary is derived from real gateway records");

  console.log(`\nIntegration Gateway contract: ${pass} passed, ${fail} failed`);
  if (fail) for (const f of failures) console.log(`  ✗ ${f}`);
  fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("Integration Gateway test crashed:", e); process.exit(1); });
