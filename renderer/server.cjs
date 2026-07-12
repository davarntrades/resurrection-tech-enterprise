"use strict";
/* ============================================================================
 * Runtime Governance — PDF renderer service (Railway, Node + Playwright).
 *
 * A dedicated, authenticated HTML→PDF renderer. Vercel's Generate-evidence-pack
 * route POSTs pre-built report HTML here; this service renders each document to
 * a PDF with headless Chromium and returns the bytes. It is the ONLY place that
 * runs Chromium in production — the Python governance engine is untouched.
 *
 * Security posture (server-to-server only; never called from a browser):
 *   · Shared secret required in `x-render-secret` (constant-time compare).
 *   · HTML content only — never a URL. Arbitrary external navigation during
 *     rendering is blocked (every non-data/about request is aborted).
 *   · Bounded body size and a per-render timeout. Fails closed.
 *
 * Chromium is resolved by the shared scripts/lib/resolve-chromium.cjs (the same
 * resolver used locally / in CI) and installed at image-build time.
 * ============================================================================ */
const http = require("node:http");
const crypto = require("node:crypto");
const { chromium } = require("playwright-core");
const { resolveChromium } = require("../scripts/lib/resolve-chromium.cjs");

const PORT = Number(process.env.PORT || 8080);
const SECRET = process.env.RENDER_SECRET || "";
const MAX_BODY_BYTES = Number(process.env.RENDER_MAX_BODY_BYTES || 8 * 1024 * 1024); // 8 MB
const MAX_DOCS = Number(process.env.RENDER_MAX_DOCS || 6);
const RENDER_TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS || 30000);

// One shared browser for the process; relaunched if it dies.
let browserP = null;
async function getBrowser() {
  if (browserP) { try { const b = await browserP; if (b.isConnected()) return b; } catch { /* relaunch */ } }
  const executablePath = resolveChromium();
  browserP = chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
  return browserP;
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Render one HTML document to a PDF Buffer. Blocks all external navigation.
async function renderOne(html) {
  const browser = await getBrowser();
  const ctx = await browser.newContext({ javaScriptEnabled: true });
  try {
    const page = await ctx.newPage();
    // Disable arbitrary external navigation: allow only the initial in-memory
    // document + data: URIs; abort anything that reaches out to the network.
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith("data:") || url === "about:blank") return route.continue();
      return route.abort();
    });
    await page.setContent(String(html), { waitUntil: "load", timeout: RENDER_TIMEOUT_MS });
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "0", bottom: "0", left: "0", right: "0" } });
    return pdf;
  } finally {
    await ctx.close().catch(() => {});
  }
}

function send(res, status, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(status, { "content-type": "application/json", "content-length": body.length, "x-content-type-options": "nosniff" });
  res.end(body);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { reject(Object.assign(new Error("request body too large"), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      return send(res, 200, { ok: true, service: "rg-renderer", chromium: safeChromePath(), secret_configured: !!SECRET });
    }
    if (req.method === "POST" && req.url === "/render") {
      if (!SECRET) return send(res, 503, { error: "renderer not configured (RENDER_SECRET unset)" });
      if (!timingSafeEqual(req.headers["x-render-secret"] || "", SECRET)) return send(res, 401, { error: "invalid render secret" });

      let raw;
      try { raw = await readBody(req); } catch (e) { return send(res, e.status || 400, { error: e.message || "bad body" }); }
      let body; try { body = JSON.parse(raw.toString("utf8") || "{}"); } catch { return send(res, 400, { error: "invalid JSON" }); }

      const docs = Array.isArray(body.documents) ? body.documents : [];
      if (!docs.length) return send(res, 400, { error: "documents[] required" });
      if (docs.length > MAX_DOCS) return send(res, 400, { error: `too many documents (max ${MAX_DOCS})` });
      for (const d of docs) {
        if (!d || typeof d.name !== "string" || typeof d.html !== "string") return send(res, 400, { error: "each document needs { name, html }" });
        if (/^https?:/i.test(d.html.trim())) return send(res, 400, { error: "html content required — URLs are not rendered" });
      }

      const files = [];
      for (const d of docs) {
        const pdf = await withTimeout(renderOne(d.html), RENDER_TIMEOUT_MS + 5000, `render ${d.name}`);
        files.push({ name: d.name, pdf_base64: pdf.toString("base64"), bytes: pdf.length });
      }
      return send(res, 200, { ok: true, files });
    }
    return send(res, 404, { error: "not found" });
  } catch (e) {
    return send(res, 500, { error: (e && e.message) || "render failed" });
  }
});

function safeChromePath() { try { return resolveChromium({ required: false }); } catch { return null; } }
function withTimeout(p, ms, label) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms))]);
}

server.listen(PORT, () => console.log(`[rg-renderer] listening on :${PORT} · secret ${SECRET ? "configured" : "MISSING"} · chromium ${safeChromePath() || "unresolved"}`));

// Graceful shutdown.
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { server.close(() => process.exit(0)); });
