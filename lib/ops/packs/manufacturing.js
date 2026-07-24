/* Guardian OS — Manufacturing Intelligence Pack.
 * Robotics governance, operational safety and industrial AI monitoring.
 * Declarative only. */
"use strict";
const S = require("../sections");

const ROBOT = /robot|arm|cell|actuator|plc|cnc|agv|conveyor|machine/i;
const PRODUCTION = /production|line|batch|recipe|throughput|yield|shift|schedule/i;
const SAFETY = /safety|interlock|estop|emergency_stop|guard|lockout/i;

module.exports = {
  id: "manufacturing",
  version: "1.0.0",
  industry: "Manufacturing",
  title: "Manufacturing Intelligence Pack",
  purpose: "Robotics governance, operational safety and industrial AI monitoring for production environments.",
  match: ["manufactur", "factory", "industrial", "production", "robotics", "plant", "assembly"],
  regulations: ["ISO 45001", "IEC 61508 / 62061 functional safety", "ISO 10218 robot safety", "Machinery Directive", "EU AI Act — safety component"],

  policies: [
    { name: "mfg_safety_interlock_immutable", domain: "enterprise",
      spec: { match: { tools: ["disable_interlock", "override_estop", "bypass_guard", "disable_safety_system"] },
        conditions: {}, severity: "critical" } },
    { name: "mfg_robot_command_requires_approval", domain: "enterprise",
      spec: { match: { tools: ["move_robot", "command_cell", "actuate_machine", "start_line", "change_recipe"] },
        conditions: { unauthorized_unless: ["engineer_approved", "operator_approved"] }, severity: "critical" } },
    { name: "mfg_production_change_control", domain: "enterprise",
      spec: { match: { tools: ["update_recipe", "change_setpoint", "modify_program"] },
        conditions: { unauthorized_unless: ["change_approved"] }, severity: "critical" } },
  ],

  templates: [
    { name: "mfg_speed_limit", description: "Cap an autonomous machine parameter (speed, torque, temperature).", domain: "enterprise",
      spec: { match: { tools: ["<machine_tool>"] }, conditions: { threshold: { field: "setpoint", op: ">", value: 100 } }, severity: "critical" } },
  ],

  evidence_mappings: [
    { regulation: "ISO 10218", control: "Robot safeguarding", evidence: "Safety-system disablement is refused by the kernel with no flag combination that unblocks it." },
    { regulation: "IEC 61508", control: "Functional safety change control", evidence: "Recipe/setpoint changes require approval; versions and approvals are retained." },
    { regulation: "ISO 45001", control: "Operational safety", evidence: "Safety incidents and their response workflow are recorded in the incident ledger." },
    { regulation: "EU AI Act", control: "AI as a safety component", evidence: "Industrial AI actions are governed at runtime and evidenced." },
  ],

  incident_workflows: [
    { kind: "safety_system_bypass_attempt", severity: "critical", steps: ["Confirm the runtime refusal held", "Halt the implicated cell", "Notify the plant safety officer", "Root-cause + corrective action", "Retain evidence for the safety file"] },
    { kind: "unplanned_production_change", severity: "warning", steps: ["Identify the changed recipe/setpoint", "Compare against the governed baseline", "Engineering review", "Re-affirm change control"] },
  ],

  metrics(ctx) {
    const robots = (ctx.entities.tool || []).filter((t) => ROBOT.test(t.name));
    const safetyTools = (ctx.entities.tool || []).filter((t) => SAFETY.test(t.name));
    const h = ctx.health;
    const safetyPosture = h ? S.clamp(h.scores.policy_coverage.score * 0.5 + h.scores.drift_score.score * 0.5) : null;
    return [
      { key: "safety_posture", label: "Operational safety posture", value: safetyPosture == null ? "—" : safetyPosture, band: safetyPosture == null ? null : S.band(safetyPosture) },
      { key: "robotic_systems", label: "Robotic / machine tools", value: robots.length },
      { key: "safety_controls", label: "Safety-critical controls", value: safetyTools.length },
      { key: "incidents", label: "Open safety incidents", value: ctx.incidents.length },
      { key: "runtime_health", label: "Industrial AI health", value: h ? h.scores.runtime_health.score : "—", band: h ? h.scores.runtime_health.band : null },
    ];
  },

  dashboard(ctx, pack) {
    const robots = (ctx.entities.tool || []).filter((t) => ROBOT.test(t.name));
    const prod = (ctx.entities.tool || []).filter((t) => PRODUCTION.test(t.name));
    const mfgPolicies = ctx.scopedPolicies.filter((p) => p.name.startsWith("mfg_"));
    const envs = ctx.entities.environment || [];
    return [
      S.stat("plant", "Production intelligence", [
        { label: "Robotic / machine tools", value: robots.length },
        { label: "Production tools", value: prod.length },
        { label: "Environments (plants/lines)", value: envs.length },
        { label: "Manufacturing policies live", value: mfgPolicies.length },
      ]),
      S.list("robotics", "Robotics governance", robots.map((t) => ({ title: t.name, meta: "engineer approval required" })), "No robotic tools in the estate."),
      S.list("safety", "Operational safety", ctx.incidents.map((i) => ({ title: i.summary || i.kind, meta: `${i.severity} · ${i.created_at}`, severity: S.severity(i.severity) })), "No safety incidents open."),
      S.list("equipment", "Equipment governance", (ctx.entities.ai_system || []).map((s) => ({ title: s.name, meta: `${(s.refs || []).length} mapped dependencies` })), "No industrial AI systems."),
      S.stat("twin", "Factory digital twin", ctx.twin && ctx.twin.counts ? [
        { label: "Asset nodes", value: ctx.twin.counts.asset.nodes },
        { label: "Dependency edges", value: ctx.twin.counts.dependency.edges },
        { label: "Runtime nodes", value: ctx.twin.counts.runtime.nodes },
      ] : []),
      S.list("policies", "Manufacturing policies enforced", mfgPolicies.map((p) => ({ title: p.name, meta: `${p.domain} · v${p.version} · active` })), "Install the pack to activate manufacturing policies."),
      S.list("workflows", "Safety response workflows", pack.incident_workflows.map((w) => ({ title: w.kind.replace(/_/g, " "), meta: w.steps.join(" → "), severity: w.severity }))),
      S.list("regmap", "Standards mappings", pack.evidence_mappings.map((m) => ({ title: `${m.regulation} — ${m.control}`, meta: m.evidence }))),
    ];
  },

  recommendations(ctx) {
    const out = [];
    const policyTools = new Set();
    for (const p of ctx.scopedPolicies) for (const t of ((p.spec && p.spec.match && p.spec.match.tools) || [])) policyTools.add(t);
    for (const t of (ctx.entities.tool || [])) {
      if (ROBOT.test(t.name) && !policyTools.has(t.name)) out.push({ title: `Govern robotic actuation tool: ${t.name}`, detail: `"${t.name}" can command physical machinery with no active runtime policy (ISO 10218 safeguarding).`, severity: "critical" });
      if (SAFETY.test(t.name) && !policyTools.has(t.name)) out.push({ title: `Make safety control immutable: ${t.name}`, detail: `Safety-related tool "${t.name}" is ungoverned — safety-system disablement must be refusable at runtime.`, severity: "critical" });
    }
    return out;
  },
};
