#!/usr/bin/env node
/* ============================================================================
 * Runtime Governance — evidence register and findings truncation.
 *
 * A monthly evidence pack is read as a factual record. Every sentence it prints
 * about its own completeness has to be true, including when the window is large
 * enough that the pack cannot print everything.
 *
 * Two ways that broke, both proved here:
 *   · The persisted register kept the OLDEST REGISTER_CAP records while the
 *     document said it was showing "the most recent" — so above the cap, a busy
 *     month presented weeks-old activity as the latest.
 *   · Integrity findings — the exceptions section — were cut at 50 with no note,
 *     so a pack with 200 exceptions looked like a pack with 50.
 *
 * Fixtures only. No database, no network.
 * ============================================================================ */
"use strict";
const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path");
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-trunc-"));

const reports = require("../../lib/runtime/reports");
// connectorHtml takes the escaper from its caller (toHtml); mirror it here.
const esc = (x) => String(x).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const { REGISTER_CAP, REGISTER_DISPLAY } = reports;

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };

// A register as connector-audit builds it: chronological, oldest first.
const chronological = (n) => Array.from({ length: n }, (_, i) => ({
  evidence_id: "ev_" + String(i).padStart(5, "0"),
  executed_at: new Date(Date.UTC(2026, 5, 1, 0, 0, i)).toISOString(),
  canonical_action_id: "aws.bedrock.invoke", proposal_id: "ops_" + i,
  governance_decision: "ALLOW", normalized_connector: "aws-bedrock",
  provider: "aws-bedrock", model: "claude", execution_outcome: "succeeded",
  provider_invocation_count: 1, request_hash: "r" + i, response_hash: "s" + i,
}));

// connectorActivityFor() is the trimming boundary. Drive it through a stubbed
// projection so the test measures the trimming, not the projection.
const audit = require("../../lib/runtime/connector-audit");
const realSummary = audit.summary;
const withRegister = async (register, findings = []) => {
  audit.summary = async () => ({
    window: { since: "2026-06-01T00:00:00.000Z", until: "2026-07-01T00:00:00.000Z" },
    scope: { org_id: "org_a", environment_id: "env_a" },
    totals: { governed_requests: register.length }, connectors: [], models: [], providers: [],
    register, findings,
  });
  try {
    return await reports.connectorActivityFor({
      org_id: "org_a", environment_id: "env_a",
      window: { since: "2026-06-01T00:00:00.000Z", until: "2026-07-01T00:00:00.000Z" },
    });
  } finally { audit.summary = realSummary; }
};

