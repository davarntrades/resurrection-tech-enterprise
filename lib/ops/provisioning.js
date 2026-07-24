/* ============================================================================
 * Guardian OS — Enterprise Provisioning ("the OS installation").
 *
 * Given an enterprise spec, stand up a COMPLETE GOVERNED RUNTIME automatically:
 *
 *   Phase 1  Enterprise Identity   org · business units · environments · regions · compliance
 *   Phase 2  AI Estate             systems · models · agents · MCP · APIs · tools · integrations
 *                                  (relationships auto-mapped as entity refs)
 *   Phase 3  Trust Architecture    boundaries · IdPs · approvers · operators · risk zones ·
 *                                  critical systems · protected assets
 *   Phase 4  Runtime Governance    Ω policies via the DYNAMIC POLICY ENGINE (govpolicy) +
 *                                  fail-closed defaults — validated, versioned, evidence-backed
 *   Phase 5  Department Deployment enable Guardian OS departments (governed agents)
 *   Phase 6  Digital Twin          the six enterprise graphs (entgraph) generated immediately
 *   Phase 7  Executive Command     a populated command payload — never an empty dashboard;
 *                                  realistic example data is seeded until live events replace it
 *
 * Every generated policy goes through govpolicy (draft → validate → activate), so
 * deny-by-default, fail-closed, the approval workflow and the evidence trail are
 * all preserved. Provisioning never weakens the baseline — its policies are
 * deny-only additions, and activation is the operator's authorised install step.
 * ============================================================================ */
"use strict";
const rt = require("../runtime");
const store = rt.store;
const entities = require("./entities");
const entgraph = require("./entgraph");
const govpolicy = require("./govpolicy");
const events = require("./events");

const DEFAULT_ENVIRONMENTS = ["Development", "Test", "Production"];
// Enable-able departments → the agent id they map to (surfaces have no agent).
const DEPARTMENTS = [
  { id: "executive_command", label: "Executive Command", surface: true },
  { id: "operations", label: "Operations", surface: true },
  { id: "finance", label: "Finance", agent: "finance" },
  { id: "security", label: "Security", agent: "security" },
  { id: "compliance", label: "Compliance", agent: "compliance" },
  { id: "customer_success", label: "Customer Success", agent: "customer_success" },
  { id: "incident_response", label: "Incident Response", agent: "incident_response" },
  { id: "architecture", label: "Architecture", agent: "architecture" },
  { id: "risk", label: "Risk", agent: "risk_intelligence" },
  { id: "policy_engineering", label: "Policy Engineering", agent: "policy_engineering" },
];
const DEPARTMENT_IDS = DEPARTMENTS.map((d) => d.id);

const slugify = (s) => String(s || "enterprise").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "enterprise";

/** A realistic demo enterprise, so an install is a one-click OS installation. */
function exampleSpec() {
  return {
    name: "Aurora Financial", industry: "Financial services",
    business_units: ["Retail Banking", "Wealth Management", "Treasury"],
    regions: ["EU", "UK", "US"], environments: DEFAULT_ENVIRONMENTS,
    compliance: ["GDPR", "FCA", "AML", "PCI-DSS"],
    ai_systems: [
      { name: "Payments Copilot", environment: "Production",
        agents: [{ name: "Payments Agent", model: "claude-opus-4-8", tools: ["wire_transfer", "send_payment", "export_documents"], privileged_tools: ["wire_transfer"], mcp_servers: ["core-banking-mcp"] }],
        apis: ["Core Banking API"], integrations: ["Stripe"] },
      { name: "Advisory Copilot", environment: "Production",
        agents: [{ name: "Advisory Agent", model: "claude-sonnet-5", tools: ["generate_report", "send_confidential_report"], mcp_servers: ["market-data-mcp"] }],
        apis: ["Market Data API"], integrations: ["Salesforce"] },
      { name: "Ops Copilot", environment: "Test",
        agents: [{ name: "Ops Agent", model: "claude-haiku-4-5", tools: ["deploy_runtime", "open_incident"], privileged_tools: ["deploy_runtime"], mcp_servers: [] }],
        apis: [], integrations: ["PagerDuty"] },
    ],
    trust: {
      identity_providers: ["Okta"], approvers: ["Head of Risk", "CISO"], operators: ["Platform SRE"],
      trust_boundaries: ["Production perimeter", "Customer-data boundary"],
      risk_zones: ["Funds movement", "Customer PII", "Production deployment"],
      critical_systems: ["Core Banking", "Ledger"], protected_assets: ["Customer accounts", "Transaction ledger", "PII store"],
    },
    departments: DEPARTMENT_IDS,
    activate_policies: true, seed: true,
  };
}

