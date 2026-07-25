/* ============================================================================
 * Guardian OS Sovereign — offline PDF rendering test.
 *
 * Proves a sovereign estate can produce a printable, auditor-ready document with
 * NO Chromium, no headless browser, no dependency and no network:
 *
 *   1. STRUCTURE   the output is a real PDF — header, indirect objects, a
 *                  correct xref table whose offsets actually point at their
 *                  objects, a trailer, %%EOF.
 *   2. NO BROWSER  nothing in the render path requires or spawns a browser.
 *   3. TYPESETTING measured line breaking: wrapped lines fit the column, and an
 *                  unbreakable token is hard-split rather than overflowing.
 *   4. FIDELITY    the content that went in comes back out of the content
 *                  streams; non-Latin-1 characters are transliterated, never
 *                  silently dropped.
 *   5. HONESTY     a not-instrumented section renders as a note carrying its
 *                  reason — never as a blank or a fabricated figure.
 *   6. END TO END  a real evidence pack renders, and its own integrity hash is
 *                  the document's hash, so paper and JSON are the same artefact.
 *
 *   node scripts/sovereign/pdf.test.cjs
 * ========================================================================== */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "gos-pdf-"));
process.env.RUNTIME_DATA_DIR = path.join(TMP, "data");
delete process.env.ANTHROPIC_API_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { startMockEngine } = require("../ops/mock-engine.cjs");
const pdf = require("../../lib/sovereign/pdf");
const report = require("../../lib/sovereign/report");

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`  [PASS] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); }
}

/** Pull the decompressed text of every content stream out of a rendered PDF. */
function contentText(bytes) {
  const buf = Buffer.from(bytes);
  let out = "";
  let i = 0;
  while (true) {
    const s = buf.indexOf("stream\n", i);
    if (s === -1) break;
    const e = buf.indexOf("\nendstream", s);
    if (e === -1) break;
    const raw = buf.subarray(s + 7, e);
    let body;
    try { body = zlib.inflateSync(raw); } catch { body = raw; }
    out += body.toString("latin1") + "\n";
    i = e + 9;
  }
  // Text is emitted as `(escaped) Tj` — recover the literals.
  return out.replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8))).replace(/\\([()\\])/g, "$1");
}

/** Verify the xref table's offsets actually land on their objects. */
function xrefIsSound(bytes) {
  const buf = Buffer.from(bytes);
  const text = buf.toString("latin1");
  const startxref = /startxref\s+(\d+)\s+%%EOF/.exec(text);
  if (!startxref) return { ok: false, why: "no startxref/%%EOF" };
  const xrefPos = Number(startxref[1]);
  if (text.slice(xrefPos, xrefPos + 4) !== "xref") return { ok: false, why: "startxref does not point at 'xref'" };
  const head = /xref\s+0\s+(\d+)\s/.exec(text.slice(xrefPos));
  if (!head) return { ok: false, why: "malformed xref subsection header" };
  const count = Number(head[1]);
  const entries = [...text.slice(xrefPos).matchAll(/^(\d{10}) (\d{5}) ([nf]) $/gm)];
  if (entries.length !== count) return { ok: false, why: `xref lists ${entries.length} entries, header says ${count}` };
  for (let n = 1; n < entries.length; n++) {
    if (entries[n][3] !== "n") continue;
    const off = Number(entries[n][1]);
    const at = text.slice(off, off + 24);
    if (!new RegExp(`^${n} 0 obj`).test(at)) return { ok: false, why: `xref entry ${n} points at ${JSON.stringify(at.slice(0, 16))}` };
  }
  return { ok: true, objects: count - 1 };
}

async function main() {
  console.log("\nOffline PDF rendering test (no Chromium, no network)\n");

  // ── 1. Structure ──────────────────────────────────────────────────────────
  const simple = report.render({
    title: "Structural probe",
    subtitle: "A short document used to validate the emitted PDF structure.",
    meta: [{ label: "Purpose", value: "test" }],
    blocks: [
      { kind: "h1", text: "Heading" },
      { kind: "text", text: "Body copy that should appear in the content stream." },
      { kind: "kv", items: [{ label: "Decisions", value: 42 }, { label: "Blocked", value: 7 }] },
      { kind: "table", headers: ["A", "B"], rows: [["one", "two"], ["three", "four"]] },
      { kind: "list", items: [{ label: "First finding", detail: "with detail", severity: "critical" }] },
      { kind: "code", text: "sha256:deadbeef\npolicy_name_here" },
    ],
  });
  const head = Buffer.from(simple.bytes).subarray(0, 8).toString("latin1");
  ok(head.startsWith("%PDF-1."), "output begins with a PDF header", head);
  ok(Buffer.from(simple.bytes).toString("latin1").trimEnd().endsWith("%%EOF"), "output ends with %%EOF");
  const xr = xrefIsSound(simple.bytes);
  ok(xr.ok, "the xref table is sound — every offset lands on its object", xr.why || xr);
  ok(simple.pages >= 2, "a cover page plus content pages were emitted", simple.pages);
  ok(simple.bytes.length > 1200, "the document has real content", simple.bytes.length);

  // ── 2. No browser anywhere in the path ────────────────────────────────────
  const loaded = Object.keys(require.cache).map((p) => p.toLowerCase());
  ok(!loaded.some((p) => /puppeteer|playwright|chromium|chrome-aws/.test(p)),
    "no browser automation module is loaded by the render path");
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "lib", "sovereign", "pdf.js"), "utf8")
    + fs.readFileSync(path.join(__dirname, "..", "..", "lib", "sovereign", "report.js"), "utf8");
  ok(!/require\(["'](?!node:)/.test(src.replace(/require\(["']\.\//g, "")),
    "the PDF engine requires only node: builtins and its own siblings");
  ok(!/chromium|puppeteer|playwright|headless/i.test(src.replace(/\* .*/g, "")),
    "no browser is referenced in the implementation");

  // ── 3. Measured typesetting ───────────────────────────────────────────────
  const col = 300;
  const lines = pdf.wrap("The quick brown fox jumps over the lazy dog while a governance engine denies an unauthorised wire transfer.", pdf.FONTS.regular, 10, col);
  ok(lines.length > 1 && lines.every((l) => pdf.widthOf(l, pdf.FONTS.regular, 10) <= col),
    "wrapped lines are measured and all fit the column", lines.map((l) => +pdf.widthOf(l, pdf.FONTS.regular, 10).toFixed(1)));
  const longToken = "a".repeat(400);
  const split = pdf.wrap(longToken, pdf.FONTS.regular, 10, col);
  ok(split.length > 1 && split.every((l) => pdf.widthOf(l, pdf.FONTS.regular, 10) <= col),
    "an unbreakable token is hard-split rather than overflowing the page", split.length);
  ok(pdf.widthOf("iii", pdf.FONTS.regular, 10) < pdf.widthOf("WWW", pdf.FONTS.regular, 10),
    "advance widths are proportional (real metrics, not a character count)");
  ok(Math.abs(pdf.widthOf("MMMM", pdf.FONTS.mono, 10) - pdf.widthOf("iiii", pdf.FONTS.mono, 10)) < 0.001,
    "Courier is treated as fixed pitch");

  // ── 4. Fidelity + transliteration ─────────────────────────────────────────
  const text = contentText(simple.bytes);
  ok(text.includes("Body copy that should appear in the content stream."), "body copy survives into the content stream");
  ok(text.includes("Structural probe") && text.includes("Heading"), "the title and headings are present");
  ok(/page 1 of \d+/.test(text) && /page 2 of \d+/.test(text), "every page carries a 'page N of M' footer");

  const unicode = report.render({ title: "Ω policy — “quoted” — 5 ≥ 3 · ✓", blocks: [{ kind: "text", text: "Ω · — “x” ✓ ✗ → 東京" }] });
  const utext = contentText(unicode.bytes);
  ok(utext.includes("Omega") && utext.includes("[ok]") && utext.includes("->"),
    "characters outside Latin-1 are transliterated, not dropped");
  ok(utext.includes("?"), "a character with no transliteration becomes '?' rather than vanishing");
  ok(!/[^\x00-\xFF]/.test(Buffer.from(unicode.bytes).toString("latin1")), "the emitted bytes stay within Latin-1");

  // ── 5. Honesty ────────────────────────────────────────────────────────────
  const honest = report.render({
    title: "Honesty probe",
    blocks: [
      { key: "spend", title: "AI spend", kind: "note", available: false, reason: "no billing source is connected to this enterprise" },
      { kind: "list", items: [], empty: "No open recommendations." },
    ],
  });
  const htext = contentText(honest.bytes);
  ok(htext.includes("Not instrumented") && htext.includes("no billing source"),
    "an un-instrumented section renders as a note carrying its reason");
  ok(htext.includes("No open recommendations"), "an empty list renders its empty-state text, not a blank");
  ok(!/\b0\b.*AI spend/.test(htext), "a missing figure is never rendered as zero");

  const weird = report.render({ title: "Unknown kind", blocks: [{ kind: "sankey_diagram", title: "Flows" }] });
  ok(contentText(weird.bytes).includes("has no paper layout"),
    "an unknown section kind degrades to a visible note (silence in an audit document is a defect)");

  // ── 6. End to end: a real evidence pack ───────────────────────────────────
  const srv = await startMockEngine({ governancePolicies: true });
  process.env.GOVERNANCE_URL = `http://127.0.0.1:${srv.address().port}`;
  const ops = require("../../lib/ops");
  const prov = await ops.provisioning.provision({ industry: "financial services" }, { actor: "pdf-test" });
  const org = prov.org_id;
  await ops.industry.install(org, "finance", { actor: "pdf-test" });
  await ops.managed.monitor(org, { actor: "guardian_os" });
  const packJson = await ops.managed.evidencePack(org, { actor: "pdf-test" });

  const doc = report.evidencePackDocument(packJson, { classification: "OFFICIAL-SENSITIVE" });
  const rendered = report.render(doc);
  const out = path.join(TMP, "evidence-pack.pdf");
  fs.writeFileSync(out, rendered.bytes);

  ok(xrefIsSound(rendered.bytes).ok, "a real evidence pack renders to a structurally sound PDF");
  ok(rendered.hash === packJson.hash, "the PDF carries the evidence pack's OWN hash — paper and JSON are the same artefact", { pdf: rendered.hash, json: packJson.hash });
  const etext = contentText(rendered.bytes);
  ok(etext.includes("Governance posture") && etext.includes("Runtime activity") && etext.includes("Audit trail"),
    "the pack's sections all reach paper");
  ok(etext.includes("OFFICIAL-SENSITIVE"), "a classification marking is carried onto the cover");
  ok(etext.includes(String(packJson.hash).slice(0, 16)), "the integrity hash appears in the page footer for the auditor");
  ok(fs.statSync(out).size > 3000 && rendered.pages >= 3, "the pack is a multi-page document of real size",
    { bytes: fs.statSync(out).size, pages: rendered.pages });

  // A verification attestation renders too.
  const sovereign = require("../../lib/sovereign");
  const v = await sovereign.verify.run({ org_id: org });
  const att = report.render(report.verificationDocument(v, { site: "Test site", operator: "D. Morrison" }));
  ok(xrefIsSound(att.bytes).ok, "a deployment attestation renders to a sound PDF");
  const atext = contentText(att.bytes);
  ok(atext.includes("Operator sign-off") && atext.includes("Signature"), "the attestation carries a sign-off block");
  ok(atext.includes("not a certification"), "the attestation states plainly that it is NOT an accreditation");

  console.log(`\n${pass}/${pass + fail} passed`);
  srv.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test crashed:", e); process.exit(1); });
