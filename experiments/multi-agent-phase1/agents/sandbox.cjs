/* ============================================================================
 * Phase-1 agent sandbox — credential and capability isolation.
 *
 * Spawns agents/run-agent.cjs as a child process whose environment is BUILT, not
 * inherited. `process.env` is never spread. An allowlist of variable names is
 * copied across and nothing else, so a credential can only reach an agent if
 * somebody adds its name to ALLOWED_ENV here, in this file, deliberately.
 *
 * What this establishes:
 *   · the agent holds no Resurrection Tech API key;
 *   · the agent holds no synthetic-environment credential;
 *   · the agent is never told the environment's address;
 *   · the agent has no execution capability — run-agent.cjs implements no
 *     executor and offers the model no callable tool.
 *
 * WHAT THIS DOES NOT ESTABLISH — stated plainly because the difference matters:
 * this is process-level credential isolation, not network-level isolation. The
 * child inherits the host's routing table, so with the address AND the token it
 * could reach the environment. It is given neither, and the environment logs and
 * refuses every unauthenticated request (`unauthorized_attempt`, a stop
 * condition). For a run where the result must hold against a hostile agent
 * rather than an uninformed one, the agents belong behind a container or network
 * namespace with no egress to the environment. That is a deployment control; it
 * cannot be asserted from inside this file, so it is not asserted.
 * ============================================================================ */
"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");

const AGENT_ENTRY = path.join(__dirname, "run-agent.cjs");

/* The complete set of variables an agent process may see.
 *
 * ANTHROPIC_API_KEY is present only for the `claude` planner and buys nothing on
 * the governed path: it authenticates to Anthropic, not to Morrison and not to
 * the synthetic environment. Every Resurrection Tech and environment credential
 * is absent, and agents/run-agent.cjs exits non-zero if any becomes visible. */
const ALLOWED_ENV = ["PATH", "HOME", "LANG", "LC_ALL", "NODE_OPTIONS", "TZ"];
const PLANNER_ENV = { claude: ["ANTHROPIC_API_KEY"], deterministic: [] };

function buildChildEnv(planner) {
  const names = [...ALLOWED_ENV, ...(PLANNER_ENV[planner] || [])];
  const env = {};
  for (const name of names) if (process.env[name] !== undefined) env[name] = process.env[name];
  // Marks the process for its own self-check and for anything inspecting it.
  env.RTX_AGENT_SANDBOX = "1";
  return env;
}

/** The environment an agent WOULD get. Exported so the isolation test can assert
 *  on it without spawning, and so an operator can inspect it before a run. */
function inspectChildEnv(planner) {
  return buildChildEnv(planner);
}

/**
 * Run one agent to a proposal.
 * Resolves to { ok, agent, proposal } or { ok:false, error } — never throws for
 * an agent-side failure, because one agent failing is data, not a crash.
 */
function runAgent(task, options = {}) {
  const planner = task.planner === "claude" ? "claude" : "deterministic";
  const timeoutMs = Number(options.timeoutMs || task.timeout_ms || 90000);

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [AGENT_ENTRY], {
      env: buildChildEnv(planner),            // built, never inherited
      cwd: options.cwd || __dirname,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const out = [];
    const err = [];
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ ok: false, agent: task.agent, error: `agent timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); finish({ ok: false, agent: task.agent, error: String(error.message || error) }); });
    child.on("close", (code) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(out).toString("utf8").trim();
      const stderr = Buffer.concat(err).toString("utf8").trim();
      if (stderr.includes("AGENT_SANDBOX_VIOLATION")) {
        return finish({ ok: false, agent: task.agent, sandbox_violation: true, error: stderr });
      }
      try { return finish({ ...JSON.parse(stdout), exit_code: code, stderr: stderr || null }); }
      catch { return finish({ ok: false, agent: task.agent, error: `agent produced no parseable proposal (exit ${code})`, stdout: stdout.slice(0, 500), stderr: stderr.slice(0, 500) }); }
    });

    child.stdin.write(JSON.stringify(task));
    child.stdin.end();
  });
}

module.exports = { runAgent, inspectChildEnv, ALLOWED_ENV, PLANNER_ENV, AGENT_ENTRY };
