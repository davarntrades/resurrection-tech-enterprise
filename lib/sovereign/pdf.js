/* ============================================================================
 * Guardian OS Sovereign — PDF generation with no Chromium.
 *
 * The cloud deployment renders deliverables by driving headless Chromium
 * (scripts/delivery-kit.cjs, renderer/). That is fine when there is a browser
 * to install; it is a non-starter on a disconnected, hardened host where a
 * ~400MB binary with its own sandbox, GPU stack and network expectations cannot
 * be justified to a security team — and cannot be fetched at all.
 *
 * So a sovereign estate writes PDF directly: this module emits PDF 1.4 bytes
 * from Node's standard library alone. No Chromium, no headless browser, no
 * dependency, no network. It is a real PDF — structured objects, an xref table,
 * a trailer — openable in any reader and printable for an auditor.
 *
 * WHY THE BASE-14 FONTS. Helvetica, Helvetica-Bold, Helvetica-Oblique and
 * Courier are guaranteed present in every conforming PDF reader, so nothing has
 * to be embedded and no font file has to travel to the sovereign environment.
 * Their advance widths are tabulated below (units/1000 em, from the Adobe core
 * font metrics) so line breaking is measured, not guessed — text wraps where a
 * typesetter would break it, not where a fixed character count falls.
 *
 * WHAT THIS DELIBERATELY IS NOT. It is not an HTML renderer and makes no
 * attempt to be one. It lays out a DECLARATIVE document — the same section
 * vocabulary (lib/ops/sections.js) every other Guardian OS surface speaks — so
 * one document description renders to the Control Room, to an executive
 * workspace, and to paper. Marketing PDFs with bespoke design keep using the
 * Chromium pipeline in cloud deployments; nothing here replaces that.
 *
 * Encoding: WinAnsiEncoding (Latin-1). Characters outside it are transliterated
 * rather than dropped, so an auditor never silently loses a character.
 * ========================================================================== */
"use strict";
const zlib = require("node:zlib");

// ── Core font metrics (advance widths, units/1000 em, ASCII 32-126) ─────────
const W_HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const W_HELV_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];

const FONTS = {
  regular: { key: "F1", base: "Helvetica", widths: W_HELV },
  bold: { key: "F2", base: "Helvetica-Bold", widths: W_HELV_BOLD },
  mono: { key: "F3", base: "Courier", widths: null },      // fixed 600
  italic: { key: "F4", base: "Helvetica-Oblique", widths: W_HELV },
};

// Latin-1 has no glyph for these, and a dropped character in an audit document
// is worse than an approximated one. Applied before encoding.
const TRANSLITERATE = [
  [/[‘’‛]/g, "'"], [/[“”‟]/g, '"'],
  [/[–‒]/g, "-"], [/—/g, "--"], [/…/g, "..."],
  [/[   ]/g, " "], [/•/g, "·"], [/[→⟶]/g, "->"],
  [/≤/g, "<="], [/≥/g, ">="], [/≠/g, "!="], [/×/g, "x"],
  [/Ω/g, "Omega"], [/✓|✔/g, "[ok]"], [/✗|✘|✕/g, "[x]"],
  [/[─-╿]/g, "-"],
];

function latin1(s) {
  let out = String(s == null ? "" : s);
  for (const [re, to] of TRANSLITERATE) out = out.replace(re, to);
  // Anything still outside Latin-1 becomes '?' rather than vanishing.
  return out.replace(/[^\x00-\xFF]/g, "?");
}

/** PDF string literal: escape the three special bytes, octal-escape high bytes. */
function pdfString(s) {
  let out = "";
  for (const ch of latin1(s)) {
    const c = ch.charCodeAt(0);
    if (ch === "(" || ch === ")" || ch === "\\") out += "\\" + ch;
    else if (c < 32 || c > 126) out += "\\" + c.toString(8).padStart(3, "0");
    else out += ch;
  }
  return out;
}

function widthOf(text, font, size) {
  const t = latin1(text);
  if (!font.widths) return t.length * 0.6 * size;      // Courier: fixed pitch
  let w = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    // Latin-1 accented letters are close enough to their base letter's advance
    // for line breaking; the reader positions the real glyph.
    const idx = c >= 32 && c <= 126 ? c - 32 : (c >= 192 ? (c < 223 ? "A".charCodeAt(0) - 32 : "a".charCodeAt(0) - 32) : 0);
    w += font.widths[idx] || 500;
  }
  return (w / 1000) * size;
}

/** Break `text` into lines that fit `maxWidth`. Long unbreakable tokens are
 *  hard-split rather than allowed to overflow the page. */
function wrap(text, font, size, maxWidth) {
  const lines = [];
  for (const para of String(text == null ? "" : text).split("\n")) {
    const words = para.split(/\s+/).filter((w) => w.length);
    if (!words.length) { lines.push(""); continue; }
    let line = "";
    for (const word of words) {
      const probe = line ? `${line} ${word}` : word;
      if (widthOf(probe, font, size) <= maxWidth) { line = probe; continue; }
      if (line) lines.push(line);
      if (widthOf(word, font, size) <= maxWidth) { line = word; continue; }
      // Hard-split an over-long token (a hash, a URL, a base64 blob).
      let chunk = "";
      for (const ch of word) {
        if (widthOf(chunk + ch, font, size) > maxWidth) { lines.push(chunk); chunk = ch; }
        else chunk += ch;
      }
      line = chunk;
    }
    if (line) lines.push(line);
  }
  return lines;
}

