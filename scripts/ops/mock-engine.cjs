/* Shared mock governance engine for Operations Agent tests.
 * Mirrors the SEMANTICS of governance-service/operations_rules.py
 * (deny-by-default authorisation rules + unconditional rules) so the suites
 * are hermetic. The real rules are validated separately by
 * governance-service/test_operations_rules.py against the actual engine. */
"use strict";
const http = require("node:http");

const UNCONDITIONAL = new Map([
  ["delete_evidence", "ops_evidence_destruction"],
  ["purge_evidence", "ops_evidence_destruction"],
  ["share_credentials", "ops_credential_sharing"],
  ["share_api_key", "ops_credential_sharing"],
]);
// operations_rules.py matches the WHOLE OPS_REPORT_DELIVERY vocabulary, not just
// send_confidential_report. Mirroring every name keeps the mock faithful for the
// governed communication actions, which ride this same outbound-delivery rule.
const REPORT_DELIVERY_RULE = ["ops_unauthorized_report_delivery", ["report_delivery_authorized", "delivery_authorized"]];
const AUTH_RULES = new Map([
  ["send_confidential_report", REPORT_DELIVERY_RULE],
  ["deliver_report", REPORT_DELIVERY_RULE],
  ["email_report", REPORT_DELIVERY_RULE],
  ["send_enterprise_report", REPORT_DELIVERY_RULE],
  ["publish_report", REPORT_DELIVERY_RULE],
  ["send_report", REPORT_DELIVERY_RULE],
  ["deploy_runtime", ["ops_unauthorized_deployment", ["deployment_approved", "change_approved"]]],
  ["create_organisation", ["ops_unauthorized_org_creation", ["onboarding_verified", "operator_approved"]]],
  ["promote_to_pilot", ["ops_unauthorized_pilot_promotion", ["pilot_approved", "operator_approved"]]],
  ["modify_customer", ["ops_unauthorized_customer_modification", ["change_authorized", "operator_approved"]]],
  ["export_documents", ["ops_unauthorized_document_export", ["export_authorized"]]],
  ["activate_policy", ["ops_unauthorized_policy_activation", ["policy_activation_approved", "operator_approved"]]],
  ["activate_governance_policy", ["ops_unauthorized_policy_activation", ["policy_activation_approved", "operator_approved"]]],
]);
// Phase 2: internal-only executors — permitted for their internal effect, but
// BLOCKED if they ever carry an external destination (mirrors operations_rules.py
// ops_internal_action_external_reach).
const INTERNAL_ACTIONS = new Set(["open_incident", "refresh_customer_intelligence",
  "schedule_internal_review", "create_work_item", "generate_deployment_checklist", "prepare_draft_reply",
  "draft_policy"]);
// Phase 4: autonomy-change tools — raising requires approval, lowering always OK.
const AUTONOMY_CHANGE = new Set(["set_autonomy_mode", "raise_autonomy", "change_autonomy_mode",
  "set_autonomy", "escalate_autonomy"]);
const isExternal = (args) => {
  if (args.destination_internal === true || args.internal === true) return false;
  if (args.destination_external === true || args.external === true) return true;
  const txt = ["args", "destination", "url", "to", "recipient"].map((k) => String(args[k] || "")).join(" ").toLowerCase();
  return ["external", "attacker", "unverified", "unknown", "public_internet"].some((t) => txt.includes(t));
};

function mockVerdict(steps) {
  for (const s of steps || []) {
    const tool = String(s.tool || "").toLowerCase();
    const args = s.args || {};
    if (UNCONDITIONAL.has(tool)) return { verdict: "BLOCK", rule: UNCONDITIONAL.get(tool) };
    if (AUTH_RULES.has(tool)) {
      const [rule, flags] = AUTH_RULES.get(tool);
      if (!flags.some((f) => args[f] === true || String(args[f]).toLowerCase() === "true")) {
        return { verdict: "BLOCK", rule };
      }
    }
    if (INTERNAL_ACTIONS.has(tool) && isExternal(args)) {
      return { verdict: "BLOCK", rule: "ops_internal_action_external_reach" };
    }
    // Phase 4: autonomy change — raising needs approval; lowering always permitted
    // (mirrors operations_rules.py ops_unauthorized_autonomy_change).
    if (AUTONOMY_CHANGE.has(tool)) {
      const raising = ["raising_autonomy", "raising"].some((f) => args[f] === true || String(args[f]).toLowerCase() === "true");
      const approved = ["autonomy_change_approved", "operator_approved"].some((f) => args[f] === true || String(args[f]).toLowerCase() === "true");
      if (raising && !approved) return { verdict: "BLOCK", rule: "ops_unauthorized_autonomy_change" };
    }
  }
  return { verdict: "PERMIT", rule: null };
}

// Dynamic runtime-loaded governance policies (opt-in): mirrors dynamic_rules.py
// — the mock engine loads ACTIVE governance policies from the store and applies
// them as DENY-ONLY rules, so a hermetic test can prove end-to-end that
// activating a policy actually blocks a matching action. Off by default, so all
// other suites see byte-identical behaviour.
function startMockEngine(opts = {}) {
  const dynamic = !!opts.governancePolicies;
  // Lazy deps: require lib/runtime/govpolicy only on the first evaluate, so the
  // engine module isn't loaded (and its ENGINE_URL frozen) before the caller has
  // set GOVERNANCE_URL. Off by default → other suites never touch these.
  let _deps = null;
  function deps() {
    if (!_deps) _deps = { store: require("../../lib/runtime").store, evaluateSpec: require("../../lib/ops/govpolicy").evaluateSpec };
    return _deps;
  }

  async function dynamicBlock(trajectory) {
    if (!dynamic) return null;
    const { store, evaluateSpec } = deps();
    let active = [];
    try { active = (await store.find("governance_policies", { status: "active" })) || []; } catch { return null; }
    for (const step of trajectory || []) {
      const state = { tool: step.tool, ...(step.args || {}) };
      for (const pol of active) {
        try { if (evaluateSpec(pol.spec, state)) return { rule: `dyn:${pol.name}`, domain: pol.domain }; } catch { /* skip bad policy */ }
      }
    }
    return null;
  }

  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", async () => {
        res.setHeader("content-type", "application/json");
        if (req.url === "/health") return res.end(JSON.stringify({ status: "ok", engine_commit: "mock", live_sectors: [] }));
        if (req.url === "/v1/evaluate") {
          let json = {}; try { json = JSON.parse(body); } catch { /* */ }
          let v = mockVerdict(json.trajectory);
          // Dynamic policies can only turn a PERMIT into a BLOCK (deny-only).
          if (v.verdict === "PERMIT") {
            const dyn = await dynamicBlock(json.trajectory);
            if (dyn) v = { verdict: "BLOCK", rule: dyn.rule, domain: dyn.domain };
          }
          return res.end(JSON.stringify({
            verdict: v.verdict, permitted: v.verdict === "PERMIT", blocked: v.verdict === "BLOCK",
            layer: v.rule ? "V5+" : "V1", reason: v.rule ? `violates ${v.rule}` : "no Ω intersection",
            omega_domain: v.rule ? (v.domain || "enterprise") : null, trajectory_hash: "mockhash",
            reachability_distance: null, metadata: v.rule ? { rule: v.rule } : {},
          }));
        }
        res.statusCode = 404; res.end("{}");
      });
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

module.exports = { startMockEngine, mockVerdict };
