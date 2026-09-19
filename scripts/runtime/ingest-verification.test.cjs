#!/usr/bin/env node
/* Ingestion of finite-model verification artifacts — what it must refuse.
 *   node scripts/runtime/ingest-verification.test.cjs [artifact.json] */
"use strict";
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "rt-ingest-"));
process.env.RUNTIME_DATA_DIR = DATA;
const rt = require("../../lib/runtime");

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };

const FIXTURE = process.argv[2] ||
  path.join(__dirname, "fixtures", "verification-artifact.json");
const CLI = path.join(__dirname, "ingest-verification.cjs");

function run(dir, extra = []) {
  try {
    const out = execFileSync("node", [CLI, "--org", "o", "--environment", "e",
      "--path", dir, ...extra], { env: { ...process.env }, encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: (e.stdout || "") + (e.stderr || "") };
  }
}

function write(dir, name, doc) {
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, name);
  fs.writeFileSync(p, JSON.stringify(doc, null, 2));
  return p;
}

(async () => {
  if (!fs.existsSync(FIXTURE)) {
    console.log(`SKIP — no fixture at ${FIXTURE}`); process.exit(0);
  }
  const base = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  // The checked-in fixture may predate the clean-tree fix; normalise the two
  // provenance fields this CLI gates on so the refusal cases are the subject.
  base.verifier = { ...base.verifier, repository_dirty: false,
                    repository_commit: base.verifier.repository_commit || "a".repeat(40) };
  base.governance = { ...base.governance,
                      rules_logic_hash: base.governance.rules_logic_hash || "b".repeat(64) };

  const good = path.join(DATA, "good");
  write(good, "a.json", base);
  let r = run(good);
  ok(r.code === 0, `a sound artifact ingests (exit ${r.code}: ${r.out})`);
  const held = await rt.store.findOptional("verification_artifacts", {});
  ok(Array.isArray(held) && held.length === 1, "exactly one row written");
  ok(held[0].content_sha256 ===
     crypto.createHash("sha256").update(fs.readFileSync(path.join(good, "a.json"))).digest("hex"),
     "content hash is over the stored bytes");

  r = run(good);
  ok(r.code === 0 && /1 already present/.test(r.out), "re-ingest is idempotent");

  const cases = [
    ["dirty tree", (d) => { d.verifier.repository_dirty = true; }, /dirty working tree/],
    ["unknown tree state", (d) => { d.verifier.repository_dirty = null; }, /could not establish/],
    ["no commit", (d) => { d.verifier.repository_commit = null; }, /no repository_commit/],
    ["SAFE on incomplete", (d) => {
      d.finite_verification.verdict = "SAFE_WITHIN_MODEL";
      d.finite_verification.complete_enumeration = false;
    }, /incomplete enumeration/],
    ["wrong schema", (d) => { d.schema_version = "mrg.global-verification.v1"; }, /schema/],
    ["no rules_logic_hash", (d) => { delete d.governance.rules_logic_hash; }, /rules_logic_hash/],
    ["no model hash", (d) => { d.environment.model_hash = null; }, /model_hash/],
  ];
  for (const [name, mutate, pattern] of cases) {
    const doc = JSON.parse(JSON.stringify(base));
    mutate(doc);
    const dir = path.join(DATA, "bad-" + name.replace(/\W+/g, "-"));
    write(dir, "x.json", doc);
    const res = run(dir);
    ok(res.code === 1 && pattern.test(res.out),
       `refuses: ${name} (exit ${res.code}, out ${res.out.trim().split("\n")[0]})`);
  }

  // Nothing beyond the one sound artifact was ever written.
  const after = await rt.store.findOptional("verification_artifacts", {});
  ok(Array.isArray(after) && after.length === 1,
     `refused artifacts wrote no rows (found ${after && after.length})`);

  // Dry run writes nothing.
  const dry = path.join(DATA, "dry");
  const doc2 = JSON.parse(JSON.stringify(base));
  doc2.verification_id = "gsv-dryrun";
  write(dry, "d.json", doc2);
  r = run(dry, ["--dry-run"]);
  const afterDry = await rt.store.findOptional("verification_artifacts", {});
  ok(r.code === 0 && afterDry.length === 1, "--dry-run writes nothing");

  console.log(`\n${pass} passed, ${fail} failed`);
  fails.forEach((f) => console.log("  FAIL " + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
