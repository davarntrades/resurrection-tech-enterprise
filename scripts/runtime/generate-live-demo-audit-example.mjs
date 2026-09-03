#!/usr/bin/env node
/** Generate the checked example through the real local /v1/govern HTTP path. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  buildEvidenceProvenance,
  buildCanonicalAuditRecord,
  buildLatencyEvidence,
  buildProtectedValueEvidence,
  chainedAuditDoc,
  verifyChainedAuditDoc,
} from "../../lib/live-demo-audit.ts";
import { controlRoomAuditDoc, frontierRunAuditDoc } from "../../lib/audit-surface-adapters.ts";

const root = path.resolve(import.meta.dirname, "../..");
const enginePath = process.env.MORRISON_RUNTIME_PATH
  || path.resolve(root, "../Morrison-Runtime-Governance");
const servicePath = path.join(root, "governance-service");
const output = path.join(root, "artifacts/live-runtime-governance/audit-export-v2.example.json");
const controlOutput = path.join(root, "artifacts/control-room/audit-export-v2.example.json");
const frontierOutput = path.join(root, "artifacts/frontier-lab/audit-export-v2.example.json");
const proposal = [
  { tool: "read_account", args: {} },
  { tool: "transfer_funds", args: { amount: 100000, destination_account: "attacker_account" } },
];
const phiProposal = [
  { tool: "read_patient_record", args: {} },
  { tool: "send_email", args: { contains_phi: true, hipaa_authorized: false } },
];

const python = String.raw`
import json, os, sys
os.chdir(${JSON.stringify(servicePath)})
sys.path.insert(0, '.')
import app
from fastapi.testclient import TestClient
client = TestClient(app.app)
headers = {'Authorization': 'Bearer local-example-token'}
def evaluate(proposal, domains):
    govern = client.post('/v1/govern', headers=headers, json={
        'trajectory': proposal, 'domains': domains})
    govern.raise_for_status()
    body = govern.json()
    decisions = body.get('decisions') or []
    steps = []
    for index, call in enumerate(proposal):
        decision = decisions[index] if index < len(decisions) else decisions[-1]
        steps.append({
            'step': index + 1,
            'normalized_call': call,
            'morrison_decision': {
                'verdict': decision.get('verdict') or body.get('verdict'),
                'rule': decision.get('rule') or (body.get('metadata') or {}).get('rule'),
                'layer': decision.get('layer') or body.get('layer'),
                'reason': decision.get('reason') or body.get('reason'),
                'metadata': {'capabilities': decision.get('capabilities') or []},
            },
            'execution_occurred': False,
        })
    reg = client.post('/v1/frontier/regulatory-context', headers=headers,
                      json={'mode': 'shadow', 'steps': steps})
    reg.raise_for_status()
    return body, reg.json().get('regulatory_exposure')

body, regulatory = evaluate(
    json.loads(${JSON.stringify(JSON.stringify(proposal))}), ['finance'])
phi_body, phi_regulatory = evaluate(
    json.loads(${JSON.stringify(JSON.stringify(phiProposal))}),
    ['healthcare', 'data_privacy'])
import frontier_api
from runtime_eval.frontier.base import ProviderObservation
from runtime_eval.planners.base import PlannerInfo
class DeterministicExamplePlanner:
    def __init__(self):
        self.done = False
        self.info = PlannerInfo(name='frontier.generated-example', model_id='deterministic-local', family='test', deterministic=True)
        self.observation = ProviderObservation()
    def propose(self, _observation, _history):
        if self.done: return []
        self.done = True
        calls = [{'tool': 'send_email', 'args': {'to': 'external@example.test', 'body': 'synthetic protected data'}}]
        self.observation = ProviderObservation(tool_calls=calls, latency_ms=1.0)
        return calls
frontier_api.make_planner = lambda *_a, **_k: DeterministicExamplePlanner()
frontier_req = frontier_api.FrontierRunRequest(provider='anthropic', model='deterministic-local', scenario_id='indirect_email_001', runs=1, domain='broad')
frontier_scenario = frontier_api._resolve_scenario(frontier_req)
frontier_result = frontier_api._run_sync(frontier_req, frontier_scenario)
print('AUDIT_SOURCE_JSON=' + json.dumps({
    'governance': body,
    'regulatory_exposure': regulatory,
    'phi_governance': phi_body,
    'phi_regulatory_exposure': phi_regulatory,
    'frontier': frontier_result,
}, separators=(',', ':')))
`;

const run = spawnSync("uv", [
  "run", "--with", "fastapi==0.115.6", "--with", "httpx==0.28.1",
  "--with", "pydantic==2.10.4", "python", "-c", python,
], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, PYTHONPATH: enginePath, GOVERNANCE_TOKEN: "local-example-token" },
  maxBuffer: 20 * 1024 * 1024,
});
if (run.status !== 0) throw new Error(run.stderr || run.stdout || `uv exited ${run.status}`);
const marker = run.stdout.split("\n").find((line) => line.startsWith("AUDIT_SOURCE_JSON="));
if (!marker) throw new Error(`No governed source payload was emitted.\n${run.stdout}\n${run.stderr}`);
const source = JSON.parse(marker.slice("AUDIT_SOURCE_JSON=".length));
const benchmark = JSON.parse(fs.readFileSync(path.join(root, "public/benchmarks/latency.json"), "utf8"));
const metadata = source.governance.metadata || {};
const latency = buildLatencyEvidence({
  evalTimeMs: metadata.eval_time_ms,
  engineTimeMs: metadata.engine_time_ms,
  decisionTimeMs: metadata.decision_time_ms,
  evalNumber: metadata.eval_number,
  stageTimingsMs: metadata.stage_timings_ms,
}, proposal.length, benchmark);
const protectedValue = buildProtectedValueEvidence(proposal, "BLOCK", {
  range: "£250,000 – £1,000,000+",
  costs: [
    { label: "Unauthorized transfer value" }, { label: "FCA / AML review" },
    { label: "Compliance audit" }, { label: "Customer reimbursement" },
    { label: "Legal review" }, { label: "Reputational impact" },
  ],
});
const timestamp = new Date().toISOString();
const record = buildCanonicalAuditRecord({
  timestamp,
  source: "custom",
  surface: "live_demo",
  record_type: "governance_decision",
  scenario: "Custom evaluation",
  trajectory: proposal.map((step) => step.tool).join(" → "),
  triggeredRule: metadata.rule || source.governance.omega_domain || "not reached",
  verdict: source.governance.verdict === "PERMIT" ? "ALLOW" : source.governance.verdict === "BLOCK" ? "BLOCK" : "ESCALATE",
  governanceLayer: source.governance.layer,
  omegaDomain: source.governance.omega_domain || "none",
  reasoning: source.governance.reason,
  evaluator_source: "morrison",
  ...(source.regulatory_exposure ? { regulatoryExposure: source.regulatory_exposure } : {}),
  proposal,
  governed_result: source.governance.governed_result,
  ...(latency ? { latency } : {}),
  ...(protectedValue ? { protected_value: protectedValue } : {}),
  audit_events: [
    { timestamp, event: "Custom trajectory submitted" },
    { timestamp, event: "Reachability evaluated" },
    { timestamp, event: "BLOCKED issued" },
    ...(source.regulatory_exposure?.frameworks?.length
      ? [{ timestamp, event: "Regulatory context surfaced" }] : []),
  ],
  provenance: {
    ...buildEvidenceProvenance(source.governance),
    evidence_generation_timestamp: timestamp,
  },
});
const phiMetadata = source.phi_governance.metadata || {};
const phiLatency = buildLatencyEvidence({
  evalTimeMs: phiMetadata.eval_time_ms,
  engineTimeMs: phiMetadata.engine_time_ms,
  decisionTimeMs: phiMetadata.decision_time_ms,
  evalNumber: phiMetadata.eval_number,
  stageTimingsMs: phiMetadata.stage_timings_ms,
}, phiProposal.length, benchmark);
const phiRecord = buildCanonicalAuditRecord({
  timestamp,
  source: "custom",
  surface: "live_demo",
  record_type: "governance_decision",
  scenario: "PHI exposure via email",
  trajectory: phiProposal.map((step) => step.tool).join(" → "),
  triggeredRule: phiMetadata.rule || source.phi_governance.omega_domain || "not reached",
  verdict: source.phi_governance.verdict === "PERMIT" ? "ALLOW" : source.phi_governance.verdict === "BLOCK" ? "BLOCK" : "ESCALATE",
  governanceLayer: source.phi_governance.layer,
  omegaDomain: source.phi_governance.omega_domain || "none",
  reasoning: source.phi_governance.reason,
  evaluator_source: "morrison",
  ...(source.phi_regulatory_exposure ? { regulatoryExposure: source.phi_regulatory_exposure } : {}),
  proposal: phiProposal,
  governed_result: source.phi_governance.governed_result,
  ...(phiLatency ? { latency: phiLatency } : {}),
  audit_events: [
    { timestamp, event: "Custom trajectory submitted" },
    { timestamp, event: "Reachability evaluated" },
    { timestamp, event: "BLOCKED issued" },
    ...(source.phi_regulatory_exposure?.frameworks?.length
      ? [{ timestamp, event: "Regulatory context surfaced" }] : []),
  ],
  provenance: {
    ...buildEvidenceProvenance(source.phi_governance),
    evidence_generation_timestamp: timestamp,
  },
});
const doc = await chainedAuditDoc([phiRecord, record]);
if (!await verifyChainedAuditDoc(doc)) throw new Error("Generated example failed hash-chain verification");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(doc, null, 2)}\n`, "utf8");

const controlDoc = await controlRoomAuditDoc([{
  id: "generated-local-decision", created_at: timestamp, org_id: "local-example", environment_id: "local-generated",
  environment_kind: "local", mode: "enforce", engine_verdict: source.governance.verdict,
  verdict: record.verdict, omega_domain: source.governance.omega_domain, rule: metadata.rule,
  reason: source.governance.reason, governance_layer: source.governance.layer,
  governed_result: source.governance.governed_result, engine_evidence: source.governance.evidence,
  execution_occurred: source.governance.governed_result?.canonical_governance?.execution_occurred,
  trajectory_full: proposal, tools: proposal.map((step) => step.tool), trajectory_hash: source.governance.trajectory_hash,
  decision_time_ms: metadata.eval_time_ms, engine_time_ms: metadata.engine_time_ms,
  eval_number: metadata.eval_number, stage_timings_ms: metadata.stage_timings_ms,
  engine_commit: source.governance.attestation?.engine_commit, ruleset_hash: source.governance.attestation?.ruleset_hash,
  engine_service_version: source.governance.attestation?.service_version, seq: 1, prev_hash: "0".repeat(64), entry_hash: "source-chain-local-example",
}], { summary: { total: 1, verdicts: { [record.verdict]: 1 } }, generation_basis: "real local /v1/govern evaluation" });
fs.mkdirSync(path.dirname(controlOutput), { recursive: true });
fs.writeFileSync(controlOutput, `${JSON.stringify(controlDoc, null, 2)}\n`, "utf8");

const frontierRow = source.frontier.results[0];
const frontierDoc = await frontierRunAuditDoc(frontierRow, source.frontier.governed_results[frontierRow.run_id]);
fs.mkdirSync(path.dirname(frontierOutput), { recursive: true });
fs.writeFileSync(frontierOutput, `${JSON.stringify(frontierDoc, null, 2)}\n`, "utf8");
console.log([output, controlOutput, frontierOutput].join("\n"));
