#!/usr/bin/env node
/* ============================================================================
 * Phase-1 trusted orchestrator — CLI.
 *
 * THE ONE RULE: it coordinates requests and it does not govern.
 *
 * There is no budget check here, no lock over the shared resource, no
 * shared-state veto, no policy of its own. If five concurrent admissible
 * transitions compose into Ω_test, all five are dispatched and what happened is
 * recorded. Adding a guard would mean the experiment measured this file instead
 * of Morrison — the one outcome that would make the exercise worthless. The
 * property is enforced by orchestrator/phase-runner.cjs and tested behaviourally
 * in tests/orchestrator.test.cjs.
 *
 * It holds the credentials agents must not have:
 *   · the Resurrection Tech ingest key — the only caller of /api/runtime/execute;
 *   · the synthetic environment token, passed as adapter_config so the execution
 *     boundary can authenticate to the environment.
 *
 * Usage
 *   node orchestrator.cjs --phase P0 --transport inproc --synthetic-only
 *   node orchestrator.cjs --phase P2 --transport http --planner claude --synthetic-only
 *   node orchestrator.cjs --preflight-only --transport http --synthetic-only
 * ============================================================================ */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const crypto = require("node:crypto");

const { runPhase, StopCondition } = require("./phase-runner.cjs");
const { createTransport } = require("./transport.cjs");
const { preflight } = require("./preflight.cjs");
const { probe } = require("./state-probe.cjs");
const { runAgent } = require("../agents/sandbox.cjs");

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : fallback;
};
const bool = (name) => argv.includes(`--${name}`);

const CONFIG = {
  phase: flag("phase", "P0"),
  transport: flag("transport", "inproc"),
  planner: flag("planner", "deterministic"),
  model: flag("model", "claude-sonnet-5"),
  runId: flag("run-id", `map1-${new Date().toISOString().slice(0, 10)}-${crypto.randomBytes(3).toString("hex")}`),
  platformUrl: flag("platform-url", process.env.RT_PLATFORM_URL || ""),
  ingestKey: process.env.RT_INGEST_KEY || "",
  envBaseUrl: flag("env-url", process.env.RTX_ENV_URL || ""),
  envToken: process.env.RTX_ENV_TOKEN || "",
  envActionPath: flag("env-action-path", "/v1/actions"),
  envStatePath: flag("env-state-path", "/v1/state"),
  environmentId: flag("environment-id", "phase1-synthetic-treasury"),
  declaredMode: flag("mode", "enforce"),
  domains: (flag("domains", "enterprise") || "").split(",").map((x) => x.trim()).filter(Boolean),
  acknowledgeSynthetic: bool("synthetic-only"),
  outDir: flag("out", path.join(__dirname, "..", ".experiment-data")),
  preflightOnly: bool("preflight-only"),
  calibrationPath: flag("calibration", path.join(__dirname, "..", ".experiment-data", "calibration.json")),
};

const OUT_DIR = path.join(CONFIG.outDir, CONFIG.runId);
const JOURNAL = path.join(OUT_DIR, `${CONFIG.phase}-journal.jsonl`);

function journal(entry) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.appendFileSync(JOURNAL, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
}

function resetEnvironment() {
  const url = new URL("/v1/reset", CONFIG.envBaseUrl);
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = transport.request({
      protocol: url.protocol, hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname, method: "POST",
      headers: { "content-type": "application/json", "content-length": 2, authorization: `Bearer ${CONFIG.envToken}` },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.write("{}");
    req.end();
  });
}

(async () => {
  if (!CONFIG.envBaseUrl) { console.error("RTX_ENV_URL (or --env-url) is required"); process.exit(2); }
  if (!CONFIG.envToken) { console.error("RTX_ENV_TOKEN is required"); process.exit(2); }

  const gate = await preflight({
    transport: CONFIG.transport, platformUrl: CONFIG.platformUrl,
    envBaseUrl: CONFIG.envBaseUrl, envToken: CONFIG.envToken,
    declaredMode: CONFIG.declaredMode, acknowledgeSynthetic: CONFIG.acknowledgeSynthetic,
  });
  journal({ kind: "preflight", ...gate });
  console.log(JSON.stringify(gate, null, 2));

  if (!gate.ready) {
    console.error(`\nPREFLIGHT FAILED — refusing to run. Blocking: ${gate.blocking.join(", ")}`);
    process.exit(1);
  }
  if (CONFIG.preflightOnly) { console.log("\npreflight-only: the phase was not run."); return; }

  const calibration = (() => {
    try { return JSON.parse(fs.readFileSync(CONFIG.calibrationPath, "utf8")); }
    catch { return null; }
  })();
  if (!calibration) {
    console.error("\nNo calibration.json found. Run calibrate.cjs first — phase expectations depend on verdicts that only "
      + "the live engine can establish, and this harness will not guess them.");
    process.exit(1);
  }

  const transport = createTransport({
    transport: CONFIG.transport, platformUrl: CONFIG.platformUrl, ingestKey: CONFIG.ingestKey,
    envBaseUrl: CONFIG.envBaseUrl, envToken: CONFIG.envToken,
  });

  try {
    const outcome = await runPhase({
      phaseId: CONFIG.phase, config: CONFIG, calibration,
      deps: {
        transport, runAgent, journal, resetEnvironment,
        probeState: () => probe(CONFIG.envBaseUrl, CONFIG.envToken),
      },
    });
    console.log(`\nphase ${outcome.phase} complete · ${outcome.records.length} transitions · journal: ${JOURNAL}`);
    console.log(`run id: ${CONFIG.runId}`);
    if (outcome.finalState && outcome.finalState.omega_test_violated) {
      console.log("\nΩ_test was reached. This is a RESULT, not a harness failure — run the analyser to characterise it.");
    }
    if (outcome.stops.length) {
      console.error(`\nSTOP CONDITIONS OBSERVED (${outcome.stops.length}) — reporting, not repairing:`);
      for (const stop of outcome.stops) console.error(`  · ${stop.id}: ${stop.detail}`);
      process.exit(1);
    }
  } catch (error) {
    journal({ kind: "aborted", error: String(error.message || error), stop_condition: error instanceof StopCondition ? error.id : null });
    console.error(`\n${error.message}`);
    process.exit(1);
  }
})();
