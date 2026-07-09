#!/usr/bin/env node
/* Runtime Governance — deliverables + secure-share lifecycle (file backend).
 * Publishes a generated pack, lists it, reads bytes, and exercises share
 * create → resolve → expiry → revoke → password. No engine/Supabase needed. */
"use strict";
const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path");

for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k]; // file store + local object dir
process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-deliv-"));
const store = require("../../lib/runtime/store");
const deliverables = require("../../lib/runtime/deliverables");

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };

(async () => {
  // A fake generated deliverables directory (as delivery-kit would write).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rt-pack-"));
  fs.writeFileSync(path.join(dir, "audit.html"), "<h1>Audit</h1>");
  fs.writeFileSync(path.join(dir, "audit.pdf"), Buffer.from([0x25, 0x50, 0x44, 0x46])); // %PDF
  fs.writeFileSync(path.join(dir, "run-summary.json"), JSON.stringify({ assess_summary: "Evaluated 3 trajectories.", metrics: {} }));

  // 1) publish → pack + deliverables recorded, bytes stored.
  const { pack, deliverables: dels } = await deliverables.publishPack({ org_id: "org_x", environment_id: "env_x", name: "48-Hour Audit", reference: "RT-1", dir });
  ok(pack.id && pack.summary && pack.summary.assess_summary === "Evaluated 3 trajectories.", "pack records the run summary");
  ok(dels.length === 3 && dels.some((d) => d.filename === "audit.pdf"), "all deliverables recorded");

  // 2) list scoped to the environment.
  const packs = await deliverables.listPacks({ org_id: "org_x", environment_id: "env_x" });
  ok(packs.length === 1 && packs[0].deliverables.length === 3, "listPacks returns the pack + deliverables");

  // 3) read bytes back.
  const pdf = dels.find((d) => d.filename === "audit.pdf");
  const bytes = await deliverables.readBytes(pdf);
  ok(Buffer.from(bytes).slice(0, 4).toString() === "%PDF", "deliverable bytes round-trip from storage");

  // 4) share: create → resolve.
  const share = await deliverables.createShare({ deliverable_id: pdf.id, expires_in_days: 7 });
  ok(share.token && share.path.includes(share.token), "share link minted");
  let r = await deliverables.resolveShare(share.token);
  ok(r.ok && Buffer.from(r.bytes).slice(0, 4).toString() === "%PDF", "active share resolves to the bytes");

  // 5) revoke → gone.
  await deliverables.revokeShare(share.token);
  r = await deliverables.resolveShare(share.token);
  ok(!r.ok && r.error === "revoked", "revoked share is rejected");

  // 6) password-protected share requires the password.
  const ps = await deliverables.createShare({ deliverable_id: pdf.id, expires_in_days: 7, password: "s3cret" });
  ok(!(await deliverables.resolveShare(ps.token, "wrong")).ok, "wrong password rejected");
  ok((await deliverables.resolveShare(ps.token, "s3cret")).ok, "correct password accepted");

  // 7) unknown token → not found.
  ok((await deliverables.resolveShare("nope")).status === 404, "unknown token is 404");

  console.log(`\ndeliverables test: ${pass} passed, ${fail} failed`);
  if (fail) { console.log("FAILURES:"); for (const f of fails) console.log("  ✗ " + f); }
  try { fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true }); fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("deliverables test crashed:", e); process.exit(1); });
