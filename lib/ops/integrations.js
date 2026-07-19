/* ============================================================================
 * Operations Agent — external integration health probes (read-only monitors).
 *
 * GitHub · Railway (governance engine) · Vercel (site) · Supabase (store).
 * Every probe is fail-soft and token-gated: unconfigured integrations report
 * status "unconfigured" rather than erroring, and no probe ever throws. The
 * agent only OBSERVES here — any remedial action still goes through the
 * proposal → governance path.
 *
 * Config (all optional):
 *   OPS_GITHUB_REPOS   comma list "owner/repo,owner/repo2"
 *   OPS_GITHUB_TOKEN   token for private repos / higher rate limits
 *   GOVERNANCE_URL     Morrison engine on Railway (already used by lib/runtime)
 *   OPS_RAILWAY_HEALTH_URLS  extra Railway service health URLs (comma list)
 *   OPS_VERCEL_TOKEN + OPS_VERCEL_PROJECT   Vercel deployments API
 *   NEXT_PUBLIC_SITE_URL     fallback site health probe
 * ============================================================================ */
"use strict";
const rt = require("../runtime");

const TIMEOUT_MS = Number(process.env.OPS_PROBE_TIMEOUT_MS || 6000);

async function probeJson(url, headers = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    const ms = Date.now() - started;
    let json = null;
    try { json = await res.json(); } catch { /* non-json body */ }
    return { ok: res.ok, status: res.status, ms, json };
  } catch (e) {
    return { ok: false, error: e.name === "AbortError" ? "timeout" : e.message, ms: Date.now() - started };
  } finally { clearTimeout(t); }
}

async function github() {
  const repos = String(process.env.OPS_GITHUB_REPOS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!repos.length) return { name: "github", status: "unconfigured" };
  const headers = { accept: "application/vnd.github+json", "user-agent": "rt-ops-agent" };
  if (process.env.OPS_GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.OPS_GITHUB_TOKEN}`;
  const results = [];
  for (const repo of repos) {
    const r = await probeJson(`https://api.github.com/repos/${repo}`, headers);
    results.push({
      repo, reachable: !!r.ok,
      pushed_at: r.json ? r.json.pushed_at : null,
      open_issues: r.json ? r.json.open_issues_count : null,
      error: r.ok ? null : r.error || `HTTP ${r.status}`,
    });
  }
  const down = results.filter((x) => !x.reachable);
  return { name: "github", status: down.length ? "degraded" : "healthy", repos: results };
}

async function railway() {
  // The governance engine deployed on Railway IS the critical Railway service.
  const eng = await rt.engine.health();
  const extra = String(process.env.OPS_RAILWAY_HEALTH_URLS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const services = [{
    url: rt.engine.ENGINE_URL, reachable: !!eng.ok,
    engine_commit: eng.ok && eng.json ? eng.json.engine_commit : null,
    error: eng.ok ? null : eng.error || `HTTP ${eng.status}`,
  }];
  for (const url of extra) {
    const r = await probeJson(url);
    services.push({ url, reachable: !!r.ok, error: r.ok ? null : r.error || `HTTP ${r.status}` });
  }
  const down = services.filter((s) => !s.reachable);
  return { name: "railway", status: down.length ? "degraded" : "healthy", services };
}

async function vercel() {
  const token = process.env.OPS_VERCEL_TOKEN, project = process.env.OPS_VERCEL_PROJECT;
  if (token && project) {
    const r = await probeJson(`https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(project)}&limit=1`, { authorization: `Bearer ${token}` });
    const dep = r.json && r.json.deployments && r.json.deployments[0];
    return {
      name: "vercel",
      status: r.ok && dep && dep.readyState === "READY" ? "healthy" : r.ok ? "degraded" : "unreachable",
      latest: dep ? { state: dep.readyState, created: dep.createdAt, url: dep.url } : null,
      error: r.ok ? null : r.error || `HTTP ${r.status}`,
    };
  }
  // Running ON Vercel: self-report this live deployment from the system env
  // vars Vercel injects into every invocation (VERCEL / VERCEL_ENV / VERCEL_URL
  // / VERCEL_GIT_COMMIT_SHA) — no API token needed. If code is executing here,
  // the deployment is by definition serving. OPS_VERCEL_TOKEN + OPS_VERCEL_PROJECT
  // (handled above) upgrade this to cross-project deployment history.
  if (process.env.VERCEL || process.env.VERCEL_URL || process.env.VERCEL_ENV) {
    return {
      name: "vercel", status: "healthy",
      self: {
        env: process.env.VERCEL_ENV || process.env.VERCEL_TARGET_ENV || null,
        url: process.env.VERCEL_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || null,
        commit: process.env.VERCEL_GIT_COMMIT_SHA ? String(process.env.VERCEL_GIT_COMMIT_SHA).slice(0, 7) : null,
      },
    };
  }
  // Fallback: probe the live site's own health route.
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  if (!site) return { name: "vercel", status: "unconfigured" };
  const r = await probeJson(`${site}/api/health`);
  return { name: "vercel", status: r.ok ? "healthy" : "degraded", probe: `${site}/api/health`, error: r.ok ? null : r.error || `HTTP ${r.status}` };
}

async function supabaseHealth() {
  const backend = rt.store.backend();
  const started = Date.now();
  try {
    await rt.store.find("orgs", {});
    return { name: "supabase", status: backend === "supabase" ? "healthy" : "degraded", backend, durable: rt.store.durable(), roundtrip_ms: Date.now() - started, warning: backend === "supabase" ? null : "running on non-durable file store" };
  } catch (e) {
    return { name: "supabase", status: "unreachable", backend, error: e.message };
  }
}

/** Probe everything in parallel. Never throws. */
async function probeAll() {
  const [gh, rw, vc, sb] = await Promise.all([
    github().catch((e) => ({ name: "github", status: "error", error: e.message })),
    railway().catch((e) => ({ name: "railway", status: "error", error: e.message })),
    vercel().catch((e) => ({ name: "vercel", status: "error", error: e.message })),
    supabaseHealth().catch((e) => ({ name: "supabase", status: "error", error: e.message })),
  ]);
  return { checked_at: rt.store.nowISO(), integrations: [gh, rw, vc, sb] };
}

module.exports = { probeAll, github, railway, vercel, supabaseHealth };
