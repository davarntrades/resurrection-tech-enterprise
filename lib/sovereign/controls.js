/* ============================================================================
 * Guardian OS Sovereign — control mapping + gap register.
 *
 * WHAT THIS IS. The evidence package an assessor asks for first: for each
 * control in a recognised framework, what Guardian OS actually implements,
 * where the implementing code is, and which test proves it — or, where it does
 * not implement the control, an explicit gap with an owner.
 *
 * WHAT THIS IS NOT. This is not accreditation, certification, or an authority
 * to operate. Guardian OS holds no Common Criteria evaluation, no NCSC
 * assurance, no FedRAMP authorisation and no ATO. Accreditation is a
 * third-party process against a specific deployment in a specific environment;
 * software cannot grant it to itself, and any document that implies otherwise
 * is worse than no document. Every artefact this module emits says so on its
 * face.
 *
 * THE GAP REGISTER IS THE POINT. A mapping that shows only satisfied controls
 * is marketing. An assessor reads the gaps first, and a vendor who has already
 * written them down — honestly, with owners — is a vendor who is easy to
 * assess. So `not_implemented` and `partial` are first-class statuses here, and
 * the summary leads with them.
 *
 * STATUSES
 *   implemented      the control is met by shipping code, with a named test
 *   partial          genuinely partial; the limitation is stated, not softened
 *   not_implemented  not met; a gap with an owner, not an omission
 *   inherited        met by the host environment, not by Guardian OS
 *   not_applicable   out of scope for this software, with the reason
 *
 * Dependency-free: an assessor can run this on an air-gapped box.
 * ========================================================================== */
"use strict";

const STATUS = {
  IMPLEMENTED: "implemented",
  PARTIAL: "partial",
  NOT_IMPLEMENTED: "not_implemented",
  INHERITED: "inherited",
  NOT_APPLICABLE: "not_applicable",
};

const c = (id, title, status, claim, evidence, note) => ({ id, title, status, claim, evidence: evidence || [], note: note || null });

