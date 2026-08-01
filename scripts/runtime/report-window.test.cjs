#!/usr/bin/env node
/* ============================================================================
 * Runtime Governance — the monthly reporting window.
 *
 * "Monthly evidence" is relied on as a COMPLETE record of a named month. A
 * rolling window ending at the instant of generation cannot deliver that:
 * generate 40 days apart and 10 days belong to no report; generate 20 days
 * apart and 10 days are counted twice. Neither is acceptable when the artefact
 * is used for assurance.
 *
 * A calendar month is a property of the month, not of when somebody pressed the
 * button, so consecutive months tile exactly: no gap, no overlap.
 * ============================================================================ */
"use strict";
const reports = require("../../lib/runtime/reports");

let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };
const w = (ref) => reports.windowFor("monthly", new Date(ref));

(async () => {
  // ── A month is a month, whenever you ask ───────────────────────────────────
  const early = w("2026-07-01T00:00:00Z");
  const mid = w("2026-07-15T13:47:11Z");
  const late = w("2026-07-31T23:59:59Z");
  ok(early.since === mid.since && mid.since === late.since
    && early.until === mid.until && mid.until === late.until,
  "1. the window is identical wherever in the month it is generated");
  ok(mid.since === "2026-07-01T00:00:00.000Z" && mid.until === "2026-08-01T00:00:00.000Z",
    `2. July is [1 Jul, 1 Aug) (got ${mid.since} → ${mid.until})`);

  // ── Consecutive months tile exactly ────────────────────────────────────────
  const jul = w("2026-07-10T12:00:00Z");
  const aug = w("2026-08-20T12:00:00Z");
  ok(jul.until === aug.since,
    `3. consecutive months meet exactly — no gap, no overlap (${jul.until} vs ${aug.since})`);

  // The exact failure the old rolling window produced.
  const oldJulUntil = "2026-07-10T12:00:00.000Z";
  const oldAugSince = "2026-07-20T12:00:00.000Z";
  ok(oldJulUntil !== oldAugSince,
    "4. (context) the previous rolling window left 10 Jul–20 Jul in no report at all");

  // ── Year and leap boundaries ───────────────────────────────────────────────
  const dec = w("2026-12-20T00:00:00Z");
  ok(dec.since === "2026-12-01T00:00:00.000Z" && dec.until === "2027-01-01T00:00:00.000Z",
    `5. December rolls into the next year correctly (got ${dec.until})`);
  const feb = w("2028-02-10T00:00:00Z");   // 2028 is a leap year
  ok(feb.since === "2028-02-01T00:00:00.000Z" && feb.until === "2028-03-01T00:00:00.000Z",
    `6. February in a leap year ends at 1 March (got ${feb.until})`);
  const jan = w("2026-01-05T00:00:00Z");
  ok(jan.since === "2026-01-01T00:00:00.000Z", "7. January starts at the year boundary");

  // ── Every instant of a year belongs to exactly one monthly window ──────────
  let gaps = 0; let overlaps = 0;
  for (let m = 0; m < 12; m += 1) {
    const a = w(Date.UTC(2026, m, 5));
    const b = w(Date.UTC(2026, m + 1, 5));
    if (Date.parse(a.until) < Date.parse(b.since)) gaps += 1;
    if (Date.parse(a.until) > Date.parse(b.since)) overlaps += 1;
  }
  ok(gaps === 0 && overlaps === 0,
    `8. across a full year every instant falls in exactly one month (gaps ${gaps}, overlaps ${overlaps})`);

  // ── The window is half-open, matching the projection's own boundary ────────
  ok(Date.parse(mid.until) - Date.parse(mid.since) === 31 * 86400000,
    "9. July spans exactly 31 days — the window is half-open, not inclusive of 1 Aug");

  // ── Other periods are deliberately unchanged ───────────────────────────────
  const ref = new Date("2026-07-10T12:00:00Z");
  const daily = reports.windowFor("daily", ref);
  const weekly = reports.windowFor("weekly", ref);
  const quarterly = reports.windowFor("quarterly", ref);
  ok(daily.until === ref.toISOString() && Date.parse(daily.until) - Date.parse(daily.since) === 86400000,
    "10. daily is still a rolling 24 hours ending now — that is the question it answers");
  ok(weekly.until === ref.toISOString() && Date.parse(weekly.until) - Date.parse(weekly.since) === 7 * 86400000,
    "11. weekly is still a rolling 7 days");
  ok(quarterly.until === ref.toISOString() && quarterly.since === "2026-04-10T12:00:00.000Z",
    "12. quarterly is deliberately left rolling — a separate change with its own blast radius");

  let threw = null;
  try { reports.windowFor("fortnightly", ref); } catch (e) { threw = e; }
  ok(threw !== null, "13. an unknown period still throws rather than silently reporting nothing");

  console.log(`\nreport window test: ${pass} passed, ${fail} failed`);
  if (fail) { console.log("FAILURES:"); for (const f of fails) console.log("  ✗ " + f); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("report window test crashed:", e); process.exit(1); });
