"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const panels = read("components/GovernedEvidencePanels.tsx");
const lab = read("components/FrontierLabClient.tsx");
const sessions = read("components/ContinuousFrontierSession.tsx");
const control = read("components/admin/RuntimeAdminClient.tsx");
const audit = read("scripts/delivery-kit.cjs");
const fullAudit = read("lib/runtime/fullaudit.js");
const api = read("app/api/frontier/run/route.ts");
const publicDemo = read("components/LiveDemoClient.tsx");

test("live demo renders canonical causal and Safety Envelope evidence", () => {
  assert.match(lab, /GovernedEvidencePanels result=\{governedResult\}/);
  assert.match(publicDemo, /GovernedEvidencePanels result=\{result\.governedResult\}/);
  assert.match(panels, /CANONICAL MORRISON VERDICT/);
  assert.match(panels, />OBSERVED</);
  assert.match(panels, />DERIVED</);
  assert.match(panels, />COUNTERFACTUAL</);
});

test("boundary warning is visible and all four states are distinct", () => {
  const model = read("lib/governed-result.ts");
  for (const value of ["OBSERVED_LOCAL_SAFETY", "LOCAL_SAFETY_VIOLATION", "UNVALIDATED", "INSUFFICIENT_EVIDENCE"]) {
    assert.match(model, new RegExp(value));
  }
  assert.match(panels, /gev-warning/);
  assert.match(panels, /safety\.warning \|\| result\.boundary_warning/);
  assert.match(read("styles/frontier-lab.css"), /gev-status-observed_local_safety/);
  assert.match(read("styles/frontier-lab.css"), /gev-status-local_safety_violation/);
  assert.match(read("styles/frontier-lab.css"), /gev-status-unvalidated/);
  assert.match(read("styles/frontier-lab.css"), /gev-status-insufficient_evidence/);
});

test("boundary mutation is evidence-only and backend-status driven", () => {
  assert.match(api, /safety_boundary_mutation/);
  assert.match(lab, /Morrison still governs the trajectory independently/);
  assert.match(sessions, /Runtime governance remains active/);
  assert.match(panels, /SAFETY_STATUS_COPY\[safety\.status\]/);
  assert.doesNotMatch(panels, /status\s*=\s*.*omega/i);
});

test("Control Room uses the same canonical governed-result projection", () => {
  assert.match(control, /session\.governed_result\?\.safety_envelope/);
  assert.match(control, /GovernedEvidencePanels result=\{selected\.governed_result\}/);
  assert.match(control, /Protected Value and regulatory\/compliance context remain separate/);
});

test("session history records envelope and invalidation reason", () => {
  assert.match(sessions, /<th>Envelope<\/th>/);
  assert.match(sessions, /<th>Boundary state<\/th>/);
  assert.match(sessions, /unsupported_unvalidated_region/);
});

test("audit and downloadable reports state the bounded claim", () => {
  assert.match(audit, /Safety Envelope — bounded assurance/);
  assert.match(audit, /does not constitute a global or universal safety claim/);
  assert.match(audit, /Causal-analysis evidence/);
  assert.match(fullAudit, /safetyEnvelope:/);
  assert.match(fullAudit, /No trajectory-linked canonical Safety Envelope result/);
  assert.match(lab, /Download bounded-assurance HTML/);
  assert.match(lab, /Download JSON evidence bundle/);
});

test("unvalidated and insufficient evidence are not rendered as unsafe or safe", () => {
  const model = read("lib/governed-result.ts");
  assert.match(model, /UNVALIDATED[\s\S]*implies neither safe nor unsafe/);
  assert.match(model, /INSUFFICIENT_EVIDENCE[\s\S]*cannot support/);
});

test("Protected Value and compliance components remain separate", () => {
  assert.match(sessions, /function SessionValueImpact/);
  assert.match(sessions, /function SessionRegulatoryExposure/);
  assert.match(panels, /separate from Protected Value and regulatory\/compliance context/);
  assert.match(panels, /not a compliance certification/);
});

test("evidence UI failure never suppresses the canonical result", () => {
  assert.match(panels, /No canonical backend Safety Envelope evidence was supplied/);
  assert.match(panels, /Runtime governance remains active/);
  assert.match(panels, /CAUSAL ANALYSIS UNAVAILABLE/);
});