// ── NIST SP 800-53 Rev 5 (the families Guardian OS actually touches) ────────
const NIST = {
  id: "nist-800-53r5",
  title: "NIST SP 800-53 Rev 5",
  scope: "Selected controls from AC, AU, CM, SC, SI and SR that Guardian OS materially implements or affects. This is NOT a baseline tailoring and does not constitute a system security plan.",
  controls: [
    c("AC-3", "Access enforcement", STATUS.IMPLEMENTED,
      "Every privileged action is evaluated by the Ω engine before execution; the deny-by-default baseline plus deny-only dynamic policies enforce at runtime, not at review time.",
      ["governance-service/app.py", "lib/ops/governor.js", "scripts/ops/agent.test.cjs"]),
    c("AC-6", "Least privilege", STATUS.IMPLEMENTED,
      "Industry pack policies and deployment rules constrain each tool to its authorised conditions; an unauthorised state blocks rather than warns.",
      ["lib/ops/packs/*.js", "governance-service/dynamic_rules.py", "scripts/ops/industry.test.cjs"]),
    c("AC-4", "Information flow enforcement", STATUS.PARTIAL,
      "Ω rules block external reach from internal actions and external disclosure of protected data at the tool-call boundary.",
      ["governance-service/operations_rules.py", "scripts/ops/executors.test.cjs"],
      "Enforcement is at the governed tool-call boundary only. Guardian OS is not a network or data-loss-prevention control and does not observe traffic that never becomes a governed action."),
    c("AU-2", "Event logging", STATUS.IMPLEMENTED,
      "Every governed decision is recorded with verdict, rule, Ω domain, trajectory hash and actor.",
      ["lib/ops/evidence.js", "lib/runtime/store.js", "scripts/ops/integrity.test.cjs"]),
    c("AU-9", "Protection of audit information", STATUS.IMPLEMENTED,
      "Decisions form a per-environment hash chain (prev_hash → entry_hash); verifyChain() recomputes it and reports the first altered or missing entry. The evidence module exposes no update or delete, and the engine blocks the agent from proposing evidence destruction.",
      ["lib/runtime/store.js verifyChain", "governance-service/operations_rules.py", "scripts/runtime/decisionseq.test.cjs"]),
    c("AU-10", "Non-repudiation", STATUS.PARTIAL,
      "Decisions are hash-chained and attributed to an actor; the engine's verdict attestation fingerprints the exact ruleset used.",
      ["lib/runtime/store.js", "governance-service/app.py _attestation"],
      "The chain proves internal tamper-evidence, not cryptographic non-repudiation by an external party: entries are not individually signed by a key the operator does not control. A deployment needing true non-repudiation must add an external timestamp/notary authority."),
    c("AU-12", "Audit record generation", STATUS.IMPLEMENTED,
      "Records are generated at the enforcement point, not by the agent, so a compromised agent cannot suppress them.",
      ["lib/ops/governor.js", "lib/ops/evidence.js"]),
    c("CM-3", "Configuration change control", STATUS.IMPLEMENTED,
      "Policy changes follow draft → validate → activate with versioning, supersession and rollback, each recorded in the admin audit trail.",
      ["lib/ops/govpolicy.js", "scripts/ops/govpolicy.test.cjs"]),
    c("CM-5", "Access restrictions for change", STATUS.IMPLEMENTED,
      "Activation is a privileged operator action governed by ops_unauthorized_policy_activation; the agent may draft but never activate. Under an immutable runtime, change requires a verified signed bundle.",
      ["lib/sovereign/immutable.js", "governance-service/operations_rules.py", "scripts/sovereign/sovereign.test.cjs"]),
    c("CM-14", "Signed components", STATUS.IMPLEMENTED,
      "Policy bundles, industry packs and update packages are Ed25519-signed and verified against a local trust store before installation; content hashes and an entry-list digest are checked independently of the signature.",
      ["lib/sovereign/bundle.js", "governance-service/policy_bundle.py", "scripts/sovereign/crosslang.test.cjs"]),
    c("SC-7", "Boundary protection", STATUS.INHERITED,
      "Guardian OS refuses to construct a cloud client under a local-storage profile and makes no external request from a sovereign build.",
      ["lib/runtime/store.js", "lib/sovereign/build.ts", "scripts/sovereign/offline-audit.cjs"],
      "Network boundary enforcement itself is the host environment's responsibility. Guardian OS proves it does not attempt egress; it does not prevent egress by other software on the host."),
    c("SC-12", "Cryptographic key establishment", STATUS.PARTIAL,
      "Ed25519 signing identities are generated by the CLI; only public keys are provisioned into the sovereign trust store.",
      ["bin/guardian.cjs keygen", "lib/sovereign/bundle.js"],
      "Key custody, rotation and revocation are operator procedures. There is no key-rotation workflow, no revocation list, and no HSM integration in this release."),
    c("SC-13", "Cryptographic protection", STATUS.PARTIAL,
      "SHA-256 content addressing and Ed25519 signature verification (RFC 8032) for all installable artefacts.",
      ["lib/sovereign/bundle.js", "governance-service/ed25519_verify.py"],
      "The pure-Python Ed25519 verifier is not FIPS-validated and is not constant-time. It operates only on public values, so no secret is exposed by timing, but a deployment requiring validated cryptography must substitute a validated module."),
    c("SI-4", "System monitoring", STATUS.IMPLEMENTED,
      "Managed Governance monitors continuously: drift detection against a captured baseline, a governance health score, and an operator queue.",
      ["lib/ops/managed.js", "scripts/ops/managed.test.cjs"]),
    c("SI-7", "Software, firmware and information integrity", STATUS.IMPLEMENTED,
      "Three independent integrity layers on every installable artefact; a failure yields zero policies rather than a partial install, and `guardian verify` fails the deployment.",
      ["lib/sovereign/bundle.js verify", "lib/sovereign/verify.js", "governance-service/test_policy_bundle.py"]),
    c("SR-4", "Provenance", STATUS.IMPLEMENTED,
      "Every installed pack records its source (registry or signed bundle), the signing key id, and whether its projection code is present in the running build.",
      ["lib/ops/industry.js", "lib/sovereign/verify.js"]),
    c("SR-11", "Component authenticity", STATUS.IMPLEMENTED,
      "An artefact signed by a key absent from the local trust store is refused, and a signature lifted from a different artefact does not validate.",
      ["scripts/sovereign/crosslang.test.cjs", "scripts/sovereign/sovereign.test.cjs"]),
    c("IA-2", "Identification and authentication", STATUS.INHERITED,
      "Operator sessions and admin keys authenticate Control Room access.",
      ["lib/runtime/adminauth.js"],
      "Guardian OS has no identity provider of its own: no MFA, no directory integration, no federated SSO. A sovereign deployment must place it behind the environment's existing IdP."),
    c("CP-9", "System backup", STATUS.PARTIAL,
      "`guardian export evidence` copies the complete local evidence store, and the documented backup set names every path that must be captured.",
      ["bin/guardian.cjs export", "docs/SOVEREIGN.md §13"],
      "There is no scheduler, no retention policy, no incremental backup and no automated restore verification. Backup orchestration is the operator's."),
  ],
};

