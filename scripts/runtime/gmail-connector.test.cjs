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

  engine.close();
  gmail.close();
  console.log(`\n${passed} governed communication connector tests passed.`);
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
