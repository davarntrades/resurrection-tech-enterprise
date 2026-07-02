#!/usr/bin/env node
/* ============================================================================
 * Mutation testing for the enterprise regression suite.
 *
 * Mutation testing inverts normal testing: instead of proving the system works,
 * it proves the TEST SUITE works — by deliberately breaking a critical
 * governance/reporting behaviour and confirming the regression suite FAILS and
 * says clearly what broke. A mutation the suite does NOT catch ("survives") is
 * a blind spot in the regression.
 *
 * Each mutation here is applied TEMPORARILY, at the narrowest faithful layer:
 *   • a mutating engine PROXY in front of the real engine (verdict / Ω / hash /
 *     runtime-evidence breaks) — the engine itself is never modified, and
 *   • temporary string-edits of scripts/delivery-kit.cjs (sector label / PDF /
 *     recommendation breaks) — reverted from an in-memory snapshot in a
 *     `finally`, so nothing persists even if the run crashes.
 * The REAL `enterprise-regression.cjs` gate is then run (scoped to one sector
 * via SMOKE_ONLY, pointed at the proxy). We assert it exits non-zero AND prints
 * the expected explanation. Then we revert and, at the end, confirm the clean
 * suite passes again.
 *
 *   GOVERNANCE_URL=<real engine> GOVERNANCE_TOKEN=… node scripts/smoke-tests/mutation-test.cjs
 * ============================================================================ */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const { spawn } = require("node:child_process");

const PACK_DIR = __dirname;
const ROOT = path.join(PACK_DIR, "..", "..");
const KIT = path.join(ROOT, "scripts", "delivery-kit.cjs");
const REGRESSION = path.join(PACK_DIR, "enterprise-regression.cjs");
const REAL_ENGINE = (process.env.GOVERNANCE_URL || "").replace(/\/$/, "");
const TOKEN = process.env.GOVERNANCE_TOKEN || "";
const PROXY_PORT = Number(process.env.MUTATION_PROXY_PORT || 8093);
const PROXY_URL = `http://127.0.0.1:${PROXY_PORT}`;
const C = { grn: (s) => `\x1b[32m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m` };

if (!REAL_ENGINE || !TOKEN) {
  console.log("Mutation testing SKIPPED — set GOVERNANCE_URL + GOVERNANCE_TOKEN (the real engine).");
  process.exit(0);
}

// ── Mutating proxy ───────────────────────────────────────────────────────────
// Forwards every request to the real engine; when a mutation MODE is active it
// rewrites /v1/evaluate responses. `MODE` is a module variable set per case.
let MODE = null;
const hex = (s) => String(s || "").split("").reverse().join("");
function mutateEvaluate(json, reqBody) {
  const domains = ((reqBody && reqBody.domains) || []).map((d) => String(d).toLowerCase());
  const v = String(json.verdict || "").toUpperCase();
  switch (MODE) {
    case "allow_to_block": if (v === "PERMIT") json.verdict = "BLOCK"; break;
    case "block_to_allow": if (v === "BLOCK") { json.verdict = "PERMIT"; json.permitted = true; json.blocked = false; } break;
    case "block_to_allow_finance":
      if (v === "BLOCK" && domains.some((d) => /financ|bank|payment|fintech/.test(d))) { json.verdict = "PERMIT"; json.permitted = true; json.blocked = false; }
      break;
    case "wrong_omega": if (v === "BLOCK" && json.omega_domain) json.omega_domain = "aerospace"; break;
    case "strip_omega_healthcare": if (json.omega_domain === "healthcare") json.omega_domain = null; break;
    case "corrupt_hash": if (json.trajectory_hash) json.trajectory_hash = hex(json.trajectory_hash); break;
    default: break;
  }
  return json;
}
const proxy = http.createServer((cReq, cRes) => {
  const chunks = [];
  cReq.on("data", (d) => chunks.push(d));
  cReq.on("end", () => {
    const body = Buffer.concat(chunks);
    // "missing runtime evidence": make /v1/evaluate unreachable so the kit
    // marks metrics.source != "engine" (it fails soft, by design).
    if (MODE === "fail_evaluate" && cReq.url.startsWith("/v1/evaluate")) {
      cRes.writeHead(503, { "content-type": "application/json" });
      cRes.end('{"detail":"mutation: evaluate disabled"}');
      return;
    }
    const u = new URL(REAL_ENGINE);
    const agent = u.protocol === "https:" ? https : http;
    const fwd = agent.request({
      hostname: u.hostname, port: u.port || (u.protocol === "https:" ? 443 : 80), path: cReq.url, method: cReq.method,
      headers: { ...cReq.headers, host: u.host },
    }, (fRes) => {
      const out = [];
      fRes.on("data", (d) => out.push(d));
      fRes.on("end", () => {
        let buf = Buffer.concat(out);
        if (MODE && cReq.url.startsWith("/v1/evaluate") && fRes.statusCode === 200) {
          try {
            const json = JSON.parse(buf.toString());
            let reqBody = null; try { reqBody = JSON.parse(body.toString()); } catch { /* ignore */ }
            buf = Buffer.from(JSON.stringify(mutateEvaluate(json, reqBody)));
          } catch { /* leave unmutated */ }
        }
        cRes.writeHead(fRes.statusCode, { "content-type": fRes.headers["content-type"] || "application/json" });
        cRes.end(buf);
      });
    });
    fwd.on("error", () => { cRes.writeHead(502); cRes.end('{"detail":"proxy upstream error"}'); });
    if (body.length) fwd.write(body);
    fwd.end();
  });
});

