/* ============================================================================
 * Guardian OS Sovereign — declarative document → PDF layout.
 *
 * The Control Room, the executive workspaces and the industry packs all speak
 * ONE section vocabulary (lib/ops/sections.js: stat · score · list · timeline ·
 * note). This module teaches that same vocabulary to paper, so a governance
 * document is described once and rendered to a screen or to a printable,
 * auditor-ready PDF — with no browser anywhere in the path.
 *
 * The blocks below are the paper primitives:
 *
 *   cover      title page with the enterprise, period and integrity hash
 *   h1 / h2    section headings
 *   text       flowed body copy
 *   kv         two-column labelled figures
 *   table      headers + rows, column widths measured from the content
 *   list       bulleted items with an optional severity marker
 *   code       monospaced block (hashes, policy names, raw payloads)
 *   note       an HONEST not-instrumented placeholder, visually distinct
 *   rule       a hairline separator
 *
 * Every page carries a footer with the document title, the integrity hash and
 * "page N of M" — the three things an auditor checks first when handed paper.
 *
 * Nothing here invents a figure. A section that is `available: false` renders as
 * a note carrying its reason, exactly as it does on screen.
 * ========================================================================== */
"use strict";
const crypto = require("node:crypto");
const { Doc, FONTS, MARGIN, INK, serialise, widthOf, wrap } = require("./pdf");

const H1 = 17, H2 = 12.5, BODY = 9.8, SMALL = 8.6, MONO = 8.4;

// ── Block primitives ────────────────────────────────────────────────────────

function h1(doc, text) {
  doc.ensure(46);
  doc.y -= 26;
  doc.draw(text, MARGIN.left, doc.y, { font: FONTS.bold, size: H1 });
  doc.y -= 9;
  doc.line(MARGIN.left, doc.y, MARGIN.left + doc.contentWidth, doc.y, INK.rule, 0.8);
  doc.y -= 12;
}

function h2(doc, text) {
  doc.ensure(30);
  doc.y -= 17;
  doc.draw(String(text).toUpperCase(), MARGIN.left, doc.y, { font: FONTS.bold, size: SMALL, color: INK.muted, tracking: 0.9 });
  doc.y -= 9;
}

const text = (doc, body, opts) => doc.flow(body, { size: BODY, gap: 5, ...(opts || {}) });

function kv(doc, items, { columns = 2 } = {}) {
  const rows = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
  const colW = doc.contentWidth / columns;
  for (const row of rows) {
    doc.ensure(30);
    doc.y -= 22;
    row.forEach((it, i) => {
      const x = MARGIN.left + i * colW;
      doc.draw(String(it.label), x, doc.y + 11, { size: SMALL, color: INK.muted });
      const value = it.of !== undefined && it.of !== null ? `${it.value} / ${it.of}` : String(it.value);
      doc.draw(value, x, doc.y, { font: FONTS.bold, size: BODY + 1.6 });
    });
    doc.y -= 5;
  }
  doc.y -= 4;
}

