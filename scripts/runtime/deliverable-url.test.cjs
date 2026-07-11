#!/usr/bin/env node
/* ============================================================================
 * Regression — Control Room deliverable Preview/Download URL builder.
 *
 * Locks in the invariant that fixed iPad Safari preview: the URL must be
 * RELATIVE (same-origin) so a new-tab Preview stays on the canonical host
 * (e.g. www.resurrection-tech.com) instead of crossing the apex→www 307. A
 * future regression to an absolute `https://resurrection-tech.com/...` URL must
 * fail this test.
 *
 *   node scripts/runtime/deliverable-url.test.cjs
 * ============================================================================ */
"use strict";
const { deliverableFileUrl } = require("../../lib/deliverable-url");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error("  FAIL:", m); } };
const eq = (a, b, m) => ok(a === b, `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

// 1) Preview URL is exactly the relative, same-origin API path with mode=preview.
{
  const u = deliverableFileUrl("del_4ed113a74c8b0a90ba", "preview");
  eq(u, "/api/runtime/admin/deliverables/file?id=del_4ed113a74c8b0a90ba&mode=preview", "preview: exact relative URL");
}

// 2) It is RELATIVE — no scheme, no host, starts with "/". This is the core guard.
{
  const u = deliverableFileUrl("del_1", "preview");
  ok(u.startsWith("/api/runtime/admin/deliverables/file"), "relative: starts with /api path");
  ok(!/^https?:\/\//i.test(u), "relative: no http(s) scheme");
  ok(!u.includes("://"), "relative: no authority");
  ok(!/resurrection-tech\.com/i.test(u), "relative: no hard-coded host");
  ok(!/www\./i.test(u), "relative: no www host");
}

// 3) Preserves the deliverable id and encodes unsafe characters.
{
  const u = deliverableFileUrl("a b&c=d/e", "preview");
  ok(u.includes("id=a%20b%26c%3Dd%2Fe"), "id url-encoded");
  ok(u.endsWith("&mode=preview"), "mode preserved after encoded id");
}

// 4) Download mode → mode=download.
{
  const u = deliverableFileUrl("del_1", "download");
  eq(u, "/api/runtime/admin/deliverables/file?id=del_1&mode=download", "download: exact URL");
}

// 5) Unknown/empty mode falls back to preview (never an invalid mode).
{
  eq(deliverableFileUrl("del_1", "bogus").endsWith("&mode=preview"), true, "unknown mode → preview");
  eq(deliverableFileUrl("del_1", "").endsWith("&mode=preview"), true, "empty mode → preview");
  eq(deliverableFileUrl("del_1", undefined).endsWith("&mode=preview"), true, "missing mode → preview");
}

console.log(`\ndeliverable-url builder: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