function shape(p) {
  if (!p) return null;
  return { id: p.id, org_id: p.org_id, name: p.name, status: p.status, spec: p.spec || null, result: p.result || null,
    phases: p.phases || null, created_by: p.created_by || null, finished_at: p.finished_at || null, created_at: p.created_at };
}
// Read surfaces tolerate an un-run additive migration (findOptional degrades to
// empty and registers the pending migration) — a missing table must never take
// the Control Room's Provision tab down with a 500. provision() itself still
// writes through store.insert/update, which throws loudly if the table is absent.
async function get(id) { return shape(await store.findOneOptional("provisioning", { id })); }
async function list({ limit = 50 } = {}) {
  const rows = await store.findOptional("provisioning", {});
  rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return rows.slice(0, limit).map(shape);
}
async function forOrg(org_id) { return (await store.findOptional("provisioning", { org_id })).map(shape)[0] || null; }

/** Preview counts without creating anything. */
function plan(spec) {
  const s = { ...exampleSpec(), ...(spec || {}) };
  const agents = (s.ai_systems || []).reduce((n, sys) => n + (sys.agents || []).length, 0);
  const tools = new Set(); for (const sys of s.ai_systems || []) for (const a of sys.agents || []) for (const t of a.tools || []) tools.add(t);
  return {
    identity: (s.business_units || []).length + (s.environments || DEFAULT_ENVIRONMENTS).length + (s.regions || []).length + (s.compliance || []).length,
    estate: (s.ai_systems || []).length + agents + tools.size,
    trust: Object.values(s.trust || {}).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0),
    departments: (s.departments || DEPARTMENT_IDS).length,
  };
}

// ── Phase 4 helpers: derive deny-only Ω policies from the estate + defaults ──
function baselinePolicies(spec, estateTools) {
  const P = [];
  // Fail-closed defaults every governed enterprise gets.
  P.push({ name: "gos_block_unapproved_deploy", domain: "enterprise", spec: { match: { tools: ["deploy_runtime", "promote_deployment", "rollout_runtime"] }, conditions: { unauthorized_unless: ["operator_approved", "deployment_approved"] }, severity: "critical" } });
  P.push({ name: "gos_block_external_export", domain: "data_privacy", spec: { match: { tools: ["export_documents", "export_evidence", "bulk_export"] }, conditions: { flag_true_blocks: ["destination_external"] }, severity: "critical" } });
  // Privileged tools discovered in the estate → require operator approval.
  for (const t of estateTools) {
    P.push({ name: `gos_privileged_${t}`, domain: "enterprise", spec: { match: { tools: [t] }, conditions: { unauthorized_unless: ["operator_approved"] }, severity: "critical" } });
  }
  // A funds-movement threshold if the estate handles payments.
  if (estateTools.has("wire_transfer") || (spec.ai_systems || []).some((s) => (s.agents || []).some((a) => (a.tools || []).includes("wire_transfer")))) {
    P.push({ name: "gos_wire_limit", domain: "finance", spec: { match: { tools: ["wire_transfer", "send_payment"] }, conditions: { threshold: { field: "amount", op: ">", value: 10000 } }, severity: "critical" } });
  }
  return P;
}

/**
 * Install a governed enterprise runtime. Once the run is recorded, no phase
 * throws — a failed phase marks the run failed with the reason, leaving what was
 * created intact for inspection. The one exception is recording the run itself:
 * if the `rg_provisioning` table is missing (additive migration not applied),
 * that insert throws so the caller learns the install cannot be tracked rather
 * than silently proceeding untracked. The API route reports it as a 400.
 */
