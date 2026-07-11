#!/usr/bin/env node
/* ============================================================================
 * Regression — deliverable byte-serving plan (Preview / Download HTTP path).
 *
 * Guards the bug that made a published audit pack fail to open in the Control
 * Room on iPad/iOS Safari ("This page couldn't load"): the file route served a
 * PDF as a bare 200 with no Content-Length and no Range support, which Safari's
 * inline PDF viewer rejects. planByteResponse() now advertises Accept-Ranges,
 * always sends an accurate Content-Length, and answers Range with a 206.
 *
 *   node scripts/runtime/deliverable-file.test.cjs
 * ============================================================================ */
"use strict";
const { planByteResponse } = require("../../lib/runtime/deliverables");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error("  FAIL:", m); } };
const eq = (a, b, m) => ok(a === b, `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

const SIZE = 337211; // the real audit.pdf size from the live pack

// 1) Full inline preview (no Range): 200 + exact length + range-capable + pdf.
{
  const p = planByteResponse({ size: SIZE, mime: "application/pdf", filename: "audit.pdf", mode: "preview" });
  eq(p.status, 200, "full: status");
  eq(p.headers["content-type"], "application/pdf", "full: content-type");
  eq(p.headers["content-disposition"], 'inline; filename="audit.pdf"', "full: disposition inline");
  eq(p.headers["content-length"], String(SIZE), "full: content-length");
  eq(p.headers["accept-ranges"], "bytes", "full: accept-ranges");
  eq(p.headers["cache-control"], "private, no-store", "full: cache-control");
  eq(p.start, 0, "full: start"); eq(p.end, SIZE - 1, "full: end");
}

// 2) Safari's opening probe: Range: bytes=0-1 → 206 + Content-Range + len 2.
{
  const p = planByteResponse({ size: SIZE, mime: "application/pdf", filename: "audit.pdf", mode: "preview", range: "bytes=0-1" });
  eq(p.status, 206, "probe: status 206");
  eq(p.headers["content-range"], `bytes 0-1/${SIZE}`, "probe: content-range");
  eq(p.headers["content-length"], "2", "probe: content-length");
  eq(p.start, 0, "probe: start"); eq(p.end, 1, "probe: end");
}

// 3) Open-ended range: bytes=100- → to EOF.
{
  const p = planByteResponse({ size: SIZE, mime: "application/pdf", filename: "audit.pdf", mode: "preview", range: "bytes=100-" });
  eq(p.status, 206, "open range: 206");
  eq(p.headers["content-range"], `bytes 100-${SIZE - 1}/${SIZE}`, "open range: content-range");
  eq(p.headers["content-length"], String(SIZE - 100), "open range: content-length");
}

// 4) Suffix range: bytes=-500 → last 500 bytes.
{
  const p = planByteResponse({ size: SIZE, mime: "application/pdf", filename: "audit.pdf", mode: "preview", range: "bytes=-500" });
  eq(p.status, 206, "suffix: 206");
  eq(p.start, SIZE - 500, "suffix: start");
  eq(p.end, SIZE - 1, "suffix: end");
  eq(p.headers["content-length"], "500", "suffix: content-length");
}

// 5) Range end past EOF is clamped, not rejected.
{
  const p = planByteResponse({ size: SIZE, mime: "application/pdf", filename: "audit.pdf", mode: "preview", range: `bytes=0-${SIZE + 999}` });
  eq(p.status, 206, "clamp: 206");
  eq(p.end, SIZE - 1, "clamp: end clamped to EOF");
}

// 6) Unsatisfiable range (start past EOF) → 416 with bytes */size.
{
  const p = planByteResponse({ size: SIZE, mime: "application/pdf", filename: "audit.pdf", mode: "preview", range: `bytes=${SIZE + 10}-${SIZE + 20}` });
  eq(p.status, 416, "unsatisfiable: 416");
  eq(p.headers["content-range"], `bytes */${SIZE}`, "unsatisfiable: content-range");
}

// 7) Download mode → attachment disposition.
{
  const p = planByteResponse({ size: SIZE, mime: "application/pdf", filename: "audit.pdf", mode: "download" });
  eq(p.headers["content-disposition"], 'attachment; filename="audit.pdf"', "download: disposition attachment");
}

// 8) Missing mime → octet-stream; filename with quotes/CRLF is neutralised.
{
  const p = planByteResponse({ size: 10, mime: null, filename: 'a"b\r\n.pdf', mode: "preview" });
  eq(p.headers["content-type"], "application/octet-stream", "default mime");
  // Wrapping quotes are fine; the injected inner quote + CR/LF must be gone.
  eq(p.headers["content-disposition"], 'inline; filename="a_b__.pdf"', "filename sanitised in disposition");
  ok(!/[\r\n]/.test(p.headers["content-disposition"]), "no CR/LF in disposition");
}

// 9) Garbage Range header falls back to a full 200.
{
  const p = planByteResponse({ size: SIZE, mime: "application/pdf", filename: "audit.pdf", mode: "preview", range: "rows=1-2" });
  eq(p.status, 200, "garbage range → full 200");
  eq(p.headers["content-length"], String(SIZE), "garbage range: full length");
}

console.log(`\ndeliverable-file byte-serving: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
