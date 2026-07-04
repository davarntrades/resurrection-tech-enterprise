#!/usr/bin/env node
/* ============================================================================
 * Runtime Governance — manifest tenant-isolation test (IDOR fix).
 *
 * Proves the cross-tenant manifest access is eliminated, at BOTH the library
 * choke point (lib/runtime/manifests) and end-to-end over HTTP (the standalone
 * gateway). Requirements verified:
 *   · Tenant A cannot READ    Tenant B manifests → 403
 *   · Tenant A cannot UPDATE  Tenant B manifests → 403
 *   · Tenant A cannot DELETE  Tenant B manifests → no delete path; B unchanged
 *   · Enumeration attacks fail → unknown vs other-tenant id both 403 (no signal)
 *   · Forged environment IDs fail → 403
 *   · Existing same-tenant behaviour unchanged
 *   · Existing API contracts unchanged (shapes/paths identical)
 *
 *   GOVERNANCE_URL=… GOVERNANCE_TOKEN=… node scripts/runtime/manifest-isolation.test.cjs
 * ============================================================================ */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-iso-"));
const rt = require("../../lib/runtime");

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };
const eq = (g, w, m) => ok(JSON.stringify(g) === JSON.stringify(w), `${m} — expected ${JSON.stringify(w)}, got ${JSON.stringify(g)}`);
async function throws403(fn, m) {
  try { await fn(); ok(false, `${m} — expected 403 TenantMismatch, but the call SUCCEEDED (leak!)`); }
  catch (e) { ok(e && (e.code === "TENANT_MISMATCH" || e.status === 403), `${m} — threw ${e && e.code || e}`); }
}
function httpJson(port, method, p, headers, body) {
  return new Promise((resolve) => {
    const req = http.request({ host: "127.0.0.1", port, path: p, method, headers: { "content-type": "application/json", ...(headers || {}) } },
      (res) => { const c = []; res.on("data", (d) => c.push(d)); res.on("end", () => { let j = null; try { j = JSON.parse(Buffer.concat(c).toString()); } catch { /**/ } resolve({ status: res.statusCode, json: j }); }); });
    req.on("error", () => resolve({ status: 0 })); if (body) req.write(JSON.stringify(body)); req.end();
  });
}
function startServer(env) {
  return new Promise((resolve) => {
    const child = spawn("node", [path.join(__dirname, "server.cjs")], { env: { ...process.env, ...env } });
    let up = false; child.stdout.on("data", (d) => { if (!up && /Gateway →/.test(d.toString())) { up = true; setTimeout(() => resolve(child), 250); } });
    setTimeout(() => resolve(child), 3000);
  });
}

