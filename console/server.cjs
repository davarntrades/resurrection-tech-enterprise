/* ============================================================
 * Resurrection Tech™ — Runtime Governance Analyst Console
 *
 * PRIVATE, INTERNAL, ANALYST-ONLY. Wraps the existing Delivery Kit
 * (scripts/delivery-kit.cjs) behind authentication. Customers never reach this
 * app, the engine, the kit, analyst tools, or pre-delivery reports — they only
 * ever receive finished deliverables you choose to share.
 *
 *   npm run console        # http://127.0.0.1:8787  (set ANALYST_USER/PASSWORD)
 *
 * Zero npm dependencies — built on Node's http module so it runs anywhere the
 * Delivery Kit already runs (Chromium + engine access). Nothing here redesigns
 * the Runtime Governance pipeline; it reuses it as-is.
 * ============================================================ */
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const DELIVERABLES = path.join(ROOT, "deliverables");
const ENGAGEMENTS = path.join(DATA_DIR, "engagements.json");
const KIT = path.join(ROOT, "scripts", "delivery-kit.cjs");

// ---- env autoload (same files the kit reads; analysts configure once) -------
(function loadEnv() {
  for (const f of [".env.delivery", ".env.local"]) {
    const p = path.join(ROOT, f);
    try {
      if (!fs.existsSync(p)) continue;
      for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (process.env[m[1]] == null || process.env[m[1]] === "") process.env[m[1]] = v;
      }
    } catch { /* ignore */ }
  }
})();

const PORT = Number(process.env.CONSOLE_PORT || 8787);
const HOST = process.env.CONSOLE_HOST || "127.0.0.1";
const USER = process.env.ANALYST_USER;
const PASS = process.env.ANALYST_PASSWORD;

// ---- fail-closed auth: refuse to start without credentials ------------------
if (!USER || !PASS) {
  console.error(`
✗ Refusing to start: the Analyst Console must be authenticated.

  Set analyst credentials in .env.delivery (gitignored), then re-run:
    ANALYST_USER=your.name
    ANALYST_PASSWORD=<a long random passphrase>

  Generate one:  node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"
`);
  process.exit(1);
}

const safeEq = (a, b) => {
  const ba = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};
function authed(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Basic ")) return false;
  let dec; try { dec = Buffer.from(h.slice(6), "base64").toString("utf8"); } catch { return false; }
  const i = dec.indexOf(":");
  if (i < 0) return false;
  return safeEq(dec.slice(0, i), USER) && safeEq(dec.slice(i + 1), PASS);
}

// ---- tiny helpers -----------------------------------------------------------
const send = (res, code, body, type = "application/json") => {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  res.writeHead(code, { "content-type": type, "content-length": buf.length, "cache-control": "no-store" });
  res.end(buf);
};
const readBody = (req) => new Promise((resolve) => {
  let d = ""; req.on("data", (c) => { d += c; if (d.length > 8e6) req.destroy(); });
  req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
});
const slug = (s) => String(s || "x").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "x";

// engagement store (local JSON; gitignored). Solo-analyst v1; swap for Supabase
// at multi-analyst scale without changing the UI contract.
function loadEngagements() { try { return JSON.parse(fs.readFileSync(ENGAGEMENTS, "utf8")); } catch { return []; } }
function saveEngagements(list) { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(ENGAGEMENTS, JSON.stringify(list, null, 2)); }

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".pdf": "application/pdf" };

// serve a static asset from console/public (auth already enforced)
function serveStatic(res, name) {
  const file = path.join(PUBLIC, name);
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file)) return send(res, 404, { error: "not found" });
  send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || "application/octet-stream");
}

// ---- run an audit: invoke the kit, stream staged progress (ndjson) ----------
function runAudit(req, res, body) {
  const { name, industry, period, reference, format, domains, manifestText, trajectories } = body || {};
  if (!manifestText || !String(manifestText).trim()) return send(res, 400, { error: "manifestText required" });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rt-console-"));
  const manifestFile = path.join(tmp, "manifest.txt");
  fs.writeFileSync(manifestFile, String(manifestText));
  const args = [KIT, "--manifest", manifestFile, "--name", name || "Customer"];
  if (industry) args.push("--industry", industry);
  if (period) args.push("--period", period);
  if (reference) args.push("--reference", reference);
  if (format) args.push("--format", format);
  if (domains) args.push("--domains", Array.isArray(domains) ? domains.join(",") : domains);
  if (Array.isArray(trajectories) && trajectories.length) {
    const tf = path.join(tmp, "trajectories.json");
    fs.writeFileSync(tf, JSON.stringify(trajectories));
    args.push("--trajectories", tf);
  }

  res.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-store", "x-accel-buffering": "no" });
  const emit = (o) => { try { res.write(JSON.stringify(o) + "\n"); } catch { /* client gone */ } };

  const child = spawn(process.execPath, args, { cwd: ROOT, env: { ...process.env, RT_CONSOLE: "1" } });
  let resultDir = null, buf = "";
  const handle = (chunk) => {
    buf += chunk.toString();
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      if (line.startsWith("__STAGE__:")) {
        const [, key, ...rest] = line.split(":");
        emit({ type: "stage", key, label: rest.join(":") });
      } else if (line.startsWith("__RESULT__:")) {
        resultDir = line.slice("__RESULT__:".length).trim();
      } else {
        emit({ type: "log", line });
      }
    }
  };
  child.stdout.on("data", handle);
  child.stderr.on("data", (c) => emit({ type: "log", line: c.toString().replace(/\n$/, "") }));
  child.on("error", (e) => { emit({ type: "error", error: e.message }); res.end(); });
  child.on("close", (code) => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    let summary = null, files = [];
    if (resultDir) {
      const abs = path.join(ROOT, resultDir);
      try { summary = JSON.parse(fs.readFileSync(path.join(abs, "run-summary.json"), "utf8")); } catch { /* none */ }
      try { files = fs.readdirSync(abs).filter((f) => /\.(pdf|json)$/.test(f)); } catch { /* none */ }
    }
    emit({ type: "complete", code, dir: resultDir, files, summary });
    res.end();
  });
  req.on("close", () => { if (child.exitCode == null) child.kill(); });
}