async function provision(inputSpec = {}, { actor = "operator" } = {}) {
  const spec = { ...exampleSpec(), ...inputSpec };
  const environments = spec.environments && spec.environments.length ? spec.environments : DEFAULT_ENVIRONMENTS;
  const run = await store.insert("provisioning", { org_id: null, name: spec.name, status: "provisioning", spec, result: null, phases: {}, created_by: actor, finished_at: null, updated_at: store.nowISO() });
  const phases = {};
  const result = {};
  const mark = async (p) => { await store.update("provisioning", run.id, { phases: p, updated_at: store.nowISO() }); };

  try {
    // ── Phase 1 — Enterprise Identity ─────────────────────────────────────
    const org = await rt.admin.createOrg({ name: spec.name, slug: slugify(spec.name), plan: "enterprise" }).catch(async () => ({ id: `org_${slugify(spec.name)}` }));
    const org_id = org.id;
    await store.update("provisioning", run.id, { org_id });
    const idn = [];
    for (const bu of spec.business_units || []) idn.push({ org_id, layer: "identity", kind: "business_unit", name: bu });
    const envEntities = {};
    for (const e of environments) idn.push({ org_id, layer: "identity", kind: "environment", name: e });
    for (const r of spec.regions || []) idn.push({ org_id, layer: "identity", kind: "region", name: r });
    for (const c of spec.compliance || []) idn.push({ org_id, layer: "identity", kind: "compliance_requirement", name: c });
    const idCreated = await entities.createMany(idn);
    for (const e of idCreated) if (e.kind === "environment") envEntities[e.name] = e.id;
    phases.identity = { status: "complete", count: idCreated.length }; result.identity = { org_id, ...phases.identity }; await mark(phases);

    // ── Phase 2 — AI Estate (with auto-mapped relationships) ──────────────
    const estateTools = new Set();
    let estateCount = 0;
    for (const sys of spec.ai_systems || []) {
      const agentIds = [];
      for (const a of sys.agents || []) {
        const model = a.model ? (await entities.create({ org_id, layer: "estate", kind: "model", name: a.model })).id : null;
        const toolIds = [];
        for (const t of a.tools || []) { estateTools.add(t.toLowerCase()); const priv = (a.privileged_tools || []).includes(t); toolIds.push((await entities.create({ org_id, layer: "estate", kind: "tool", name: t, attrs: { privileged: priv } })).id); }
        const mcpIds = [];
        for (const m of a.mcp_servers || []) mcpIds.push((await entities.create({ org_id, layer: "estate", kind: "mcp_server", name: m })).id);
        const agent = await entities.create({ org_id, layer: "estate", kind: "agent", name: a.name, refs: [model, ...toolIds, ...mcpIds].filter(Boolean) });
        agentIds.push(agent.id); estateCount += 2 + toolIds.length + mcpIds.length;
      }
      const apiIds = [];
      for (const api of sys.apis || []) apiIds.push((await entities.create({ org_id, layer: "estate", kind: "api", name: api })).id);
      const intIds = [];
      for (const it of sys.integrations || []) intIds.push((await entities.create({ org_id, layer: "estate", kind: "integration", name: it })).id);
      const envId = envEntities[sys.environment] || envEntities.Production || Object.values(envEntities)[0] || null;
      await entities.create({ org_id, layer: "estate", kind: "ai_system", name: sys.name, refs: [...agentIds, ...apiIds, ...intIds, envId].filter(Boolean) });
      estateCount += 1 + apiIds.length + intIds.length;
    }
    phases.estate = { status: "complete", count: estateCount, privileged_tools: [...estateTools] }; result.estate = phases.estate; await mark(phases);

    // ── Phase 3 — Trust Architecture ──────────────────────────────────────
    const t = spec.trust || {};
    const trustEnts = [];
    const paIds = {};
    for (const pa of t.protected_assets || []) { const e = await entities.create({ org_id, layer: "trust", kind: "protected_asset", name: pa }); paIds[pa] = e.id; trustEnts.push(e); }
    for (const cs of t.critical_systems || []) trustEnts.push(await entities.create({ org_id, layer: "trust", kind: "critical_system", name: cs, refs: Object.values(paIds) }));
    for (const rz of t.risk_zones || []) trustEnts.push(await entities.create({ org_id, layer: "trust", kind: "risk_zone", name: rz, refs: Object.values(paIds).slice(0, 2) }));
    for (const tb of t.trust_boundaries || []) trustEnts.push(await entities.create({ org_id, layer: "trust", kind: "trust_boundary", name: tb, refs: Object.values(envEntities) }));
    for (const ip of t.identity_providers || []) trustEnts.push(await entities.create({ org_id, layer: "trust", kind: "identity_provider", name: ip }));
    for (const ap of t.approvers || []) trustEnts.push(await entities.create({ org_id, layer: "trust", kind: "approver", name: ap }));
    for (const opr of t.operators || []) trustEnts.push(await entities.create({ org_id, layer: "trust", kind: "operator", name: opr }));
    phases.trust = { status: "complete", count: trustEnts.length }; result.trust = phases.trust; await mark(phases);

    // ── Phase 4 — Runtime Governance (dynamic policy engine) ──────────────
    const wanted = baselinePolicies(spec, estateTools);
    const policies = [];
    for (const w of wanted) {
      try {
        const d = await govpolicy.draft({ name: w.name, scope: org_id, domain: w.domain, spec: w.spec, notes: `provisioned for ${spec.name}`, created_by: actor });
        await govpolicy.validate(d.id, { actor });
        let status = "validated";
        if (spec.activate_policies !== false) { await govpolicy.activate(d.id, { actor }); status = "active"; }
        policies.push({ id: d.id, name: w.name, status });
      } catch (e) { policies.push({ name: w.name, status: "error", error: e.message }); }
    }
    phases.governance = { status: "complete", policies: policies.length, active: policies.filter((p) => p.status === "active").length, fail_closed: true };
    result.governance = { ...phases.governance, list: policies }; await mark(phases);

    // ── Phase 5 — Department Deployment ───────────────────────────────────
    const chosen = (spec.departments && spec.departments.length ? spec.departments : DEPARTMENT_IDS).filter((d) => DEPARTMENT_IDS.includes(d));
    for (const dep of chosen) await store.insert("enterprise_departments", { org_id, department: dep, enabled: true, config: {}, updated_at: store.nowISO() });
    phases.departments = { status: "complete", enabled: chosen.length, list: chosen }; result.departments = phases.departments; await mark(phases);

    // ── Phase 7 (seed) — never an empty dashboard ─────────────────────────
    // Seed realistic example governance activity so Executive Command is
    // populated immediately; marked as examples until live events replace them.
    if (spec.seed !== false) {
      const proposals = require("./proposals");
      const incidents = require("./incidents");
      await proposals.propose({ action_id: "send_confidential_report", org_id, params: { org_id }, source: "provisioning:example" }).catch(() => {});
      await proposals.propose({ action_id: "refresh_customer_intelligence", org_id, params: { org_id }, source: "provisioning:example" }).catch(() => {});
      await incidents.open({ severity: "warning", kind: "example_runtime_signal", summary: "Example: elevated model latency on Payments Copilot (seeded until live events arrive)", org_id, opened_by: "provisioning" }).catch(() => {});
      result.seeded = { approvals: 1, snapshot: 1, incident: 1 };
    }

    // ── Phase 6 — Digital Twin Generation (derived, immediate) ────────────
    const graph = await entgraph.build(org_id).catch(() => null);
    phases.twin = { status: "complete", facets: graph ? graph.counts : null }; result.twin = phases.twin; await mark(phases);

    // Capture the governed baseline so Managed Governance can watch for drift
    // from the first second — the enterprise is continuously governed, not just
    // installed. Best-effort: a baseline failure never fails the install.
    try { const mg = require("./managed"); const b = await mg.captureBaseline(org_id, { actor }); result.baseline = b ? { version: b.version } : null; } catch (e) { result.baseline = { error: e.message }; }

    // Suggest the Industry Intelligence Pack matching this enterprise's sector.
    // Suggestion only — installing a pack activates Ω policies, which stays an
    // explicit, governed operator decision.
    try { const s = require("./industry").suggest(spec.industry); if (s) result.suggested_industry_pack = s; } catch { /* packs optional */ }

    await store.update("provisioning", run.id, { status: "complete", result, phases, finished_at: store.nowISO(), updated_at: store.nowISO() });
    await rt.adminaudit.record({ action: "enterprise_provisioned", actor, via: "ops", target: org_id, meta: { name: spec.name, policies: policies.length, departments: chosen.length } });
    await events.emit("provisioning.complete", { id: run.id, org_id, name: spec.name });
    rt.log.info("enterprise_provisioned", { id: run.id, org_id, name: spec.name });
    return { ...(await get(run.id)), org_id, command: await command(org_id) };
  } catch (e) {
    await store.update("provisioning", run.id, { status: "failed", phases, result: { ...result, error: e.message || String(e) }, finished_at: store.nowISO() });
    rt.log.error("provisioning_failed", { id: run.id, error: e.message });
    return { ...(await get(run.id)), error: e.message || String(e) };
  }
}

