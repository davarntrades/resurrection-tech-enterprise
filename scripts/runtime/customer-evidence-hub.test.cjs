#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[key];
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "rt-customer-hub-"));
process.env.RUNTIME_DATA_DIR = dataDir;

const store = require("../../lib/runtime/store");
const deliverables = require("../../lib/runtime/deliverables");
const hub = require("../../lib/runtime/hub");

(async () => {
  await store.insert("orgs", { id: "org_a", name: "Evaluator A", status: "active" });
  await store.insert("orgs", { id: "org_b", name: "Evaluator B", status: "active" });
  await store.insert("environments", { id: "env_a", org_id: "org_a", kind: "production", mode: "enforce" });
  await store.insert("environments", { id: "env_b", org_id: "org_b", kind: "production", mode: "enforce" });

  const a = await deliverables.publishUploaded({
    org_id: "org_a", environment_id: "env_a", name: "Monthly Governance Evidence", files: [
      { filename: "monthly-evidence.html", bytes: Buffer.from("<h1>A</h1>"), mime: "text/html" },
      { filename: "morrison-audit-v2.json", bytes: Buffer.from('{"schema":"morrison-audit-chain/2"}'), mime: "application/json" },
    ],
  });
  const b = await deliverables.publishUploaded({
    org_id: "org_b", environment_id: "env_b", name: "Monthly Governance Evidence", files: [
      { filename: "monthly-evidence.html", bytes: Buffer.from("<h1>B</h1>"), mime: "text/html" },
    ],
  });

  const first = await hub.createHub({ org_id: "org_a" });
  const reused = await hub.createHub({ org_id: "org_a" });
  assert.equal(reused.token, first.token, "the customer link is durable and reused");
  assert.equal(reused.reused, true);

  const resolved = await hub.resolveHub(first.token);
  assert.equal(resolved.ok, true, "active Hub access resolves");
  assert.equal(resolved.org.id, "org_a", "Hub is scoped to its organisation");
  assert.deepEqual(resolved.packs.map((pack) => pack.org_id), ["org_a"]);
  assert.equal(resolved.packs[0].deliverables.length, 2, "machine-readable evidence is present in the existing pack");

  const active = await hub.getHub(first.token);
  const ownFile = await deliverables.getDeliverable(a.deliverables[1].id);
  const otherFile = await deliverables.getDeliverable(b.deliverables[0].id);
  assert.equal(ownFile.org_id, active.org_id, "same-org file passes the file route's ownership condition");
  assert.notEqual(otherFile.org_id, active.org_id, "cross-org file fails the file route's ownership condition");
  assert.match((await deliverables.readBytes(ownFile)).toString("utf8"), /morrison-audit-chain/, "customer can retain downloaded bytes");

  const rotated = await hub.rotateHub("org_a");
  assert.notEqual(rotated.token, first.token, "rotation mints a fresh token");
  assert.equal((await hub.resolveHub(first.token)).status, 410, "rotation revokes the prior URL");
  assert.equal((await hub.resolveHub(rotated.token)).ok, true, "rotated URL is active");
  await hub.revokeHub(rotated.token);
  assert.equal((await hub.resolveHub(rotated.token)).status, 410, "revocation removes subsequent Hub access");

  const page = fs.readFileSync(path.join(__dirname, "../../app/evidence/hub/[token]/page.tsx"), "utf8");
  const fileRoute = fs.readFileSync(path.join(__dirname, "../../app/api/runtime/hub/[token]/file/route.ts"), "utf8");
  assert.match(page, /pdf\|html\|json\|md\|csv\|txt/, "Evidence Library exposes retained machine-readable artifacts");
  assert.match(fileRoute, /export async function GET/, "customer file surface is read-only GET");
  assert.doesNotMatch(fileRoute, /export async function (POST|PUT|PATCH|DELETE)/, "customer file surface exposes no mutation method");
  assert.match(fileRoute, /del\.org_id !== hub\.org_id/, "file route enforces organisation isolation");

  console.log("Customer Evidence Hub: access, retention, isolation, rotation, revocation and read-only checks passed");
})().finally(() => fs.rmSync(dataDir, { recursive: true, force: true }));
