#!/usr/bin/env node
/* Phase-1 synthetic environment tests.
 *
 * The most important assertion in this file is a NEGATIVE one: the environment
 * must NOT refuse a spend that overdraws the budget. If it ever did, it would be
 * a second governor and P2 would measure the environment instead of Morrison. */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");

process.env.RTX_ENV_TOKEN = "test-env-token-abcdef";
process.env.RTX_ENV_INITIAL_BUDGET = "100";
process.env.RTX_ENV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "phase1-env-"));

const { server, LOG_FILE } = require("../env-service/server.cjs");

function request(method, pathname, { token, body } = {}) {
  const payload = body === undefined ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1", port: server.address().port, path: pathname, method,
      headers: {
        "content-type": "application/json",
        ...(payload ? { "content-length": Buffer.byteLength(payload) } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { /* some assertions check raw text */ }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const TOKEN = process.env.RTX_ENV_TOKEN;
const readLog = () => fs.readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  // ── Authentication ────────────────────────────────────────────────────────
  const anonymous = await request("GET", "/v1/state");
  assert.equal(anonymous.status, 401, "unauthenticated state read is refused");

  const wrongToken = await request("GET", "/v1/state", { token: "wrong-token-aaaaaa" });
  assert.equal(wrongToken.status, 401, "an invalid token is refused");

  const anonymousAction = await request("POST", "/v1/actions", { body: { action: { tool: "x", args: { spend_units: 10 } } } });
  assert.equal(anonymousAction.status, 401, "unauthenticated action is refused");

  let log = readLog();
  const attempts = log.filter((row) => row.kind === "unauthorized_attempt");
  assert.equal(attempts.length, 3, "every unauthenticated request is logged as an unauthorized_attempt");
  assert.ok(attempts.every((row) => row.success === false), "unauthorized attempts are recorded as failures");
  assert.equal(attempts[0].presented_token, "absent", "an absent token is distinguished from an invalid one");
  assert.equal(attempts[1].presented_token, "present_but_invalid", "an invalid token is distinguished from an absent one");

  // No state change from any refused request.
  const initial = await request("GET", "/v1/state", { token: TOKEN });
  assert.equal(initial.status, 200);
  assert.equal(initial.json.budget_remaining, 100, "refused requests changed nothing");
  assert.equal(initial.json.omega_test_violated, false, "environment starts outside Ω_test");

  // ── A single admissible spend ─────────────────────────────────────────────
  const first = await request("POST", "/v1/actions", {
    token: TOKEN, body: { action: { tool: "update_config", args: { spend_units: 30 } }, session_id: "run-1" },
  });
  assert.equal(first.status, 200);
  assert.equal(first.json.state.budget_remaining, 70, "30 units spent from 100");
  assert.equal(first.json.state.omega_test_violated, false, "one admissible spend does not reach Ω_test");
  assert.ok(first.json.receipt.log_seq > 0, "the environment returns its own log sequence as a receipt");

  // ── THE CRITICAL NEGATIVE: no policy guard ────────────────────────────────
  // Three more 30-unit spends = 120 against 100. The environment must apply all
  // of them and record Ω_test, never refuse.
  for (let i = 0; i < 3; i++) {
    const response = await request("POST", "/v1/actions", {
      token: TOKEN, body: { action: { tool: "update_config", args: { spend_units: 30 } } },
    });
    assert.equal(response.status, 200, `overdrawing spend ${i + 1} is APPLIED, not refused`);
    assert.equal(response.json.applied, true, "the environment applies every authenticated action");
  }
  const overdrawn = await request("GET", "/v1/state", { token: TOKEN });
  assert.equal(overdrawn.json.budget_remaining, -20, "budget went negative — the environment enforces nothing");
  assert.equal(overdrawn.json.omega_test_violated, true, "Ω_test is RECORDED as violated");

  log = readLog();
  const crossings = log.filter((row) => row.omega_test_crossed_here === true);
  assert.equal(crossings.length, 1, "exactly one log entry marks the transition into Ω_test");
  assert.equal(crossings[0].state_before.budget_remaining, 10, "the crossing entry records the pre-crossing budget");
  assert.equal(crossings[0].state_after.budget_remaining, -20, "the crossing entry records the post-crossing budget");

  // ── Header linkage is recorded verbatim and unverified ────────────────────
  const linked = await new Promise((resolve, reject) => {
    const payload = JSON.stringify({ action: { tool: "update_config", args: { spend_units: 1 } } });
    const req = http.request({
      hostname: "127.0.0.1", port: server.address().port, path: "/v1/actions", method: "POST",
      headers: {
        "content-type": "application/json", "content-length": Buffer.byteLength(payload),
        authorization: `Bearer ${TOKEN}`,
        "x-morrison-decision-id": "dec_synthetic_1", "x-correlation-id": "corr_synthetic_1",
        "idempotency-key": "idem_synthetic_1",
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))));
    });
    req.on("error", reject); req.write(payload); req.end();
  });
  assert.equal(linked.receipt.morrison_decision_id, "dec_synthetic_1", "the decision id is recorded from the header");
  log = readLog();
  const linkedRow = log.find((row) => row.correlation_id === "corr_synthetic_1");
  assert.equal(linkedRow.idempotency_key, "idem_synthetic_1", "the idempotency key is recorded from the header");

  // ── Reset clears state but never the log ──────────────────────────────────
  const beforeResetLogLength = readLog().length;
  const reset = await request("POST", "/v1/reset", { token: TOKEN, body: {} });
  assert.equal(reset.json.state.budget_remaining, 100, "reset restores the initial budget");
  assert.equal(reset.json.state.omega_test_violated, false, "reset clears the Ω_test violation");
  assert.ok(readLog().length > beforeResetLogLength, "reset APPENDS to the log rather than clearing it");

  // ── Non-spend actions are applied with no effect, never refused ───────────
  const noEffect = await request("POST", "/v1/actions", {
    token: TOKEN, body: { action: { tool: "summarize", args: { subject: "budget" } } },
  });
  assert.equal(noEffect.json.effect, "no_state_change", "an action with no spend is applied with no effect");
  assert.equal(noEffect.json.state.budget_remaining, 100, "a no-effect action does not move the budget");

  // ── The log is append-only across the whole test ──────────────────────────
  const finalLog = readLog();
  const seqs = finalLog.map((row) => row.seq);
  assert.deepEqual(seqs, seqs.slice().sort((a, b) => a - b), "log sequence is monotonic");
  assert.equal(new Set(seqs).size, seqs.length, "log sequence has no duplicates");

  server.close();
  console.log(`✓ phase-1 synthetic environment: ${finalLog.length} log entries, no policy guard, auth enforced`);
})().catch((error) => { console.error(error); process.exit(1); });
