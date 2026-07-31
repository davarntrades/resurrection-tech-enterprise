#!/usr/bin/env node
/* ============================================================================
 * Governed communication connector contract (Gmail first adapter).
 *
 * Hermetic: real Runtime Governance path (integration gateway → ops.proposals →
 * governor → engine) against the mock engine that mirrors operations_rules.py,
 * and the real Gmail connector boundary against a mock Google endpoint. Only
 * the network is faked — no governance decision is stubbed.
 *
 *   1. REGISTERED       the three canonical actions are dispatchable and are
 *                       registered in the governed action catalog.
 *   2. ESCALATE         an unapproved send is BLOCKED by the engine
 *                       (ops_unauthorized_report_delivery), escalates, and
 *                       NO email is sent.
 *   3. APPROVE → PERMIT operator approval is re-evaluated by the engine, the
 *                       permit is issued, and exactly ONE email is delivered.
 *   4. DENY             a denied approval is terminal and sends nothing.
 *   5. DRAFT            a draft is permitted without sign-off and delivers
 *                       nothing.
 *   6. FAIL CLOSED      an unreachable engine sends nothing.
 *   7. AT MOST ONCE     re-advancing / concurrent advances never send twice.
 *   8. APPROVAL BINDING an approval cannot be replayed against a different
 *                       message.
 *   9. ISOLATION        organisation, environment and connector scope hold.
 *  10. EVIDENCE         immutable evidence records connector, org, environment,
 *                       proposal, verdict, latency and the Gmail message id —
 *                       and never the body.
 *  11. HEADER SAFETY    CRLF injection in a recipient or subject is refused.
 *
 *   node scripts/runtime/gmail-connector.test.cjs
 * ============================================================================ */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-gmail-connector-"));
process.env.RUNTIME_LOG_SILENT = "1";
process.env.INTEGRATION_SECRET_KEY = "test-only-gmail-connector-secret-key";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { startMockEngine } = require("../ops/mock-engine.cjs");
const { startMockGmail } = require("./mock-gmail.cjs");

const MAILBOX = "governed@resurrection.tech";
const BODY = "Your governed GuardianOS request has been actioned. No account changes were made.";

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}

