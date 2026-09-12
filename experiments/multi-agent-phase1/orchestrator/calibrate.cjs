#!/usr/bin/env node
/* ============================================================================
 * Phase-1 calibration.
 *
 * WHY THIS EXISTS. The Morrison engine is not in this repository. The
 * governance-service image vendors it at build time from a pinned ref of
 * Morrison-Runtime-Governance (see governance-service/Dockerfile, ENGINE_REF),
 * and the deployed ruleset is whatever that ref plus the deployment rules
 * produce. So no file in this experiment can honestly declare "update_config
 * will be ALLOWed". It has to be measured.
 *
 * Calibration submits every candidate action from scenarios.cjs to
 * POST /api/runtime/evaluate — the ADVISORY endpoint. It records a decision and
 * executes nothing, which is exactly what is wanted here: the verdict is
 * discovered without any external effect and without consuming the execution
 * path the experiment is meant to measure.
 *
 * Output: calibration.json, naming for each scenario kind the candidate that
 * actually produced the required verdict. The orchestrator refuses to run
 * without it. If a kind has NO candidate producing its required verdict, that is
 * reported as uncalibratable and the phase depending on it cannot run honestly
 * — extend CANDIDATES rather than reinterpreting a verdict.
 *
 * Note: these calibration decisions ARE recorded in rg_decisions like any other.
 * They carry label `phase=CALIBRATION` so the analyser can exclude them from
 * experiment reconciliation.
 * ============================================================================ */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");

const { CANDIDATES } = require("./scenarios.cjs");

const REQUIRED_VERDICT = { admissible: "ALLOW", prohibited: "BLOCK", escalating: "ESCALATE" };

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : fallback;
};

const PLATFORM_URL = (flag("platform-url", process.env.RT_PLATFORM_URL || "") || "").replace(/\/$/, "");
const INGEST_KEY = process.env.RT_INGEST_KEY || "";
const DOMAINS = (flag("domains", "enterprise") || "").split(",").map((x) => x.trim()).filter(Boolean);
const OUT = flag("out", path.join(__dirname, "..", ".experiment-data", "calibration.json"));

function postJson(urlString, token, body, timeoutMs = 30000) {
  const url = new URL(urlString);
  const transport = url.protocol === "https:" ? https : http;
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = transport.request({
      protocol: url.protocol, hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname, method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
        authorization: `Bearer ${token}`,
        "x-guardian-sdk": "phase1-calibration",
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { /* surfaced below */ }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error("calibration request timed out")));
    req.write(payload);
    req.end();
  });
}

async function evaluateCandidate(candidate, index) {
  const { status, json, text } = await postJson(`${PLATFORM_URL}/api/runtime/evaluate`, INGEST_KEY, {
    trajectory: [{ tool: candidate.tool, args: candidate.args }],
    domains: DOMAINS.length ? DOMAINS : undefined,
    agent: "CALIBRATION",
    label: `phase=CALIBRATION;candidate=${candidate.tool};index=${index}`,
    correlation_id: `calibration-${candidate.tool}-${index}`,
  });
  if (status !== 200 || !json) {
    return { tool: candidate.tool, args: candidate.args, ok: false, http_status: status, error: (json && json.error) || text.slice(0, 300) };
  }
  return {
    tool: candidate.tool, args: candidate.args, ok: true,
    verdict: json.verdict, engine_verdict: json.engine_verdict,
    rule: json.rule || null, omega_domain: json.omega_domain || null,
    reason: json.reason || null,
    requires_human_review: json.requires_human_review === true,
    mode: json.mode, enforced: json.enforced,
    recorded: json.recorded, decision_id: json.decision_id || null,
    ruleset_hash: json.ruleset_hash || null, engine_commit: json.engine_commit || null,
  };
}

(async () => {
  if (!PLATFORM_URL) { console.error("--platform-url or RT_PLATFORM_URL is required"); process.exit(2); }
  if (!INGEST_KEY) { console.error("RT_INGEST_KEY is required"); process.exit(2); }

  const calibration = {
    calibrated_at: new Date().toISOString(),
    platform_url: PLATFORM_URL,
    domains: DOMAINS,
    endpoint: "/api/runtime/evaluate",
    endpoint_note: "Advisory ingest. A decision is recorded; nothing is executed. Chosen so calibration has no external effect.",
    engine_provenance: null,
  };

  for (const [kind, pool] of Object.entries(CANDIDATES)) {
    const required = REQUIRED_VERDICT[kind];
    const observations = [];
    for (const [index, candidate] of pool.entries()) {
      const observation = await evaluateCandidate(candidate, index);
      observations.push(observation);
      console.log(`${kind.padEnd(12)} ${candidate.tool.padEnd(32)} → ${observation.ok ? `${observation.verdict}${observation.rule ? ` (${observation.rule})` : ""}` : `ERROR ${observation.error}`}`);
      if (observation.ok && !calibration.engine_provenance && observation.ruleset_hash) {
        calibration.engine_provenance = { ruleset_hash: observation.ruleset_hash, engine_commit: observation.engine_commit };
      }
    }
    const match = observations.find((item) => item.ok && item.verdict === required);
    calibration[kind] = {
      required_verdict: required,
      selected: match ? match.tool : null,
      calibrated: !!match,
      // Kept in full so a later reader can see what was rejected and why, rather
      // than only the winner.
      observations,
      ...(match ? {} : {
        uncalibratable: true,
        note: `No candidate produced ${required}. The phases depending on this kind cannot run honestly. `
          + `Extend CANDIDATES in scenarios.cjs — do not reinterpret an observed verdict as the required one.`,
      }),
    };
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(calibration, null, 2));

  const uncalibrated = Object.entries(REQUIRED_VERDICT)
    .filter(([kind]) => !calibration[kind] || !calibration[kind].calibrated)
    .map(([kind]) => kind);

  console.log(`\ncalibration written: ${OUT}`);
  if (uncalibrated.length) {
    console.error(`\nUNCALIBRATED: ${uncalibrated.join(", ")} — the phases requiring these verdicts must not be run.`);
    process.exit(1);
  }
})();