function table(doc, headers, rows) {
  if (!rows.length) return note(doc, "No rows.");
  const cols = headers.length;
  // Measure: give every column at least its header, then share the remainder in
  // proportion to the longest cell, so a hash column does not squeeze a label.
  const want = headers.map((hdr, i) => Math.max(
    widthOf(hdr, FONTS.bold, SMALL),
    ...rows.map((r) => Math.min(widthOf(String(r[i] ?? ""), FONTS.regular, SMALL), doc.contentWidth * 0.55)),
  ) + 14);
  const total = want.reduce((a, b) => a + b, 0);
  const widths = want.map((w) => (w / total) * doc.contentWidth);

  const header = () => {
    doc.ensure(26);
    doc.y -= 15;
    let x = MARGIN.left;
    headers.forEach((hdr, i) => { doc.draw(hdr, x + 4, doc.y, { font: FONTS.bold, size: SMALL, color: INK.muted }); x += widths[i]; });
    doc.y -= 5;
    doc.line(MARGIN.left, doc.y, MARGIN.left + doc.contentWidth, doc.y, INK.rule, 0.7);
  };
  header();

  let zebra = false;
  for (const row of rows) {
    const cells = row.map((c, i) => wrap(String(c ?? ""), FONTS.regular, SMALL, widths[i] - 10));
    const lines = Math.max(...cells.map((c) => c.length), 1);
    const h = lines * (SMALL * 1.42) + 7;
    if (doc.y - h < MARGIN.bottom) { doc.newPage(); header(); }
    if (zebra) doc.rect(MARGIN.left, doc.y - h + 3, doc.contentWidth, h, INK.panel);
    let x = MARGIN.left;
    cells.forEach((lines2, i) => {
      let yy = doc.y - 10;
      for (const ln of lines2) { doc.draw(ln, x + 4, yy, { size: SMALL }); yy -= SMALL * 1.42; }
      x += widths[i];
    });
    doc.y -= h;
    zebra = !zebra;
  }
  doc.y -= 8;
}

const SEV_INK = { critical: INK.bad, warning: INK.warn, info: INK.muted };

function list(doc, items, { empty = "Nothing to show." } = {}) {
  if (!items.length) return note(doc, empty);
  for (const it of items) {
    const label = it.label ?? it.title ?? String(it);
    const detail = it.detail ?? it.description ?? "";
    const sev = SEV_INK[it.severity] || null;
    doc.ensure(20);
    doc.y -= 13;
    if (sev) doc.rect(MARGIN.left, doc.y - 1, 2.4, 9, sev);
    doc.draw(label, MARGIN.left + (sev ? 10 : 0), doc.y, { font: FONTS.bold, size: BODY });
    if (detail) doc.flow(detail, { size: SMALL, color: INK.muted, indent: sev ? 10 : 0, leading: SMALL * 1.4 });
    doc.y -= 3;
  }
  doc.y -= 5;
}

function code(doc, body) {
  const lines = wrap(body, FONTS.mono, MONO, doc.contentWidth - 16);
  const h = lines.length * (MONO * 1.5) + 14;
  doc.ensure(Math.min(h, 220));
  doc.rect(MARGIN.left, doc.y - h + 4, doc.contentWidth, h, INK.panel);
  doc.y -= 12;
  for (const ln of lines) {
    if (doc.y < MARGIN.bottom) { doc.newPage(); doc.y -= 8; }
    doc.draw(ln, MARGIN.left + 8, doc.y, { font: FONTS.mono, size: MONO });
    doc.y -= MONO * 1.5;
  }
  doc.y -= 8;
}

function note(doc, reason) {
  doc.ensure(26);
  doc.y -= 14;
  doc.rect(MARGIN.left, doc.y - 4, 2.4, 11, INK.muted);
  doc.flow(`Not instrumented — ${reason}`, { font: FONTS.italic, size: SMALL, color: INK.muted, indent: 10 });
  doc.y -= 5;
}

function rule(doc) {
  doc.ensure(14);
  doc.y -= 8;
  doc.line(MARGIN.left, doc.y, MARGIN.left + doc.contentWidth, doc.y, INK.rule, 0.6);
  doc.y -= 6;
}

function cover(doc, { title, subtitle, meta = [], classification = null }) {
  doc.y = doc.size.h - 210;
  if (classification) {
    doc.draw(String(classification).toUpperCase(), MARGIN.left, doc.size.h - 46,
      { font: FONTS.bold, size: SMALL, color: INK.bad, tracking: 1.4 });
  }
  doc.draw("GUARDIAN OS", MARGIN.left, doc.y + 74, { font: FONTS.bold, size: SMALL, color: INK.muted, tracking: 2.2 });
  for (const line of wrap(title, FONTS.bold, 26, doc.contentWidth)) {
    doc.draw(line, MARGIN.left, doc.y, { font: FONTS.bold, size: 26 });
    doc.y -= 32;
  }
  if (subtitle) { doc.y -= 4; doc.flow(subtitle, { size: 11.5, color: INK.muted, leading: 17 }); }
  doc.y -= 26;
  doc.line(MARGIN.left, doc.y, MARGIN.left + doc.contentWidth, doc.y, INK.rule, 0.8);
  doc.y -= 6;
  for (const m of meta) {
    doc.y -= 17;
    doc.draw(m.label, MARGIN.left, doc.y, { size: SMALL, color: INK.muted });
    doc.draw(String(m.value), MARGIN.left + 160, doc.y, { font: FONTS.bold, size: SMALL });
  }
  doc.newPage();
}

