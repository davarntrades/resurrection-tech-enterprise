/* ============================================================================
 * Guardian OS — shared presentation vocabulary.
 *
 * The section kinds every Guardian OS surface speaks: Executive Workspaces
 * (lib/ops/workspaces.js) and Industry Intelligence Packs (lib/ops/packs/*)
 * both build sections with THESE builders, so one renderer in the Control Room
 * draws every surface and a pack can never invent its own presentation layer.
 *
 *   stat      · a row of labelled figures
 *   score     · an overall score + banded sub-scores
 *   list      · ranked items with optional severity
 *   timeline  · chronological items
 *   note      · an HONEST not-instrumented placeholder (never a fabricated
 *               number) carrying the reason a real source is missing
 *
 * Dependency-free by design: both consumers import it, neither imports the
 * other, so there is no require cycle.
 * ============================================================================ */
"use strict";

const stat = (key, title, items) => ({ key, title, kind: "stat", items: (items || []).filter(Boolean) });
const score = (key, title, overall, subs) => ({ key, title, kind: "score", overall: overall || null, subs: (subs || []).filter((s) => s && s.score != null) });
const list = (key, title, items, empty) => ({ key, title, kind: "list", items: (items || []).filter(Boolean), empty: empty || "Nothing to show." });
const timeline = (key, title, items, empty) => ({ key, title, kind: "timeline", items: (items || []).filter(Boolean), empty: empty || "No history yet." });
const note = (key, title, reason) => ({ key, title, kind: "note", available: false, reason });

/** Severity normaliser shared by every surface. */
const severity = (s) => (s === "critical" ? "critical" : s === "warning" || s === "warn" ? "warning" : "info");

/** 0-100 → band, the same ladder governance health uses. */
const band = (n) => (n >= 80 ? "strong" : n >= 60 ? "developing" : n >= 40 ? "watch" : "weak");
const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

module.exports = { stat, score, list, timeline, note, severity, band, clamp };