(async () => {
  if (!(await rt.health()).engine.reachable) { console.log("Isolation test SKIPPED — engine not reachable."); process.exit(0); }

  // Two tenants; B holds a confidential manifest.
  const A = await rt.admin.onboardCustomer({ name: "Tenant A", slug: "a" });
  const B = await rt.admin.onboardCustomer({ name: "Tenant B", slug: "b" });
  await rt.manifests.putManifest({ org_id: B.org.id, environment_id: B.production.id, manifest: [{ name: "B_SECRET_wire" }, { name: "B_SECRET_transfer" }], domains: ["finance"], reassess: false });
  const bBefore = await rt.manifests.manifestHistory(B.org.id, B.production.id);

  // ── 1. READ isolation ──────────────────────────────────────────────────────
  await throws403(() => rt.manifests.currentManifest(A.org.id, B.production.id), "A reading B's current manifest");
  await throws403(() => rt.manifests.manifestHistory(A.org.id, B.production.id), "A reading B's manifest history");
  await throws403(() => rt.manifests.diffVersions(A.org.id, B.production.id, 1, 1), "A diffing B's manifest versions");

  // ── 2. UPDATE isolation ────────────────────────────────────────────────────
  await throws403(() => rt.manifests.putManifest({ org_id: A.org.id, environment_id: B.production.id, manifest: [{ name: "A_injected" }], reassess: false }), "A writing into B's environment");
  const bAfter = await rt.manifests.manifestHistory(B.org.id, B.production.id);
  eq(bAfter.length, bBefore.length, "B's manifest history is untouched after A's write attempt");
  eq(bAfter[0].tools, ["B_SECRET_transfer", "B_SECRET_wire"], "B's manifest content is unchanged (no cross-tenant corruption)");

  // ── 3. DELETE isolation ────────────────────────────────────────────────────
  // Manifests are append-only immutable versions — there is no delete API to
  // abuse. Assert no delete function is exposed, and B's data survives.
  ok(typeof rt.manifests.deleteManifest === "undefined" && typeof rt.manifests.remove === "undefined", "no manifest delete path exists to abuse");
  eq((await rt.manifests.currentManifest(B.org.id, B.production.id)).tools, ["B_SECRET_transfer", "B_SECRET_wire"], "B's current manifest intact");

  // ── 4. Enumeration attacks fail (no distinguishing signal) ─────────────────
  let unknownErr = "", otherErr = "";
  try { await rt.manifests.currentManifest(A.org.id, "env_totally_made_up_000"); } catch (e) { unknownErr = e.message; }
  try { await rt.manifests.currentManifest(A.org.id, B.production.id); } catch (e) { otherErr = e.message; }
  ok(unknownErr && otherErr && unknownErr === otherErr, "unknown-id and other-tenant-id return the SAME 403 message (no enumeration oracle)");

  // ── 5. Forged environment IDs fail ─────────────────────────────────────────
  for (const forged of ["", "null", "../etc", "env_" + "0".repeat(40), B.production.id + "x"]) {
    await throws403(() => rt.manifests.currentManifest(A.org.id, forged), `forged env id ${JSON.stringify(forged).slice(0, 24)} rejected`);
  }

  // ── 6. Same-tenant behaviour unchanged ─────────────────────────────────────
  const aPut = await rt.manifests.putManifest({ org_id: A.org.id, environment_id: A.production.id, manifest: [{ name: "a_read" }, { name: "a_write" }], domains: ["finance"], reassess: false });
  ok(aPut.changed === true && aPut.version.version === 1, "A writes its OWN manifest normally");
  const aCur = await rt.manifests.currentManifest(A.org.id, A.production.id);
  eq(aCur.tools, ["a_read", "a_write"], "A reads its OWN manifest normally");
  ok((await rt.manifests.manifestHistory(A.org.id, A.production.id)).length === 1, "A's own history works");

  // ── 7. API contract unchanged (same-tenant shapes) ─────────────────────────
  ok("changed" in aPut && "version" in aPut && "diff" in aPut, "putManifest return shape unchanged");
  ok(aCur && "tools" in aCur && "content_hash" in aCur && "version" in aCur, "currentManifest return shape unchanged");

  // ── End-to-end over HTTP: the route maps the violation to 403 ──────────────
  const admin = "iso-admin";
  const srv = await startServer({ RUNTIME_PORT: "8798", RUNTIME_ADMIN_KEY: admin, RUNTIME_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "rt-iso-http-")), GOVERNANCE_URL: process.env.GOVERNANCE_URL, GOVERNANCE_TOKEN: process.env.GOVERNANCE_TOKEN });
  const onB = await httpJson(8798, "POST", "/admin/onboard", { "x-admin-key": admin }, { name: "HTTP B", slug: "hb" });
  const onA = await httpJson(8798, "POST", "/admin/onboard", { "x-admin-key": admin }, { name: "HTTP A", slug: "ha" });
  const bEnv = onB.json.production.id;
  // B seeds a manifest with its own env-scoped ingest key
  await httpJson(8798, "POST", "/v1/manifests", { authorization: `Bearer ${onB.json.ingest_key}` }, { manifest: [{ name: "HTTP_B_SECRET" }], reassess: false });
  // A gets an ORG-LEVEL viewer key (no env scope) and tries to read B's env via query param
  const aOrgKey = await httpJson(8798, "POST", "/admin/keys", { "x-admin-key": admin }, { org_id: onA.json.org.id, role: "viewer", label: "dash" });
  const read = await httpJson(8798, "GET", `/v1/manifests/current?environment_id=${bEnv}`, { authorization: `Bearer ${aOrgKey.json.key}` });
  ok(read.status === 403, `HTTP: A's org-level key reading B's manifest → 403 (got ${read.status})`);
  ok(!(read.json && JSON.stringify(read.json).includes("SECRET")), "HTTP: no secret leaked in the 403 body");
  const write = await httpJson(8798, "POST", `/v1/manifests?environment_id=${bEnv}`, { authorization: `Bearer ${aOrgKey.json.key}` }, { manifest: [{ name: "A_INJECT" }], reassess: false });
  ok(write.status === 403, `HTTP: A writing into B's env → 403 (got ${write.status})`);
  // Same-tenant over HTTP still works
  const bRead = await httpJson(8798, "GET", "/v1/manifests/current", { authorization: `Bearer ${onB.json.ingest_key}` });
  ok(bRead.status === 200 && bRead.json && bRead.json.tools && bRead.json.tools.includes("HTTP_B_SECRET"), "HTTP: B reads its OWN manifest normally (contract unchanged)");
  srv.kill("SIGKILL");

  console.log(`\nManifest tenant-isolation: ${pass} passed, ${fail} failed`);
  if (fail) { console.log("\nFAILURES:"); for (const f of fails) console.log("  ✗ " + f); }
  try { fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true }); } catch { /**/ }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("isolation test crashed:", e); process.exit(1); });
