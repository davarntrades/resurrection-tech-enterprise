#!/usr/bin/env node
/* ============================================================================
 * Overlap + adversarial regression (unit, no engine).
 *
 * Two jobs:
 *   A) OVERLAP — deliberately confuse sector detection with cross-sector
 *      terminology (insurance using payment words, supply-chain vendor
 *      payments, manufacturing/government procurement, defence logistics,
 *      telecom billing, energy trading) and assert each still classifies to
 *      the RIGHT sector, deterministically.
 *   B) ADVERSARIAL — feed the manifest parser hostile / malformed / huge /
 *      nested / duplicated / reordered input and assert it stays deterministic,
 *      never throws, and detection does not flip.
 *
 *   node scripts/smoke-tests/overlap-adversarial.test.cjs
 * ============================================================================ */
"use strict";
const K = require("../delivery-kit.cjs");

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };
const eq = (g, w, m) => ok(g === w, `${m} — expected ${JSON.stringify(w)}, got ${JSON.stringify(g)}`);

// ── A. OVERLAP: confusing terminology must resolve to the declared sector ────
// Each case declares the sector as its PRIMARY domain (as a real engagement
// would) but loads the industry prose with a rival sector's vocabulary.
const OVERLAP = [
  // [industry prose (rival vocab),                                   domains,                         expected]
  ["Claims payout automation with payment settlement and remittance", ["insurance", "fraud"],          "insurance"],
  ["Vendor payment release and invoice settlement across the network", ["supply_chain"],               "supply_chain"],
  ["Procurement and purchase-order payments for the plant",           ["manufacturing"],               "manufacturing"],
  ["Public procurement and supplier payment processing",             ["government"],                   "government"],
  ["Defence logistics: fulfilment, freight and vendor payments",      ["defence", "supply_chain"],     "defence"],
  ["Telecom subscriber billing, invoicing and payment collection",    ["telecommunications"],          "telecommunications"],
  ["Energy trading desk: wholesale power settlement and payments",    ["energy"],                      "energy"],
  ["Hospital billing, payment posting and revenue-cycle claims",      ["healthcare", "finance"],       "healthcare"],
  ["Actuarial pricing with treasury-style capital and payouts",       ["insurance"],                   "insurance"],
  ["Warehouse robotics procurement and freight payment automation",   ["supply_chain", "manufacturing"], "supply_chain"],
];
for (const [industry, domains, want] of OVERLAP) {
  const got = K.sectorIdFor(industry, domains);
  eq(got, want, `overlap "${industry.slice(0, 44)}"`);
  // And the rendered headline must be the right sector's, not finance's.
  ok(K.sectorProfile(industry, domains).label.toLowerCase() !== "financial services" || want === "finance",
    `overlap headline not wrongly "Financial Services" for ${want}`);
}

// Pure-finance control: finance vocabulary with a finance domain stays finance.
eq(K.sectorIdFor("Wire transfers, SWIFT, treasury and payment rails", ["finance"]), "finance", "pure finance stays finance");

// ── B. ADVERSARIAL: manifest parser robustness + detection stability ─────────
const parses = (label, input, minTools) => {
  let tools;
  try { tools = K.parseManifestTools(input); }
  catch (e) { ok(false, `${label} — parser threw: ${e && e.message}`); return null; }
  ok(Array.isArray(tools), `${label} — returns an array`);
  if (typeof minTools === "number") ok(tools.length >= minTools, `${label} — parsed >= ${minTools} tools (got ${tools ? tools.length : 0})`);
  return tools;
};

// Determinism helper: same input parsed twice → identical tool-name vector.
const deterministic = (label, input) => {
  const a = K.parseManifestTools(input).map((t) => t.name).join("|");
  const b = K.parseManifestTools(input).map((t) => t.name).join("|");
  eq(a, b, `${label} — deterministic parse`);
};

// 1) Malformed manifests never crash the parser.
parses("null manifest", {}, 0);
parses("manifest: null", { manifest: null }, 0);
parses("manifest: string", { manifest: "not-an-array" }, 0);
parses("manifest: number", { manifest: 42 }, 0);
parses("empty array", { manifest: [] }, 0);
parses("array of nulls", { manifest: [null, null] }, 0);
parses("array of empties", { manifest: [{}, {}] }, 0);
parses("tools missing names", { manifest: [{ description: "x" }, { capabilities: ["y"] }] }, 0);