// ── delivery-kit.cjs string-edit mutations (snapshot + revert) ───────────────
const KIT_SRC = fs.readFileSync(KIT, "utf8");
function editKit(find, replace) {
  const cur = fs.readFileSync(KIT, "utf8");
  if (!cur.includes(find)) throw new Error(`mutation anchor not found in delivery-kit.cjs: ${find.slice(0, 50)}`);
  fs.writeFileSync(KIT, cur.replace(find, replace));
}
const restoreKit = () => fs.writeFileSync(KIT, KIT_SRC);

// ── run the real regression gate, scoped, through the proxy ──────────────────
// MUST be async (spawn, not spawnSync): the mutating proxy runs in THIS process,
// so the event loop has to stay free to serve the gate subprocess's requests.
function runGate(sector, extraEnv) {
  return new Promise((resolve) => {
    const child = spawn("node", [REGRESSION, "--no-report"], {
      env: { ...process.env, GOVERNANCE_URL: PROXY_URL, GOVERNANCE_TOKEN: TOKEN, SMOKE_ONLY: sector, ...(extraEnv || {}) },
    });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    const timer = setTimeout(() => { child.kill("SIGKILL"); }, 120000);
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, out }); });
  });
}

// ── the mutations ────────────────────────────────────────────────────────────
const MUTATIONS = [
  { id: 1, name: "Sector mislabelling", sector: "supply_chain",
    expect: /sector detection changed|threat-model headline|→ *finance/i,
    // Force detection to always answer "finance" (rest of the fn becomes dead
    // but syntactically valid code) — a supply-chain audit is now mislabelled.
    apply: () => editKit("function sectorIdFor(industry, domains, explicit) {",
                         'function sectorIdFor(industry, domains, explicit) { return "finance"; /* MUTATION */'),
    revert: restoreKit },

  { id: 2, name: "Wrong Ω attribution", sector: "finance", mode: "wrong_omega",
    expect: /Ω[^\n]*→|cross-sector Ω/i },

  { id: 3, name: "ALLOW changed to BLOCK", sector: "finance", mode: "allow_to_block",
    expect: /PERMIT → BLOCK|FALSE POSITIVES increased|verdicts match expected/i },

  { id: 4, name: "BLOCK changed to ALLOW", sector: "supply_chain", mode: "block_to_allow",
    expect: /BLOCK → PERMIT|FALSE NEGATIVES increased|verdicts match expected/i },

  { id: 5, name: "Missing runtime evidence", sector: "finance", mode: "fail_evaluate",
    expect: /runtime evidence/i },

  { id: 6, name: "Corrupted trajectory hash", sector: "finance", mode: "corrupt_hash",
    expect: /trajectory_hash changed|deterministic replay/i },

  { id: 7, name: "Missing PDF section", sector: "finance",
    expect: /PDF renders|PDF failed to render|PDF size/i,
    // Chromium resolves to nothing → the kit fails soft, no PDF is produced.
    apply: () => editKit("function resolveChrome() {", "function resolveChrome() { return null; /* MUTATION */"),
    revert: restoreKit },

  { id: 8, name: "Missing recommendation", sector: "finance",
    expect: /recommendation engine produced a recommendation|recommendation changed/i,
    apply: () => editKit("`## Recommended engagement — ${rec.name}`", "`(recommendation suppressed by MUTATION)`"),
    revert: restoreKit },

  { id: 9, name: "Disabled healthcare attribution", sector: "healthcare", mode: "strip_omega_healthcare",
    expect: /Ω[^\n]*→/i },

  { id: 10, name: "Removed finance/payment rule", sector: "finance", mode: "block_to_allow_finance",
    expect: /BLOCK → PERMIT|FALSE NEGATIVES increased|verdicts match expected/i },
];

