#!/usr/bin/env node
/* ============================================================================
 * Unit regression — deterministic sector detection + anti-contamination.
 *
 * Runs WITHOUT the engine (pure functions from delivery-kit.cjs). This is the
 * fast guard that fails immediately on the class of bug the multi-sector smoke
 * test surfaced: a finance report generated for a supply-chain engagement,
 * healthcare Ω leaking into a cyber report, wrong Ω attribution, or a report
 * headline that doesn't match the detected sector.
 *
 *   node scripts/smoke-tests/sector-detection.test.cjs
 * ============================================================================ */
"use strict";
const K = require("../delivery-kit.cjs");

let pass = 0, fail = 0;
const fails = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; fails.push(msg); } }
function eq(got, want, msg) { ok(got === want, `${msg} — expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); }

// ── 1. Structural invariants — every detectable sector MUST have a profile ──
// (A sector that can be detected but has no SECTORS entry silently renders the
// generic "Enterprise" headline — exactly the bug we are hardening against.)
for (const sec of Object.keys(K.SECTOR_SIGNALS)) ok(K.SECTORS[sec], `SECTOR_SIGNALS "${sec}" has a SECTORS profile`);
for (const [dom, sec] of Object.entries(K.DOMAIN_TO_SECTOR)) ok(K.SECTORS[sec], `DOMAIN_TO_SECTOR ${dom}→${sec} resolves to a SECTORS profile`);
for (const sec of K.SECTOR_PRECEDENCE) ok(K.SECTORS[sec], `SECTOR_PRECEDENCE "${sec}" has a SECTORS profile`);
for (const sec of Object.keys(K.SECTOR_ADJACENT)) ok(K.SECTORS[sec], `SECTOR_ADJACENT "${sec}" has a SECTORS profile`);

// ── 2. Deterministic detection across the enterprise sectors ────────────────
// (industry text, declared domains, expected sector id, expected headline)
const CASES = [
  ["Tier-1 banking — payments, treasury, SWIFT, trading", ["finance", "banking", "fraud", "compliance"], "finance", "Financial Services"],
  ["Hospital clinical operations, PHI, medication, discharge", ["healthcare", "data_privacy", "compliance"], "healthcare", "Healthcare"],
  ["Managed SOC / MDR incident response across customer tenants", ["cybersecurity", "compliance", "data_privacy"], "cybersecurity", "Cybersecurity"],
  ["Claims automation, underwriting, SIU fraud, actuarial", ["insurance", "fraud", "data_privacy", "compliance"], "insurance", "Insurance"],
  ["Autonomous fulfilment — procurement, routing, warehouse robotics, vendor payments", ["supply_chain", "manufacturing", "finance", "compliance"], "supply_chain", "Supply Chain & Logistics"],
  ["Plant-floor robotics, production scheduling, quality control", ["manufacturing", "compliance"], "manufacturing", "Manufacturing"],
  ["Public-sector benefits casework, entitlement, citizen records", ["government", "data_privacy", "compliance"], "government", "Government & Public Sector"],
  ["Defence mission systems, classified handling, command & control", ["defence", "cybersecurity", "compliance"], "defence", "Defence"],
  ["Carrier network provisioning, BGP routing, lawful intercept", ["telecommunications"], "telecommunications", "Telecommunications"],
  ["Grid operations, SCADA control, substation safety", ["energy"], "energy", "Energy & Utilities"],
  ["Airline flight-planning and airworthiness sign-off", ["aerospace"], "aerospace", "Aerospace & Aviation"],
];
for (const [industry, domains, sector, label] of CASES) {
  eq(K.sectorIdFor(industry, domains), sector, `detect "${industry.slice(0, 40)}"`);
  eq(K.sectorProfile(industry, domains).label, label, `headline for ${sector}`);
}

// ── 3. Overlapping-terminology stress (the finance-first-bias killer) ───────
// finance's payment/settlement/vendor vocabulary must NOT hijack these.
eq(K.sectorIdFor("Autonomous fulfilment with vendor payment release and route optimisation", ["supply_chain", "finance"]), "supply_chain", "supply-chain w/ payments not hijacked by finance");
eq(K.sectorIdFor("Claims payout automation and fraud review", ["insurance", "fraud"]), "insurance", "insurance payout not hijacked by finance");
eq(K.sectorIdFor("Hospital billing and payment posting", ["healthcare", "finance"]), "healthcare", "healthcare billing not hijacked by finance");
eq(K.sectorIdFor("Warehouse robotics and procurement payment", ["supply_chain"]), "supply_chain", "warehouse+payment stays supply_chain");
eq(K.sectorIdFor("Benefits disbursement and entitlement payments", ["government"]), "government", "gov disbursement not hijacked by finance");
// A genuine finance engagement is still finance (no false demotion).
eq(K.sectorIdFor("Wire transfers, treasury and payment operations", ["finance"]), "finance", "pure finance still finance");

// ── 4. Determinism — primary declared domain is authoritative + repeatable ──
// The FIRST non-neutral declared domain wins and prose cannot overturn it.
// Leading neutral domains (compliance, …) are skipped when picking the primary.
eq(K.sectorIdFor("supply chain logistics", ["finance", "supply_chain"]), "finance",
   "primary declared domain (finance) wins over logistics prose");
eq(K.sectorIdFor("supply chain logistics", ["supply_chain", "finance"]), "supply_chain",
   "primary declared domain (supply_chain) wins");
eq(K.sectorIdFor("supply chain logistics", ["compliance", "finance", "supply_chain"]), "finance",
   "leading neutral domain skipped; finance is the primary declaration");
// Repeatability: same input → same output every call.
{
  const a = K.sectorIdFor("Managed SOC incident response", ["cybersecurity"]);
  const b = K.sectorIdFor("Managed SOC incident response", ["cybersecurity"]);
  eq(a, b, "detection is repeatable");
}
// sectorIdFor NEVER returns a key without a profile (would render "Enterprise").
for (const [industry, domains] of CASES.map((c) => [c[0], c[1]])) {
  const id = K.sectorIdFor(industry, domains);
  ok(K.SECTORS[id], `detected id "${id}" has a profile (no silent Enterprise fallback)`);
}
// Unknown/empty → explicit default.
eq(K.sectorIdFor("", []), "default", "empty input → default");
eq(K.sectorIdFor("basket weaving collective", ["general"]), "default", "no signal → default");

// ── 5. Explicit override short-circuits detection ───────────────────────────
eq(K.sectorIdFor("Tier-1 banking payments", ["finance"], "supply_chain"), "supply_chain", "explicit override wins over finance signals");
eq(K.sectorIdFor("anything", [], "Healthcare"), "healthcare", "override accepts label/casing");
eq(K.sectorIdFor("anything", [], "not_a_real_sector"), K.sectorIdFor("anything", []), "invalid override falls back to scoring");

// ── 6. Anti-contamination — Ω attribution + cross-sector scoping ────────────
// blockSectorId attributes by explicit Ω domain first (exact), not loose words.
eq(K.blockSectorId({ omega_domain: "insurance", label: "claim payout to unverified payee" }), "insurance", "insurance payout attributed to insurance (not finance)");
eq(K.blockSectorId({ omega_domain: "healthcare", label: "PHI egress" }), "healthcare", "PHI egress attributed to healthcare");
eq(K.blockSectorId({ omega_domain: "supply_chain", label: "vendor payment to unknown account" }), "supply_chain", "vendor payment attributed to supply_chain");
eq(K.blockSectorId({ omega_domain: "data_privacy" }), "", "neutral Ω with no keyword label casts no sector vote");
// When a neutral Ω carries a label with a real sector signal, the label decides.
eq(K.blockSectorId({ omega_domain: "data_privacy", label: "credential exfiltration" }), "cybersecurity", "neutral Ω + cyber label → cyber");

// FAIL-FAST guard #1: healthcare Ω must be dropped from a cyber engagement.
{
  const blocks = [{ omega_domain: "healthcare", label: "PHI egress" }, { omega_domain: "cybersecurity", label: "credential exfiltration" }];
  const r = K.scopeBlocksToSector(blocks, "cybersecurity");
  ok(!r.kept.some((b) => K.blockSectorId(b) === "healthcare"), "healthcare Ω does NOT appear in a cyber report");
  eq(r.dropped, 1, "exactly the healthcare block dropped from cyber engagement");
}
// FAIL-FAST guard #2: a supply-chain engagement keeps its intrinsic finance +
// manufacturing findings (vendor payment, robotics), drops a foreign healthcare one.
{
  const blocks = [
    { omega_domain: "finance", label: "vendor payment to unknown account" },
    { omega_domain: "manufacturing", label: "robot motion out of envelope" },
    { omega_domain: "healthcare", label: "PHI egress" },
  ];
  const r = K.scopeBlocksToSector(blocks, "supply_chain");
  ok(r.kept.some((b) => K.blockSectorId(b) === "finance"), "supply_chain keeps vendor-payment (finance) finding");
  ok(!r.kept.some((b) => K.blockSectorId(b) === "healthcare"), "supply_chain drops foreign healthcare finding");
}
// FAIL-FAST guard #3: a finance engagement keeps finance, drops healthcare.
{
  const r = K.scopeBlocksToSector([{ omega_domain: "finance", label: "wire to attacker" }, { omega_domain: "healthcare", label: "PHI egress" }], "finance");
  eq(r.kept.length, 1, "finance engagement keeps only the finance finding");
  eq(K.blockSectorId(r.kept[0]), "finance", "kept finding is the finance one");
}

// ── report ──────────────────────────────────────────────────────────────────
console.log(`sector-detection unit regression: ${pass} passed, ${fail} failed`);
if (fail) { console.log("\nFAILURES:"); for (const f of fails) console.log("  ✗ " + f); process.exit(1); }
process.exit(0);
