/* ============================================================================
 * Enterprise Runtime Governance Assessment assembler.
 *
 * This is the organisation-wide assessment product. It aggregates the stored
 * manifests and live engine assessments for every customer environment, then
 * hands one evidence model to the authoritative branded HTML generator. It is
 * deliberately separate from the single-environment 48-Hour Audit.
 * ============================================================================ */
"use strict";
const store = require("./store");
const admin = require("./admin");
const engine = require("./engine");
const metrics = require("./metrics");
const manifests = require("./manifests");
const dk = require("../../scripts/delivery-kit.cjs");

const NO_MANIFEST = "Enterprise assessment unavailable — at least one stored customer manifest is required.";

async function availability(org_id) {
  try {
    const environments = (await admin.listEnvironments(org_id)).filter((e) => (e.status || "active") === "active");
    const resolved = await Promise.all(environments.map(async (environment) => ({
      environment,
      manifest: await manifests.currentManifest(org_id, environment.id).catch(() => null),
    })));
    const withManifest = resolved.filter((x) => x.manifest);
    if (!withManifest.length) return { available: false, reason: NO_MANIFEST, environment_count: environments.length, assessed_environment_count: 0 };
    return {
      available: true,
      environment_count: environments.length,
      assessed_environment_count: withManifest.length,
      tool_count: withManifest.reduce((n, x) => n + ((x.manifest.tools || []).length), 0),
    };
  } catch (e) {
    return { available: false, reason: (e && e.message) || "enterprise assessment scope lookup failed" };
  }
}

const pct = (n, d) => d > 0 ? Math.round((n / d) * 1000) / 10 : null;
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

function aggregateExposure(rows) {
  const out = {};
  for (const row of rows) {
    for (const [riskClass, x] of Object.entries(row.exposure || {})) {
      const current = out[riskClass] || { tools: 0, rules: new Set(), environments: new Set(), statuses: [] };
      current.tools += Number(x.tools || 0);
      for (const rule of (x.rules || [])) current.rules.add(rule);
      current.environments.add(row.environment.id);
      current.statuses.push(String(x.status || "Not assessed"));
      out[riskClass] = current;
    }
  }
  return Object.fromEntries(Object.entries(out).map(([riskClass, x]) => {
    const status = x.statuses.includes("Uncovered") ? "Uncovered" : x.statuses.includes("Partial") ? "Partial" : x.statuses.every((s) => s === "Covered") ? "Covered" : "Not assessed";
    return [riskClass, { status, tools: x.tools, rules: [...x.rules].sort(), environment_count: x.environments.size }];
  }));
}

function readinessModel({ environments, assessed, totals, chains, telemetryTotal }) {
  const manifestCoverage = pct(assessed.length, environments.length) ?? 0;
  const omegaCoverage = totals.risky > 0 ? pct(totals.covered, totals.risky) ?? 0 : 0;
  const production = environments.filter((e) => e.kind === "production");
  const enforcement = pct(production.filter((e) => e.mode === "enforce").length, production.length) ?? 0;
  const chainIntegrity = chains.length ? pct(chains.filter((x) => x.ok).length, chains.length) ?? 0 : 0;
  const telemetry = telemetryTotal > 0 ? 100 : 0;
  const components = [
    { key: "estate_manifest_coverage", label: "Estate manifest coverage", score: manifestCoverage, weight: 20 },
    { key: "omega_coverage", label: "Reachable Ω coverage", score: omegaCoverage, weight: 30 },
    { key: "production_enforcement", label: "Production enforcement", score: enforcement, weight: 20 },
    { key: "evidence_integrity", label: "Evidence-chain integrity", score: chainIntegrity, weight: 15 },
    { key: "runtime_telemetry", label: "Runtime telemetry", score: telemetry, weight: 15 },
  ];
  const score = clamp(components.reduce((n, c) => n + (c.score * c.weight / 100), 0));
  const band = score >= 85 ? "Production governance ready" : score >= 70 ? "Conditionally ready" : score >= 50 ? "Remediation required" : "Not ready for production rollout";
  return { score, band, components };
}

