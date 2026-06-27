/* Analyst Console — front end. Talks only to this private server; never to the
 * engine or kit directly. */
const $ = (id) => document.getElementById(id);
const api = async (m, url, body) => {
  const r = await fetch(url, { method: m, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const STAGES = [
  ["parsing", "Parsing manifest"], ["assessment", "Runtime assessment"],
  ["exposure", "Ω exposure mapping"], ["audit", "Generating audit PDF"],
  ["replay", "Replaying trajectories"], ["determinism", "Determinism verification"],
  ["report", "Executive report"], ["complete", "Complete"],
];

// ---- session + engagements -------------------------------------------------
async function boot() {
  try {
    const me = await api("GET", "/api/me");
    $("who").innerHTML = `<b>${esc(me.user)}</b><br><span class="dot ${me.tokenSet ? "ok" : "warn"}"></span>engine ${me.tokenSet ? "ready" : "token unset"}`;
    $("e_analyst").placeholder = me.user;
  } catch { $("who").textContent = "session error"; }
  await refresh();
}

let ENGAGEMENTS = [];
async function refresh() {
  ENGAGEMENTS = await api("GET", "/api/engagements");
  renderEngagements();
  const sel = $("r_engagement");
  const cur = sel.value;
  sel.innerHTML = '<option value="">— ad-hoc (no record) —</option>' +
    ENGAGEMENTS.map((e) => `<option value="${e.id}">${esc(e.company || e.customer)} · ${esc(e.reference || e.engagement_type)}</option>`).join("");
  sel.value = cur;
}

const STATUS_OPTS = ["intake", "audited", "delivered", "closed"];
const PROPOSAL_OPTS = ["none", "drafted", "sent", "accepted", "declined"];
const INVOICE_OPTS = ["none", "drafted", "sent", "paid"];
const DELIVERY_OPTS = ["not_delivered", "shared", "delivered"];

function renderEngagements() {
  const host = $("engagements");
  if (!ENGAGEMENTS.length) { host.innerHTML = '<p class="empty">No engagements yet.</p>'; return; }
  const sel = (id, field, opts, val) => `<select class="mini" data-id="${id}" data-field="${field}">` +
    opts.map((o) => `<option ${o === val ? "selected" : ""}>${o}</option>`).join("") + "</select>";
  host.innerHTML = `<table><thead><tr>
    <th>Client</th><th>Industry</th><th>Reference</th><th>Type</th><th>Status</th>
    <th>Proposal</th><th>Invoice</th><th>Delivery</th><th>Reports</th><th>Created</th></tr></thead><tbody>` +
    ENGAGEMENTS.map((e) => `<tr>
      <td class="m">${esc(e.company || e.customer)}${e.customer && e.company ? `<br><small style="color:var(--ink-3)">${esc(e.customer)}</small>` : ""}</td>
      <td>${esc(e.industry || "—")}</td><td style="font-family:var(--mono);font-size:11px">${esc(e.reference || "—")}</td>
      <td>${esc(e.engagement_type || "—")}</td>
      <td>${sel(e.id, "status", STATUS_OPTS, e.status)}</td>
      <td>${sel(e.id, "proposal_status", PROPOSAL_OPTS, e.proposal_status)}</td>
      <td>${sel(e.id, "invoice_status", INVOICE_OPTS, e.invoice_status)}</td>
      <td>${sel(e.id, "delivery_status", DELIVERY_OPTS, e.delivery_status)}</td>
      <td>${(e.reports && e.reports.length) ? e.reports.map((r) => `<a href="/api/file?dir=${encodeURIComponent(r.dir)}&file=${encodeURIComponent(r.file)}" target="_blank">${esc(r.file.replace(/\.pdf$/, ""))}</a>`).join("<br>") : "—"}</td>
      <td style="font-family:var(--mono);font-size:11px;color:var(--ink-3)">${esc((e.created_at || "").slice(0, 10))}</td>
    </tr>`).join("") + "</tbody></table>";
  host.querySelectorAll("select.mini").forEach((s) => s.addEventListener("change", async (ev) => {
    const t = ev.target;
    await api("PATCH", "/api/engagements/" + t.dataset.id, { [t.dataset.field]: t.value });
    await refresh();
  }));
}

// ---- create engagement -----------------------------------------------------
$("e_create").addEventListener("click", async () => {
  const body = {
    customer: $("e_customer").value.trim(), company: $("e_company").value.trim(),
    industry: $("e_industry").value.trim(), reference: $("e_reference").value.trim(),
    engagement_type: $("e_type").value, analyst: $("e_analyst").value.trim(), notes: $("e_notes").value.trim(),
  };
  if (!body.customer && !body.company) { alert("Enter a customer or company."); return; }
  try {
    const rec = await api("POST", "/api/engagements", body);
    ["e_customer", "e_company", "e_industry", "e_reference", "e_notes"].forEach((id) => ($(id).value = ""));
    await refresh();
    // pre-fill the run panel from the new record
    $("r_engagement").value = rec.id;
    $("r_name").value = rec.company || rec.customer;
    $("r_domains").value = (rec.industry || "").toLowerCase();
  } catch (e) { alert("Could not create: " + e.message); }
});

// when an engagement is picked for a run, pre-fill name/domains
$("r_engagement").addEventListener("change", () => {
  const e = ENGAGEMENTS.find((x) => x.id === $("r_engagement").value);
  if (e) { $("r_name").value = e.company || e.customer; if (!$("r_domains").value) $("r_domains").value = (e.industry || "").toLowerCase(); }
});

// ---- file upload → textarea ------------------------------------------------
$("r_file").addEventListener("change", (ev) => {
  const f = ev.target.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = () => { $("r_manifest").value = reader.result; if (!$("r_name").value) $("r_name").value = f.name.replace(/\.[^.]+$/, ""); };
  reader.readAsText(f);
});

// ---- run audit (streamed) --------------------------------------------------
function renderStages(active, done) {
  $("stages").innerHTML = STAGES.map(([k, label]) => {
    const cls = done.has(k) ? "done" : (k === active ? "active" : "");
    const ic = done.has(k) ? "✓" : (k === active ? "•" : "");
    return `<div class="stage ${cls}"><span class="ic">${ic}</span>${esc(label)}</div>`;
  }).join("");
}

$("r_run").addEventListener("click", async () => {
  const manifestText = $("r_manifest").value.trim();
  if (!manifestText) { alert("Upload or paste a manifest first."); return; }
  let trajectories;
  const tj = $("r_traj").value.trim();
  if (tj) { try { trajectories = JSON.parse(tj); } catch { alert("Trajectories must be valid JSON."); return; } }

  const body = {
    name: $("r_name").value.trim() || "Customer", period: $("r_period").value.trim(),
    industry: ($("r_domains").value.split(",")[0] || "").trim(), format: $("r_format").value,
    domains: $("r_domains").value.trim(), manifestText, trajectories,
  };
  const eng = ENGAGEMENTS.find((x) => x.id === $("r_engagement").value);
  if (eng) body.reference = eng.reference;

  $("r_run").disabled = true; $("r_status").textContent = "running…";
  $("run_card").style.display = ""; $("run_title").textContent = `Audit — ${esc(body.name)}`;
  $("deliverables").classList.remove("on"); $("log").classList.add("on"); $("log").textContent = "";
  const done = new Set(); renderStages("parsing", done);

  try {
    const res = await fetch("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const reader = res.body.getReader(); const dec = new TextDecoder();
    let buf = "", last = "parsing", final = null;
    while (true) {
      const { value, done: rdone } = await reader.read(); if (rdone) break;
      buf += dec.decode(value, { stream: true });
      let nl; while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1); if (!line.trim()) continue;
        const ev = JSON.parse(line);
        if (ev.type === "stage") { if (last && last !== ev.key) done.add(last); if (ev.key === "complete") done.add("complete"); last = ev.key; renderStages(ev.key, done); }
        else if (ev.type === "log") { const l = $("log"); l.textContent += ev.line + "\n"; l.scrollTop = l.scrollHeight; }
        else if (ev.type === "error") { throw new Error(ev.error); }
        else if (ev.type === "complete") { final = ev; }
      }
    }
    STAGES.forEach(([k]) => done.add(k)); renderStages(null, done);
    if (final && final.dir) await showDeliverables(final, eng);
    $("r_status").textContent = "done ✓";
  } catch (e) {
    $("r_status").textContent = "failed: " + e.message;
  } finally { $("r_run").disabled = false; }
});

async function showDeliverables(final, eng) {
  const d = $("deliverables"); d.classList.add("on");
  const s = final.summary || {};
  const pending = s.pending || [];
  const matrix = s.fields ? Object.entries(s.fields).map(([k, v]) => `${v ? "✅" : pending.includes(k) ? "⏳" : "🔴"} ${k}`).join(" · ") : "";
  const modeLabel = s.mode === "live" ? "🟢 Live Runtime Evidence" : s.mode === "deployment-ready" ? "🟡 Deployment Ready" : s.mode === "incomplete" ? "🔴 Incomplete" : "";
  $("deliv_meta").innerHTML = `Output: <span style="font-family:var(--mono);color:var(--ink-2)">${esc(final.dir)}</span>` +
    (modeLabel ? `<br><span style="font-size:11px">Executive Report: <b>${esc(modeLabel)}</b></span>` : "") +
    (matrix ? `<br><span style="font-size:11px">${esc(matrix)}</span>` : "") +
    (pending.length ? `<br><span style="color:var(--ink-3);font-size:11px">⏳ Pending live evidence (by design): ${esc(pending.join(", "))} — populate after trajectories are replayed.</span>` : "") +
    (s.missing && s.missing.length ? `<br><span style="color:var(--omega);font-size:11px">Missing structural evidence: ${esc(s.missing.join(", "))} — check engine connectivity.</span>` : "");
  $("files").innerHTML = final.files.map((f) => {
    const isPdf = f.endsWith(".pdf");
    const u = (dl) => `/api/file?dir=${encodeURIComponent(final.dir)}&file=${encodeURIComponent(f)}${dl ? "&dl=1" : ""}`;
    return `<div class="file"><div class="n">${esc(f)}<small>${isPdf ? "Branded PDF" : "Run summary (JSON)"}</small></div><div style="display:flex;gap:8px">
      ${isPdf ? `<a class="btn ghost sm" href="${u(0)}" target="_blank">Preview</a>` : ""}
      <a class="btn ghost sm" href="${u(1)}">Download</a>
      ${isPdf ? `<button class="btn sm" data-share-dir="${esc(final.dir)}" data-share-file="${esc(f)}">Share securely</button>` : ""}</div></div>`;
  }).join("");
  $("files").querySelectorAll("[data-share-file]").forEach((b) => b.addEventListener("click", () => createShare(b.dataset.shareDir, b.dataset.shareFile, eng)));

  // attach reports to the engagement record + advance status
  if (eng) {
    const reports = final.files.filter((f) => f.endsWith(".pdf")).map((f) => ({ dir: final.dir, file: f, at: new Date().toISOString() }));
    await api("PATCH", "/api/engagements/" + eng.id, { reports: [...(eng.reports || []), ...reports], status: "audited" });
    await refresh();
  }
}

// ---- secure delivery -------------------------------------------------------
async function createShare(dir, file, eng) {
  const days = prompt("Link valid for how many days? (1–90)", "14");
  if (days === null) return;
  const password = prompt("Optional password (leave blank for none):", "") || "";
  try {
    const r = await api("POST", "/api/share", {
      dir, file, days: parseInt(days, 10) || 14, password,
      label: file.replace(/\.pdf$/, "").replace(/-/g, " "),
      recipient: eng ? (eng.customer || eng.company) : "",
      title: eng ? `${eng.company || eng.customer} — Runtime Governance report` : "Your Runtime Governance report",
      engagementId: eng ? eng.id : "",
    });
    await loadShares();
    try { await navigator.clipboard.writeText(r.url); } catch { /* clipboard may be blocked */ }
    if (eng) { await api("PATCH", "/api/engagements/" + eng.id, { delivery_status: "shared", status: "delivered" }); await refresh(); }
    alert(`Secure link created${r.password_protected ? " (password-protected)" : ""} — copied to clipboard:\n\n${r.url}\n\nExpires: ${new Date(r.expires_at).toUTCString()}`);
  } catch (e) { alert("Could not create link: " + e.message); }
}

async function loadShares() {
  const shares = await api("GET", "/api/shares");
  const host = $("shares");
  if (!shares.length) { host.innerHTML = '<p class="empty">No share links yet. Use “Share” on a deliverable above.</p>'; return; }
  host.innerHTML = `<table><thead><tr><th>File</th><th>Recipient</th><th>Link</th><th>State</th><th>Expires</th><th>PW</th><th>DL</th><th></th></tr></thead><tbody>` +
    shares.map((s) => {
      const st = s.state;
      const pill = st === "active" ? "running" : st === "expired" || st === "revoked" ? "" : "";
      return `<tr>
        <td class="m">${esc(s.label || s.file)}</td>
        <td>${esc(s.recipient || "—")}</td>
        <td>${st === "active" ? `<a href="${esc(s.url)}" target="_blank">open</a> · <button class="btn ghost sm" data-copy="${esc(s.url)}">copy</button>` : "—"}</td>
        <td><span class="pill ${pill}">${esc(st)}</span></td>
        <td style="font-family:var(--mono);font-size:11px;color:var(--ink-3)">${esc(new Date(s.expires_at).toISOString().slice(0, 10))}</td>
        <td>${s.password_protected ? "🔒" : "—"}</td>
        <td class="m">${s.downloads}</td>
        <td>${st === "active" ? `<button class="btn ghost sm" data-revoke="${esc(s.id)}">Revoke</button>` : ""}</td>
      </tr>`;
    }).join("") + "</tbody></table>";
  host.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "copied ✓"; } catch { prompt("Copy this link:", b.dataset.copy); } }));
  host.querySelectorAll("[data-revoke]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Revoke this link? The customer will no longer be able to download it.")) return;
    await api("POST", "/api/shares/" + b.dataset.revoke + "/revoke"); await loadShares();
  }));
}

boot();
loadShares();