/** Stamp the footer onto every page once the page count is known. */
function footers(doc, { title, hash }) {
  const pages = doc.ops && doc.ops.length ? [...doc.pages, doc.ops] : doc.pages;
  const total = pages.length;
  pages.forEach((ops, i) => {
    const saved = doc.ops;
    doc.ops = ops;
    const y = MARGIN.bottom - 22;
    doc.line(MARGIN.left, y + 14, MARGIN.left + doc.contentWidth, y + 14, INK.rule, 0.5);
    doc.draw(title, MARGIN.left, y, { size: 7.6, color: INK.muted });
    if (hash) doc.draw(`integrity ${String(hash).slice(0, 32)}`, MARGIN.left + 210, y, { font: FONTS.mono, size: 7.2, color: INK.muted });
    const label = `page ${i + 1} of ${total}`;
    doc.draw(label, MARGIN.left + doc.contentWidth - widthOf(label, FONTS.regular, 7.6), y, { size: 7.6, color: INK.muted });
    doc.ops = saved;
  });
}

// ── Section vocabulary → paper ──────────────────────────────────────────────

/** Render one lib/ops/sections.js section. Unknown kinds degrade to a note
 *  rather than being dropped — silence in an audit document is a defect. */
function section(doc, s) {
  if (!s) return;
  h2(doc, s.title || s.key || "Section");
  if (s.available === false || s.kind === "note") return note(doc, s.reason || "no instrumented source for this figure");
  switch (s.kind) {
    case "stat": return kv(doc, (s.items || []).map((i) => ({ label: i.label, value: i.value, of: i.of })));
    case "score": {
      if (s.overall != null) kv(doc, [{ label: "Overall", value: s.overall }]);
      return table(doc, ["Dimension", "Score", "Band"], (s.subs || []).map((x) => [x.label || x.key, x.score, x.band || ""]));
    }
    case "list": return list(doc, s.items || [], { empty: s.empty });
    case "timeline":
      return table(doc, ["When", "Event"], (s.items || []).map((i) => [i.at || i.when || "", i.label || i.title || ""]));
    default:
      return note(doc, `section kind "${s.kind}" has no paper layout in this build`);
  }
}

/**
 * Render a declarative Guardian OS document to PDF bytes.
 *
 *   { title, subtitle, classification?, meta: [{label,value}],
 *     hash?, blocks: [ {kind, ...} | <a sections.js section> ] }
 */
function render(document) {
  const doc = new Doc({ title: document.title || "Guardian OS report" });
  const hash = document.hash || crypto.createHash("sha256").update(JSON.stringify(document)).digest("hex");

  cover(doc, {
    title: document.title || "Guardian OS report",
    subtitle: document.subtitle || "",
    classification: document.classification || null,
    meta: [...(document.meta || []), { label: "Integrity (SHA-256)", value: String(hash).slice(0, 32) }],
  });

  for (const b of document.blocks || []) {
    if (!b) continue;
    switch (b.kind) {
      case "h1": h1(doc, b.text); break;
      case "h2": h2(doc, b.text); break;
      case "text": text(doc, b.text); break;
      case "kv": kv(doc, b.items || [], { columns: b.columns || 2 }); break;
      case "table": table(doc, b.headers || [], b.rows || []); break;
      case "list": list(doc, b.items || [], { empty: b.empty }); break;
      case "code": code(doc, b.text || ""); break;
      case "note": note(doc, b.reason || b.text || ""); break;
      case "rule": rule(doc); break;
      case "pagebreak": doc.newPage(); break;
      default: section(doc, b); break;     // a sections.js section
    }
  }

  footers(doc, { title: document.title || "Guardian OS report", hash });
  return { bytes: serialise(doc, { meta: { title: document.title, date: document.generated_at } }), hash, pages: (doc.ops && doc.ops.length ? doc.pages.length + 1 : doc.pages.length) };
}

