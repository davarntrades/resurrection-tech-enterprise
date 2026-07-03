#!/usr/bin/env node
/* ============================================================================
 * Resurrection Tech™ — Runtime Governance Gateway (standalone server).
 *
 * The continuous-governance control plane that wraps the EXISTING engine. Run
 * it immediately after a customer approves an audit — no rebuild required.
 * Zero npm dependencies (Node http), same spirit as console/server.cjs.
 *
 *   GOVERNANCE_URL=… GOVERNANCE_TOKEN=… npm run runtime:server   # :8790
 *
 * Endpoints (JSON):
 *   GET  /health                            engine + store diagnostics
 *   POST /admin/onboard          {name,slug}                → org+envs+ingest key (ADMIN_KEY)
 *   POST /admin/environments/:id/mode  {mode}               flip shadow↔enforce (rollback/cutover)
 *   POST /admin/keys             {org_id,role,environment_id} issue an API key   (ADMIN_KEY)
 *   POST /v1/runtime/evaluate    {trajectory,domains,...}   govern one trajectory (Bearer ingest key)
 *   POST /v1/manifests           {manifest,domains,note}    upload/version a manifest (Bearer admin/ingest)
 *   GET  /v1/manifests/current                              current version       (Bearer)
 *   GET  /v1/manifests/history                              version history        (Bearer)
 *   GET  /v1/metrics             ?since&until                dashboard summary      (Bearer)
 *   GET  /v1/trends              ?bucket=day                 trend series           (Bearer)
 *   GET  /v1/decisions           ?verdict&q&limit            searchable history     (Bearer)
 *   GET  /v1/decisions/export    ?format=csv                 evidence export        (Bearer)
 *   POST /v1/decisions/:id/replay                            decision replay        (Bearer)
 *   POST /v1/reports             {period}                    generate a report      (Bearer)
 *   GET  /v1/reports             ?period                     list reports           (Bearer)
 *   GET  /                                                   the runtime dashboard (HTML)
 * ============================================================================ */
"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const rt = require("../../lib/runtime");

const PORT = Number(process.env.RUNTIME_PORT || 8790);
// Item 1: fail CLOSED. No default admin key — if RUNTIME_ADMIN_KEY is unset the
// /admin/* control plane is DISABLED (not left open on a well-known default).
const ADMIN_KEY = process.env.RUNTIME_ADMIN_KEY || null;
const DASHBOARD = path.join(__dirname, "dashboard.html");

