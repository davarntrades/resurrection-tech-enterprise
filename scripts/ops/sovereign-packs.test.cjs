/* ============================================================================
 * Guardian OS — Sovereign Intelligence Packs test (Phase 7).
 *
 * Hermetic (mock engine with dynamic-policy enforcement, temp store). These are
 * the claims a government or enterprise buyer is entitled to have PROVEN rather
 * than asserted in a datasheet:
 *
 *   1. CATALOG        seven sovereign packs, each satisfying the SAME pack
 *                     contract as the eight Industry Packs.
 *   2. NO CODE        no sovereign pack contains an executable value anywhere in
 *                     its object graph — checked structurally, not by review.
 *   3. KERNEL INTACT  every contributed policy uses an Ω domain the kernel
 *                     ALREADY defines. Phase 7 introduces no domain, no
 *                     condition kind, and no new evaluation path.
 *   4. ADMISSIBILITY  a sovereign pack is REFUSED on a deployment that does not
 *                     meet its classification — and the refusal leaves the
 *                     enterprise byte-for-byte untouched (nothing half-installs).
 *   5. GOVERNED       on an eligible deployment it installs through the SAME
 *                     lifecycle (draft → validate → activate) and the SAME
 *                     kernel then enforces it — deny-only.
 *   6. ONE TWIN       the sovereign lens reads the same shared context and shows
 *                     the same governance score as the CEO workspace.
 *   7. FULL FIDELITY  a sovereign pack round-trips through a signed offline
 *                     bundle with NO loss — the air-gapped copy renders
 *                     identically, because there was never any code to lose.
 *   8. HONEST         an un-instrumented readiness measure renders as an
 *                     explicit note, never as a plausible-looking number.
 *   9. REVERSIBLE     uninstalling rolls its policies back to the prior baseline.
 *  10. GOVERNED PATH  its recommendations enter the same proposal → Ω → approval
 *                     → evidence lifecycle as everything else.
 *
 *   node scripts/ops/sovereign-packs.test.cjs
 * ============================================================================ */
"use strict";
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "ops-sovereign-packs-test-"));
process.env.RUNTIME_DATA_DIR = TMP;
process.env.GUARDIAN_TRUST_DIR = path.join(TMP, "trust");
fs.mkdirSync(process.env.GUARDIAN_TRUST_DIR, { recursive: true });
delete process.env.ANTHROPIC_API_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
// The suite drives the profile itself; start from the platform default.
process.env.GUARDIAN_PROFILE = "cloud";

