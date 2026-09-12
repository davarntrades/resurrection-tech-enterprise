#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonicalValue(item)]));
  }
  return value;
}

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const isHash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);

function verifyAuditDoc(doc) {
  if (!doc || typeof doc !== "object") return { ok: false, reason: "document must be a JSON object" };
  if (doc.schema !== "morrison-audit-chain/2") return { ok: false, reason: "unsupported schema" };
  if (!isHash(doc.genesis) || !isHash(doc.head_hash)) return { ok: false, reason: "invalid genesis or head hash" };
  if (!Array.isArray(doc.records) || !Number.isInteger(doc.count)) return { ok: false, reason: "records/count missing or malformed" };
  if (doc.count !== doc.records.length) return { ok: false, reason: "record count mismatch" };

  let previous = doc.genesis;
  for (let index = 0; index < doc.records.length; index++) {
    const record = doc.records[index];
    if (!record || typeof record !== "object" || Array.isArray(record)) return { ok: false, reason: `record ${index} is malformed` };
    if (record.prev_hash !== previous) return { ok: false, reason: `record ${index} previous hash mismatch` };
    if (!isHash(record.record_hash)) return { ok: false, reason: `record ${index} hash is malformed` };
    const { prev_hash: _prev, record_hash, ...withoutHashes } = record;
    const expected = sha256(previous + JSON.stringify(canonicalValue(withoutHashes)));
    if (expected !== record_hash) return { ok: false, reason: `record ${index} content hash mismatch` };
    previous = record_hash;
  }
  if (previous !== doc.head_hash) return { ok: false, reason: "head hash mismatch" };
  return { ok: true, reason: null, count: doc.count, head_hash: doc.head_hash };
}

function main(argv) {
  const filename = argv[2];
  if (!filename) {
    console.error("Usage: node scripts/runtime/verify-audit-v2.cjs <morrison-audit-v2.json>");
    return 2;
  }
  let doc;
  try { doc = JSON.parse(fs.readFileSync(filename, "utf8")); }
  catch (error) {
    console.error(`INVALID: ${(error && error.message) || error}`);
    return 2;
  }
  const result = verifyAuditDoc(doc);
  if (!result.ok) {
    console.error(`INVALID: ${result.reason}`);
    return 1;
  }
  console.log(`VALID: ${result.count} record(s), head ${result.head_hash}`);
  console.log("Scope: export integrity and internal consistency only. Authenticate origin separately and compare correlation/request IDs with evaluator-controlled environment logs.");
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv);

module.exports = { canonicalValue, verifyAuditDoc, main };
