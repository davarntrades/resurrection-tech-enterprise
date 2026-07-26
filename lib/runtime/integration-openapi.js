"use strict";

function document(baseUrl = "https://resurrection-tech.com") {
  const json = (schema = { type: "object" }) => ({ "application/json": { schema } });
  const secured = [{ bearerAuth: [] }];
  return {
    openapi: "3.1.0",
    info: {
      title: "GuardianOS Integration Gateway API",
      version: "1.0.0",
      description: "Enterprise onboarding API around the existing GuardianOS Runtime Governance platform. Runtime Governance remains final decision authority.",
    },
    servers: [{ url: baseUrl.replace(/\/$/, "") }],
    security: secured,
    tags: [
      { name: "Runtime", description: "Existing Runtime Governance APIs (reused, not duplicated)." },
      { name: "Gateway", description: "Organisation-scoped integration management." },
      { name: "AWS Bedrock", description: "Governed Amazon Bedrock Runtime and Agent action-group adapter." },
    ],
    paths: {
      "/api/runtime/evaluate": {
        post: { tags: ["Runtime"], operationId: "evaluate", summary: "Evaluate a trajectory through Runtime Governance", requestBody: { required: true, content: json({ type: "object", required: ["trajectory"], properties: { trajectory: { type: "array", items: { type: "object" } }, domains: { type: "array", items: { type: "string" } }, correlation_id: { type: "string" } } }) }, responses: { "200": { description: "Governance decision", content: json() }, "401": { $ref: "#/components/responses/Unauthorized" }, "429": { $ref: "#/components/responses/RateLimited" } } },
      },
      "/api/integration/v1/organisation": {
        get: { tags: ["Gateway"], operationId: "getOrganisation", summary: "Get the authenticated organisation and connected environments", responses: { "200": { description: "Organisation boundary", content: json() }, "401": { $ref: "#/components/responses/Unauthorized" } } },
      },
      "/api/integration/v1/connectors": {
        get: { tags: ["Gateway"], operationId: "listConnectors", summary: "List connector instances and definitions", responses: { "200": { description: "Connectors", content: json() } } },
        post: { tags: ["Gateway"], operationId: "createConnector", summary: "Configure a connector through governed execution", responses: { "200": { description: "Connector configured" }, "202": { description: "Awaiting governed approval" }, "403": { description: "Blocked by Runtime Governance" } } },
      },
      "/api/integration/v1/webhooks": {
        get: { tags: ["Gateway"], operationId: "listWebhooks", summary: "List webhooks and delivery history", responses: { "200": { description: "Webhooks", content: json() } } },
        post: { tags: ["Gateway"], operationId: "registerWebhook", summary: "Register a signed webhook through governed execution", responses: { "200": { description: "Webhook and one-time signing secret" }, "202": { description: "Awaiting governed approval" } } },
      },
      "/api/integration/v1/credentials": {
        get: { tags: ["Gateway"], operationId: "listCredentials", summary: "List redacted organisation credentials", responses: { "200": { description: "Credential metadata", content: json() } } },
        post: { tags: ["Gateway"], operationId: "manageCredential", summary: "Issue, rotate or revoke a governed scoped credential", responses: { "200": { description: "Credential operation completed; plaintext shown once when applicable" }, "202": { description: "Awaiting governed approval" } } },
      },
      "/api/integration/v1/deployments": {
        get: { tags: ["Gateway"], operationId: "listDeployments", summary: "List sandbox and production deployment records", responses: { "200": { description: "Deployments", content: json() } } },
        post: { tags: ["Gateway"], operationId: "createDeployment", summary: "Create a governed deployment record", responses: { "200": { description: "Deployment record created" }, "202": { description: "Awaiting governed approval" } } },
      },
      "/api/integration/v1/evidence": {
        get: { tags: ["Gateway"], operationId: "retrieveAuditTrail", summary: "Retrieve runtime decisions and integration evidence", responses: { "200": { description: "Organisation-scoped audit trail", content: json() } } },
        post: { tags: ["Gateway"], operationId: "submitEvidence", summary: "Submit immutable evidence through Runtime Governance", responses: { "200": { description: "Evidence recorded" }, "403": { description: "Blocked by Runtime Governance" } } },
      },
      "/api/integration/v1/decisions/{id}": {
        get: { tags: ["Gateway"], operationId: "getDecision", summary: "Retrieve one organisation-scoped decision", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Decision", content: json() }, "404": { description: "Not found or outside organisation boundary" } } },
      },
      "/api/integration/v1/health": {
        get: { tags: ["Gateway"], operationId: "getIntegrationHealth", summary: "Get runtime and integration health", responses: { "200": { description: "Health and usage metrics", content: json() } } },
      },
      "/api/integration/v1/sandbox": {
        get: { tags: ["Gateway"], operationId: "getSandboxQuickstart", summary: "Get the organisation sandbox, sample policies and examples", responses: { "200": { description: "Sandbox starter kit", content: json() }, "404": { description: "Credential is not authorised for a sandbox" } } },
      },
      "/api/integration/v1/bedrock": {
        get: { tags: ["AWS Bedrock"], operationId: "getBedrockHealth", summary: "Get redacted Bedrock connector health and activity", responses: { "200": { description: "Organisation-scoped Bedrock connectors", content: json() } } },
        post: {
          tags: ["AWS Bedrock"], operationId: "bedrockOperation",
          summary: "Invoke a Bedrock model, govern an Agent action group, validate credentials or rotate credentials",
          requestBody: { required: true, content: json({ type: "object", required: ["operation", "connector_id", "environment_id"], properties: {
            operation: { type: "string", enum: ["invoke", "action_group", "validate", "rotate_credentials"] },
            connector_id: { type: "string" }, environment_id: { type: "string" },
            request: { type: "object" }, event: { type: "object" }, credentials: { type: "object", writeOnly: true },
          } }) },
          responses: {
            "200": { description: "Governed operation completed", content: json() },
            "202": { description: "Runtime Governance escalation remains unresolved; AWS was not called", content: json() },
            "403": { description: "Blocked by Runtime Governance; AWS was not called", content: json() },
          },
        },
      },
    },
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "GuardianOS API key" } },
      responses: {
        Unauthorized: { description: "Missing, invalid, expired or revoked credential" },
        RateLimited: { description: "Rate limit exceeded; retry after the response interval" },
      },
    },
  };
}

module.exports = { document };
