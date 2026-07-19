/* ============================================================================
 * Operations Agent — system status board (honest, never fakes success).
 *
 * One status card per component, using only these states:
 *   healthy | degraded | unavailable | not_configured | awaiting_credentials
 *
 * A component that cannot be verified is reported as such — with the exact
 * environment variable(s) needed to activate it — rather than shown green.
 * Also derives the agent's operating MODE (on-demand vs continuous) from real
 * run records, so the Control Room works before any persistent worker exists:
 *
 *   on_demand          briefings are generated from current records when the
 *                      operator opens/refreshes the page (always available)
 *   continuous_active  a scheduled/worker cycle ran within the freshness
 *                      window (2× OPS_CYCLE_INTERVAL_HOURS, default 4h)
 *   worker_offline     continuous mode is expected (OPS_WORKER_MODE=continuous)
 *                      but no scheduled cycle ran within the window
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const integrations = require("./integrations");
const agent = require("./agent");
const clientsMod = require("./clients");

const card = (component, status, detail, extra = {}) => ({ component, status, detail, ...extra });

// Map integration probe statuses onto the honest vocabulary.
const probeStatus = (s) =>
  s === "healthy" ? "healthy" :
  s === "degraded" ? "degraded" :
  s === "unconfigured" ? "not_configured" : "unavailable";

/** Agent operating mode, derived from run records (never asserted). */
async function mode() {
  const intervalH = Number(process.env.OPS_CYCLE_INTERVAL_HOURS) > 0 ? Number(process.env.OPS_CYCLE_INTERVAL_HOURS) : 4;
  const windowMs = 2 * intervalH * 3600000;
  const runs = await agent.runs({ limit: 20 }).catch(() => []);
  const scheduled = runs.find((r) => ["cron", "worker"].includes(String(r.trigger || "").split(":")[0]));
  const fresh = scheduled && Date.now() - Date.parse(scheduled.started_at) < windowMs;
  const expectContinuous = /^continuous$/i.test(String(process.env.OPS_WORKER_MODE || ""));
  if (fresh) {
    return { mode: "continuous_active", label: "Continuous monitoring active",
      detail: `last scheduled cycle ${scheduled.started_at} (${scheduled.trigger})`, last_scheduled_run: scheduled.started_at };
  }
  if (expectContinuous) {
    return { mode: "worker_offline", label: "Worker offline",
      detail: `OPS_WORKER_MODE=continuous but no scheduled cycle within ${2 * intervalH}h`, last_scheduled_run: scheduled ? scheduled.started_at : null };
  }
  return { mode: "on_demand", label: "On-demand monitoring",
    detail: "briefings generated from current records on open/refresh; scheduled cycles activate continuous mode", last_scheduled_run: scheduled ? scheduled.started_at : null };
}