function controlGaps({ environments, assessed, totals, telemetryTotal, replayReady }) {
  const gaps = [];
  const missing = environments.filter((e) => !assessed.some((x) => x.environment.id === e.id));
  if (missing.length) gaps.push({ severity: "High", title: "Incomplete estate manifest coverage", evidence: `${missing.length} of ${environments.length} active environments have no stored manifest.`, action: "Collect and assess the authoritative tool manifest for every in-scope environment." });
  if (totals.uncovered > 0) gaps.push({ severity: "Critical", title: "Uncovered reachable pathways", evidence: `${totals.uncovered} risk-bearing tool pathways are uncovered.`, action: "Add fail-closed runtime policies before production approval." });
  if (totals.partial > 0) gaps.push({ severity: "High", title: "Partially governed pathways", evidence: `${totals.partial} risk-bearing tool pathways are only partially covered.`, action: "Close partial Ω coverage and replay the affected trajectories." });
  const productionShadow = environments.filter((e) => e.kind === "production" && e.mode !== "enforce");
  if (productionShadow.length) gaps.push({ severity: "High", title: "Production environments remain in shadow mode", evidence: `${productionShadow.length} production environment${productionShadow.length === 1 ? " is" : "s are"} not enforcing BLOCK decisions.`, action: "Complete change approval and move validated production environments to enforce mode." });
  if (!telemetryTotal) gaps.push({ severity: "Medium", title: "No runtime decision telemetry", evidence: "No recorded runtime decisions were available for the assessed estate.", action: "Connect live workflows and collect a representative evidence window." });
  if (!replayReady) gaps.push({ severity: "Medium", title: "Deterministic replay evidence unavailable", evidence: "No in-scope environment retains the trajectory payloads required for exact replay.", action: "Obtain customer approval for scoped payload retention and run the replay protocol." });
  return gaps;
}

function complianceMappings({ totals, telemetryTotal, replayReady }) {
  const coverage = totals.risky > 0 ? (totals.covered / totals.risky) : 0;
  const strong = coverage === 1 && totals.uncovered === 0;
  return [
    { framework: "EU AI Act", control: "Article 9 · Risk management", status: strong ? "Evidence available" : "Partial evidence", evidence: "Reachable Ω exposure map, risk-bearing tool inventory and control gaps." },
    { framework: "EU AI Act", control: "Article 12 · Record-keeping", status: telemetryTotal > 0 ? "Evidence available" : "Not evidenced", evidence: telemetryTotal > 0 ? "Versioned runtime decisions and evidence-chain verification." : "Runtime decision telemetry was not available." },
    { framework: "EU AI Act", control: "Article 14 · Human oversight", status: "Stakeholder validation required", evidence: "Decision rights, escalation ownership and override procedures require interview evidence." },
    { framework: "EU AI Act", control: "Article 15 · Robustness and cybersecurity", status: strong ? "Technical evidence available" : "Partial evidence", evidence: "Pre-execution reachability assessment and forbidden-state interception evidence." },
    { framework: "NIST AI RMF", control: "MAP / MEASURE / MANAGE", status: strong ? "Technical evidence available" : "Partial evidence", evidence: "Mapped tool estate, measured Ω coverage and prioritised control-gap actions." },
    { framework: "ISO/IEC 42001", control: "Operational controls and monitoring", status: telemetryTotal > 0 ? "Partial alignment evidence" : "Not evidenced", evidence: "Runtime governance records support an AIMS; organisational conformity is not assessed here." },
    { framework: "Replay assurance", control: "Reproducibility", status: replayReady ? "Protocol available" : "Not assessed", evidence: replayReady ? "At least one environment retains payloads for exact replay." : "Payload retention is disabled or no replay set was supplied." },
  ];
}

