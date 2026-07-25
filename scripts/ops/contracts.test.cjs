/* ============================================================================
 * Guardian OS — engineering contract tests.
 *
 * These do not test behaviour. They test the PROPERTIES of the codebase that,
 * when they quietly lapsed, produced real incidents:
 *
 *   1. A bare `catch {}` in the storage layer turned "the database client cannot
 *      be built" into "we are now writing governance evidence to local disk",
 *      with nothing logged.
 *   2. package.json declared Node >= 18 while the database client requires 22,
 *      so CI ran a version the platform cannot actually use.
 *   3. A YAML indentation error meant the sovereign workflow NEVER PARSED, so it
 *      never ran a single job — while being cited as proof of air-gapped
 *      operation.
 *   4. A check script read status BEFORE loading, so the tampered-bundle
 *      assertion would have passed against a perfectly good bundle.
 *
 * Every one of those was invisible to the existing tests, because the existing
 * tests asked "does the feature work?" and the answer was yes — in the
 * configuration being tested. These ask a different question: "can this class of
 * failure be reintroduced?"
 *
 * DELIBERATELY STATIC. No engine, no store, no network — so they run everywhere,
 * fast, and cannot themselves rot into a no-op.
 *
 *   node scripts/ops/contracts.test.cjs
 * ========================================================================== */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`  [PASS] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`); }
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
function walk(dir, filter, out = []) {
  let items = [];
  try { items = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }); } catch { return out; }
  for (const it of items) {
    const rel = `${dir}/${it.name}`;
    if (it.isDirectory()) { if (it.name !== "node_modules" && it.name !== ".next") walk(rel, filter, out); }
    else if (filter(rel)) out.push(rel);
  }
  return out;
}

// ── 1. Swallowed exceptions ────────────────────────────────────────────────
// A `catch` that discards the error is only acceptable where the error carries
// no information the caller could act on. Anywhere that decides WHERE DATA GOES
// or WHETHER SOMETHING IS TRUSTED, it is a defect: it converts a fault into a
// silent behaviour change. Those modules are listed here and held to the rule.
const INTEGRITY_CRITICAL = [
  "lib/runtime/store.js",
  "lib/sovereign/bundle.js",
  "lib/sovereign/packs.js",
  "lib/sovereign/updates.js",
  "lib/sovereign/immutable.js",
  "lib/ops/govpolicy.js",
];

// THE RULE: you may discard an error only if you say why.
//
// `catch { /* the head cache is non-authoritative */ }` is a considered
// decision a reviewer can check. `catch {}` is the absence of one — and it was
// the absence of one that turned an unbuildable database client into a silent
// downgrade. So an empty catch with an explanation passes; an empty catch
// WITHOUT an explanation fails.
function silentCatches(src) {
  const hits = [];
  const re = /catch\s*(\([^)]*\))?\s*\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const raw = m[2];
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").trim();
    const explained = /\/\*[\s\S]*?\*\/|\/\//.test(raw);
    if (!code && !explained) hits.push(m[0].replace(/\s+/g, " ").slice(0, 90));
  }
  return hits;
}