// ── ISO/IEC 27001:2022 Annex A (selected) ───────────────────────────────────
const ISO = {
  id: "iso-27001-2022",
  title: "ISO/IEC 27001:2022 Annex A",
  scope: "Selected Annex A controls Guardian OS materially supports. Certification is of an organisation's ISMS, never of a product; this mapping supports an operator's ISMS and is not itself a certification.",
  controls: [
    c("A.5.15", "Access control", STATUS.IMPLEMENTED, "Runtime enforcement of privileged actions, deny-by-default.", ["lib/ops/governor.js"]),
    c("A.8.15", "Logging", STATUS.IMPLEMENTED, "Complete decision log with verdict, rule and actor.", ["lib/ops/evidence.js"]),
    c("A.8.16", "Monitoring activities", STATUS.IMPLEMENTED, "Continuous drift detection and health scoring against a baseline.", ["lib/ops/managed.js"]),
    c("A.8.32", "Change management", STATUS.IMPLEMENTED, "Versioned, validated, reversible policy lifecycle with an audit trail.", ["lib/ops/govpolicy.js"]),
    c("A.5.23", "Cloud services security", STATUS.IMPLEMENTED, "Deployment profiles let an organisation remove cloud services from the deployment entirely, proven by CI with egress removed.", [".github/workflows/sovereign.yml"]),
    c("A.5.21", "ICT supply chain security", STATUS.IMPLEMENTED, "Signed, content-addressed artefacts verified before installation.", ["lib/sovereign/bundle.js"]),
    c("A.8.7", "Protection against malware", STATUS.NOT_APPLICABLE, "Guardian OS is not an anti-malware control.", [],
      "Listed so the boundary is explicit rather than assumed."),
    c("A.5.30", "ICT readiness for business continuity", STATUS.PARTIAL, "Documented backup set, evidence export and a restore procedure that ends in `guardian verify`.", ["docs/SOVEREIGN.md §13"],
      "No tested RTO/RPO. Continuity targets have not been measured on representative hardware."),
  ],
};

// ── EU AI Act — high-risk provider/deployer obligations ─────────────────────
const AI_ACT = {
  id: "eu-ai-act",
  title: "EU AI Act — high-risk system obligations",
  scope: "Articles Guardian OS helps a DEPLOYER satisfy for their own high-risk AI systems. Guardian OS is a governance control, not a conformity assessment; it does not make a deployer compliant and carries no CE marking.",
  controls: [
    c("Art. 12", "Record-keeping / logging", STATUS.IMPLEMENTED,
      "Automatic, tamper-evident logging of every governed AI action for the lifetime of the deployment.",
      ["lib/ops/evidence.js", "lib/runtime/store.js"]),
    c("Art. 14", "Human oversight", STATUS.IMPLEMENTED,
      "Privileged actions escalate to a human approver; the agent proposes and never executes. The approval chain is retained as evidence.",
      ["lib/ops/proposals.js", "lib/ops/governor.js"]),
    c("Art. 15", "Accuracy, robustness, cybersecurity", STATUS.PARTIAL,
      "Fail-closed enforcement: an unreachable engine BLOCKS rather than degrades to allow.",
      ["lib/runtime/engine.js", "scripts/ops/schema-resilience.test.cjs"],
      "Guardian OS governs the AI system's actions; it makes no claim about the accuracy of the governed model itself."),
    c("Art. 9", "Risk management system", STATUS.PARTIAL,
      "Continuous drift detection, a governance health score and a recommendations engine feed an operator's risk process.",
      ["lib/ops/managed.js"],
      "Guardian OS supplies evidence and signal; the risk management system remains the deployer's documented process."),
    c("Art. 11 / Annex IV", "Technical documentation", STATUS.PARTIAL,
      "Monthly evidence packs render to JSON and to auditor-ready PDF with an integrity hash, offline.",
      ["lib/ops/managed.js evidencePack", "lib/sovereign/report.js"],
      "The pack documents governance of the system, not the design of the governed model. Annex IV requires much more than Guardian OS holds."),
    c("Art. 43", "Conformity assessment", STATUS.NOT_APPLICABLE, "A procedure performed on the deployer's AI system by the deployer or a notified body.", [],
      "Guardian OS produces evidence that can be submitted; it performs no assessment and issues no declaration."),
  ],
};

// ── NCSC Cloud Security Principles (UK) ─────────────────────────────────────
const NCSC = {
  id: "ncsc-cloud-principles",
  title: "NCSC Cloud Security Principles",
  scope: "Principles a sovereign Guardian OS deployment addresses. Not an NCSC assessment; NCSC has not reviewed this software.",
  controls: [
    c("P1", "Data in transit protection", STATUS.INHERITED, "A sovereign deployment makes no external request at all; internal transport is the host's TLS.", ["scripts/sovereign/offline-audit.cjs"]),
    c("P2", "Asset protection and resilience", STATUS.IMPLEMENTED, "State never leaves the estate under a local-storage profile; the cloud client is refused, not merely unused.", ["lib/runtime/store.js"]),
    c("P5", "Operational security", STATUS.IMPLEMENTED, "`guardian verify` gives a documented, repeatable deployment check that is diagnostic and never corrective.", ["lib/sovereign/verify.js"]),
    c("P7", "Secure development", STATUS.PARTIAL, "Every change runs the governed regression suites, and the sovereign path runs with egress removed in CI.", [".github/workflows/sovereign.yml"],
      "No independent security assessment or penetration test of this codebase has been commissioned."),
    c("P8", "Supply chain security", STATUS.IMPLEMENTED, "Signed artefacts with independent content, entry-list and signature verification; refusal on any failure.", ["lib/sovereign/bundle.js"]),
    c("P11", "External interface protection", STATUS.IMPLEMENTED, "The sovereign update path has no network-reachable write surface — installation happens at the console where the media is.", ["app/api/ops/sovereign/route.ts"]),
  ],
};