// ---- serve a deliverable file (scoped strictly under /deliverables) ---------
function serveDeliverable(res, dir, file, download) {
  const abs = path.resolve(DELIVERABLES, dir || "", file || "");
  const within = abs === DELIVERABLES || abs.startsWith(DELIVERABLES + path.sep);
  if (!within || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) return send(res, 404, { error: "not found" });
  const data = fs.readFileSync(abs);
  const headers = { "content-type": MIME[path.extname(abs)] || "application/octet-stream", "content-length": data.length, "cache-control": "no-store" };
  if (download) headers["content-disposition"] = `attachment; filename="${path.basename(abs)}"`;
  res.writeHead(200, headers); res.end(data);
}

// ---- router -----------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  if (!authed(req)) {
    res.writeHead(401, { "www-authenticate": 'Basic realm="Resurrection Tech Analyst Console", charset="UTF-8"', "content-type": "text/plain" });
    return res.end("Authentication required.");
  }
  const u = new URL(req.url, `http://${req.headers.host}`);
  const p = u.pathname;
  try {
    if (req.method === "GET" && (p === "/" || p === "/index.html")) return serveStatic(res, "index.html");
    if (req.method === "GET" && (p === "/app.css" || p === "/app.js")) return serveStatic(res, p.slice(1));
    if (req.method === "GET" && p === "/api/me") return send(res, 200, { user: USER, engine: (process.env.GOVERNANCE_URL || "default"), tokenSet: !!process.env.GOVERNANCE_TOKEN });

    if (req.method === "GET" && p === "/api/engagements") return send(res, 200, loadEngagements());
    if (req.method === "POST" && p === "/api/engagements") {
      const b = await readBody(req);
      if (!b.customer && !b.company) return send(res, 400, { error: "customer or company required" });
      const list = loadEngagements();
      const rec = {
        id: slug(b.customer || b.company) + "-" + crypto.randomBytes(3).toString("hex"),
        customer: b.customer || "", company: b.company || "", industry: b.industry || "",
        reference: b.reference || "", engagement_type: b.engagement_type || "48-Hour Audit",
        analyst: b.analyst || USER, notes: b.notes || "",
        status: "intake", reports: [],
        proposal_status: "none", pilot_reco: "", enterprise_reco: "",
        invoice_status: "none", delivery_status: "not_delivered",
        created_at: new Date().toISOString(),
      };
      list.unshift(rec); saveEngagements(list);
      return send(res, 200, rec);
    }
    const mEng = p.match(/^\/api\/engagements\/([\w-]+)$/);
    if (mEng && req.method === "PATCH") {
      const b = await readBody(req);
      const list = loadEngagements();
      const rec = list.find((r) => r.id === mEng[1]);
      if (!rec) return send(res, 404, { error: "not found" });
      const allowed = ["customer", "company", "industry", "reference", "engagement_type", "analyst", "notes",
        "status", "reports", "proposal_status", "pilot_reco", "enterprise_reco", "invoice_status", "delivery_status"];
      for (const k of allowed) if (k in b) rec[k] = b[k];
      rec.updated_at = new Date().toISOString();
      saveEngagements(list);
      return send(res, 200, rec);
    }

    if (req.method === "POST" && p === "/api/run") return runAudit(req, res, await readBody(req));

    if (req.method === "GET" && p === "/api/file") {
      return serveDeliverable(res, u.searchParams.get("dir"), u.searchParams.get("file"), u.searchParams.get("dl") === "1");
    }

    return send(res, 404, { error: "not found" });
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\nResurrection Tech™ — Runtime Governance Analyst Console`);
  console.log(`  ▶ http://${HOST}:${PORT}   (analyst: ${USER})`);
  console.log(`  engine: ${process.env.GOVERNANCE_URL || "default Railway"} · token ${process.env.GOVERNANCE_TOKEN ? "set ✓" : "NOT set ✗ (exec-report replay needs it)"}`);
  console.log(`  private/internal — do not expose publicly. Customers never reach this app.\n`);
});