/** Full status board. Never throws. */
async function statusBoard() {
  const [eng, probes, m, lastRun, clientList] = await Promise.all([
    rt.engine.health(),
    integrations.probeAll().catch(() => ({ integrations: [] })),
    mode(),
    agent.lastRun().catch(() => null),
    clientsMod.list().catch(() => []),
  ]);
  const probe = (name) => probes.integrations.find((i) => i.name === name) || { status: "unconfigured" };

  const cards = [];

  // Runtime Governance engine — the trust anchor; fail-closed when down.
  cards.push(card("runtime_governance", eng.ok ? "healthy" : "unavailable",
    eng.ok ? `engine reachable (${rt.engine.ENGINE_URL})` : `engine unreachable — agent actions fail closed (${eng.error || `HTTP ${eng.status}`})`,
    { url: rt.engine.ENGINE_URL }));

  // Control Room — if this code is answering, the surface is up.
  cards.push(card("control_room", "healthy", "operator surface serving requests"));

  // Supabase / store durability.
  const sb = probe("supabase");
  cards.push(card("supabase",
    rt.store.backend() === "supabase" ? probeStatus(sb.status) : "not_configured",
    rt.store.backend() === "supabase" ? `durable store (roundtrip ${sb.roundtrip_ms ?? "?"}ms)` : "running on non-durable file store",
    rt.store.backend() === "supabase" ? {} : { required_env: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] }));

  // Railway — the engine deployment (+ optional extra service probes).
  const rw = probe("railway");
  cards.push(card("railway", probeStatus(rw.status),
    rw.status === "healthy" ? "governance engine deployment healthy" : rw.status === "unconfigured" ? "Railway monitoring not configured" : "one or more Railway services unreachable",
    { services: rw.services || [], optional_env: ["OPS_RAILWAY_HEALTH_URLS"] }));

  // Vercel — self-reports when running ON Vercel (system env vars); the
  // OPS_VERCEL_* token upgrades to cross-project deployment history; else a
  // NEXT_PUBLIC_SITE_URL health probe. Only truly "not configured" off-Vercel.
  const vc = probe("vercel");
  const onVercel = !!(process.env.VERCEL || process.env.VERCEL_URL || process.env.VERCEL_ENV);
  const vercelConfigured = onVercel || !!(process.env.OPS_VERCEL_TOKEN && process.env.OPS_VERCEL_PROJECT) || !!process.env.NEXT_PUBLIC_SITE_URL;
  let vercelDetail;
  if (vc.latest) vercelDetail = `latest deployment ${vc.latest.state}`;
  else if (vc.self) {
    const bits = [vc.self.env, vc.self.commit ? `@ ${vc.self.commit}` : null].filter(Boolean).join(" ");
    vercelDetail = `serving this deployment${bits ? ` (${bits})` : ""}`;
  } else if (vc.probe) vercelDetail = `site probe ${vc.status}`;
  else vercelDetail = vercelConfigured ? (vc.error || vc.status) : "Vercel monitoring not configured";
  cards.push(card("vercel",
    vercelConfigured ? probeStatus(vc.status) : "not_configured",
    vercelDetail,
    vercelConfigured
      ? (vc.self ? { note: "add OPS_VERCEL_TOKEN + OPS_VERCEL_PROJECT for cross-project deployment history" } : {})
      : { required_env: ["OPS_VERCEL_TOKEN", "OPS_VERCEL_PROJECT"] }));

  // GitHub — repo list + token.
  const gh = probe("github");
  cards.push(card("github",
    process.env.OPS_GITHUB_REPOS ? probeStatus(gh.status) : "not_configured",
    process.env.OPS_GITHUB_REPOS ? `${(gh.repos || []).filter((r) => r.reachable).length}/${(gh.repos || []).length} repositories reachable` : "GitHub monitoring not configured",
    process.env.OPS_GITHUB_REPOS ? { repos: gh.repos || [] } : { required_env: ["OPS_GITHUB_REPOS", "OPS_GITHUB_TOKEN (private repos)"] }));

  // Operations worker + background scheduling.
  cards.push(card("operations_worker",
    m.mode === "continuous_active" ? "healthy" : m.mode === "worker_offline" ? "unavailable" : "not_configured",
    m.mode === "on_demand" ? "no persistent worker — on-demand cycles only (Vercel cron activates continuous mode)" : m.detail,
    { mode: m.mode, last_scheduled_run: m.last_scheduled_run, required_env: m.mode === "on_demand" ? ["CRON_SECRET (Vercel cron)", "or a Railway worker calling agent.runCycle"] : [] }));

  // LLM reasoning provider — configured ≠ verified; verification is the last
  // cycle's actual reasoning source.
  const llmKey = !!process.env.ANTHROPIC_API_KEY;
  const lastSource = lastRun ? lastRun.reasoning_source : null;
  cards.push(card("llm_reasoning",
    !llmKey ? "not_configured" : lastSource === "llm" ? "healthy" : lastSource === "heuristic" ? "degraded" : "awaiting_credentials",
    !llmKey ? "no API key — deterministic heuristic reasoning in use"
      : lastSource === "llm" ? `LLM reasoning verified on last cycle (${process.env.OPS_REASONING_MODEL || "claude-opus-4-8"})`
      : lastSource === "heuristic" ? "API key set but last cycle fell back to heuristics — check key/model"
      : "API key set — verified on the next agent cycle",
    llmKey ? {} : { required_env: ["ANTHROPIC_API_KEY", "OPS_REASONING_MODEL (optional)"] }));

  // OpenClaw — a scoped API client by design; "connected" means an active key
  // labelled openclaw that has actually been used.
  const openclaw = clientList.find((c) => /openclaw/i.test(String(c.label || "")) && c.status === "active");
  cards.push(card("openclaw",
    openclaw ? (openclaw.last_used_at ? "healthy" : "awaiting_credentials") : "not_configured",
    openclaw
      ? (openclaw.last_used_at ? `client key active, last used ${openclaw.last_used_at}` : "client key issued but never used — deliver it to the OpenClaw bridge")
      : "OpenClaw not connected — issue a scoped client key (label: openclaw) via /api/ops/clients",
    { scopes_when_issued: ["briefing", "status", "proposals:read"], approval_capable: false }));

  // Email / prospect activity — no integration exists yet; manual notes fill in.
  cards.push(card("email",
    "not_configured",
    "Email activity unavailable — Gmail integration not configured. Manual engagement notes contribute to the briefing.",
    { required_env: ["(future) OPS_GMAIL_* credentials"] }));

  return { checked_at: rt.store.nowISO(), mode: m, systems: cards };
}

module.exports = { statusBoard, mode };