const send = (res, code, obj, type) => {
  const body = type ? obj : JSON.stringify(obj, null, 2);
  res.writeHead(code, { "content-type": type || "application/json", "access-control-allow-origin": "*" });
  res.end(body);
};
const readBody = (req) => new Promise((resolve) => {
  const c = []; req.on("data", (d) => c.push(d));
  req.on("end", () => { try { resolve(c.length ? JSON.parse(Buffer.concat(c).toString()) : {}); } catch { resolve({}); } });
});
const bearer = (req) => { const h = req.headers.authorization || ""; const m = h.match(/^Bearer\s+(.+)$/i); return m ? m[1].trim() : ""; };
// Admin gate: disabled entirely unless RUNTIME_ADMIN_KEY is configured, then a
// constant-time-ish exact match. Returns { ok } / { disabled } so callers emit
// the right status (503 when unconfigured, 401 when the key is wrong).
const adminGate = (req) => {
  if (!ADMIN_KEY) return { disabled: true };
  return { ok: (req.headers["x-admin-key"] || "") === ADMIN_KEY };
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const p = url.pathname;
    const q = Object.fromEntries(url.searchParams);

    if (req.method === "OPTIONS") return send(res, 204, "", "text/plain");
    if (p === "/" || p === "/index.html") {
      try { return send(res, 200, fs.readFileSync(DASHBOARD, "utf8"), "text/html; charset=utf-8"); }
      catch { return send(res, 200, "<h1>Runtime Governance Gateway</h1><p>Dashboard file missing.</p>", "text/html"); }
    }
    if (p === "/health") return send(res, 200, await rt.health());

    // ── Admin (x-admin-key) ──────────────────────────────────────────────────
    const denyAdmin = (req) => {
      const g = adminGate(req);
      if (g.disabled) return { code: 503, body: { error: "admin control plane disabled — set RUNTIME_ADMIN_KEY to enable /admin/*" } };
      if (!g.ok) return { code: 401, body: { error: "admin key required (x-admin-key)" } };
      return null;
    };
    if (p === "/admin/onboard" && req.method === "POST") {
      const d = denyAdmin(req); if (d) return send(res, d.code, d.body);
      const b = await readBody(req);
      if (!b.name) return send(res, 400, { error: "name required" });
      return send(res, 200, await rt.admin.onboardCustomer(b));
    }
    if (p === "/admin/keys" && req.method === "POST") {
      const d = denyAdmin(req); if (d) return send(res, d.code, d.body);
      const b = await readBody(req);
      if (!b.org_id) return send(res, 400, { error: "org_id required" });
      return send(res, 200, await rt.admin.issueApiKey(b));
    }
    let m;
    if ((m = p.match(/^\/admin\/environments\/([^/]+)\/mode$/)) && req.method === "POST") {
      const d = denyAdmin(req); if (d) return send(res, d.code, d.body);
      const b = await readBody(req);
      return send(res, 200, await rt.admin.setMode(m[1], b.mode));
    }

    // ── Authenticated (Bearer API key) ───────────────────────────────────────
    const auth = await rt.admin.authenticate(bearer(req));
    if (!auth) return send(res, 401, { error: "valid API key required (Authorization: Bearer <key>)" });
    // Tenant context: org_id is ALWAYS the authenticated key's org (never the
    // client). An env-scoped key pins its own environment; an org-level key may
    // name an environment_id, but manifest ops verify it belongs to org_id
    // (fail-closed → 403), so a forged/other-tenant id is rejected.
    const org_id = auth.org.id;
    const environment_id = auth.environment ? auth.environment.id : q.environment_id;

    if (p === "/v1/runtime/evaluate" && req.method === "POST") {
      if (auth.role === "viewer") return send(res, 403, { error: "ingest role required" });
      const b = await readBody(req);
      const r = await rt.gateway.govern({ auth, trajectory: b.trajectory, domains: b.domains, horizon: b.horizon, label: b.label, agent: b.agent, correlation_id: b.correlation_id });
      return send(res, r.ok ? 200 : 400, r);
    }
    if (p === "/v1/manifests" && req.method === "POST") {
      const b = await readBody(req);
      return send(res, 200, await rt.manifests.putManifest({ org_id, environment_id, manifest: b.manifest, domains: b.domains, note: b.note, reassess: b.reassess !== false }));
    }
    if (p === "/v1/manifests/current" && req.method === "GET") return send(res, 200, (await rt.manifests.currentManifest(org_id, environment_id)) || { error: "no manifest" });
    if (p === "/v1/manifests/history" && req.method === "GET") return send(res, 200, await rt.manifests.manifestHistory(org_id, environment_id));
    if (p === "/v1/metrics" && req.method === "GET") return send(res, 200, await rt.metrics.summary({ org_id, environment_id: q.all ? undefined : environment_id, since: q.since, until: q.until }));
    if (p === "/v1/trends" && req.method === "GET") return send(res, 200, await rt.metrics.trends({ org_id, environment_id: q.all ? undefined : environment_id, since: q.since, until: q.until, bucket: q.bucket || "day" }));
    if (p === "/v1/decisions" && req.method === "GET") return send(res, 200, await rt.store.queryDecisions({ org_id, environment_id: q.all ? undefined : environment_id, verdict: q.verdict, omega_domain: q.omega_domain, rule: q.rule, q: q.q, since: q.since, until: q.until, limit: Number(q.limit || 200) }));
    if (p === "/v1/decisions/export" && req.method === "GET") {
      const out = await rt.metrics.exportDecisions({ org_id, environment_id: q.all ? undefined : environment_id, since: q.since, until: q.until, format: q.format || "json" });
      return send(res, 200, out.body, out.contentType);
    }
    if ((m = p.match(/^\/v1\/decisions\/([^/]+)\/replay$/)) && req.method === "POST") return send(res, 200, await rt.gateway.replayDecision(m[1]));
    if (p === "/v1/reports" && req.method === "POST") { const b = await readBody(req); return send(res, 200, await rt.reports.generate({ org_id, environment_id, period: b.period, ref: b.ref })); }
    if (p === "/v1/reports" && req.method === "GET") return send(res, 200, await rt.reports.listReports({ org_id, environment_id: q.all ? undefined : environment_id, period: q.period }));

    return send(res, 404, { error: "not found", path: p });
  } catch (e) {
    // Fail closed: a tenant-scope violation is a 403, never a 500 or a leak.
    if (e && (e.code === "TENANT_MISMATCH" || e.status === 403)) return send(res, 403, { error: e.message || "forbidden" });
    return send(res, 500, { error: e && e.message ? e.message : String(e) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Runtime Governance Gateway → http://127.0.0.1:${PORT}`);
  console.log(`  engine:  ${rt.engine.ENGINE_URL}`);
  console.log(`  store:   ${rt.store.backend()}  (${rt.store.durable() ? "durable" : "NON-DURABLE dev file store — " + rt.store.DATA_DIR})`);
  console.log(`  admin:   ${ADMIN_KEY ? "enabled (x-admin-key configured)" : "DISABLED — set RUNTIME_ADMIN_KEY to enable /admin/*"}`);
  if (!rt.store.durable()) console.log(`  ⚠ file store is not durable/concurrency-safe — configure Supabase for live customer traffic (set RUNTIME_REQUIRE_DURABLE=1 to enforce).`);
});
module.exports = server;