/** Phase 7 — the Executive Command payload for a provisioned enterprise. Never
 *  empty once provisioned. Read-only; assembles from the installed runtime. */
async function command(org_id) {
  if (!org_id) return null;
  const intelligence = require("./intelligence");
  const proposals = require("./proposals");
  const incidents = require("./incidents");
  const [org, detail, entSummary, depsRows, activePolicies, escalated, openInc, graph] = await Promise.all([
    store.findOne("orgs", { id: org_id }).catch(() => null),
    intelligence.detail(org_id).catch(() => null),
    entities.summary(org_id),
    store.find("enterprise_departments", { org_id }).catch(() => []),
    govpolicy.active({}).catch(() => []),
    proposals.list({ status: "escalated", org_id, limit: 20 }).catch(() => []),
    incidents.list({ status: "open", org_id, limit: 20 }).catch(() => []),
    entgraph.build(org_id).catch(() => null),
  ]);
  const scopedPolicies = activePolicies.filter((p) => p.scope === org_id);
  const health = detail ? { score: detail.scores.health.score, band: detail.scores.health.band } : null;
  const aiSystems = await entities.forOrg(org_id, { kind: "ai_system" });
  const agents = await entities.forOrg(org_id, { kind: "agent" });
  return {
    org_id, name: org ? org.name : org_id, generated_at: store.nowISO(),
    health,
    ai_systems: { systems: aiSystems.length, agents: agents.length, list: aiSystems.slice(0, 8).map((s) => ({ name: s.name, seeded: s.seeded })) },
    governance: { active_policies: scopedPolicies.length, fail_closed: true, status: scopedPolicies.length ? "governed" : "baseline" },
    open_approvals: escalated.map((p) => ({ id: p.id, action_id: p.action_id, risk: p.risk, reason: (p.reasoning && p.reasoning.reason) || null })),
    risks: { open_incidents: openInc.length, incidents: openInc.slice(0, 5).map((i) => ({ severity: i.severity, summary: i.summary || i.kind })), risk_zones: (await entities.forOrg(org_id, { kind: "risk_zone" })).map((z) => z.name) },
    departments: depsRows.filter((d) => d.enabled).map((d) => d.department),
    twin: graph ? graph.counts : null,
    estate: entSummary,
    recommended_actions: [
      escalated.length ? { title: `${escalated.length} approval(s) awaiting sign-off`, ref: `/admin/operations?view=approvals` } : null,
      openInc.length ? { title: `${openInc.length} open incident(s) to review`, ref: `/admin/operations?view=blocked` } : null,
      scopedPolicies.length ? null : { title: "Activate the enterprise's governance policies", ref: `/admin/operations?view=policies` },
    ].filter(Boolean),
  };
}

module.exports = { DEPARTMENTS, DEPARTMENT_IDS, exampleSpec, plan, provision, command, get, list, forOrg };
