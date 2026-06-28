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
const SHARES = path.join(DATA_DIR, "shares.json");
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
let USER = process.env.ANALYST_USER;
let PASS = process.env.ANALYST_PASSWORD;

// ---- fail-closed auth -------------------------------------------------------
// The console never serves without credentials. On a fresh checkout there are
// none, which is the usual reason it "won't start" — so instead of refusing, we
// auto-provision a strong password into .env.delivery (gitignored) on first run
// and print it once. Still fail-closed: it only proceeds once creds exist. Set
// CONSOLE_NO_AUTOPROVISION=1 to require manual credentials instead.
if (!USER || !PASS) {
  if (process.env.CONSOLE_NO_AUTOPROVISION) {
    console.error(`\n✗ Refusing to start: set ANALYST_USER and ANALYST_PASSWORD in .env.delivery.\n  Generate a password:  node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"\n`);
    process.exit(1);
  }
  USER = USER || "analyst";
  PASS = PASS || crypto.randomBytes(18).toString("base64url");
  const envPath = path.join(ROOT, ".env.delivery");
  try {
    let cur = "";
    try { cur = fs.readFileSync(envPath, "utf8"); } catch { /* new file */ }
    const lines = cur ? cur.replace(/\s*$/, "").split(/\r?\n/) : ["# Resurrection Tech — Delivery Kit / Analyst Console config (gitignored)"];
    const setLine = (k, v) => {
      const i = lines.findIndex((l) => new RegExp(`^\\s*${k}\\s*=`).test(l));
      if (i >= 0) { if (/=\s*$/.test(lines[i])) lines[i] = `${k}=${v}`; } else lines.push(`${k}=${v}`);
    };
    setLine("ANALYST_USER", USER);
    setLine("ANALYST_PASSWORD", PASS);
    fs.writeFileSync(envPath, lines.join("\n") + "\n");
    process.env.ANALYST_USER = USER; process.env.ANALYST_PASSWORD = PASS;
    console.log(`
┌─────────────────────────────────────────────────────────────┐
│  Analyst Console — credentials auto-provisioned (first run)   │
├─────────────────────────────────────────────────────────────┤
│  username:  ${USER.padEnd(48)}│
│  password:  ${PASS.padEnd(48)}│
└─────────────────────────────────────────────────────────────┘
  Saved to .env.delivery (gitignored). Use these at the login prompt.
  Change them by editing .env.delivery, or re-run with your own
  ANALYST_USER / ANALYST_PASSWORD.
`);
  } catch (e) {
    console.error(`\n✗ Could not write .env.delivery (${e.message}). Set ANALYST_USER / ANALYST_PASSWORD manually and re-run.\n`);
    process.exit(1);
  }
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
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// engagement store (local JSON; gitignored). Solo-analyst v1; swap for Supabase
// at multi-analyst scale without changing the UI contract.
function loadEngagements() { try { return JSON.parse(fs.readFileSync(ENGAGEMENTS, "utf8")); } catch { return []; } }
function saveEngagements(list) { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(ENGAGEMENTS, JSON.stringify(list, null, 2)); }
// Atomically mutate one engagement record and persist. Returns the updated rec.
function updateEngagement(id, mutate) {
  const list = loadEngagements();
  const rec = list.find((r) => r.id === id);
  if (!rec) return null;
  mutate(rec);
  rec.updated_at = new Date().toISOString();
  saveEngagements(list);
  return rec;
}

// secure-delivery shares (capability tokens; expiring + revocable; optional pw).
// Served credential-free at /share/<token> so customers never touch the console.
function loadShares() { try { return JSON.parse(fs.readFileSync(SHARES, "utf8")); } catch { return []; } }
function saveShares(list) { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(SHARES, JSON.stringify(list, null, 2)); }
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString("hex");
function shareState(s) {
  if (!s) return "invalid";
  if (s.revoked) return "revoked";
  if (Date.parse(s.expires_at) < Date.now()) return "expired";
  return "active";
}

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".pdf": "application/pdf" };

// serve a static asset from console/public (auth already enforced)
function serveStatic(res, name) {
  const file = path.join(PUBLIC, name);
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file)) return send(res, 404, { error: "not found" });
  send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || "application/octet-stream");
}

