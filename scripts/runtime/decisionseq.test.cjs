#!/usr/bin/env node
/* Runtime Governance — decision sequence allocation test (no engine needed).
 * Proves the per-environment seq is allocated from max(seq)+1 and self-heals
 * chain_heads drift, so it never reuses a seq (which on Supabase trips the
 * rg_dec_env_seq_uidx unique constraint). File-store backed. */
"use strict";
const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path");

for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k]; // force file store
process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-seq-"));
const store = require("../../lib/runtime/store");

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };
const eq = (g, w, m) => ok(JSON.stringify(g) === JSON.stringify(w), `${m} — expected ${JSON.stringify(w)}, got ${JSON.stringify(g)}`);
const dec = (v) => ({ org_id: "org_t", environment_id: "env_t", engine_verdict: v, verdict: v, omega_domain: "finance", rule: "r" });

(async () => {
  ok(store.backend() === "file", "running on the file store");

  // 1) Contiguous sequential appends.
  for (let i = 0; i < 3; i++) await store.appendDecision(dec("ALLOW"));
  let v = await store.verifyChain("org_t", "env_t");
  ok(v.ok && v.count === 3, `3 sequential appends verify (ok=${v.ok} count=${v.count})`);
  const seqs = (await store.queryDecisions({ environment_id: "env_t", limit: 100 })).map((r) => r.seq).sort((a, b) => a - b);
  eq(seqs, [1, 2, 3], "seqs are contiguous 1..3");

  // 2) Simulate chain_heads DRIFT (the production bug): force the cached head
  //    counter backwards to 1 while the decisions table holds seq up to 3.
  const head = await store.findOne("chain_heads", { environment_id: "env_t" });
  await store.update("chain_heads", head.id, { seq: 1 });

  // The next append must allocate seq = max(seq)+1 = 4, NOT head.seq+1 = 2.
  const rec = await store.appendDecision(dec("BLOCK"));
  ok(rec.seq === 4, `drift self-heals: next seq is 4, not a duplicate (got ${rec.seq})`);
  v = await store.verifyChain("org_t", "env_t");
  ok(v.ok && v.count === 4, `chain remains intact after self-heal (ok=${v.ok} count=${v.count})`);

  // 3) No duplicate seq anywhere.
  const all = (await store.queryDecisions({ environment_id: "env_t", limit: 100 })).map((r) => r.seq);
  ok(new Set(all).size === all.length, `no duplicate seq values (${all.sort((a, b) => a - b).join(",")})`);

  console.log(`\ndecision-sequence test: ${pass} passed, ${fail} failed`);
  if (fail) { console.log("FAILURES:"); for (const f of fails) console.log("  ✗ " + f); }
  try { fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true }); } catch { /* */ }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("seq test crashed:", e); process.exit(1); });
