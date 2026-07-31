#!/usr/bin/env node
/* ============================================================================
 * Runtime Governance — share-link password handling.
 *
 * The 144-bit token is the control that makes a share unguessable. The password
 * is a SECOND factor for the case the token leaks: a forwarded email, browser
 * history, a proxy log. Two properties follow from that, and both were missing:
 *
 *   1. The password must not travel in the URL. Carrying it there leaks it by
 *      exactly the route it defends against.
 *   2. It must be stored salted and with a work factor. An unsalted digest of a
 *      human-chosen password falls to a rainbow table the moment a database
 *      leaks, and customers reuse passwords.
 *
 * Existing shares were stored as an unsalted digest and must keep working —
 * invalidating live customer links to tidy a hash format would be worse than
 * the weakness it fixes.
 * ============================================================================ */
"use strict";
const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path");
const crypto = require("node:crypto");
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rt-share-"));

const store = require("../../lib/runtime/store");
const deliverables = require("../../lib/runtime/deliverables");

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };

(async () => {
  // ── Storage format ─────────────────────────────────────────────────────────
  const stored = deliverables.hashSharePassword("correct horse battery staple");
  ok(stored.startsWith("scrypt$"), `1. a new share password is stored with a work factor (got ${stored.slice(0, 12)})`);
  ok(deliverables.hashSharePassword("same") !== deliverables.hashSharePassword("same"),
    "2. the same password hashes differently each time — the salt is per share");
  ok(!stored.includes("correct horse"), "3. the plaintext never appears in the stored value");

  // A bare SHA-256 of the password must NOT be what we store any more.
  const bare = crypto.createHash("sha256").update("correct horse battery staple").digest("hex");
  ok(stored !== bare, "4. the stored value is not an unsalted digest of the password");

  // ── Verification ───────────────────────────────────────────────────────────
  ok(deliverables.verifySharePassword("correct horse battery staple", stored) === true,
    "5. the correct password verifies");
  ok(deliverables.verifySharePassword("wrong", stored) === false, "6. a wrong password is rejected");
  ok(deliverables.verifySharePassword("", stored) === false, "7. an empty password is rejected");
  ok(deliverables.verifySharePassword(null, null) === true, "8. a share with no password stays open");

  // ── Legacy shares keep working ─────────────────────────────────────────────
  ok(deliverables.verifySharePassword("legacy secret", crypto.createHash("sha256").update("legacy secret").digest("hex")) === true,
    "9. a share stored under the old unsalted format still verifies — live links are not invalidated");
  ok(deliverables.verifySharePassword("wrong", crypto.createHash("sha256").update("legacy secret").digest("hex")) === false,
    "10. a legacy share still rejects the wrong password");
  ok(deliverables.verifySharePassword("x", "not-a-valid-stored-value") === false,
    "11. a malformed stored value fails closed instead of throwing");

  // ── End to end through the real share lifecycle ────────────────────────────
  await store.insert("orgs", { id: "org_s", name: "S", status: "active" });
  await store.insert("environments", { id: "env_s", org_id: "org_s", kind: "production", mode: "enforce" });
  const share = await deliverables.shareInline({
    org_id: "org_s", environment_id: "env_s", filename: "audit.pdf",
    bytes: Buffer.from("%PDF-1.4 fixture"), mime: "application/pdf", password: "s3cret",
  });
  const row = await store.findOne("shares", { token: share.token });
  ok(row.password_hash.startsWith("scrypt$"),
    "12. a share minted through the real path stores a salted hash");
  ok((await deliverables.resolveShare(share.token, "s3cret")).ok === true,
    "13. the correct password resolves the deliverable");
  const bad = await deliverables.resolveShare(share.token, "guess");
  ok(bad.ok === false && bad.status === 401, "14. a wrong password is refused with 401");

  // The token remains the primary control.
  ok((await deliverables.resolveShare("not-a-real-token", "s3cret")).status === 404,
    "15. an unknown token is refused regardless of password");

  // ── The route must not accept the password from the URL ────────────────────
  const routeSrc = fs.readFileSync(
    path.join(__dirname, "..", "..", "app", "api", "runtime", "share", "[token]", "route.ts"), "utf8");
  ok(!/searchParams\.get\(["']pw["']\)/.test(routeSrc),
    "16. the share route no longer reads the password from the query string");
  ok(/x-share-password/.test(routeSrc),
    "17. the share route reads the password from a header");
  ok(/searchParams\.has\(["']pw["']\)/.test(routeSrc),
    "18. a link still carrying ?pw= is rejected explicitly, so the operator learns to re-issue it");

  console.log(`\nshare password test: ${pass} passed, ${fail} failed`);
  if (fail) { console.log("FAILURES:"); for (const f of fails) console.log("  ✗ " + f); }
  try { fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true }); } catch { /* */ }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("share password test crashed:", e); process.exit(1); });