function contractSwallowedExceptions() {
  console.log("\n1. Swallowed exceptions in integrity-critical modules\n");
  for (const file of INTEGRITY_CRITICAL) {
    const src = read(file);
    const hits = silentCatches(src);
    ok(hits.length === 0, `${file}: every discarded error is explained`, hits);
  }
  // The specific regression: the storage layer must never discard a client
  // construction failure again.
  const store = read("lib/runtime/store.js");
  ok(/catch \(e\) \{[\s\S]{0,900}_cloudError = /.test(store),
    "store.js RECORDS the cloud client failure rather than discarding it");
  ok(/assertStorageHealthy/.test(store) && (store.match(/assertStorageHealthy\(/g) || []).length >= 6,
    "every write path asserts storage integrity before writing",
    (store.match(/assertStorageHealthy\(/g) || []).length);
  ok(/StorageUnavailableError/.test(store), "a distinct error type exists for an unavailable durable store");
}

// ── 2. Runtime version floor ───────────────────────────────────────────────
// The Node floor must be stated in ONE place and honoured everywhere. It lapsed
// because package.json said 18, CI said 20, and the database client needed 22 —
// three answers, none of them checked against each other.
function contractNodeFloor() {
  console.log("\n2. Node version floor is consistent everywhere\n");
  const pkg = JSON.parse(read("package.json"));
  const declared = /(\d+)/.exec(String((pkg.engines || {}).node || ""));
  ok(!!declared, "package.json declares an engines.node floor", (pkg.engines || {}).node);
  const floor = declared ? Number(declared[1]) : 0;
  ok(floor >= 22, "the declared floor is at least 22 (required by @supabase/supabase-js)", floor);

  // Every workflow that runs the platform must use >= the floor.
  const workflows = walk(".github/workflows", (p) => p.endsWith(".yml"));
  const offenders = [];
  for (const wf of workflows) {
    const src = read(wf);
    for (const m of src.matchAll(/node-version:\s*"?(\d+)"?/g)) {
      if (Number(m[1]) < floor) offenders.push(`${wf.split("/").pop()} → node ${m[1]}`);
    }
  }
  ok(offenders.length === 0, `no workflow runs Node below the declared floor (${floor})`, offenders);

  // And every Dockerfile that runs the platform.
  const dockerfiles = walk("deploy", (p) => /Dockerfile/.test(p));
  const dockerOffenders = [];
  for (const df of dockerfiles) {
    for (const m of read(df).matchAll(/FROM node:(\d+)/g)) {
      if (Number(m[1]) < floor) dockerOffenders.push(`${df} → node:${m[1]}`);
    }
  }
  ok(dockerOffenders.length === 0, `no Dockerfile bases on Node below the floor (${floor})`, dockerOffenders);

  // A pinned runtime for the hosting platform, so the floor is not left to a
  // provider default that can change under us.
  ok(fs.existsSync(path.join(ROOT, ".nvmrc")), ".nvmrc pins the runtime for the host platform");
  if (fs.existsSync(path.join(ROOT, ".nvmrc"))) {
    const n = Number((read(".nvmrc").match(/(\d+)/) || [])[1]);
    ok(n >= floor, `.nvmrc is at or above the floor`, n);
  }
  // startup.js must read the floor from package.json, not hard-code a second copy.
  ok(/require\("\.\.\/\.\.\/package\.json"\)/.test(read("lib/runtime/startup.js")),
    "startup validation reads the floor from package.json (one source of truth)");
}

// ── 3. CI workflows are real ───────────────────────────────────────────────
// The blind spot: GitHub reports an unparseable workflow as a FAILED RUN WITH
// ZERO JOBS, which reads like an infrastructure blip. A dead pipeline was cited
// as proof for weeks. Parsing every workflow locally makes that impossible.
function contractWorkflowsValid() {
  console.log("\n3. Every CI workflow parses and references files that exist\n");
  let yaml;
  try { yaml = require("js-yaml"); } catch { yaml = null; }

  const workflows = walk(".github/workflows", (p) => p.endsWith(".yml"));
  ok(workflows.length > 0, "workflows are present", workflows.length);

  for (const wf of workflows) {
    const src = read(wf);
    const name = wf.split("/").pop();
    if (yaml) {
      let doc = null, err = null;
      try { doc = yaml.load(src); } catch (e) { err = e.message; }
      ok(!!doc && !!doc.jobs && Object.keys(doc.jobs).length > 0,
        `${name} parses and declares at least one job`, err || "no jobs");
    } else {
      // Without a YAML parser, catch the specific failure mode that bit us: a
      // line at column 0 inside a `run: |` block scalar.
      const lines = src.split("\n");
      let inBlock = false, indent = 0, bad = null;
      lines.forEach((ln, i) => {
        const m = /^(\s*)(run|if):\s*[|>]/.exec(ln);
        if (m) { inBlock = true; indent = m[1].length; return; }
        if (inBlock) {
          if (!ln.trim()) return;
          const lead = ln.length - ln.trimStart().length;
          if (lead <= indent) inBlock = false;
          if (lead === 0 && ln.trim()) bad = bad || `${name}:${i + 1}`;
        }
      });
      ok(!bad, `${name} has no column-0 line inside a block scalar`, bad);
    }

    // Every script the workflow invokes must exist. A workflow that references a
    // deleted script fails at runtime, minutes into a job, for no good reason.
    const refs = [...src.matchAll(/\b(?:node|python3?|bash|sh)\s+((?:scripts|bin|governance-service)\/[\w./-]+)/g)].map((m) => m[1]);
    const missing = [...new Set(refs)].filter((r) => !fs.existsSync(path.join(ROOT, r)));
    ok(missing.length === 0, `${name} references only scripts that exist`, missing);
  }
}

// ── 4. Sovereign verification cannot be bypassed ───────────────────────────
// Verification is only worth having if it cannot be quietly turned into a
// no-op. These pin the properties that make it meaningful.
function contractSovereignVerification() {
  console.log("\n4. Sovereign verification cannot be bypassed\n");
  const bundle = require("../../lib/sovereign/bundle");
  const profiles = require("../../lib/sovereign/profiles");

  // An unsigned bundle must be refused where the profile demands a signature.
  const built = bundle.build({
    kind: "policies", id: "contract", version: "1.0.0",
    files: { "policies/a.json": JSON.stringify({ name: "x", domain: "finance", spec: { match: { tools: ["t"] }, conditions: {} } }) },
    sign: null,
  });
  ok(bundle.verify(built, { requireSignature: true }).ok === false,
    "an unsigned bundle is refused when a signature is required");
  ok(profiles.requiresSignedBundles("sovereign") && profiles.requiresSignedBundles("air_gapped"),
    "sovereign and air-gapped profiles require signed bundles");

  // Tampering must be caught by content hash independently of the signature.
  const tampered = { manifest: built.manifest, files: { "policies/a.json": Buffer.from("{}") } };
  ok(bundle.verify(tampered, { requireSignature: false }).ok === false,
    "content tampering is caught even with signatures not required");

  // The verifier must not be reducible to a single boolean an option can flip.
  const src = read("lib/sovereign/bundle.js");
  ok(/entriesDigest\(entries\) !== manifest\.digest/.test(src), "the entry-list digest is checked independently");
  ok(/unlisted file/.test(src), "files not listed in the manifest are rejected");
  ok(!/if \(process\.env\.[A-Z_]*SKIP/.test(src) && !/return \{ ok: true \}/.test(src),
    "no environment variable short-circuits verification to ok");

  // `guardian verify` is diagnostic: it must not mutate.
  const verifySrc = read("lib/sovereign/verify.js");
  ok(!/store\.(insert|update|remove)\(/.test(verifySrc) && !/govpolicy\.(draft|activate|rollback)\(/.test(verifySrc),
    "guardian verify performs no writes — it is diagnostic, never corrective");

  // A check script that reads state before loading it passes vacuously. That
  // shipped once; pin the ordering.
  const airgap = read("scripts/sovereign/airgap_engine_check.py");
  ok(/def load_then_status/.test(airgap) && /rules, st = load_then_status\(\)/.test(airgap),
    "the air-gap check loads BEFORE reading status (a vacuous pass is impossible)");
  ok(/recorded NO reason/.test(airgap),
    "the tampered-bundle check requires a recorded reason, so an unloaded bundle cannot satisfy it");
}

// ── 5. Honesty properties that must not drift ──────────────────────────────
function contractHonesty() {
  console.log("\n5. Honesty properties are structural, not editorial\n");
  const acceptance = read("lib/sovereign/acceptance.js");
  ok(/sovereign_evidence/.test(acceptance) && /DOES NOT EVIDENCE SOVEREIGN/.test(acceptance),
    "a connected-profile acceptance run is marked as NOT sovereign evidence");
  ok(/caveats\.push/.test(acceptance) && /caveats\.join/.test(acceptance),
    "caveats COMPOSE rather than override — one cannot displace another");
  const controls = read("lib/sovereign/controls.js");
  ok(/no third-party accreditation/i.test(controls) && /not a certification/i.test(controls),
    "the control mapping refuses to imply accreditation");
  ok(/gapRegister/.test(controls) && controls.indexOf("Gap register") < controls.indexOf("for (const f of all.frameworks)"),
    "the gap register is emitted before the satisfied controls");
  const report = read("lib/sovereign/report.js");
  ok(/function readable/.test(report),
    "the PDF layer has a value serialiser, so structured fields cannot render as [object Object]");
}

function main() {
  console.log("\nGuardian OS — engineering contract tests");
  console.log("(properties whose lapse caused real incidents)");
  contractSwallowedExceptions();
  contractNodeFloor();
  contractWorkflowsValid();
  contractSovereignVerification();
  contractHonesty();
  console.log(`\n${pass}/${pass + fail} passed\n`);
  process.exit(fail ? 1 : 0);
}

main();