// ---- run an audit: invoke the kit, stream staged progress (ndjson) ----------
function runAudit(req, res, body) {
  const { name, industry, period, reference, format, domains, manifestText, trajectories, engagementId } = body || {};
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
    // Persist the run to the engagement so deliverables survive refresh/navigation
    // and the Engagement Details page can restore everything from the server.
    if (engagementId && resultDir && files.length) {
      const at = new Date().toISOString();
      const ev = summary ? {
        mode: summary.mode || null,
        coverage_pct: summary.assess_summary ? summary.assess_summary.coverage_pct : null,
        verified_blocked_trajectories: summary.assess_summary ? summary.assess_summary.verified_blocked_trajectories : null,
        metrics: summary.metrics || null,
        performance: summary.performance || null,
        replay: summary.replay || null,
        pending: summary.pending || [], missing: summary.missing || [],
      } : null;
      updateEngagement(engagementId, (rec) => {
        const reports = files.filter((f) => /\.(pdf|json)$/.test(f)).map((f) => ({ dir: resultDir, file: f, at }));
        const seen = new Set();
        rec.reports = [...reports, ...(rec.reports || [])].filter((r) => {
          const k = r.dir + "/" + r.file; if (seen.has(k)) return false; seen.add(k); return true;
        });
        rec.audits = [{ at, dir: resultDir, files, evidence: ev, period: period || "", manifest_preview: String(manifestText).slice(0, 4000) }, ...(rec.audits || [])];
        rec.last_audit_at = at;
        if (period && !rec.period) rec.period = period;
        if (rec.status === "intake" || !rec.status) rec.status = "audited";
      });
    }
    emit({ type: "complete", code, dir: resultDir, files, summary, engagementId: engagementId || null });
    res.end();
  });
  req.on("close", () => { if (child.exitCode == null) child.kill(); });
}

// ---- resolve a deliverable path, scoped strictly under /deliverables --------
// `dir` may be repo-root-relative ("deliverables/<slug>", as the run emits) or
// DELIVERABLES-relative ("<slug>"). Always returns an absolute path inside
// DELIVERABLES, or null (out of scope / traversal). Single source of truth so
// preview, download, and share all resolve identically.
function resolveDeliverable(dir, file) {
  const within = (p) => p === DELIVERABLES || p.startsWith(DELIVERABLES + path.sep);
  let abs = path.resolve(ROOT, dir || "", file || "");      // handles "deliverables/<slug>"
  if (!within(abs)) abs = path.resolve(DELIVERABLES, dir || "", file || ""); // handles bare "<slug>"
  return within(abs) ? abs : null;
}

// ---- serve a deliverable file (scoped strictly under /deliverables) ---------
function serveDeliverable(res, dir, file, download) {
  const abs = resolveDeliverable(dir, file);
  if (!abs || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) return send(res, 404, { error: "not found" });
  const data = fs.readFileSync(abs);
  const headers = { "content-type": MIME[path.extname(abs)] || "application/octet-stream", "content-length": data.length, "cache-control": "no-store" };
  if (download) headers["content-disposition"] = `attachment; filename="${path.basename(abs)}"`;
  res.writeHead(200, headers); res.end(data);
}