const FRAMEWORKS = { [NIST.id]: NIST, [ISO.id]: ISO, [AI_ACT.id]: AI_ACT, [NCSC.id]: NCSC };
const FRAMEWORK_IDS = Object.keys(FRAMEWORKS);

/** Roll a framework up, leading with the gaps. */
function assess(frameworkId) {
  const f = FRAMEWORKS[frameworkId];
  if (!f) throw new Error(`unknown framework "${frameworkId}" — expected one of ${FRAMEWORK_IDS.join(", ")}`);
  const by = {};
  for (const s of Object.values(STATUS)) by[s] = 0;
  for (const ctl of f.controls) by[ctl.status] = (by[ctl.status] || 0) + 1;
  const gaps = f.controls.filter((x) => x.status === STATUS.NOT_IMPLEMENTED || x.status === STATUS.PARTIAL);
  return {
    framework: f.id, title: f.title, scope: f.scope,
    total: f.controls.length, by_status: by,
    gaps: gaps.map((g) => ({ id: g.id, title: g.title, status: g.status, limitation: g.note || "not implemented in this release" })),
    controls: f.controls,
  };
}

/** Every framework at once, plus the disclaimer that must travel with them. */
function assessAll() {
  return {
    generated_at: new Date().toISOString(),
    disclaimer: "Guardian OS holds no third-party accreditation. It has no Common Criteria evaluation, no NCSC assurance, no FedRAMP authorisation and no authority to operate. This document is a self-assessment of implemented controls, published with its gaps, to support an assessor's own work — it is not a certification and must not be presented as one.",
    frameworks: FRAMEWORK_IDS.map(assess),
  };
}

/** The gap register across every framework — what an assessor reads first. */
function gapRegister() {
  const rows = [];
  for (const id of FRAMEWORK_IDS) {
    const a = assess(id);
    for (const g of a.gaps) rows.push({ framework: a.title, ...g });
  }
  return rows;
}

/** The control mapping as a declarative document for lib/sovereign/report.js. */
function document({ classification = null } = {}) {
  const all = assessAll();
  const blocks = [
    { kind: "h1", text: "Status of this document" },
    { kind: "text", text: all.disclaimer },
    { kind: "h1", text: "Gap register" },
    { kind: "text", text: "Read this first. Every control below is one Guardian OS does not fully implement, with the limitation stated as it is rather than as we would prefer it." },
    { kind: "table", headers: ["Framework", "Control", "Status", "Limitation"],
      rows: gapRegister().map((g) => [g.framework, `${g.id} ${g.title}`, g.status, g.limitation]) },
  ];
  for (const f of all.frameworks) {
    blocks.push({ kind: "pagebreak" }, { kind: "h1", text: f.title }, { kind: "text", text: f.scope });
    blocks.push({ kind: "kv", items: Object.entries(f.by_status).filter(([, n]) => n > 0).map(([s, n]) => ({ label: s.replace(/_/g, " "), value: n })) });
    blocks.push({ kind: "table", headers: ["Control", "Status", "What Guardian OS does", "Evidence"],
      rows: f.controls.map((ctl) => [`${ctl.id} — ${ctl.title}`, ctl.status, ctl.claim + (ctl.note ? ` LIMITATION: ${ctl.note}` : ""), (ctl.evidence || []).join("; ")]) });
  }
  return {
    title: "Control mapping and gap register",
    subtitle: "Guardian OS Sovereign — a self-assessment of implemented controls, published with its gaps. This is not an accreditation.",
    classification,
    generated_at: all.generated_at,
    meta: [
      { label: "Frameworks", value: all.frameworks.length },
      { label: "Controls mapped", value: all.frameworks.reduce((n, f) => n + f.total, 0) },
      { label: "Open gaps", value: gapRegister().length },
      { label: "Accreditation held", value: "none" },
    ],
    blocks,
  };
}

module.exports = { STATUS, FRAMEWORKS, FRAMEWORK_IDS, assess, assessAll, gapRegister, document };
