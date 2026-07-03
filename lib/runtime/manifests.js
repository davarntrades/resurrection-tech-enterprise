/* ============================================================================
 * Runtime Governance — continuous manifest management.
 *
 * Upload → hash-address → version → diff → history, per environment. When a
 * manifest changes, a new immutable version is stored and (optionally) the
 * change is re-assessed through the engine so exposure deltas are captured.
 * The engine is never modified; this only manages the manifest lifecycle
 * around it.
 * ============================================================================ */
"use strict";
const store = require("./store");
const engine = require("./engine");

const toolName = (t) => (typeof t === "string" ? t : (t && (t.name || t.tool || t.id || (t.function && t.function.name)))) || "";
function normalizeTools(manifest) {
  const arr = Array.isArray(manifest) ? manifest : (manifest && Array.isArray(manifest.tools) ? manifest.tools : []);
  return arr.map((t) => String(toolName(t) || "").trim()).filter(Boolean).sort();
}
function manifestHash(manifest) {
  // Order-independent content hash: two manifests with the same tool set (any
  // order) hash equal, so a cosmetic reorder is not a "change".
  return store.sha256(JSON.stringify(normalizeTools(manifest)));
}

// Upload/replace the manifest for an environment. If the content hash matches
// the current version, this is a no-op (returns { changed:false }). Otherwise a
// new immutable version is recorded and the manifest pointer advances.
async function putManifest({ org_id, environment_id, manifest, domains, note, reassess = true }) {
  const hash = manifestHash(manifest);
  const current = await store.findOne("manifests", { environment_id });
  const versions = (await store.find("manifest_versions", { environment_id }));
  const priorVersion = current ? versions.find((v) => v.id === current.current_version_id) : null;

  if (priorVersion && priorVersion.content_hash === hash) {
    return { changed: false, version: priorVersion, diff: null };
  }

  const versionNumber = versions.length + 1;
  let assessment = null;
  if (reassess) {
    const res = await engine.assess(manifest, domains);
    assessment = res.ok ? { ok: true, summary: res.json && res.json.summary, exposure: res.json && res.json.exposure } : { ok: false, error: res.error || `HTTP ${res.status}` };
  }
  const version = await store.insert("manifest_versions", {
    org_id, environment_id, version: versionNumber, content_hash: hash,
    tools: normalizeTools(manifest), tool_count: normalizeTools(manifest).length,
    domains: domains || null, note: note || null, assessment,
  });

  const diff = priorVersion ? diffTools(priorVersion.tools, version.tools) : { added: version.tools, removed: [], unchanged: [] };

  if (current) await store.update("manifests", current.id, { current_version_id: version.id, updated_at: store.nowISO() });
  else await store.insert("manifests", { org_id, environment_id, current_version_id: version.id, updated_at: store.nowISO() });

  return { changed: true, version, diff, previous_version: priorVersion || null };
}

function diffTools(prev = [], next = []) {
  const a = new Set(prev), b = new Set(next);
  return {
    added: next.filter((t) => !a.has(t)),
    removed: prev.filter((t) => !b.has(t)),
    unchanged: next.filter((t) => a.has(t)),
  };
}

async function currentManifest(environment_id) {
  const current = await store.findOne("manifests", { environment_id });
  if (!current) return null;
  return store.findOne("manifest_versions", { id: current.current_version_id });
}
async function manifestHistory(environment_id) {
  return (await store.find("manifest_versions", { environment_id })).sort((a, b) => b.version - a.version);
}
// Diff any two versions (by version number) for an environment.
async function diffVersions(environment_id, fromV, toV) {
  const hist = await manifestHistory(environment_id);
  const from = hist.find((v) => v.version === fromV), to = hist.find((v) => v.version === toV);
  if (!from || !to) return null;
  return { from: from.version, to: to.version, ...diffTools(from.tools, to.tools) };
}

module.exports = { manifestHash, normalizeTools, putManifest, diffTools, currentManifest, manifestHistory, diffVersions };