// ---- public customer delivery (no analyst auth; capability token) -----------
const sharePage = (title, inner) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${title} · Resurrection Tech</title><style>
body{margin:0;background:#08090b;color:#aab2bd;font-family:-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}
.box{max-width:460px;width:92%;background:#0f1216;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:34px 32px}
.r{color:#e0a93f;font-size:22px;font-weight:700}.eyebrow{font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#e0a93f;margin-top:14px}
h1{color:#f3f5f7;font-size:20px;margin:6px 0 4px}.sub{color:#6b7480;font-size:13px}
.file{margin:18px 0;padding:14px 16px;background:#0b0d10;border:1px solid rgba(255,255,255,.08);border-radius:10px;color:#f3f5f7;font-size:14px}
.file small{display:block;color:#6b7480;font-family:ui-monospace,Menlo,monospace;font-size:11px;margin-top:3px}
a.btn,button.btn{display:inline-block;background:linear-gradient(180deg,#f2c66a,#e0a93f);color:#1a1407;border:0;border-radius:10px;padding:12px 20px;font-weight:600;font-size:14px;text-decoration:none;cursor:pointer}
input{width:100%;background:#0b0d10;border:1px solid rgba(255,255,255,.08);border-radius:9px;color:#f3f5f7;padding:10px 12px;font-size:14px;margin:8px 0 14px;box-sizing:border-box}
.foot{margin-top:22px;border-top:1px solid rgba(255,255,255,.08);padding-top:12px;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#474e58}
.warn{color:#f0b4b6}</style></head><body><div class="box"><span class="r">&#8475;(t)</span>&nbsp;&nbsp;Resurrection Tech&trade;${inner}
<div class="foot">Confidential delivery · Do not forward</div></div></body></html>`;

function handleShare(req, res, u) {
  const rest = decodeURIComponent(u.pathname.slice("/share/".length));
  const [token, action] = rest.split("/");
  const shares = loadShares();
  const s = shares.find((x) => x.token === token);
  const state = shareState(s);
  if (state !== "active") {
    const msg = state === "expired" ? "This link has expired." : state === "revoked" ? "This link has been revoked." : "This link is invalid.";
    res.writeHead(state === "expired" ? 410 : 404, { "content-type": "text/html", "cache-control": "no-store" });
    return res.end(sharePage("Unavailable", `<div class="eyebrow">Secure delivery</div><h1>Link unavailable</h1><p class="sub warn">${msg} Please contact your Resurrection Tech analyst for an updated link.</p>`));
  }
  const pw = u.searchParams.get("pw") || "";
  const pwOk = !s.password_hash || (pw && hashPw(pw, s.password_salt) === s.password_hash);

  if (action === "download") {
    if (!pwOk) { res.writeHead(403, { "content-type": "text/html", "cache-control": "no-store" }); return res.end(sharePage("Password required", `<div class="eyebrow">Secure delivery</div><h1>Password required</h1><p class="sub warn">Incorrect or missing password.</p>`)); }
    const abs = resolveDeliverable(s.dir, s.file);
    if (!abs || !fs.existsSync(abs)) { res.writeHead(404, { "content-type": "text/html" }); return res.end(sharePage("Unavailable", `<h1>File unavailable</h1>`)); }
    s.downloads = (s.downloads || 0) + 1; s.last_download = new Date().toISOString(); saveShares(shares);
    const data = fs.readFileSync(abs);
    res.writeHead(200, { "content-type": MIME[path.extname(abs)] || "application/octet-stream", "content-length": data.length, "content-disposition": `attachment; filename="${path.basename(abs)}"`, "cache-control": "no-store" });
    return res.end(data);
  }

  // landing page
  const exp = new Date(s.expires_at).toUTCString();
  const dl = `/share/${encodeURIComponent(token)}/download`;
  const pwForm = s.password_hash
    ? `<form method="GET" action="${dl}"><div class="eyebrow">Password protected</div><input type="password" name="pw" placeholder="Enter the password you were sent" required autofocus><button class="btn" type="submit">Unlock &amp; download</button></form>`
    : `<a class="btn" href="${dl}">Download ${esc(s.label || "report")}</a>`;
  res.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
  return res.end(sharePage("Secure delivery", `<div class="eyebrow">Secure delivery${s.recipient ? " · " + esc(s.recipient) : ""}</div>
    <h1>${esc(s.title || "Your Runtime Governance report")}</h1>
    <p class="sub">Shared by Resurrection Tech. This link expires ${esc(exp)}.</p>
    <div class="file">${esc(s.file)}<small>${esc(s.label || "Confidential deliverable")}</small></div>
    ${pwForm}`));
}

// ---- router -----------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const p = u.pathname;
  // PUBLIC: customer delivery via capability token — bypasses analyst auth.
  if (p.startsWith("/share/")) return handleShare(req, res, u);

  if (!authed(req)) {
    res.writeHead(401, { "www-authenticate": 'Basic realm="Resurrection Tech Analyst Console", charset="UTF-8"', "content-type": "text/plain" });
    return res.end("Authentication required.");
  }
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
    if (mEng && req.method === "GET") {
      // Full engagement record + its share links + on-disk file verification, so
      // the Engagement Details page restores everything from the server.
      const rec = loadEngagements().find((r) => r.id === mEng[1]);
      if (!rec) return send(res, 404, { error: "not found" });
      const proto = (req.headers["x-forwarded-proto"] || "http").split(",")[0];
      const shares = loadShares().filter((s) => s.engagement_id === rec.id).map((s) => ({
        id: s.id, file: s.file, dir: s.dir, label: s.label, recipient: s.recipient,
        url: `${proto}://${req.headers.host}/share/${s.token}`,
        created_at: s.created_at, expires_at: s.expires_at, state: shareState(s),
        password_protected: !!s.password_hash, downloads: s.downloads || 0,
      }));
      const reports = (rec.reports || []).map((r) => {
        const abs = resolveDeliverable(r.dir, r.file);
        return { ...r, exists: !!(abs && fs.existsSync(abs)) };
      });
      return send(res, 200, { ...rec, reports, shares });
    }
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

    // --- secure delivery: create / list / revoke share links ---------------
    if (req.method === "POST" && p === "/api/share") {
      const b = await readBody(req);
      const abs = resolveDeliverable(b.dir, b.file);
      if (!abs || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) return send(res, 400, { error: "deliverable not found" });
      const days = Math.min(Math.max(parseInt(b.days, 10) || 14, 1), 90);
      const rec = {
        id: crypto.randomBytes(4).toString("hex"),
        token: crypto.randomBytes(24).toString("base64url"),
        dir: b.dir, file: b.file, label: b.label || b.file,
        title: b.title || "Your Runtime Governance report", recipient: b.recipient || "",
        engagement_id: b.engagementId || "",
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + days * 86400000).toISOString(),
        revoked: false, downloads: 0,
      };
      if (b.password) { rec.password_salt = crypto.randomBytes(8).toString("hex"); rec.password_hash = hashPw(b.password, rec.password_salt); }
      const list = loadShares(); list.unshift(rec); saveShares(list);
      const proto = (req.headers["x-forwarded-proto"] || "http").split(",")[0];
      const url = `${proto}://${req.headers.host}/share/${rec.token}`;
      return send(res, 200, { id: rec.id, url, expires_at: rec.expires_at, password_protected: !!rec.password_hash, days });
    }
    if (req.method === "GET" && p === "/api/shares") {
      const proto = (req.headers["x-forwarded-proto"] || "http").split(",")[0];
      return send(res, 200, loadShares().map((s) => ({
        id: s.id, file: s.file, dir: s.dir, label: s.label, recipient: s.recipient,
        url: `${proto}://${req.headers.host}/share/${s.token}`,
        created_at: s.created_at, expires_at: s.expires_at, state: shareState(s),
        password_protected: !!s.password_hash, downloads: s.downloads || 0,
      })));
    }
    const mShare = p.match(/^\/api\/shares\/([\w-]+)\/revoke$/);
    if (mShare && req.method === "POST") {
      const list = loadShares(); const s = list.find((x) => x.id === mShare[1]);
      if (!s) return send(res, 404, { error: "not found" });
      s.revoked = true; s.revoked_at = new Date().toISOString(); saveShares(list);
      return send(res, 200, { id: s.id, state: "revoked" });
    }
    const mRegen = p.match(/^\/api\/shares\/([\w-]+)\/regenerate$/);
    if (mRegen && req.method === "POST") {
      const list = loadShares(); const old = list.find((x) => x.id === mRegen[1]);
      if (!old) return send(res, 404, { error: "not found" });
      old.revoked = true; old.revoked_at = new Date().toISOString();
      const days = 14;
      const rec = {
        id: crypto.randomBytes(4).toString("hex"), token: crypto.randomBytes(24).toString("base64url"),
        dir: old.dir, file: old.file, label: old.label, title: old.title, recipient: old.recipient,
        engagement_id: old.engagement_id, created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + days * 86400000).toISOString(), revoked: false, downloads: 0,
      };
      list.unshift(rec); saveShares(list);
      const proto = (req.headers["x-forwarded-proto"] || "http").split(",")[0];
      return send(res, 200, { id: rec.id, url: `${proto}://${req.headers.host}/share/${rec.token}`, expires_at: rec.expires_at });
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
