#!/usr/bin/env node
/* ============================================================================
 * Runtime Governance — continuous report generator (CLI / cron).
 *
 * Generates a daily / weekly / monthly / quarterly governance-evidence report
 * for an org (all environments or one) from recorded decisions, writes the
 * Markdown, and — if Chromium is available — hands it to the existing delivery
 * kit's print pipeline for a branded PDF (reusing the audit's renderer).
 *
 *   node scripts/runtime/report.cjs --org <org_id> --period monthly [--env <id>]
 *   (schedule with cron: daily 06:00, weekly Mon, monthly 1st, quarterly.)
 * ============================================================================ */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const rt = require("../../lib/runtime");

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = path.join(__dirname, "..", "..", "deliverables", "runtime-reports");

// Minimal, self-contained Chromium locator (CHROME_BIN, Playwright cache, PATH).
function findChromium() {
  const os = require("node:os");
  const cands = [process.env.CHROME_BIN];
  for (const base of [process.env.PLAYWRIGHT_BROWSERS_PATH, "/opt/pw-browsers", path.join(os.homedir(), ".cache", "ms-playwright")].filter(Boolean)) {
    try { for (const d of fs.readdirSync(base)) if (/^chromium/.test(d)) cands.push(path.join(base, d, "chrome-linux", "chrome"), path.join(base, d, "chrome-linux64", "chrome")); } catch { /* skip */ }
  }
  for (const c of ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"]) cands.push(c);
  return cands.find((c) => c && fs.existsSync(c)) || null;
}

(async () => {
  const org_id = arg("--org");
  const environment_id = arg("--env");
  const period = arg("--period", "daily");
  if (!org_id) { console.error("--org <org_id> required"); process.exit(1); }
  if (!rt.reports.PERIODS.includes(period)) { console.error(`--period must be one of ${rt.reports.PERIODS.join("|")}`); process.exit(1); }

  const report = await rt.reports.generate({ org_id, environment_id, period });
  const md = rt.reports.toMarkdown(report);
  fs.mkdirSync(OUT, { recursive: true });
  const stamp = report.generated_at.slice(0, 10);
  const base = path.join(OUT, `${org_id}_${period}_${stamp}`);
  fs.writeFileSync(base + ".md", md);
  fs.writeFileSync(base + ".json", JSON.stringify(report, null, 2));
  console.log(`Report written: ${base}.md / .json`);
  console.log(`  ${report.headline}`);

  // Optional branded PDF via headless Chromium (same engine the delivery kit
  // uses). Self-contained finder so this never couples to kit internals.
  try {
    const chrome = findChromium();
    if (chrome) {
      const { execFileSync } = require("node:child_process");
      const html = `<!doctype html><meta charset="utf-8"><style>body{font:14px/1.6 -apple-system,sans-serif;max-width:800px;margin:40px auto;padding:0 24px}h1{font-size:22px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px 10px;text-align:left}blockquote{border-left:3px solid #444;padding-left:14px;color:#333}</style>` +
        md.replace(/^# (.*)$/m, "<h1>$1</h1>").replace(/^## (.*)$/gm, "<h2>$1</h2>").replace(/^> (.*)$/gm, "<blockquote>$1</blockquote>")
          .replace(/\|(.+)\|/g, (line) => "<tr>" + line.split("|").filter((c) => c.trim() !== "").map((c) => `<td>${c.trim()}</td>`).join("") + "</tr>")
          .replace(/\n/g, "\n");
      const tmpHtml = base + ".html"; fs.writeFileSync(tmpHtml, html);
      execFileSync(chrome, ["--headless=new", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer", "--print-to-pdf=" + base + ".pdf", "file://" + tmpHtml], { stdio: ["ignore", "ignore", "pipe"], timeout: 60000 });
      if (fs.existsSync(base + ".pdf")) console.log(`  PDF: ${base}.pdf`);
    } else {
      console.log("  (Chromium not found — Markdown/JSON only; PDF is optional.)");
    }
  } catch (e) { console.log("  (PDF step skipped: " + (e && e.message) + ")"); }
})().catch((e) => { console.error("report failed:", e && e.message ? e.message : e); process.exit(1); });