// ── Evidence pack → document ────────────────────────────────────────────────

/**
 * Turn a Managed Governance evidence pack (lib/ops/managed.js evidencePack)
 * into the declarative document above. Purely a projection — it adds no figure
 * that is not already in the pack, and the pack's own hash becomes the document
 * integrity hash so paper and JSON are provably the same artefact.
 */
function evidencePackDocument(pack, { classification = null } = {}) {
  const b = [];
  const gp = pack.governance_posture;

  b.push({ kind: "h1", text: "Governance posture" });
  if (gp) {
    b.push({ kind: "kv", items: [{ label: "Overall score", value: gp.overall }, { label: "Band", value: gp.band }] });
    if (gp.scores) {
      b.push({ kind: "table", headers: ["Dimension", "Score"], rows: Object.entries(gp.scores).map(([k, v]) => [k.replace(/_/g, " "), v]) });
    }
  } else {
    b.push({ kind: "note", reason: "no governance health snapshot exists for this period" });
  }

  b.push({ kind: "h1", text: "Runtime activity" });
  const ra = pack.runtime_activity || {};
  b.push({ kind: "kv", items: [
    { label: "Governed decisions", value: ra.total ?? 0 },
    { label: "Blocked", value: (ra.by_verdict && ra.by_verdict.block) ?? 0 },
    { label: "Escalated", value: (ra.by_verdict && ra.by_verdict.escalate) ?? 0 },
    { label: "Allowed", value: (ra.by_verdict && ra.by_verdict.allow) ?? 0 },
  ] });

  b.push({ kind: "h1", text: "Policies enforced" });
  const pe = pack.policies_enforced || { active: 0, names: [] };
  b.push({ kind: "kv", items: [{ label: "Active Ω policies", value: pe.active }] });
  if ((pe.names || []).length) b.push({ kind: "code", text: pe.names.join("\n") });

  b.push({ kind: "h1", text: "Blocked actions" });
  b.push({ kind: "table", headers: ["When", "Action", "Reason"],
    rows: (pack.blocked_actions || []).slice(0, 60).map((x) => [String(x.at || "").slice(0, 19), x.action || "", x.reason || ""]) });

  if (pack.executive_summary) {
    b.push({ kind: "pagebreak" }, { kind: "h1", text: "Executive summary" });
    for (const [key, label] of [["what_changed", "What changed"], ["risks_increased", "Risks that increased"], ["approve_next", "Awaiting approval"]]) {
      const v = pack.executive_summary[key];
      b.push({ kind: "h2", text: label });
      if (Array.isArray(v) && v.length) b.push({ kind: "list", items: v.map((x) => (typeof x === "string" ? { label: x } : x)) });
      else if (typeof v === "string" && v) b.push({ kind: "text", text: v });
      else b.push({ kind: "note", reason: "nothing recorded for this period" });
    }
  }

  b.push({ kind: "h1", text: "Risk trend" });
  const rtd = pack.risk_trend || {};
  b.push({ kind: "kv", items: [{ label: "Open drift findings", value: rtd.drift_open ?? 0 }, { label: "Drift score", value: rtd.drift_score ?? 0 }] });
  if ((rtd.health_history || []).length) {
    b.push({ kind: "table", headers: ["Captured", "Overall", "Band"],
      rows: rtd.health_history.map((h) => [String(h.created_at || h.at || "").slice(0, 10), h.overall ?? "", h.band ?? ""]) });
  }

  b.push({ kind: "h1", text: "Compliance evidence" });
  const ce = pack.compliance_evidence || {};
  b.push({ kind: "kv", items: [
    { label: "Governed departments", value: (ce.departments || []).length },
    { label: "Fail-closed enforcement", value: ce.fail_closed ? "yes" : "no" },
  ] });
  if ((ce.departments || []).length) b.push({ kind: "list", items: ce.departments.map((d) => ({ label: d })) });

  b.push({ kind: "h1", text: "Recommendations" });
  b.push({ kind: "list", items: (pack.recommendations || []).map((r) => ({ label: r.title, severity: r.severity })), empty: "No open recommendations." });

  b.push({ kind: "pagebreak" }, { kind: "h1", text: "Audit trail" });
  b.push({ kind: "table", headers: ["When", "Action", "Actor"],
    rows: (pack.audit_trail || []).slice(0, 120).map((a) => [String(a.created_at || "").slice(0, 19), a.action || "", a.actor || ""]) });

  return {
    title: `Governance evidence pack — ${pack.enterprise || pack.org_id}`,
    subtitle: `Period ${pack.period}. Generated by Guardian OS from runtime evidence. Every figure in this document is derived from recorded governance decisions; nothing is estimated.`,
    classification,
    hash: pack.hash,
    generated_at: pack.generated_at,
    meta: [
      { label: "Enterprise", value: pack.enterprise || pack.org_id },
      { label: "Period", value: pack.period },
      { label: "Generated", value: String(pack.generated_at || "").slice(0, 19) },
      { label: "Generated by", value: pack.generated_by || "guardian-os" },
      { label: "Rendered", value: "offline (no browser)" },
    ],
    blocks: b,
  };
}