(async () => {
  // ── 1. Under the cap: nothing is trimmed, nothing is claimed ───────────────
  const small = await withRegister(chronological(10));
  ok(small.register.length === 10, "1a. a register under the cap is persisted whole");
  ok(small.register_truncated === false, "1b. a register under the cap is not marked truncated");
  const smallMd = reports.connectorMarkdown(small).join("\n");
  ok(!/Showing the/.test(smallMd), "1c. a register under the display limit prints no truncation note");

  // ── 2. Over the display limit but under the cap ────────────────────────────
  const mid = await withRegister(chronological(99));
  ok(mid.register.length === 99, "2a. a 99-record register is persisted whole");
  ok(mid.register_truncated === false, "2b. 99 records is under the persisted cap");
  const midMd = reports.connectorMarkdown(mid).join("\n");
  ok(midMd.includes(`Showing the ${REGISTER_DISPLAY} most recent of 99 records`),
    "2c. the document discloses that it shows a subset, and of how many");
  ok(midMd.includes("Complete identifiers are preserved in the exported audit data"),
    "2d. below the cap, the claim that the export is complete is true and is made");
  ok(midMd.includes("ev_00098") && !midMd.includes("ev_00073"),
    "2e. the rows shown really are the most recent, newest first");

  // ── 3. Over the persisted cap — the regression this test exists for ────────
  const big = await withRegister(chronological(REGISTER_CAP + 500));
  ok(big.register.length === REGISTER_CAP, "3a. the persisted register is capped");
  ok(big.register_truncated === true, "3b. exceeding the cap is recorded as truncation");
  ok(big.register_total === REGISTER_CAP + 500, "3c. the true total is preserved, not the capped count");

  // The cap must keep the NEWEST records. Keeping the oldest is what made the
  // document's own sentence false.
  const lastId = "ev_" + String(REGISTER_CAP + 499).padStart(5, "0");
  ok(big.register[big.register.length - 1].evidence_id === lastId,
    "3d. the cap retains the most recent record, not the oldest window of records");
  ok(!big.register.some((r) => r.evidence_id === "ev_00000"),
    "3e. the oldest records are the ones dropped");

  const bigMd = reports.connectorMarkdown(big).join("\n");
  ok(bigMd.includes(lastId),
    "3f. above the cap the document still shows the genuinely most recent record");
  ok(bigMd.includes(`most recent of ${REGISTER_CAP + 500} records`),
    "3g. the document reports the true total, not the capped count");
  ok(!bigMd.includes("Complete identifiers are preserved in the exported audit data"),
    "3h. above the cap the document does NOT claim the export is complete");
  ok(bigMd.includes(`retains the ${REGISTER_CAP} most recent records`) && bigMd.includes("500 earlier records"),
    "3i. above the cap the document says exactly what is missing and how much");

  // ── 4. Integrity findings must not shorten in silence ─────────────────────
  const finding = (i) => ({ severity: "medium", kind: "unattributed_execution", detail: "record " + i });
  const fewFindings = await withRegister(chronological(5), Array.from({ length: 3 }, (_, i) => finding(i)));
  const fewMd = reports.connectorMarkdown(fewFindings).join("\n");
  ok(!/integrity findings\./i.test(fewMd) && fewMd.includes("record 2"),
    "4a. a short findings list prints in full with no truncation note");

  const manyFindings = await withRegister(chronological(5), Array.from({ length: 130 }, (_, i) => finding(i)));
  const manyMd = reports.connectorMarkdown(manyFindings).join("\n");
  ok(manyMd.includes("Showing 50 of 130 integrity findings"),
    "4b. a truncated findings list says so, with both numbers");
  ok(manyMd.includes("remaining 80 are present in the exported audit data"),
    "4c. the note says how many are missing and where to find them");
  ok(!manyMd.includes("record 120"), "4d. the findings table is genuinely capped for document length");

  // ── 5. Markdown and HTML must agree — an auditor may read either ──────────
  const bigHtml = reports.connectorHtml(big, esc);
  ok(bigHtml.includes(`retains the ${REGISTER_CAP} most recent records`),
    "5a. the HTML/PDF path carries the same truncation disclosure as the Markdown");
  ok(!bigHtml.includes("Complete identifiers are preserved"),
    "5b. the HTML/PDF path does not claim completeness above the cap either");
  const manyHtml = reports.connectorHtml(manyFindings, esc);
  ok(manyHtml.includes("Showing 50 of 130 integrity findings"),
    "5c. the HTML/PDF path discloses findings truncation");

  // ── 6. The unavailable branch still carries the shape the renderer expects ─
  audit.summary = async () => { throw new Error("projection unavailable"); };
  const broken = await reports.connectorActivityFor({
    org_id: "org_a", environment_id: "env_a",
    window: { since: "2026-06-01T00:00:00.000Z", until: "2026-07-01T00:00:00.000Z" },
  });
  audit.summary = realSummary;
  ok(broken.available === false && broken.register_truncated === false && broken.register_total === 0,
    "6. an unavailable projection reports unavailable rather than an empty-but-complete register");

  console.log(`\nreport truncation test: ${pass} passed, ${fail} failed`);
  if (fail) { console.log("FAILURES:"); for (const f of fails) console.log("  ✗ " + f); }
  try { fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true }); } catch { /* */ }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("report truncation test crashed:", e); process.exit(1); });