function seal(value) {
  const key = crypto.createHash("sha256").update(process.env.INTEGRATION_SECRET_KEY).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const payload = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${payload.toString("base64url")}`;
}

(async () => {
  const engine = await startMockEngine();
  process.env.GOVERNANCE_URL = `http://127.0.0.1:${engine.address().port}`;
  const gmail = await startMockGmail({ mailbox: MAILBOX });
  process.env.INTEGRATION_GMAIL_OAUTH_BASE = gmail.oauthBase;
  process.env.INTEGRATION_GMAIL_API_BASE = gmail.apiBase;

  const rt = require("../../lib/runtime");
  const ops = require("../../lib/ops");
  const gateway = rt.integrationGateway;
  const runs = rt.communicationRuns;
  const adapters = rt.communicationAdapters;

  const org = await rt.store.insert("orgs", { id: "org_gmail", name: "Resurrection Tech" });
  const environment = await rt.store.insert("environments", { id: "env_gmail", org_id: org.id, name: "Production", kind: "production" });
  const otherEnv = await rt.store.insert("environments", { id: "env_gmail_stage", org_id: org.id, name: "Staging", kind: "staging" });
  const connector = await rt.store.insert("integration_connectors", {
    id: "con_gmail", org_id: org.id, environment_id: environment.id, type: "gmail", name: "Enterprise Gmail",
    status: "configured", health: "healthy",
    config: { mailbox: MAILBOX, allowed_recipient_domains: ["example.com"] },
    secret_encrypted: seal({ client_id: "cid", client_secret: "csecret", refresh_token: "rtoken" }),
  });
  const otherConnector = await rt.store.insert("integration_connectors", {
    id: "con_gmail_stage", org_id: org.id, environment_id: otherEnv.id, type: "gmail", name: "Staging Gmail",
    status: "configured", health: "healthy",
    config: { mailbox: MAILBOX, allowed_recipient_domains: ["example.com"] },
    secret_encrypted: seal({ client_id: "cid", client_secret: "csecret", refresh_token: "rtoken" }),
  });

  await test("Validate can promote a newly configured unknown connector to healthy", async () => {
    await rt.store.update("integration_connectors", connector.id, {
      health: "unknown", last_checked_at: null, last_error: null,
    });
    const tokenRequestsBefore = gmail.state.tokenRequests;
    const result = await gateway.checkCommunicationHealthRaw({
      org_id: org.id, environment_id: environment.id, connector_id: connector.id, connector_type: "gmail",
    });
    assert.equal(result.ok, true);
    assert.equal(result.mailbox, MAILBOX);
    assert.equal(gmail.state.tokenRequests, tokenRequestsBefore + 1, "the stored OAuth credential must be decrypted and exchanged");
    const persisted = await rt.store.findOne("integration_connectors", { id: connector.id });
    assert.equal(persisted.health, "healthy");
    assert.ok(persisted.last_checked_at, "successful validation must persist its timestamp");
    assert.equal(persisted.last_error, null);
  });

  await test("Validate persists a failed health state and exact provider reason", async () => {
    const invalid = await rt.store.insert("integration_connectors", {
      id: "con_gmail_invalid", org_id: org.id, environment_id: environment.id,
      type: "gmail", name: "Invalid Gmail", status: "configured", health: "unknown",
      config: { mailbox: MAILBOX, capabilities: ["read"] },
      secret_encrypted: seal({ client_id: "cid", client_secret: "csecret", refresh_token: "invalid-refresh-token" }),
    });
    const result = await gateway.checkCommunicationHealthRaw({
      org_id: org.id, environment_id: environment.id, connector_id: invalid.id, connector_type: "gmail",
    }, {
      fetch: async () => new Response(JSON.stringify({
        error: { message: "invalid_grant: refresh token expired or revoked" },
      }), { status: 400, headers: { "content-type": "application/json" } }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "GMAIL_TOKEN_REFUSED");
    assert.match(result.error, /invalid_grant: refresh token expired or revoked/);
    const persisted = await rt.store.findOne("integration_connectors", { id: invalid.id });
    assert.equal(persisted.health, "down");
    assert.ok(persisted.last_checked_at, "failed validation must persist its timestamp");
    assert.match(persisted.last_error, /GMAIL_TOKEN_REFUSED: invalid_grant: refresh token expired or revoked/);
  });

  const message = (overrides = {}) => ({ to: ["customer@example.com"], subject: "Governed reply", body: BODY, ...overrides });
  const create = (overrides = {}) => runs.createRun({
    org_id: org.id, environment_id: environment.id, connector_id: connector.id,
    action_id: "gmail.send_email", source_type: "rest_api", actor: "communication_gateway",
    message: message(), idempotency_key: `gmail-${crypto.randomUUID()}`, ...overrides,
  });

  await test("the three canonical actions are dispatchable and governed", async () => {
    const dispatchable = adapters.listActions().map((item) => item.action_id);
    for (const action_id of ["gmail.send_email", "gmail.reply_email", "gmail.create_draft"]) {
      assert.ok(dispatchable.includes(action_id), `${action_id} must be dispatchable`);
      const entry = ops.actions.get(action_id);
      assert.ok(entry, `${action_id} must be registered in the governed action catalog`);
      assert.equal(entry.refuse, undefined);
    }
    assert.equal(ops.actions.get("gmail.send_email").tool, "email_report");
    assert.equal(ops.actions.get("gmail.reply_email").tool, "send_report");
    assert.equal(ops.actions.get("gmail.create_draft").tool, "prepare_draft_reply");
    assert.equal(ops.actions.autoExecutable(ops.actions.get("gmail.send_email")), false, "a delivering action must never auto-execute");
    assert.equal(ops.actions.autoExecutable(ops.actions.get("gmail.create_draft")), true);
  });

  await test("an unapproved send is blocked by Ω, escalates, and sends no email", async () => {
    const before = gmail.state.sent.length;
    const created = await create();
    const run = await runs.advanceRun(created.id, org.id, gateway);
    assert.equal(run.status, "awaiting_approval");
    assert.equal(run.approval_status, "pending");
    assert.equal(run.provider_invocation_count, 0);
    assert.equal(run.provider_called, false);
    assert.equal(run.delivered, false);
    assert.equal(gmail.state.sent.length, before, "NO email may be sent while a decision is escalated");
    const proposal = await ops.proposals.get(run.proposal_id);
    assert.equal(proposal.status, "escalated");
    assert.equal(proposal.decision.rule, "ops_unauthorized_report_delivery");
  });

  let approvedRun;
  await test("operator approval is re-evaluated by the engine and delivers exactly one email", async () => {
    const before = gmail.state.sent.length;
    const created = await create();
    let run = await runs.advanceRun(created.id, org.id, gateway);
    assert.equal(run.status, "awaiting_approval");
    const approved = await ops.proposals.approve(run.proposal_id, { actor: "operator@resurrection.tech" });
    assert.equal(approved.status, "executed", "the engine must issue the permit on re-evaluation");
    run = await runs.advanceRun(created.id, org.id, gateway);
    assert.equal(run.status, "completed");
    assert.equal(run.approval_status, "approved_and_executed");
    assert.equal(run.provider_invocation_count, 1);
    assert.equal(run.delivered, true);
    assert.ok(run.message_id, "the Gmail message id must be recorded");
    assert.ok(Number.isFinite(Number(run.provider_latency_ms)), "provider latency must be recorded");
    assert.ok(Number.isFinite(Number(run.governance_latency_ms)), "governance latency must be recorded");
    assert.equal(gmail.state.sent.length, before + 1, "exactly one email");
    approvedRun = run;
  });

  await test("re-advancing an executed run never sends a second email", async () => {
    const before = gmail.state.sent.length;
    await Promise.all([1, 2, 3].map(() => runs.advanceRun(approvedRun.id, org.id, gateway)));
    assert.equal(gmail.state.sent.length, before, "polling or retry must not resend");
    const run = await runs.getRun(approvedRun.id, org.id);
    assert.equal(run.provider_invocation_count, 1);
  });

  await test("a denied approval is terminal and sends nothing", async () => {
    const before = gmail.state.sent.length;
    const created = await create();
    let run = await runs.advanceRun(created.id, org.id, gateway);
    await ops.proposals.deny(run.proposal_id, { actor: "operator@resurrection.tech", note: "not authorised" });
    run = await runs.advanceRun(created.id, org.id, gateway);
    assert.equal(run.status, "rejected");
    assert.equal(run.approval_status, "rejected");
    assert.equal(run.provider_invocation_count, 0);
    assert.equal(gmail.state.sent.length, before, "a denial must never reach the provider");
  });

  await test("a draft is permitted without sign-off and delivers nothing", async () => {
    const sentBefore = gmail.state.sent.length;
    const draftsBefore = gmail.state.drafts.length;
    const created = await create({ action_id: "gmail.create_draft" });
    const run = await runs.advanceRun(created.id, org.id, gateway);
    assert.equal(run.status, "completed", run.safe_failure_reason || "draft should complete");
    assert.equal(run.governance_decision, "executed");
    assert.equal(run.delivered, false, "a draft delivers nothing");
    assert.ok(run.draft_id, "the Gmail draft id must be recorded");
    assert.equal(gmail.state.drafts.length, draftsBefore + 1);
    assert.equal(gmail.state.sent.length, sentBefore, "creating a draft must not send mail");
  });

  await test("an unreachable Runtime Governance engine fails closed", async () => {
    const before = gmail.state.sent.length;
    const engineModule = require("../../lib/runtime/engine");
    const realEvaluate = engineModule.evaluate;
    engineModule.evaluate = async () => ({ ok: false, error: "connection refused" });
    try {
      const created = await create({ action_id: "gmail.create_draft" });
      const run = await runs.advanceRun(created.id, org.id, gateway);
      assert.equal(run.status, "blocked");
      assert.equal(run.provider_invocation_count, 0);
      assert.equal(gmail.state.sent.length, before, "no message may be sent while governance is unavailable");
    } finally {
      engineModule.evaluate = realEvaluate;
    }
  });

  await test("an approval cannot be replayed against a different message", async () => {
    const created = await create();
    const run = await runs.advanceRun(created.id, org.id, gateway);
    await ops.proposals.approve(run.proposal_id, { actor: "operator@resurrection.tech" });
    const before = gmail.state.sent.length;
    await assert.rejects(
      () => gateway.executeApprovedCommunication({
        org_id: org.id, environment_id: environment.id, connector_id: connector.id,
        action_id: "gmail.send_email", proposal_id: run.proposal_id,
        message: message({ to: ["attacker@example.com"] }), actor: "operator@resurrection.tech",
      }),
      /does not match the message/,
    );
    assert.equal(gmail.state.sent.length, before, "a rebound approval must never reach the provider");
  });

  await test("organisation, environment and connector scope hold", async () => {
    await assert.rejects(() => create({ connector_id: otherConnector.id }), /not found for this organisation and environment/);
    await assert.rejects(() => create({ connector_id: "con_missing" }), /not found for this organisation and environment/);
    assert.equal(await runs.getRun(approvedRun.id, "org_other"), null, "another organisation cannot read the run");
    await assert.rejects(() => create({ message: message({ to: ["someone@not-allowed.test"] }) }), /not permitted for this connector/);
  });

  await test("immutable evidence records the governed chain and never the body", async () => {
    const events = await rt.store.findOptional("integration_events", { org_id: org.id });
    const sent = events.filter((item) => item.type === "communication.message.sent.approved");
    assert.ok(sent.length >= 1, "an approved send must record evidence");
    const record = sent[sent.length - 1];
    assert.equal(record.immutable, true);
    assert.equal(record.org_id, org.id);
    assert.equal(record.environment_id, environment.id);
    assert.equal(record.evidence.connector_id, connector.id);
    assert.equal(record.evidence.provider, "gmail");
    assert.equal(record.evidence.channel, "email");
    assert.ok(record.evidence.proposal_id, "evidence must carry the proposal id");
    assert.ok(record.evidence.gmail_message_id, "evidence must carry the Gmail message id");
    const blob = JSON.stringify(events);
    assert.ok(!blob.includes(BODY), "no message body may appear in evidence");
    assert.ok(!blob.includes("rtoken"), "no credential may appear in evidence");
  });

  await test("header injection in a recipient or subject is refused before governance", async () => {
    await assert.rejects(() => create({ message: message({ subject: "Hi\r\nBcc: attacker@example.com" }) }), /control characters|invalid/i);
    await assert.rejects(() => create({ message: message({ to: ["ok@example.com\r\nBcc: attacker@example.com"] }) }), /control characters|invalid/i);
  });

  await test("a modified recipient, subject or body after approval all fail closed", async () => {
    const created = await create();
    const run = await runs.advanceRun(created.id, org.id, gateway);
    await ops.proposals.approve(run.proposal_id, { actor: "operator@resurrection.tech" });
    const before = gmail.state.sent.length;
    const tampered = [
      ["recipient", message({ to: ["attacker@example.com"] })],
      ["subject", message({ subject: "Different subject" })],
      ["body", message({ body: "Different body entirely." })],
      ["extra bcc", message({ bcc: ["silent@example.com"] })],
    ];
    for (const [label, payload] of tampered) {
      await assert.rejects(
        () => gateway.executeApprovedCommunication({
          org_id: org.id, environment_id: environment.id, connector_id: connector.id,
          action_id: "gmail.send_email", proposal_id: run.proposal_id,
          message: payload, actor: "operator@resurrection.tech",
        }),
        /does not match the message/,
        `a modified ${label} must fail closed`,
      );
    }
    assert.equal(gmail.state.sent.length, before, "no tampered message may reach the provider");
  });

  await test("no ungoverned path can reach the provider (structural invariant)", () => {
    // The narrowed gmail.test.cjs invariant only holds if provider execution is
    // reachable from exactly two places, both of which gate on an EXECUTED
    // proposal. Pin that structurally so a refactor cannot add a third.
    const root = path.join(__dirname, "../..");
    const scanned = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(js|ts|tsx|cjs)$/.test(entry.name)) scanned.push(full);
      }
    };
    for (const dir of ["lib", "app"]) walk(path.join(root, dir));
    const ALLOWED = new Set(["lib/runtime/integration-gateway.js", "lib/runtime/communication-approved-send.js"]);
    const offenders = scanned.filter((file) => {
      const rel = path.relative(root, file);
      if (ALLOWED.has(rel)) return false;
      const source = fs.readFileSync(file, "utf8");
      return /adapters\.execute\s*\(|communicationExecute|\.createDraft\s*\(/.test(source)
        || /require\(["'][^"']*connectors\/gmail["']\)[\s\S]{0,200}?\.(send|reply|createDraft)\s*\(/.test(source);
    }).map((file) => path.relative(root, file));
    assert.deepEqual(offenders, [], "only the two governed call sites may reach provider execution");

    const gatewaySource = fs.readFileSync(path.join(root, "lib/runtime/integration-gateway.js"), "utf8");
    const send = gatewaySource.split("async function sendCommunication")[1].split("\nasync function")[0];
    assert.ok(send.indexOf("if (!executed(proposal))") < send.indexOf("adapters.execute"),
      "sendCommunication must reject a non-executed proposal BEFORE reaching the provider");

    // Catalog executors for email-mutating actions authorize only — they must
    // not themselves be able to produce a delivery.
    for (const action_id of ["gmail.send_email", "gmail.reply_email", "gmail.create_draft"]) {
      const source = String(ops.actions.CATALOG[action_id].execute);
      assert.ok(!/adapters\.execute|\.send\(|createDraft/.test(source), `${action_id} executor must authorize only`);
    }
  });

  await test("governed reads are permitted, evidenced, and match the Bedrock posture", async () => {
    for (const action_id of ["gmail.list_messages", "gmail.read_message"]) {
      const entry = ops.actions.get(action_id);
      assert.ok(entry, `${action_id} must be registered`);
      assert.equal(entry.risk, "medium", "read posture must match invoke_aws_bedrock_model");
      assert.equal(ops.actions.autoExecutable(entry), true, "a permitted read auto-executes, like Bedrock");
    }
    const listed = await gateway.readCommunication({
      org_id: org.id, environment_id: environment.id, connector_id: connector.id,
      action_id: "gmail.list_messages", canonical_action: { action_id: "gmail.list_messages" },
      request: { query: "in:inbox", max_results: 10 }, actor: "communication_gateway",
    });
    assert.equal(listed.ok, true, listed.error || "listing should be permitted");
    assert.equal(listed.governance.status, "executed");
    assert.ok(listed.governance.proposal_id, "a read must create a proposal");
    assert.equal(listed.message_count, 1);
    assert.equal(listed.messages[0].subject, "Quarterly governance review");
    assert.ok(listed.evidence && listed.evidence.id, "a read must record immutable evidence");
    assert.ok(Number.isFinite(Number(listed.provider_latency_ms)));

    const read = await gateway.readCommunication({
      org_id: org.id, environment_id: environment.id, connector_id: connector.id,
      action_id: "gmail.read_message", canonical_action: { action_id: "gmail.read_message" },
      request: { message_id: "gmailmsg_inbox_1", include_body: true }, actor: "communication_gateway",
    });
    assert.equal(read.ok, true, read.error || "reading should be permitted");
    assert.equal(read.message.body, "Full inbound body text.");
    assert.ok(read.evidence.id);
  });

  await test("a blocked or unavailable engine stops a read before Google", async () => {
    const engineModule = require("../../lib/runtime/engine");
    const realEvaluate = engineModule.evaluate;
    engineModule.evaluate = async () => ({ ok: false, error: "connection refused" });
    try {
      const result = await gateway.readCommunication({
        org_id: org.id, environment_id: environment.id, connector_id: connector.id,
        action_id: "gmail.list_messages", canonical_action: { action_id: "gmail.list_messages" },
        request: { query: "in:inbox" }, actor: "communication_gateway",
      });
      assert.equal(result.ok, false);
      assert.equal(result.code, "GOVERNANCE_BLOCKED");
      assert.ok(!result.messages, "no mailbox data may be returned without a permit");
    } finally { engineModule.evaluate = realEvaluate; }
  });

  await test("read evidence carries ids and counts but never message content", async () => {
    const events = await rt.store.findOptional("integration_events", { org_id: org.id });
    const reads = events.filter((item) => item.type === "communication.mailbox.read");
    assert.ok(reads.length >= 2, "each governed read records evidence");
    const blob = JSON.stringify(reads);
    assert.ok(!blob.includes("Full inbound body text."), "no message body may enter evidence");
    assert.ok(!blob.includes("Quarterly governance review"), "no subject line may enter evidence");
    assert.ok(reads.every((item) => item.immutable === true && item.evidence.proposal_id));
  });

  await test("a connector without the read capability refuses reads", async () => {
    const sendOnly = await rt.store.insert("integration_connectors", {
      id: "con_gmail_sendonly", org_id: org.id, environment_id: environment.id, type: "gmail", name: "Send only",
      status: "configured", health: "healthy",
      config: { mailbox: MAILBOX, capabilities: ["send"] },
      secret_encrypted: seal({ client_id: "cid", client_secret: "csecret", refresh_token: "rtoken" }),
    });
    const result = await gateway.readCommunication({
      org_id: org.id, environment_id: environment.id, connector_id: sendOnly.id,
      action_id: "gmail.list_messages", canonical_action: { action_id: "gmail.list_messages" },
      request: { query: "in:inbox" }, actor: "communication_gateway",
    }).catch((error) => ({ ok: false, error: error.message }));
    assert.equal(result.ok, false);
    assert.match(String(result.error), /not configured to list/);
  });

  await test("Gmail is offered by the Integration Gateway admin UI", () => {
    // The connector-type dropdown is driven by CONNECTOR_DEFINITIONS, so Gmail
    // must be registered there or the option silently disappears.
    const definitions = gateway.CONNECTOR_DEFINITIONS.map((d) => d.id);
    assert.ok(definitions.includes("gmail"), "gmail must be a registered connector type");
    const root = path.join(__dirname, "../..");
    const panel = fs.readFileSync(path.join(root, "components/admin/IntegrationGatewayPanel.tsx"), "utf8");
    for (const field of ["Sender mailbox", "Allowed recipient domains", "OAuth client ID", "OAuth client secret", "Refresh token", "Capabilities"]) {
      assert.ok(panel.includes(field), `the Gmail form must expose ${field}`);
    }
    for (const operation of ["gmail.credentials.check", "gmail.credentials.rotate", "gmail.credentials.revoke", "connector.status"]) {
      assert.ok(panel.includes(operation), `the Gmail panel must expose ${operation}`);
    }
    // The generic HTTPS endpoint field must NOT render for Gmail.
    assert.ok(/type !== "aws-bedrock" && type !== "gmail"\)\) && <label/.test(panel),
      "the generic HTTPS endpoint field must be suppressed for Gmail");
    // Credentials must be cleared from client state after submit.
    assert.ok(panel.includes("clearGmailSecrets"), "Gmail credentials must be cleared from component state on submit");
    // Exactly one Gmail administration path: the route is a thin wrapper.
    const route = fs.readFileSync(path.join(root, "app/runtime/admin/integration-gateway/page.tsx"), "utf8");
    assert.ok(route.includes("RuntimeAdminClient"), "the route must reuse the shared console, not duplicate it");
    assert.ok(!/client_secret|refresh_token/.test(route), "the route must not implement its own credential form");
  });

  await test("provisioning refuses an incomplete OAuth credential", async () => {
    const connectors = require("../../lib/runtime/connectors/gmail");
    assert.throws(() => connectors.validateConfiguration({ mailbox: MAILBOX }, { client_id: "a", client_secret: "b" }), /refresh_token is required/);
    assert.throws(() => connectors.validateConfiguration({ mailbox: MAILBOX }, {}), /client_id is required/);
    assert.throws(() => connectors.validateConfiguration({ mailbox: "not-an-email" }, { client_id: "a", client_secret: "b", refresh_token: "c" }), /valid Gmail mailbox/);
    await assert.rejects(
      () => gateway.createConnectorRaw({ org_id: org.id, environment_id: environment.id, type: "gmail", name: "Half provisioned", config: { mailbox: MAILBOX } }),
      /client_id is required/,
      "a Gmail connector must not be creatable without a complete credential",
    );
  });

  await test("no OAuth secret material can reach a connector's public configuration", async () => {
    const connectors = require("../../lib/runtime/connectors/gmail");
    const config = connectors.publicConfiguration({
      mailbox: MAILBOX, allowed_recipient_domains: ["example.com"],
      client_id: "leaked-client", client_secret: "leaked-secret", refresh_token: "leaked-token",
    });
    const blob = JSON.stringify(config);
    for (const secret of ["leaked-client", "leaked-secret", "leaked-token"]) {
      assert.ok(!blob.includes(secret), `${secret} must never appear in a public connector configuration`);
    }
    assert.deepEqual(config.required_scopes.sort(), [connectors.COMPOSE_SCOPE, connectors.READ_SCOPE, connectors.SEND_SCOPE].sort());
    // Least privilege is real: a narrowed connector asks for fewer scopes.
    assert.deepEqual(connectors.publicConfiguration({ mailbox: MAILBOX, capabilities: ["draft"] }).required_scopes, [connectors.COMPOSE_SCOPE]);
    assert.deepEqual(connectors.publicConfiguration({ mailbox: MAILBOX, capabilities: ["list", "read"] }).required_scopes, [connectors.READ_SCOPE]);
    const projected = await rt.store.findOptional("integration_connectors", { org_id: org.id });
    const rowBlob = JSON.stringify(projected.map((row) => row.config));
    assert.ok(!rowBlob.includes("rtoken"), "no refresh token may be stored in a connector config column");
  });

  await test("credential rotation validates live and binds to the configured mailbox", async () => {
    const ref = await gateway.stageSecret(org.id, { client_id: "cid2", client_secret: "csecret2", refresh_token: "rtoken2" }, "gmail");
    const rotated = await gateway.rotateGmailCredentialsRaw({
      org_id: org.id, environment_id: environment.id, connector_id: connector.id, secret_ref: ref.secret_ref || ref.id || ref,
    });
    assert.equal(rotated.health, "healthy");
    assert.ok(rotated.config.credential_rotated_at, "rotation must be timestamped");
    assert.equal(rotated.has_secret, true);
    assert.ok(gmail.state.revoked.includes("rtoken"), "the superseded refresh token must be revoked at Google");
    const blob = JSON.stringify(rotated);
    assert.ok(!blob.includes("rtoken2") && !blob.includes("csecret2"), "rotation must not echo the new credential");
  });

  await test("revocation drops the ciphertext and disables the connector", async () => {
    const doomed = await rt.store.insert("integration_connectors", {
      id: "con_gmail_revoke", org_id: org.id, environment_id: environment.id, type: "gmail", name: "Decommission",
      status: "configured", health: "healthy", config: { mailbox: MAILBOX },
      secret_encrypted: seal({ client_id: "cid", client_secret: "csecret", refresh_token: "rtoken-doomed" }),
    });
    const result = await gateway.revokeGmailCredentialsRaw({ org_id: org.id, connector_id: doomed.id });
    assert.equal(result.revoked, true);
    assert.equal(result.status, "disabled");
    assert.equal(result.has_secret, false, "the stored ciphertext must be dropped");
    assert.ok(gmail.state.revoked.includes("rtoken-doomed"), "the token must be revoked at Google");
    const row = await rt.store.findOne("integration_connectors", { id: doomed.id });
    assert.equal(row.secret_encrypted, null);
    await assert.rejects(() => runs.createRun({
      org_id: org.id, environment_id: environment.id, connector_id: doomed.id,
      action_id: "gmail.send_email", message: message(), idempotency_key: `revoked-${crypto.randomUUID()}`,
    }), /enabled and healthy/, "a revoked connector must be unusable");
  });

  await test("a draft-only connector cannot deliver even with an approval", async () => {
    const sandbox = await rt.store.insert("integration_connectors", {
      id: "con_gmail_sandbox", org_id: org.id, environment_id: environment.id, type: "gmail", name: "Sandbox Gmail",
      status: "configured", health: "healthy",
      config: { mailbox: MAILBOX, allowed_recipient_domains: ["example.com"], capabilities: ["draft"] },
      secret_encrypted: seal({ client_id: "cid", client_secret: "csecret", refresh_token: "rtoken" }),
    });
    const before = gmail.state.sent.length;
    await assert.rejects(() => runs.createRun({
      org_id: org.id, environment_id: environment.id, connector_id: sandbox.id,
      action_id: "gmail.send_email", message: message(), idempotency_key: `sandbox-${crypto.randomUUID()}`,
    }), /not configured to send/, "a draft-only connector must refuse a send before governance");
    assert.equal(gmail.state.sent.length, before);
    const drafted = await runs.createRun({
      org_id: org.id, environment_id: environment.id, connector_id: sandbox.id,
      action_id: "gmail.create_draft", message: message(), idempotency_key: `sandbox-draft-${crypto.randomUUID()}`,
    });
    const run = await runs.advanceRun(drafted.id, org.id, gateway);
    assert.equal(run.status, "completed", run.safe_failure_reason || "the draft capability must still work");
  });

  engine.close();
  gmail.close();
  console.log(`\n${passed} governed communication connector tests passed.`);
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