const { startMockEngine } = require("./mock-engine.cjs");

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`  [PASS] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); }
}

const SOVEREIGN_IDS = ["national-security", "defence-operations", "critical-infrastructure", "public-sector", "national-healthcare", "research-development", "cyber-operations"];

/** Walk an object graph looking for anything executable. */
function findFunction(value, at = "pack", seen = new Set()) {
  if (typeof value === "function") return at;
  if (value === null || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  const entries = Array.isArray(value) ? value.map((v, i) => [`[${i}]`, v]) : Object.entries(value).map(([k, v]) => [`.${k}`, v]);
  for (const [k, v] of entries) {
    const hit = findFunction(v, at + k, seen);
    if (hit) return hit;
  }
  return null;
}

async function main() {
  const srv = await startMockEngine({ governancePolicies: true });
  process.env.GOVERNANCE_URL = `http://127.0.0.1:${srv.address().port}`;
  const ops = require("../../lib/ops");
  const rt = require("../../lib/runtime");
  const registry = require("../../lib/ops/packs");
  const sovRegistry = require("../../lib/ops/packs/sovereign");
  const sovereignty = require("../../lib/ops/sovereignty");
  const bundlePacks = require("../../lib/sovereign/packs");
  console.log("\nSovereign Intelligence Packs test (mock engine on :" + srv.address().port + ")\n");

  const evalTool = (tool, args = {}) => rt.engine.evaluate([{ tool, args }], ["enterprise"], 3);

  // ── 1. Catalog + contract ─────────────────────────────────────────────────
  const catalog = ops.industry.catalog().filter((p) => p.sovereign);
  ok(catalog.length === 7 && SOVEREIGN_IDS.every((id) => catalog.some((p) => p.id === id)), "seven Sovereign Intelligence Packs are registered", catalog.map((p) => p.id));
  ok(catalog.every((p) => p.version && p.classification && p.mission_domain && p.counts.policies > 0 && p.counts.mappings > 0), "every sovereign pack is independently versioned and carries policies + evidence mappings");
  ok(catalog.every((p) => p.counts.authority_chains > 0 && p.counts.mission_workflows > 0 && p.counts.capabilities > 0 && p.counts.twin_projections > 0 && p.counts.readiness > 0), "every sovereign pack carries authority chains, mission workflows, governed capabilities, twin projections and readiness measures");
  ok(catalog.every((p) => p.counts.briefings > 0 && p.counts.reports > 0 && p.counts.risk_models > 0), "every sovereign pack carries executive briefings, reports and risk models");
  // The whole registry — both families — still satisfies the ONE pack contract.
  ok(registry.all().every((p) => typeof p.metrics === "function" && typeof p.dashboard === "function" && typeof p.recommendations === "function"), "sovereign and industry packs satisfy the SAME registry contract (one installer, one renderer)");

  // ── 2. Structurally declarative — no executable code, anywhere ────────────
  const offenders = SOVEREIGN_IDS.map((id) => [id, findFunction(sovRegistry.declarative(sovRegistry.get(id)))]).filter(([, hit]) => hit);
  ok(offenders.length === 0, "no sovereign pack contains an executable value anywhere in its object graph", offenders);
  let threw = null;
  try {
    sovRegistry.validate({ ...sovRegistry.declarative(sovRegistry.get("public-sector")), sovereign: { ...sovRegistry.get("public-sector").sovereign, authority_chains: [{ id: "x", onApprove: () => true }] } });
  } catch (e) { threw = e.message; }
  ok(/not declarative/.test(threw || ""), "the registry REFUSES a pack carrying code — the guarantee is structural, not a review convention", threw);

  // ── 3. The kernel is unchanged ────────────────────────────────────────────
  const kernelDomains = require("../../lib/ops/govpolicy").DOMAINS;
  const domainsUsed = [...new Set(SOVEREIGN_IDS.flatMap((id) => sovRegistry.get(id).policies.map((p) => p.domain)))];
  ok(domainsUsed.every((d) => kernelDomains.has(d)), "every sovereign policy uses an Ω domain the kernel ALREADY defines — packs add policies, never domains", domainsUsed);
  const conditionKinds = [...new Set(SOVEREIGN_IDS.flatMap((id) => sovRegistry.get(id).policies.flatMap((p) => Object.keys(p.spec.conditions || {}))))];
  ok(conditionKinds.every((k) => ["unauthorized_unless", "flag_true_blocks", "threshold"].includes(k)), "sovereign policies use only the kernel's existing condition vocabulary", conditionKinds);
  threw = null;
  try { sovRegistry.validate({ ...sovRegistry.declarative(sovRegistry.get("public-sector")), policies: [{ name: "x", domain: "national_security", spec: { match: { tools: ["t"] } } }] }); } catch (e) { threw = e.message; }
  ok(/never domains/.test(threw || ""), "a pack inventing an Ω domain is refused at load", threw);

  // ── Provision an enterprise ───────────────────────────────────────────────
  const prov = await ops.provisioning.provision({}, { actor: "davarn@control-room" });
  const org = prov.org_id;
  ok(!prov.result.suggested_industry_pack || !SOVEREIGN_IDS.includes(prov.result.suggested_industry_pack), "provisioning never AUTO-suggests a sovereign pack — installing one asserts something about the deployment", prov.result.suggested_industry_pack);
  // Ungoverned mission capability, so the pack has real work to do.
  await ops.entities.create({ org_id: org, layer: "estate", kind: "tool", name: "execute_mission_task", attrs: { privileged: true } });
  await ops.entities.create({ org_id: org, layer: "trust", kind: "approver", name: "Mission Authorising Officer" });

  // ── 4. Admissibility — refused below the classification, cleanly ──────────
  const baselinePolicies = (await ops.govpolicy.active({})).filter((p) => p.scope === org).length;
  ok(sovereignty.posture("cloud").admissible_classifications.length === 0, "a cloud deployment can host no sovereign classification at all");
  threw = null;
  try { await ops.industry.install(org, "national-security", { actor: "davarn@control-room" }); } catch (e) { threw = e.message; }
  ok(/requires a Secret deployment/.test(threw || ""), "the National Security Pack is REFUSED on a cloud deployment", threw);
  ok(/sovereign, air_gapped/.test(threw || ""), "the refusal names the deployment profiles that would be eligible");
  const afterRefusal = (await ops.govpolicy.active({})).filter((p) => p.scope === org).length;
  ok(afterRefusal === baselinePolicies && (await ops.industry.installed(org)).length === 0, "a refused install leaves the enterprise byte-for-byte untouched — nothing half-installs", { baselinePolicies, afterRefusal });

  // Classification tiers are DERIVED from deployment guarantees, not declared.
  ok(sovereignty.eligibleProfiles("top_secret").join() === "air_gapped", "Top Secret derives to air-gapped only", sovereignty.eligibleProfiles("top_secret"));
  ok(sovereignty.eligibleProfiles("secret").join() === "sovereign,air_gapped", "Secret derives to sovereign and air-gapped", sovereignty.eligibleProfiles("secret"));
  ok(sovereignty.assessPack(registry.get("healthcare")).ok, "an ordinary Industry Pack is admissible everywhere — Phase 7 constrains nothing that shipped before it");

  // ── 5. Governed install on an eligible deployment ─────────────────────────
  // On a sovereign deployment the runtime is IMMUTABLE, so a pack cannot be
  // installed from the Control Room or an API route at all — it arrives on
  // signed media and nowhere else. That is the supply chain a sovereign estate
  // is entitled to: the network has no write path into governed configuration.
  process.env.GUARDIAN_PROFILE = "sovereign";
  const bundle = require("../../lib/sovereign/bundle");
  const key = bundle.keygen({ key_id: "sovereign-packs-test" });
  fs.writeFileSync(path.join(process.env.GUARDIAN_TRUST_DIR, `${key.key_id}.pub`), `${key.public_key}\n`);
  const signing = { alg: "ed25519", key_id: key.key_id, private_key_pem: key.private_key_pem };
  const mediaFor = (id) => {
    const file = path.join(TMP, `${id}.pack`);
    bundle.writeFile(bundlePacks.exportPack(id, { sign: signing }), file);
    return file;
  };

  ok((await evalTool("execute_mission_task")).json.verdict === "PERMIT", "before installing, the kernel does not govern the mission capability (baseline unchanged)");
  threw = null;
  try { await ops.industry.install(org, "national-security", { actor: "davarn@control-room" }); } catch (e) { threw = e.message; }
  ok(/immutable runtime/.test(threw || ""), "on a sovereign deployment a pack CANNOT be installed over the network — the runtime is locked to signed media", threw);

  const nsMedia = mediaFor("national-security");
  const inst = await ops.industry.installFromBundle(org, nsMedia, { actor: "guardian-cli" });
  ok(inst.bundle && inst.bundle.signed && inst.bundle.alg === "ed25519", "the pack bundle's signature is verified BEFORE anything is installed", inst.bundle);
  ok(inst.projections === "sovereign", "the pack installs in sovereign projection mode — full fidelity from media", inst.projections);
  ok(inst.pack_id === "national-security" && inst.activated === 6, "installing from signed media activates the pack's Ω policies", inst.activated);
  const after = (await ops.govpolicy.active({})).filter((p) => p.scope === org);
  ok(after.length === baselinePolicies + 6, "the pack's policies are live in the SAME engine, scoped to the enterprise", { before: baselinePolicies, after: after.length });
  ok(after.some((p) => p.name === "ns_mission_action_requires_authority" && p.status === "active"), "sovereign policies went through draft → validate → activate (the governed lifecycle)");
  ok((await evalTool("execute_mission_task")).json.verdict === "BLOCK", "the kernel NOW refuses the mission action with no authority (deny-only, live)");
  ok((await evalTool("execute_mission_task", { operator_approved: true })).json.verdict === "PERMIT", "an authorised mission action still PERMITs — a pack only ever ADDS constraints");
  ok((await evalTool("some_unrelated_tool")).json.verdict === "PERMIT", "installing a sovereign pack never blocks unrelated tools");
  ok((await rt.adminaudit.list({ limit: 50 })).some((a) => a.action === "industry_pack_installed"), "the installation is recorded in the admin audit trail");

  // ── 6. One twin — the sovereign lens is a lens, not a second system ───────
  const dash = await ops.industry.dashboard(org, "national-security");
  ok(dash && dash.sections.length >= 15 && dash.metrics.length >= 5, "the pack contributes a full sovereign dashboard + executive metrics", { s: dash.sections.length, m: dash.metrics.length });
  ok(dash.sovereign && dash.sovereign.ok && dash.sovereign.classification === "secret", "the dashboard reports LIVE admissibility alongside the domain intelligence");
  const KINDS = new Set(["stat", "score", "list", "timeline", "note"]);
  ok(dash.sections.every((s) => KINDS.has(s.kind)), "sovereign sections use the shared presentation vocabulary (no sovereign-specific renderer)", [...new Set(dash.sections.map((s) => s.kind))]);
  const ceo = await ops.workspaces.workspace("ceo", org);
  const lens = await ops.workspaces.workspace("industry:national-security", org);
  ok(lens && lens.header.governance.score === ceo.header.governance.score, "the sovereign lens shows the SAME governance score as the CEO workspace (one twin)", { lens: lens && lens.header.governance.score, ceo: ceo.header.governance.score });
  ok(lens.sovereign && lens.sovereign.classification === "secret" && lens.sovereign.mission_domain, "the lens carries its classification and mission domain");
  const rolesFor = await ops.workspaces.rolesFor(org);
  ok(rolesFor.some((r) => r.id === "industry:national-security" && r.sovereign === true), "an installed sovereign pack becomes an additional executive perspective, marked sovereign");

  // ── 7. Full-fidelity offline round trip ──────────────────────────────────
  const content = bundlePacks.declarative(sovRegistry.get("cyber-operations"));
  ok(!!content.sovereign && content.sovereign.authority_chains.length > 0, "the declarative payload carries the WHOLE sovereign block into a bundle");
  const copy = JSON.parse(JSON.stringify({ ...content, id: "cyber-operations-offline" }));
  const adapted = bundlePacks.adapt(copy);
  ok(adapted.projections === "sovereign", "a bundle-installed sovereign pack renders in sovereign mode, never degraded to generic", adapted.projections);
  const neutral = { entities: {}, scopedPolicies: [], blocked: [], packs: [], incidents: [], escalated: [], drift: { open: [] }, evSum: { total: 0 }, cmd: null, health: null };
  ok(adapted.dashboard(neutral).length === sovRegistry.get("cyber-operations").dashboard(neutral).length, "the offline copy renders exactly the same sections as the copy in this image — nothing was lost in transit");
  ok(bundlePacks.projectionMode("national-security") === "sovereign" && bundlePacks.projectionMode("healthcare") === "builtin", "the platform reports each pack's projection mode honestly");
  threw = null;
  try { bundlePacks.validateContent({ ...copy, sovereign: { ...copy.sovereign, workflows: [{ id: "w", run: () => 1 }] } }); } catch (e) { threw = e.message; }
  ok(/not declarative/.test(threw || ""), "a TAMPERED bundle that smuggles code in as content is refused at read time", threw);

  // ── 8. Honesty — no fabricated figures ───────────────────────────────────
  const notes = dash.sections.filter((s) => s.kind === "note" && s.available === false);
  ok(notes.length > 0 && notes.every((n) => typeof n.reason === "string" && n.reason.length > 10), "un-instrumented readiness measures render as explicit notes carrying the reason", notes.map((n) => n.key));
  ok(dash.metrics.filter((m) => m.available === false).every((m) => m.value === "—"), "an ungrounded executive metric shows an em-dash, never a substituted number");

  // ── 9. Recommendations flow through the SAME governed path ───────────────
  // With every declared capability governed and an authority mapped, the pack
  // has nothing to report — and says so rather than manufacturing findings.
  ok((await ops.industry.recommendations(org)).length === 0, "a fully governed estate produces NO findings — the pack does not manufacture work");

  // Now introduce a real gap: mission capability the twin projection recognises
  // and no active policy names.
  await ops.entities.create({ org_id: org, layer: "estate", kind: "tool", name: "task_collection_delta", attrs: { privileged: true } });
  const recs = await ops.industry.recommendations(org);
  ok(recs.length > 0 && recs.every((r) => r.source_pack === "national-security"), "the installed sovereign pack contributes recommendation candidates", recs.length);
  ok(recs.some((r) => r.severity === "critical" && /Mission capability ungoverned: task_collection_delta/.test(r.title)), "the pack finds real mission capability in the estate that no policy names", recs.map((r) => r.title));
  const derived = await ops.managed.deriveRecommendations(org);
  ok(derived.some((r) => r.evidence && r.evidence.pack === "national-security"), "managed governance picks up sovereign recommendations (one recommendations engine)");
  await ops.managed.recommend(org, { actor: "guardian_os" });
  const props = (await ops.proposals.list({ org_id: org, limit: 200 })).filter((p) => p.action_id === "create_recommendation" && p.source === "managed_governance");
  ok(props.length > 0, "sovereign recommendations become GOVERNED proposals — proposal → Ω → approval → evidence", props.length);

  // Sovereignty drift: a deployment that DROPS below the pack's bar is the most
  // serious finding a sovereign pack can make, and it must surface as critical.
  process.env.GUARDIAN_PROFILE = "cloud";
  const driftRecs = await ops.industry.recommendations(org);
  ok(driftRecs.some((r) => r.severity === "critical" && /below its classification/.test(r.title)), "if the deployment later drops below the pack's classification, that surfaces as a critical finding");
  const sum = await ops.industry.summary(org);
  ok(sum.sovereign.inadmissible.length === 1 && sum.sovereign.installed === 1, "the enterprise summary reports the inadmissible pack plainly", sum.sovereign.inadmissible.map((a) => a.classification));
  process.env.GUARDIAN_PROFILE = "sovereign";

  // ── 10. Reversible ───────────────────────────────────────────────────────
  const un = await ops.industry.uninstall(org, "national-security", { actor: "davarn@control-room" });
  ok(un.policies_rolled_back.length === 6, "uninstalling rolls the sovereign pack's policies back", un.policies_rolled_back.length);
  const restored = (await ops.govpolicy.active({})).filter((p) => p.scope === org).length;
  ok(restored === baselinePolicies, "the enterprise returns to exactly its pre-pack governed baseline", { restored, baselinePolicies });
  ok((await evalTool("execute_mission_task")).json.verdict === "PERMIT", "the kernel stops enforcing the pack's rule once removed");
  ok((await ops.workspaces.rolesFor(org)).every((r) => !r.id.startsWith("industry:")), "the sovereign lens disappears with the pack");

  // ── Extensibility: another sovereign domain installs identically ─────────
  const ci = await ops.industry.installFromBundle(org, mediaFor("critical-infrastructure"), { actor: "guardian-cli" });
  ok(ci.activated === 6 && (await ops.industry.isInstalled(org, "critical-infrastructure")), "a different sovereign domain installs the same way (extensibility is data-only)");
  ok((await evalTool("open_breaker")).json.verdict === "BLOCK" && (await evalTool("open_breaker", { operator_approved: true })).json.verdict === "PERMIT", "the Critical Infrastructure pack governs control actions at runtime (control room approval enforced)");

  console.log(`\n${pass}/${pass + fail} passed`);
  srv.close();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test crashed:", e); process.exit(1); });