/** Render a verification report (`guardian verify`) as a signable attestation. */
function verificationDocument(v, { site = null, operator = null, classification = null } = {}) {
  const MARK = { pass: "[ok]", warn: "[!]", fail: "[x]" };
  return {
    title: "Sovereign deployment attestation",
    subtitle: `Guardian OS ${v.profile} deployment, verified on the target system. This document records the state the verification observed; it is not a certification and asserts no third-party accreditation.`,
    classification,
    generated_at: v.generated_at,
    meta: [
      { label: "Deployment profile", value: v.profile },
      { label: "Enterprise", value: v.org_id || "not scoped" },
      { label: "Site", value: site || "not recorded" },
      { label: "Verified at", value: String(v.generated_at || "").slice(0, 19) },
      { label: "Result", value: v.ok ? "VERIFIED" : "NOT VERIFIED" },
    ],
    blocks: [
      { kind: "h1", text: "Result" },
      { kind: "kv", items: [
        { label: "Checks passed", value: v.summary.pass, of: v.summary.total },
        { label: "Warnings", value: v.summary.warn },
        { label: "Failures", value: v.summary.fail },
        { label: "Immutable runtime", value: v.immutable && v.immutable.immutable ? "yes" : "no" },
      ] },
      { kind: "h1", text: "Checks" },
      { kind: "table", headers: ["", "Check", "Finding"],
        rows: (v.checks || []).map((c) => [MARK[c.status] || c.status, c.title, c.detail]) },
      { kind: "h1", text: "Industry pack projection modes" },
      { kind: "table", headers: ["Pack", "Mode"], rows: Object.entries(v.projections || {}).map(([k, m]) => [k, m]) },
      { kind: "h1", text: "Operator sign-off" },
      { kind: "text", text: "The named operator confirms this verification was run on the deployed system described above, that the output was not edited, and that any failures recorded here were present at the time of verification." },
      { kind: "table", headers: ["Field", "Entry"], rows: [
        ["Operator", operator || ""], ["Role", ""], ["Signature", ""], ["Date", ""], ["Witness", ""],
      ] },
    ],
  };
}

module.exports = { render, evidencePackDocument, verificationDocument, section, blocks: { h1, h2, text, kv, table, list, code, note, rule, cover, footers } };