async function assessEnvironment(org_id, environment, manifest) {
  const tools = Array.isArray(manifest.tools) ? manifest.tools : [];
  const domains = Array.isArray(manifest.domains) ? manifest.domains : (manifest.domains ? [manifest.domains] : []);
  const live = await engine.assess(tools, domains).catch((e) => ({ ok: false, error: (e && e.message) || "assessment failed" }));
  const cached = manifest.assessment && manifest.assessment.ok ? manifest.assessment : null;
  const json = live && live.ok && live.json ? live.json : null;
  const summary = (json && json.summary) || (cached && cached.summary) || null;
  const exposure = (json && json.exposure) || (cached && cached.exposure) || {};
  const blocks = (json && json.grounded_blocks) || [];
  const attestation = (json && json.attestation) || null;
  const telemetry = await metrics.summary({ org_id, environment_id: environment.id }).catch(() => null);
  const chain = await store.verifyChain(org_id, environment.id).catch(() => null);
  return { environment, manifest, tools, domains, summary, exposure, blocks, attestation, telemetry, chain, assess_source: json ? "live" : cached ? "cached" : "unavailable" };
}

async function build({ org_id, requested_environment_id }) {
  const org = await admin.getOrg(org_id);
  if (!org) throw Object.assign(new Error("organisation not found"), { code: "not_found" });
  if (requested_environment_id) {
    const selected = await admin.getEnvironment(requested_environment_id);
    if (!selected || selected.org_id !== org_id) throw Object.assign(new Error("environment does not belong to this organisation"), { code: "cross_org" });
  }
  const environments = (await admin.listEnvironments(org_id)).filter((e) => (e.status || "active") === "active");
  const resolved = await Promise.all(environments.map(async (environment) => ({ environment, manifest: await manifests.currentManifest(org_id, environment.id).catch(() => null) })));
  const scoped = resolved.filter((x) => x.manifest);
  if (!scoped.length) throw Object.assign(new Error(NO_MANIFEST), { code: "no_manifest" });
  const assessed = await Promise.all(scoped.map((x) => assessEnvironment(org_id, x.environment, x.manifest)));
  if (!assessed.some((x) => x.summary)) throw Object.assign(new Error("engine assessment produced no enterprise evidence"), { code: "assess_failed" });

  const totals = assessed.reduce((a, x) => {
    const s = x.summary || {};
    a.tools += Number(s.tools ?? x.tools.length ?? 0); a.risky += Number(s.risky || 0); a.covered += Number(s.covered || 0);
    a.partial += Number(s.partial || 0); a.uncovered += Number(s.uncovered || 0); a.blocked += Number((x.blocks || []).length || s.verified_blocked_trajectories || 0);
    return a;
  }, { tools: 0, risky: 0, covered: 0, partial: 0, uncovered: 0, blocked: 0 });
  totals.coverage_pct = pct(totals.covered, totals.risky);
  const telemetryTotal = assessed.reduce((n, x) => n + Number((x.telemetry && x.telemetry.total) || 0), 0);
  const chains = assessed.map((x) => x.chain).filter(Boolean);
  const replayReady = assessed.some((x) => !!x.environment.store_payloads && Number((x.telemetry && x.telemetry.total) || 0) > 0);
  const readiness = readinessModel({ environments, assessed, totals, chains, telemetryTotal });
  const gaps = controlGaps({ environments, assessed, totals, telemetryTotal, replayReady });
  const reference = `RG-ENTERPRISE-${String(org.id).slice(-6).toUpperCase()}-${new Date().toISOString().slice(0, 10)}`;
  const model = {
    reportType: "enterprise_assessment",
    organisation: { id: org.id, name: org.name },
    reference,
    classification: "Confidential",
    scope: { active_environments: environments.length, assessed_environments: assessed.length, manifest_coverage_pct: pct(assessed.length, environments.length), timeline: "2–6 weeks", engagement: "Enterprise Runtime Governance Assessment™" },
    executive: { decision: readiness.score >= 85 && totals.uncovered === 0 ? "Proceed to controlled production planning" : readiness.score >= 70 ? "Proceed conditionally after priority remediation" : "Do not approve broader production rollout", readiness, totals },
    environments: assessed.map((x) => ({
      id: x.environment.id, name: x.environment.name || x.environment.kind, kind: x.environment.kind, mode: x.environment.mode,
      manifest_version: x.manifest.version || null, tools: x.tools, domains: x.domains, summary: x.summary,
      blocked_trajectories: x.blocks, telemetry_evaluations: Number((x.telemetry && x.telemetry.total) || 0),
      evidence_chain_intact: x.chain ? !!x.chain.ok : null, assess_source: x.assess_source,
    })),
    estate: { totals, exposure: aggregateExposure(assessed), telemetry_evaluations: telemetryTotal, evidence_chains_verified: chains.filter((x) => x.ok).length, evidence_chains_checked: chains.length, replay_status: replayReady ? "Ready for scoped replay protocol" : "Not assessed — replay inputs unavailable" },
    controlGaps: gaps,
    maturity: [
      { domain: "Estate visibility", status: assessed.length === environments.length ? "Established" : "Developing", evidence: `${assessed.length}/${environments.length} active environments have assessed manifests.` },
      { domain: "Runtime policy enforcement", status: environments.some((e) => e.kind === "production" && e.mode === "enforce") ? "Operational" : "Developing", evidence: `${environments.filter((e) => e.mode === "enforce").length}/${environments.length} environments are enforcing.` },
      { domain: "Evidence and auditability", status: telemetryTotal > 0 ? "Operational" : "Not evidenced", evidence: `${telemetryTotal} runtime decisions available across the assessed estate.` },
      { domain: "Replay assurance", status: replayReady ? "Protocol ready" : "Not assessed", evidence: replayReady ? "Payload-retaining evidence is available." : "Exact replay inputs were not available." },
      { domain: "Decision rights and operating model", status: "Stakeholder validation required", evidence: "Executive, risk, compliance and technical interviews are engagement inputs." },
    ],
    compliance: complianceMappings({ totals, telemetryTotal, replayReady }),
    stakeholderEvidence: ["Executive risk appetite and deployment decision rights", "Technical architecture and trust-boundary validation", "Compliance obligations and control ownership", "Incident response, override and escalation procedures"].map((item) => ({ item, status: "Pending stakeholder workshop" })),
    roadmap: [
      { horizon: "Immediate · 0–2 weeks", actions: gaps.filter((g) => ["Critical", "High"].includes(g.severity)).map((g) => g.action) },
      { horizon: "30 days", actions: ["Validate cross-system trust boundaries with technical owners.", "Complete representative trajectory replay and document deterministic outcomes.", "Confirm human escalation ownership and emergency override controls."] },
      { horizon: "60–90 days", actions: ["Execute a Limited Pilot™ against agreed production workflows.", "Operationalise monthly evidence, board reporting and control-change review.", "Approve the target Enterprise Integration™ architecture and rollout sequence."] },
    ],
    limitations: ["This generated report covers technical evidence available from stored manifests, live engine assessment and recorded runtime telemetry.", "Stakeholder interviews, documentary control testing and legal compliance conclusions require the full 2–6 week engagement.", "Framework mappings indicate available technical evidence; they are not certifications or legal opinions."],
    meta: { generated_at: store.nowISO(), renderer: "authoritative auditHtml shell", source: "stored manifests + live /v1/assess + runtime telemetry" },
  };
  return { html: dk.enterpriseAssessmentHtml(model), model, meta: model.meta };
}

module.exports = { availability, build, NO_MANIFEST, readinessModel, aggregateExposure, controlGaps, complianceMappings };
