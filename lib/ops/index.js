/* Operations Agent — barrel export. An autonomous enterprise operating layer
 * that extends AROUND the existing Runtime Governance platform (lib/runtime)
 * and is itself governed by it. The agent is not trusted; the engine is. */
"use strict";
const rt = require("../runtime");
const actions = require("./actions");
const governor = require("./governor");
const proposals = require("./proposals");
const evidence = require("./evidence");
const events = require("./events");
const observers = require("./observers");
const reasoning = require("./reasoning");
const agent = require("./agent");
const briefing = require("./briefing");
const clients = require("./clients");
const integrations = require("./integrations");
const sources = require("./sources");
const systems = require("./systems");
const intelligence = require("./intelligence");
const workflow = require("./workflow");
const handoffs = require("./handoffs");
const integrity = require("./integrity");
const incidents = require("./incidents");
const graph = require("./graph");
const gmail = require("./gmail");
const agentsCore = require("./agents");
const autonomy = require("./autonomy");
const performance = require("./performance");
const twin = require("./twin");
const guardian = require("./guardian");
const risk = require("./risk");
const architecture = require("./architecture");
const partners = require("./partners");
const policies = require("./policies");
const govpolicy = require("./govpolicy");
const entities = require("./entities");
const entgraph = require("./entgraph");
const provisioning = require("./provisioning");
const managed = require("./managed");
const workspaces = require("./workspaces");
const industry = require("./industry");
const ask = require("./ask");

// Health: agent status + the trust chain it depends on (engine + store).
async function health() {
  const [eng, run, props] = await Promise.all([
    rt.engine.health(),
    agent.lastRun().catch(() => null),
    proposals.summary().catch(() => null),
  ]);
  // Additive tables observed missing this process — an un-run migration is
  // reported, never guessed at and never silently ignored.
  const pending = rt.store.pendingMigrations();
  return {
    status: eng.ok ? (pending.length ? "degraded_schema" : "ok") : "degraded_fail_closed",
    time: rt.store.nowISO(),
    schema: { pending_migrations: pending, note: pending.length ? "apply supabase/operations_agent.sql — these additive tables are missing, so the surfaces that read them are empty" : null },
    governance_engine: { url: rt.engine.ENGINE_URL, reachable: !!eng.ok, note: eng.ok ? null : "agent actions are blocked while the engine is unreachable (fail-closed)" },
    store: { backend: rt.store.backend(), durable: rt.store.durable() },
    reasoning: { llm_configured: !!process.env.ANTHROPIC_API_KEY, model: process.env.OPS_REASONING_MODEL || "claude-opus-4-8" },
    last_run: run ? { at: run.started_at, status: run.status, trigger: run.trigger } : null,
    proposals: props ? props.by_status : null,
  };
}

module.exports = { actions, governor, proposals, evidence, events, observers, reasoning, agent, agents: agentsCore, autonomy, performance, twin, guardian, risk, architecture, partners, policies, govpolicy, entities, entgraph, provisioning, managed, workspaces, industry, handoffs, integrity, incidents, graph, gmail, briefing, clients, integrations, sources, systems, intelligence, workflow, ask, health };