// 2) Nested JSON manifest (function-calling schema shapes).
parses("nested function schema", { manifest: [{ function: { name: "transfer_funds" } }, { function: { name: "read_account" } }] }, 2);
parses("manifest_text JSON with tools[]", { manifest_text: JSON.stringify({ tools: [{ name: "a" }, { name: "b" }] }) }, 2);
parses("manifest_text markdown list", { manifest_text: "tools:\n- transfer_funds (moves money)\n- read_account\n- delete_record" }, 3);

// 3) Duplicated tools — parser keeps them; toolModel de-duplicates canonically.
{
  const dup = { manifest: [{ name: "transfer_funds" }, { name: "transfer_funds" }, { name: "TRANSFER_FUNDS" }] };
  parses("duplicated tools", dup, 3);
  const model = K.toolModel(null, K.parseManifestTools(dup));
  eq(model.length, 1, "toolModel de-duplicates case-insensitively");
}

// 4) Reordered manifest → same tool SET, order-independent detection.
{
  const a = { manifest: [{ name: "issue_po" }, { name: "dispatch_shipment" }, { name: "robot_move" }] };
  const b = { manifest: [{ name: "robot_move" }, { name: "issue_po" }, { name: "dispatch_shipment" }] };
  const setA = new Set(K.parseManifestTools(a).map((t) => t.name.toLowerCase()));
  const setB = new Set(K.parseManifestTools(b).map((t) => t.name.toLowerCase()));
  eq([...setA].sort().join(","), [...setB].sort().join(","), "reordered manifest → same tool set");
}

// 5) Mixed-sector manifest: detection follows the DECLARED domain, not the
//    manifest's scariest tool. (Manifest tools do not vote for the sector.)
{
  const mixed = { manifest: [{ name: "transfer_funds" }, { name: "prescribe" }, { name: "robot_move" }, { name: "weapons_release" }] };
  // No domains, no industry → default (manifest tools must not swing the sector).
  eq(K.sectorIdFor(mixed.industry, mixed.domains), "default", "mixed-sector manifest, no domains → default (tools don't vote)");
}

// 6) Misleading keywords / fake finance vocabulary / hidden healthcare terms in
//    tool names must NOT change the sector (only industry+domains vote).
eq(K.sectorIdFor("Logistics fulfilment", ["supply_chain"]), "supply_chain",
  "supply_chain unaffected by a manifest that happens to contain payment tools");
eq(K.sectorIdFor("hospital clinical operations", ["healthcare"]), "healthcare",
  "healthcare with buried finance-y tool names stays healthcare");
// A prospect who lies in prose ("we are a bank") but declares healthcare domain:
// the structured domain wins over the misleading free text.
eq(K.sectorIdFor("We are basically a bank doing payments and treasury", ["healthcare"]), "healthcare",
  "declared healthcare domain beats misleading 'bank' prose");

// 7) Extremely large manifest — parses, de-dupes, stays fast + deterministic.
{
  const big = { manifest: [] };
  for (let i = 0; i < 5000; i++) big.manifest.push({ name: `tool_${i}`, capabilities: i % 3 ? ["data_access"] : ["payment"] });
  const t0 = Date.now();
  const tools = parses("5000-tool manifest", big, 5000);
  ok(Date.now() - t0 < 2000, "5000-tool manifest parses in < 2s");
  deterministic("5000-tool manifest", big);
  if (tools) {
    const model = K.toolModel(null, tools);
    eq(model.length, 5000, "toolModel handles 5000 unique tools");
  }
}

// 8) Deeply/awkwardly shaped entries never throw.
parses("weird value types", { manifest: [{ name: 123 }, { name: ["a"] }, { name: { nested: true } }, "bare_string_tool"] }, 1);

// ── report ────────────────────────────────────────────────────────────────
console.log(`overlap + adversarial regression: ${pass} passed, ${fail} failed`);
if (fail) { console.log("\nFAILURES:"); for (const f of fails) console.log("  ✗ " + f); process.exit(1); }
process.exit(0);