// ── driver ───────────────────────────────────────────────────────────────────
(async () => {
  await new Promise((res) => proxy.listen(PROXY_PORT, "127.0.0.1", res));
  console.log(C.bold(`\nMutation testing — proxy ${PROXY_URL} → engine ${REAL_ENGINE}\n`));

  // Sanity: a clean pass-through run of the scoped gate must PASS (proves the
  // harness + proxy don't themselves break anything).
  MODE = null;
  const sanity = await runGate("finance");
  const sanityOk = sanity.code === 0;
  console.log(`${sanityOk ? C.grn("✓") : C.red("✗")} baseline sanity (finance, no mutation): ${sanityOk ? "PASS" : "FAIL — harness/proxy is not transparent"}`);
  if (!sanityOk) { console.log(sanity.out.split("\n").slice(-20).join("\n")); proxy.close(); process.exit(1); }

  const rows = [];
  for (const m of MUTATIONS) {
    let applied = false;
    try {
      MODE = m.mode || null;
      if (m.apply) { m.apply(); if (m.fixup) m.fixup(); applied = true; }
      const r = await runGate(m.sector);
      const detected = r.code !== 0 && m.expect.test(r.out);
      const evidence = (r.out.split("\n").find((l) => m.expect.test(l)) || "").trim().replace(/\x1b\[[0-9;]*m/g, "").slice(0, 88);
      rows.push({ id: m.id, name: m.name, detected, evidence });
      console.log(`${detected ? C.grn("✓") : C.red("✗")} [${String(m.id).padStart(2)}] ${m.name.padEnd(32)} ${detected ? C.dim(evidence) : C.red("NOT DETECTED (mutation survived) code=" + r.code)}`);
    } finally {
      MODE = null;
      if (m.revert) m.revert();     // revert kit edits
      else if (applied) restoreKit();
    }
  }

  // Confirm nothing persisted: the kit is byte-identical to the snapshot, and a
  // clean scoped run passes again.
  const kitClean = fs.readFileSync(KIT, "utf8") === KIT_SRC;
  MODE = null;
  const after = await runGate("finance");
  const afterOk = after.code === 0;
  console.log(`\n${kitClean ? C.grn("✓") : C.red("✗")} delivery-kit.cjs restored byte-for-byte`);
  console.log(`${afterOk ? C.grn("✓") : C.red("✗")} clean regression passes again after all mutations reverted`);

  proxy.close();

  // ── summary table ──────────────────────────────────────────────────────────
  console.log(C.bold("\n══════════════════════════════════════════════════════════════════════"));
  console.log(C.bold(" MUTATION TESTING SUMMARY"));
  console.log(C.bold("══════════════════════════════════════════════════════════════════════"));
  console.log(` ${"Mutation".padEnd(34)}${"Expected failure detected".padEnd(27)}Status`);
  for (const r of rows) {
    console.log(` ${(r.id + ". " + r.name).padEnd(34)}${(r.detected ? "yes" : "NO").padEnd(27)}${r.detected ? "PASS" : "FAIL"}`);
  }
  const caught = rows.filter((r) => r.detected).length;
  const allCaught = caught === rows.length && kitClean && afterOk;
  console.log(`\n ${caught}/${rows.length} mutations caught · kit restored ${kitClean ? "yes" : "NO"} · clean suite passes ${afterOk ? "yes" : "NO"}`);
  console.log(C.bold(` RESULT: ${allCaught ? C.grn("PASS — every mutation was caught") : C.red("FAIL — a mutation survived (regression blind spot)")}\n`));
  process.exit(allCaught ? 0 : 1);
})();