// ── Page geometry (A4) ──────────────────────────────────────────────────────
const A4 = { w: 595.28, h: 841.89 };
const MARGIN = { top: 62, right: 54, bottom: 64, left: 54 };
const INK = { body: "0.13 0.14 0.16", muted: "0.42 0.44 0.48", rule: "0.85 0.86 0.88",
  accent: "0.16 0.35 0.85", warn: "0.72 0.45 0.05", bad: "0.72 0.16 0.16", panel: "0.965 0.968 0.975" };

/**
 * A paged document with a text cursor. Content streams are built as arrays of
 * operator strings and flushed one per page.
 */
class Doc {
  constructor({ title = "", footer = "", size = A4 } = {}) {
    this.size = size;
    this.title = title;
    this.footer = footer;
    this.pages = [];
    this.ops = null;
    this.y = 0;
    this.contentWidth = size.w - MARGIN.left - MARGIN.right;
    this.newPage();
  }

  newPage() {
    if (this.ops) this.pages.push(this.ops);
    this.ops = [];
    this.y = this.size.h - MARGIN.top;
    return this;
  }

  /** Start a new page unless `h` points still fit below the cursor. */
  ensure(h) {
    if (this.y - h < MARGIN.bottom) this.newPage();
    return this;
  }

  fill(rgb) { this.ops.push(`${rgb} rg`); return this; }
  stroke(rgb) { this.ops.push(`${rgb} RG`); return this; }

  rect(x, y, w, h, rgb) {
    this.ops.push("q", `${rgb} rg`, `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`, "f", "Q");
    return this;
  }

  line(x1, y1, x2, y2, rgb = INK.rule, width = 0.6) {
    this.ops.push("q", `${rgb} RG`, `${width} w`,
      `${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l`, "S", "Q");
    return this;
  }

  /** Draw one line of text at an absolute position. */
  draw(text, x, y, { font = FONTS.regular, size = 10, color = INK.body, tracking = 0 } = {}) {
    this.ops.push("BT", `${color} rg`, `/${font.key} ${size} Tf`);
    if (tracking) this.ops.push(`${tracking} Tc`);
    this.ops.push(`1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`, `(${pdfString(text)}) Tj`);
    if (tracking) this.ops.push("0 Tc");
    this.ops.push("ET");
    return this;
  }

  /** Flow wrapped text from the cursor, paginating as needed. */
  flow(text, { font = FONTS.regular, size = 10, leading = null, color = INK.body, indent = 0, gap = 0 } = {}) {
    const lead = leading || size * 1.45;
    const width = this.contentWidth - indent;
    for (const line of wrap(text, font, size, width)) {
      this.ensure(lead);
      this.y -= lead;
      if (line) this.draw(line, MARGIN.left + indent, this.y, { font, size, color });
    }
    this.y -= gap;
    return this;
  }
}

// ── Serialisation ───────────────────────────────────────────────────────────

/**
 * Emit the finished document as PDF bytes. Content streams are Flate-compressed
 * (zlib is stdlib) so an evidence pack with a long audit trail stays a sensible
 * size on removable media.
 */
function serialise(doc, { compress = true, meta = {} } = {}) {
  const pages = doc.ops && doc.ops.length ? [...doc.pages, doc.ops] : doc.pages;
  const objects = [];                       // 1-indexed; objects[i] is object i+1
  const add = (body) => { objects.push(body); return objects.length; };

  // Reserve: 1 = catalog, 2 = pages tree.
  add(null); add(null);
  const fontIds = {};
  for (const f of Object.values(FONTS)) {
    fontIds[f.key] = add(`<< /Type /Font /Subtype /Type1 /BaseFont /${f.base} /Encoding /WinAnsiEncoding >>`);
  }
  const resources = `<< /Font << ${Object.entries(fontIds).map(([k, id]) => `/${k} ${id} 0 R`).join(" ")} >> >>`;

  const pageIds = [];
  for (const ops of pages) {
    const raw = Buffer.from(ops.join("\n"), "latin1");
    const body = compress ? zlib.deflateSync(raw) : raw;
    const streamId = add({ dict: `<< /Length ${body.length}${compress ? " /Filter /FlateDecode" : ""} >>`, stream: body });
    pageIds.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${doc.size.w.toFixed(2)} ${doc.size.h.toFixed(2)}] /Resources ${resources} /Contents ${streamId} 0 R >>`));
  }

  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  const infoId = add(`<< /Title (${pdfString(meta.title || doc.title)}) /Author (${pdfString(meta.author || "Guardian OS")}) ` +
    `/Creator (${pdfString(meta.creator || "Guardian OS Sovereign - no browser used")}) ` +
    `/Producer (${pdfString("Guardian OS lib/sovereign/pdf.js")}) /CreationDate (${pdfDate(meta.date)}) >>`);

  const chunks = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  let offset = chunks[0].length;
  const offsets = [];
  objects.forEach((body, i) => {
    const num = i + 1;
    offsets[num] = offset;
    let buf;
    if (body && body.stream) {
      buf = Buffer.concat([
        Buffer.from(`${num} 0 obj\n${body.dict}\nstream\n`, "latin1"),
        body.stream,
        Buffer.from("\nendstream\nendobj\n", "latin1"),
      ]);
    } else {
      buf = Buffer.from(`${num} 0 obj\n${body}\nendobj\n`, "latin1");
    }
    chunks.push(buf);
    offset += buf.length;
  });

  const xrefStart = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "latin1"));

  return Buffer.concat(chunks);
}

function pdfDate(d) {
  const t = d ? new Date(d) : new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `D:${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}${p(t.getUTCHours())}${p(t.getUTCMinutes())}${p(t.getUTCSeconds())}Z`;
}

module.exports = {
  A4, MARGIN, INK, FONTS, Doc,
  latin1, pdfString, widthOf, wrap, serialise, pdfDate,
};
