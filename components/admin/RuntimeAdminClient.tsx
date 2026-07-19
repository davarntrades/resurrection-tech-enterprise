"use client";
/**
 * Runtime Governance — Operator Control Room (admin dashboard, Phase 2).
 *
 * The browser surface over the Phase-1 admin API (/api/runtime/admin/*). Auth is
 * a session cookie set by /admin/login; every call is same-origin so the cookie
 * rides along automatically. Screens: Customers (onboard, shadow/enforce toggle,
 * key rotation, evidence, reports), Readiness (preflight card), Audit (action log).
 * Reuses the tested lib/runtime functions via those routes — no business logic here.
 */
import "@/styles/runtime-admin.css";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { VolumeChart, RatioBar, LatencySpark, FreqBars, Info, MiniSpark } from "./Charts";
import { deliverableFileUrl } from "@/lib/deliverable-url";

const OMEGA_TIP = "Ω (Omega) domains are the catastrophic-risk categories the engine governs — e.g. finance, healthcare, infrastructure. Every blocked or escalated action is attributed to the Ω domain whose safety boundary it would cross.";

// ── API helper (cookie auto-sent same-origin) ────────────────────────────────
async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(`/api/runtime/admin/${path}`, {
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e: any = new Error(data?.error || `HTTP ${res.status}`); e.status = res.status; throw e; }
  return data;
}

type Tab = "overview" | "customers" | "onboard" | "readiness" | "alerts" | "audit";

export default function RuntimeAdminClient() {
  const [authed, setAuthed] = useState<boolean | null>(null); // null = checking
  const [tab, setTab] = useState<Tab>("overview");

  const check = useCallback(async () => {
    try { await api("orgs"); setAuthed(true); }
    catch (e: any) { setAuthed(e.status === 401 ? false : true); }
  }, []);
  useEffect(() => { check(); }, [check]);

  if (authed === null) return <div className="radmin radmin-loading">Checking session…</div>;
  if (!authed) return <div className="radmin"><LoginGate onLogin={() => setAuthed(true)} /></div>;

  return (
    <div className="radmin">
      <header className="radmin-top">
        <div className="radmin-brand">
          <span className="radmin-omega">Ω</span>
          <div>
            <div className="radmin-title">Operator Control Room</div>
            <div className="radmin-sub">Morrison Runtime Governance</div>
          </div>
        </div>
        <nav className="radmin-tabs">
          {(["overview", "customers", "onboard", "readiness", "alerts", "audit"] as Tab[]).map((t) => (
            <button key={t} className={`radmin-tab${tab === t ? " is-active" : ""}`} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
          <a className="radmin-tab" href="/admin/operations">Operations</a>
          <button className="radmin-logout" onClick={async () => { await api("logout", { method: "POST" }); setAuthed(false); }}>
            Sign out
          </button>
        </nav>
      </header>

      <main className="radmin-main">
        {tab === "overview" && <OverviewPanel onOpenCustomers={() => setTab("customers")} />}
        {tab === "customers" && <CustomersPanel />}
        {tab === "onboard" && <OnboardPanel onDone={() => setTab("customers")} />}
        {tab === "readiness" && <ReadinessPanel />}
        {tab === "alerts" && <AlertsPanel />}
        {tab === "audit" && <AuditPanel />}
      </main>
    </div>
  );
}

// ── Login ────────────────────────────────────────────────────────────────────
function LoginGate({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { await api("login", { method: "POST", body: JSON.stringify({ password }) }); onLogin(); }
    catch (e: any) { setErr(e.message || "login failed"); } finally { setBusy(false); }
  };
  return (
    <form className="radmin-login" onSubmit={submit}>
      <span className="radmin-omega lg">Ω</span>
      <h1>Operator sign in</h1>
      <p>Runtime Governance control room</p>
      <input type="password" placeholder="Operator password" value={password}
        onChange={(e) => setPassword(e.target.value)} autoFocus />
      {err && <div className="radmin-err">{err}</div>}
      <button className="radmin-btn primary" disabled={busy || !password}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}

// ── Onboard ──────────────────────────────────────────────────────────────────
function OnboardPanel({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState(""); const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [result, setResult] = useState<any>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(""); setBusy(true); setResult(null);
    try { setResult(await api("onboard", { method: "POST", body: JSON.stringify({ name, slug: slug || undefined }) })); }
    catch (e: any) { setErr(e.message || "onboarding failed"); } finally { setBusy(false); }
  };
  if (result) {
    return (
      <section className="radmin-card">
        <h2>✅ {result.org?.name} onboarded</h2>
        <p className="radmin-muted">Production + staging environments created (both in shadow mode).</p>
        <KeyReveal label="Ingest key (shown once — send to the customer)" value={result.ingest_key} warning={result.warning} />
        <div className="radmin-kv">
          <div><span>Org id</span><code>{result.org?.id}</code></div>
          <div><span>Production env</span><code>{result.production?.id}</code></div>
        </div>
        <div className="radmin-row">
          <button className="radmin-btn primary" onClick={onDone}>Go to customers</button>
          <button className="radmin-btn" onClick={() => { setResult(null); setName(""); setSlug(""); }}>Onboard another</button>
        </div>
      </section>
    );
  }
  return (
    <section className="radmin-card">
      <h2>Onboard a customer</h2>
      <p className="radmin-muted">Provisions the org, production + staging environments, and a production ingest key.</p>
      <form className="radmin-form" onSubmit={submit}>
        <label>Company name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Corp" required /></label>
        <label>Slug <span className="radmin-muted">(optional)</span><input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="acme-corp" /></label>
        {err && <div className="radmin-err">{err}</div>}
        <button className="radmin-btn primary" disabled={busy || !name}>{busy ? "Creating…" : "Create"}</button>
      </form>
    </section>
  );
}

// ── Overview (operator dashboard) ────────────────────────────────────────────
function OverviewPanel({ onOpenCustomers }: { onOpenCustomers: () => void }) {
  const [data, setData] = useState<any>(null); const [err, setErr] = useState("");
  // cache: "no-store" + the route's no-store header ⇒ Refresh always re-reads live.
  const load = useCallback(async () => { setErr(""); try { setData(await api("overview", { cache: "no-store" })); } catch (e: any) { setErr(e.message); } }, []);
  useEffect(() => { load(); }, [load]);
  if (err) return <div className="radmin-err">{err}</div>;
  if (!data) return <div className="radmin-muted">Loading overview…</div>;
  const p = data.platform || {};
  const ae = p.audit_evidence;
  // These cards read LIVE runtime decisions (rg_decisions) — NOT audit replays.
  const kpis: Array<[string, any, string?]> = [
    ["Customers", p.customers ?? 0],
    ["Environments", p.environments ?? 0],
    ["Production active", p.production_active ?? 0],
    ["Enforce", p.enforce ?? 0, "ok"],
    ["Shadow", p.shadow ?? 0],
    ["Live runtime evaluations", Number(p.evaluations ?? 0).toLocaleString()],
    ["Live catastrophic actions prevented", p.blocked ?? 0, "omega"],
    ["Live avg latency", p.avg_latency_ms != null ? `${p.avg_latency_ms}ms` : "—"],
    ["Reports generated", p.reports ?? 0],
    ["Published audit packs", p.audit_packs ?? 0],
    ["Active alerts (24h)", p.active_alerts ?? 0, p.active_alerts > 0 ? "warn" : undefined],
    ["Engine", p.engine_reachable ? "reachable" : "down", p.engine_reachable ? "ok" : "omega"],
  ];
  const auditKpis: Array<[string, any, string?]> = ae ? [
    ["Assessed trajectories", ae.trajectories ?? 0],
    ["Evaluations incl. replay", ae.evaluations_incl_replay ?? 0],
    ["Blocked", ae.blocked ?? 0, "omega"],
    ["Escalated", ae.escalated ?? 0, ae.escalated > 0 ? "warn" : undefined],
    ["Deterministic replay", ae.replay || "—", ae.replay_deterministic ? "ok" : undefined],
  ] : [];
  return (
    <>
      <section className="radmin-card">
        <div className="radmin-row" style={{ margin: "0 0 6px" }}>
          <h2>Platform overview <span className="radmin-muted" style={{ fontSize: 12, fontWeight: 400 }}>· live runtime traffic</span></h2>
          <span className="radmin-lasteval">Last live runtime decision {ago(p.last_activity)}</span>
          <span style={{ flex: 1 }} />
          <button className="radmin-btn sm" onClick={load}>Refresh</button>
        </div>
        <div className="radmin-kpis">
          {kpis.map(([label, val, tone], i) => (
            <div key={i} className={`radmin-kpi${tone ? " " + tone : ""}`}><div className="radmin-kpi-v">{val}</div><div className="radmin-kpi-l">{label}</div></div>
          ))}
        </div>
        {p.engine_commit && <div className="radmin-muted" style={{ marginTop: 12 }}>Runtime engine commit <code>{p.engine_commit}</code></div>}
        <div className="radmin-row"><button className="radmin-btn" onClick={onOpenCustomers}>View customers →</button></div>
      </section>
      {ae && (
        <section className="radmin-card">
          <div className="radmin-row" style={{ margin: "0 0 6px" }}>
            <h2>Audit evidence <span className="radmin-muted" style={{ fontSize: 12, fontWeight: 400 }}>· latest published pack</span></h2>
            <span className="radmin-lasteval">Generated {ago(ae.generated_at)}</span>
          </div>
          <div className="radmin-muted" style={{ margin: "0 0 8px", fontSize: 12 }}>
            From the latest audit pack’s run-summary{ae.source ? ` (${ae.source})` : ""}. Kept separate from live runtime telemetry above — replayed audit trajectories are never counted as production evaluations.
          </div>
          <div className="radmin-kpis">
            {auditKpis.map(([label, val, tone], i) => (
              <div key={i} className={`radmin-kpi${tone ? " " + tone : ""}`}><div className="radmin-kpi-v">{val}</div><div className="radmin-kpi-l">{label}</div></div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// ── Customer summary badges ──────────────────────────────────────────────────
function ago(iso?: string | null) {
  if (!iso) return "—";
  const d = Date.now() - Date.parse(iso);
  if (isNaN(d)) return "—";
  const m = Math.floor(d / 60000), h = Math.floor(d / 3600000), day = Math.floor(d / 86400000);
  if (day > 0) return `${day}d ago`; if (h > 0) return `${h}h ago`; if (m > 0) return `${m}m ago`; return "just now";
}
function CustomerBadges({ b }: { b: any }) {
  if (!b) return null;
  return (
    <div className="radmin-badges">
      {b.enterprise_ready && <span className="radmin-badge ok">Enterprise Ready</span>}
      {(b.modes || []).map((m: string, i: number) => <span key={i} className={`radmin-badge${m === "enforce" ? " accent" : ""}`}>{m === "enforce" ? "Enforce" : "Shadow"}</span>)}
      <span className="radmin-badge ghost">Evals {Number(b.evaluations ?? 0).toLocaleString()}</span>
      {b.blocked > 0 && <span className="radmin-badge omega">Blocked {b.blocked}</span>}
      <span className="radmin-badge ghost">Activity {ago(b.last_activity)}</span>
      <span className="radmin-badge ghost">Report {ago(b.last_report)}</span>
      <span className="radmin-badge ghost">Pack {ago(b.last_audit_pack)}</span>
      {b.last_alert && <span className="radmin-badge warn">Alert {ago(b.last_alert)}</span>}
      {b.runtime_version && <span className="radmin-badge ghost">Runtime {String(b.runtime_version).slice(0, 10)}</span>}
    </div>
  );
}

// Per-customer Evidence Hub — one durable, credential-free, revocable link that
// aggregates all of the customer's evidence. Operator-only management here; the
// hub page itself is served credential-free at /evidence/hub/<token>.
function EvidenceHubControl({ org }: { org: any }) {
  const [hub, setHub] = useState<any>(null); const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false); const [emailTo, setEmailTo] = useState(""); const [note, setNote] = useState("");
  const load = useCallback(async () => {
    try { const d = await api(`hub?org_id=${encodeURIComponent(org.id)}`); setHub(d.hub); } catch { /* ignore */ } finally { setLoaded(true); }
  }, [org.id]);
  useEffect(() => { load(); }, [load]);
  const post = async (opts: { rotate?: boolean; email?: string } = {}) => {
    setBusy(true); setNote("");
    try {
      const d = await api("hub", { method: "POST", body: JSON.stringify({ org_id: org.id, ...opts }) });
      setHub((h: any) => ({ token: d.token, path: d.path, url: d.url, created_at: h?.created_at, accessed: h?.accessed || 0 }));
      if (opts.email) setNote(d.emailed_to ? `✓ Sent to ${d.emailed_to}` : d.email_error ? `✗ ${d.email_error}` : "");
      else if (opts.rotate) setNote("Link rotated — the previous link is revoked.");
    } catch (e: any) { setNote(`✗ ${e.message}`); } finally { setBusy(false); }
  };
  const revoke = async () => {
    if (!hub?.token || !window.confirm("Revoke this customer's Evidence Hub link? Their bookmarked URL will stop working.")) return;
    setBusy(true); setNote("");
    try { await api("hub", { method: "POST", body: JSON.stringify({ revoke: hub.token }) }); setHub(null); setNote("Link revoked."); }
    catch (e: any) { setNote(`✗ ${e.message}`); } finally { setBusy(false); }
  };
  if (!loaded) return null;
  return (
    <div className="radmin-hub" style={{ margin: "12px 0 6px", padding: "12px 14px", border: "1px solid var(--line-2)", borderRadius: "var(--radius-sm, 9px)", background: "var(--bg-1, #0b0d10)" }}>
      <div className="radmin-row" style={{ margin: "0 0 6px" }}>
        <span className="radmin-pill">Evidence Hub</span>
        <span className="radmin-muted" style={{ fontSize: 11 }}>
          {hub ? `Durable customer link${hub.accessed ? ` · opened ${hub.accessed}×` : ""}` : "One durable, credential-free link aggregating all this customer's evidence."}
        </span>
      </div>
      {hub ? (
        <>
          <KeyReveal label="Customer Evidence Hub — bookmark-able, revocable" value={hub.url} />
          <div className="radmin-row" style={{ margin: "8px 0 0", gap: 8 }}>
            <input className="radmin-select" style={{ flex: 1, minWidth: 200 }} type="email" placeholder="Email hub link to customer (optional)" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} />
            <button className="radmin-btn sm" disabled={busy || !emailTo.trim()} onClick={() => post({ email: emailTo.trim() })}>{busy ? "…" : "Send to customer"}</button>
            <button className="radmin-btn sm" disabled={busy} onClick={() => post({ rotate: true })}>Rotate</button>
            <button className="radmin-btn sm" disabled={busy} onClick={revoke}>Revoke</button>
          </div>
        </>
      ) : (
        <button className="radmin-btn sm primary" disabled={busy} onClick={() => post()}>{busy ? "…" : "Create Evidence Hub link"}</button>
      )}
      {note && <div className="radmin-muted" style={{ fontSize: 11, marginTop: 4 }}>{note}</div>}
    </div>
  );
}

// ── Engagement management (operator CRM — Control Room only) ──────────────────
const CADENCE_OPTS = ["weekly", "biweekly", "monthly", "quarterly", "ad_hoc"];
const ENGAGEMENT_STAGES = [
  ["prospect", "Prospect"],
  ["audit", "48-Hour Audit"],
  ["enterprise_assessment", "Enterprise Assessment"],
  ["limited_pilot", "Limited Pilot"],
  ["enterprise_integration", "Enterprise Integration"],
  ["managed_service", "Managed Service"],
] as const;
function EngagementControl({ org, onChange }: { org: any; onChange?: () => void }) {
  const [eng, setEng] = useState<any>(null);
  const [busy, setBusy] = useState(false); const [note, setNote] = useState("");
  const [open, setOpenState] = useState(false);
  const [cName, setCName] = useState(""); const [cEmail, setCEmail] = useState(""); const [cRole, setCRole] = useState("");
  const [noteText, setNoteText] = useState("");
  const load = useCallback(async () => {
    try { const d = await api(`engagement?org_id=${encodeURIComponent(org.id)}`); setEng(d.engagement); }
    catch (e: any) { setNote(`✗ ${e.message}`); }
  }, [org.id]);
  useEffect(() => { load(); }, [load]);
  const save = async (patch: any) => {
    setBusy(true); setNote("");
    try { const d = await api("engagement", { method: "POST", body: JSON.stringify({ org_id: org.id, ...patch }) }); setEng(d.engagement); setNote("✓ Saved"); if (patch.stage) onChange?.(); }
    catch (e: any) { setNote(`✗ ${e.message}`); } finally { setBusy(false); }
  };
  const addContact = async () => {
    if (!cName.trim() && !cEmail.trim()) return;
    await save({ add_contact: { name: cName.trim(), email: cEmail.trim(), role: cRole.trim() } });
    setCName(""); setCEmail(""); setCRole("");
  };
  const addNote = async () => { if (!noteText.trim()) return; await save({ note: noteText.trim() }); setNoteText(""); };
  if (!eng) return null;
  const dueSoon = eng.next_review_date && eng.next_review_date <= new Date().toISOString().slice(0, 10);
  return (
    <div className="radmin-hub" style={{ margin: "6px 0", padding: "12px 14px", border: "1px solid var(--line-2)", borderRadius: "var(--radius-sm, 9px)", background: "var(--bg-1, #0b0d10)" }}>
      <div className="radmin-row" style={{ margin: "0 0 6px", justifyContent: "space-between" }}>
        <span>
          <span className="radmin-pill">Engagement</span>
          <span className="radmin-muted" style={{ fontSize: 11, marginLeft: 8 }}>
            {eng.next_review_date ? <>Next review {eng.next_review_date}{dueSoon ? " · due" : ""}</> : "No review scheduled"} · {eng.cadence}
          </span>
        </span>
        <button className="radmin-btn sm" onClick={() => setOpenState((o) => !o)}>{open ? "Close" : "Manage"}</button>
      </div>
      <div>
        <div className="radmin-muted" style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 5 }}>Set company stage</div>
        <div className="radmin-row" style={{ gap: 6, flexWrap: "wrap" }}>
          {ENGAGEMENT_STAGES.map(([key, label]) => (
            <button key={key} className={`radmin-btn sm${eng.stage === key ? " primary" : ""}`} disabled={busy || eng.stage === key} onClick={() => save({ stage: key })}>{label}</button>
          ))}
        </div>
      </div>
      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="radmin-row" style={{ gap: 8, flexWrap: "wrap" }}>
            <label className="radmin-muted" style={{ fontSize: 11 }}>Next review
              <input className="radmin-select" type="date" defaultValue={eng.next_review_date || ""} disabled={busy}
                onBlur={(e) => e.target.value !== (eng.next_review_date || "") && save({ next_review_date: e.target.value })} style={{ marginLeft: 6 }} />
            </label>
            <label className="radmin-muted" style={{ fontSize: 11 }}>Cadence
              <select className="radmin-select" value={eng.cadence} disabled={busy} onChange={(e) => save({ cadence: e.target.value })} style={{ marginLeft: 6, maxWidth: 130 }}>
                {CADENCE_OPTS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <input className="radmin-select" placeholder="Delivery schedule (e.g. monthly executive report + weekly summary)" defaultValue={eng.delivery_schedule || ""} disabled={busy}
            onBlur={(e) => e.target.value !== (eng.delivery_schedule || "") && save({ delivery_schedule: e.target.value })} />

          {/* Contacts */}
          <div>
            <div className="radmin-muted" style={{ fontSize: 11, marginBottom: 4 }}>Contacts</div>
            {(eng.contacts || []).length ? (
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 6px", display: "flex", flexDirection: "column", gap: 4 }}>
                {eng.contacts.map((c: any) => (
                  <li key={c.id} className="radmin-row" style={{ gap: 8, fontSize: 12, alignItems: "center" }}>
                    <span>{c.name || "—"}{c.role ? ` · ${c.role}` : ""}{c.email ? ` · ${c.email}` : ""}</span>
                    <button className="radmin-btn sm" style={{ marginLeft: "auto" }} disabled={busy} onClick={() => save({ remove_contact: c.id })}>Remove</button>
                  </li>
                ))}
              </ul>
            ) : <div className="radmin-muted" style={{ fontSize: 11, marginBottom: 6 }}>No contacts yet.</div>}
            <div className="radmin-row" style={{ gap: 6, flexWrap: "wrap" }}>
              <input className="radmin-select" placeholder="Name" value={cName} onChange={(e) => setCName(e.target.value)} style={{ maxWidth: 130 }} />
              <input className="radmin-select" placeholder="Email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} style={{ maxWidth: 170 }} />
              <input className="radmin-select" placeholder="Role" value={cRole} onChange={(e) => setCRole(e.target.value)} style={{ maxWidth: 120 }} />
              <button className="radmin-btn sm" disabled={busy || (!cName.trim() && !cEmail.trim())} onClick={addContact}>Add contact</button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <div className="radmin-muted" style={{ fontSize: 11, marginBottom: 4 }}>Notes</div>
            <div className="radmin-row" style={{ gap: 6 }}>
              <input className="radmin-select" placeholder="Add a note (meeting summary, action item…)" value={noteText} onChange={(e) => setNoteText(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
              <button className="radmin-btn sm" disabled={busy || !noteText.trim()} onClick={addNote}>Add note</button>
            </div>
            {(eng.notes || []).length > 0 && (
              <ul style={{ listStyle: "none", padding: 0, margin: "6px 0 0", display: "flex", flexDirection: "column", gap: 4 }}>
                {eng.notes.slice(0, 6).map((n: any) => (
                  <li key={n.id} style={{ fontSize: 12 }}><span className="radmin-muted" style={{ fontSize: 10 }}>{String(n.at).slice(0, 10)}</span> · {n.text}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {note && <div className="radmin-muted" style={{ fontSize: 11, marginTop: 4 }}>{note}</div>}
    </div>
  );
}

// ── Recommendations tracker (operator-managed, customer-visible) ──────────────
const REC_STATUS: { key: string; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved", label: "Resolved" },
];
const REC_SEV = ["low", "medium", "high", "critical"];
const SEV_HUE: Record<string, string> = { critical: "#e5484d", high: "#e5893f", medium: "#c9a227", low: "#6b7480" };
function RecommendationsControl({ org }: { org: any }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [busy, setBusy] = useState(false); const [note, setNote] = useState("");
  const [title, setTitle] = useState(""); const [detail, setDetail] = useState(""); const [severity, setSeverity] = useState("medium");
  const [adding, setAdding] = useState(false);
  const load = useCallback(async () => {
    try { const d = await api(`recommendations?org_id=${encodeURIComponent(org.id)}`); setItems(d.recommendations || []); setSummary(d.summary || null); }
    catch (e: any) { setNote(`✗ ${e.message}`); }
  }, [org.id]);
  useEffect(() => { load(); }, [load]);
  const create = async () => {
    if (!title.trim()) return;
    setBusy(true); setNote("");
    try { await api("recommendations", { method: "POST", body: JSON.stringify({ org_id: org.id, title: title.trim(), detail: detail.trim(), severity }) });
      setTitle(""); setDetail(""); setSeverity("medium"); setAdding(false); await load(); }
    catch (e: any) { setNote(`✗ ${e.message}`); } finally { setBusy(false); }
  };
  const setStatus = async (id: string, status: string) => {
    setBusy(true); setNote("");
    try { await api("recommendations", { method: "POST", body: JSON.stringify({ id, status }) }); await load(); }
    catch (e: any) { setNote(`✗ ${e.message}`); } finally { setBusy(false); }
  };
  if (!items) return null;
  return (
    <div className="radmin-hub" style={{ margin: "6px 0", padding: "12px 14px", border: "1px solid var(--line-2)", borderRadius: "var(--radius-sm, 9px)", background: "var(--bg-1, #0b0d10)" }}>
      <div className="radmin-row" style={{ margin: "0 0 6px", justifyContent: "space-between" }}>
        <span><span className="radmin-pill">Recommendations</span>{summary ? <span className="radmin-muted" style={{ fontSize: 11, marginLeft: 8 }}>{summary.open} open · {summary.total} total</span> : null}</span>
        <button className="radmin-btn sm" disabled={busy} onClick={() => setAdding((a) => !a)}>{adding ? "Cancel" : "Add"}</button>
      </div>
      {adding && (
        <div style={{ margin: "6px 0 10px", display: "flex", flexDirection: "column", gap: 6 }}>
          <input className="radmin-select" placeholder="Recommendation title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="radmin-select" placeholder="Detail (optional)" value={detail} onChange={(e) => setDetail(e.target.value)} rows={2} style={{ resize: "vertical" }} />
          <div className="radmin-row" style={{ gap: 8 }}>
            <select className="radmin-select" value={severity} onChange={(e) => setSeverity(e.target.value)} style={{ maxWidth: 140 }}>
              {REC_SEV.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="radmin-btn sm primary" disabled={busy || !title.trim()} onClick={create}>{busy ? "…" : "Create"}</button>
          </div>
        </div>
      )}
      {!items.length ? (
        <div className="radmin-muted" style={{ fontSize: 11 }}>No recommendations yet. These appear in the customer&rsquo;s Evidence Hub and reports.</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((r) => (
            <li key={r.id} style={{ padding: "8px 10px", border: "1px solid var(--line-2)", borderRadius: 8, opacity: r.status === "resolved" ? 0.55 : 1 }}>
              <div className="radmin-row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: SEV_HUE[r.severity] || "#6b7480", flex: "0 0 8px" }} />
                <span style={{ fontSize: 13, textDecoration: r.status === "resolved" ? "line-through" : "none" }}>{r.title}</span>
                <select className="radmin-select" value={r.status} disabled={busy} onChange={(e) => setStatus(r.id, e.target.value)} style={{ marginLeft: "auto", maxWidth: 150, fontSize: 11 }}>
                  {REC_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              {r.detail && <div className="radmin-muted" style={{ fontSize: 11, marginTop: 4, paddingLeft: 16 }}>{r.detail}</div>}
            </li>
          ))}
        </ul>
      )}
      {note && <div className="radmin-muted" style={{ fontSize: 11, marginTop: 4 }}>{note}</div>}
    </div>
  );
}

// ── Customer notifications (opt-in, per-org, managed service) ─────────────────
const NOTIFY_EVENTS: { key: string; label: string }[] = [
  { key: "new_evidence", label: "New evidence available" },
  { key: "executive_report", label: "Executive report generated" },
  { key: "weekly_summary", label: "Weekly Runtime Governance summary" },
  { key: "significant_event", label: "Significant governance event" },
];
function CustomerNotifyControl({ org }: { org: any }) {
  const [prefs, setPrefs] = useState<any>(null); const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false); const [note, setNote] = useState("");
  const [recips, setRecips] = useState(""); const [sig, setSig] = useState("");
  const load = useCallback(async () => {
    try { const d = await api(`notify?org_id=${encodeURIComponent(org.id)}`); setPrefs(d.prefs); setRecips((d.prefs?.recipients || []).join(", ")); }
    catch { /* ignore */ } finally { setLoaded(true); }
  }, [org.id]);
  useEffect(() => { load(); }, [load]);
  const save = async (patch: any) => {
    setBusy(true); setNote("");
    try {
      const d = await api("notify", { method: "POST", body: JSON.stringify({ org_id: org.id, ...patch }) });
      if (d.prefs) { setPrefs(d.prefs); setRecips((d.prefs.recipients || []).join(", ")); setNote("✓ Saved"); }
    } catch (e: any) { setNote(`✗ ${e.message}`); } finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true); setNote("");
    try { await api("notify", { method: "POST", body: JSON.stringify({ org_id: org.id, test: true }) }); setNote("✓ Test sent"); }
    catch (e: any) { setNote(`✗ ${e.message}`); } finally { setBusy(false); }
  };
  const sendSig = async () => {
    if (!sig.trim()) return;
    setBusy(true); setNote("");
    try { const d = await api("notify", { method: "POST", body: JSON.stringify({ org_id: org.id, significant_event: true, message: sig.trim() }) });
      setNote(d.sent ? "✓ Alert sent to customer" : d.skipped ? `Not sent — ${d.skipped}` : "Sent"); setSig(""); }
    catch (e: any) { setNote(`✗ ${e.message}`); } finally { setBusy(false); }
  };
  if (!loaded) return null;
  const ev = prefs?.events || {};
  const enabled = !!prefs?.enabled;
  return (
    <div className="radmin-hub" style={{ margin: "6px 0", padding: "12px 14px", border: "1px solid var(--line-2)", borderRadius: "var(--radius-sm, 9px)", background: "var(--bg-1, #0b0d10)" }}>
      <div className="radmin-row" style={{ margin: "0 0 6px", justifyContent: "space-between" }}>
        <span><span className="radmin-pill">Customer alerts</span> <span className={`radmin-badge${enabled ? " ok" : ""}`} style={{ marginLeft: 6 }}>{enabled ? "On" : "Off"}</span></span>
        <button className="radmin-btn sm" disabled={busy} onClick={() => save({ enabled: !enabled })}>{enabled ? "Disable" : "Enable"}</button>
      </div>
      <span className="radmin-muted" style={{ fontSize: 11 }}>Opt-in email updates to the customer&rsquo;s contacts. No customer login — every alert links to their Evidence Hub.</span>
      <div className="radmin-row" style={{ margin: "8px 0 0", gap: 8 }}>
        <input className="radmin-select" style={{ flex: 1, minWidth: 200 }} placeholder="Recipient emails (comma-separated)" value={recips} onChange={(e) => setRecips(e.target.value)} />
        <button className="radmin-btn sm" disabled={busy} onClick={() => save({ recipients: recips })}>Save recipients</button>
        <button className="radmin-btn sm" disabled={busy || !(prefs?.recipients || []).length} onClick={test}>Send test</button>
      </div>
      <div className="radmin-row" style={{ margin: "8px 0 0", gap: 12, flexWrap: "wrap" }}>
        {NOTIFY_EVENTS.map((e) => (
          <label key={e.key} className="radmin-muted" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
            <input type="checkbox" checked={ev[e.key] !== false} disabled={busy} onChange={(ce) => save({ events: { [e.key]: ce.target.checked } })} />
            {e.label}
          </label>
        ))}
      </div>
      <div className="radmin-row" style={{ margin: "8px 0 0", gap: 8 }}>
        <input className="radmin-select" style={{ flex: 1, minWidth: 200 }} placeholder="Significant event message (sent now)" value={sig} onChange={(e) => setSig(e.target.value)} />
        <button className="radmin-btn sm" disabled={busy || !sig.trim()} onClick={sendSig}>Send event</button>
      </div>
      {note && <div className="radmin-muted" style={{ fontSize: 11, marginTop: 4 }}>{note}</div>}
    </div>
  );
}

// ── Customers (list + badges + per-environment control) ──────────────────────
function CustomersPanel() {
  const [orgs, setOrgs] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const [refresh, setRefresh] = useState(0);
  const load = useCallback(async () => {
    setErr("");
    try { const d = await api("overview"); setOrgs(d.customers || []); setRefresh((n) => n + 1); }
    catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (err) return <div className="radmin-err">{err}</div>;
  if (!orgs) return <div className="radmin-muted">Loading customers…</div>;
  if (!orgs.length) return <div className="radmin-empty">No customers yet. Use the <b>Onboard</b> tab to create the first.</div>;

  // Collapse cards by default once the list grows, so operators can scan many
  // customers at a glance and expand the one they need.
  const collapsible = orgs.length > 3;
  return (
    <div className="radmin-orgs">
      {orgs.map((o) => <CustomerCard key={o.id} o={o} onChange={load} defaultOpen={!collapsible} />)}
      <ArchivedSection refreshToken={refresh} onRestore={load} />
    </div>
  );
}

// ── Customer lifecycle (computed from live data — operator guidance) ──────────
const PRE_TELEMETRY_STEPS = ["Send first event", "Governance evaluates", "Evidence generated", "Audit available"];
function LifecyclePanel({ lc }: { lc: any }) {
  if (!lc) return null;
  const stages: any[] = lc.stages || [];
  const firstIncomplete = stages.findIndex((s) => !s.done);
  return (
    <div className="radmin-hub" style={{ margin: "6px 0", padding: "12px 14px", border: "1px solid var(--line-2)", borderRadius: "var(--radius-sm, 9px)", background: "var(--bg-1, #0b0d10)" }}>
      <div className="radmin-row" style={{ margin: "0 0 8px", justifyContent: "space-between" }}>
        <span><span className="radmin-pill">Customer status</span> <span className="radmin-muted" style={{ fontSize: 11, marginLeft: 6 }}>{lc.state} · {lc.done_count}/{lc.total_stages}</span></span>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
        {stages.map((s, i) => (
          <li key={s.key} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, color: s.done ? "var(--ok, #3fb27f)" : i === firstIncomplete ? "var(--ink, #f3f5f7)" : "var(--ink3, #6b7480)" }}>
            <span style={{ fontSize: 12 }}>{s.done ? "✓" : "○"}</span>
            <span style={{ fontWeight: i === firstIncomplete ? 600 : 400 }}>{s.label}</span>
          </li>
        ))}
      </ul>
      {/* Next operator action — always the first incomplete stage */}
      {lc.next_action && (
        <div style={{ marginTop: 10, padding: "9px 11px", borderRadius: 8, border: "1px solid rgba(76,125,255,.45)", background: "rgba(76,125,255,.10)" }}>
          <div className="radmin-muted" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 3 }}>Next operator action</div>
          <div style={{ fontSize: 13, color: "var(--ink, #f3f5f7)" }}>{lc.next_action.label}</div>
          {lc.next_action.detail && <div className="radmin-muted" style={{ fontSize: 11, marginTop: 2 }}>{lc.next_action.detail}</div>}
        </div>
      )}
      {/* For new organisations, show what happens next */}
      {lc.pre_telemetry && (
        <div style={{ marginTop: 10 }}>
          <div className="radmin-muted" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 4 }}>Next steps</div>
          <ol style={{ margin: 0, paddingLeft: 18, color: "var(--ink3, #6b7480)", fontSize: 12, lineHeight: 1.6 }}>
            {PRE_TELEMETRY_STEPS.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </div>
      )}
    </div>
  );
}

function CustomerCard({ o, onChange, defaultOpen }: { o: any; onChange: () => void; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const b = o.badges || {};
  const lc = o.lifecycle;
  return (
    <section className="radmin-card">
      <button className="radmin-cust-head" onClick={() => setOpen(!open)}>
        <span className="radmin-cust-left">
          <span className={`radmin-chev${open ? " open" : ""}`}>▸</span>
          <span className="radmin-cust-name">{o.name}</span>
          {lc?.signals?.engagement_stage_label && <span className="radmin-badge accent">{lc.signals.engagement_stage_label}</span>}
          {b.enterprise_ready && <span className="radmin-badge ok">Enterprise Ready</span>}
          {(b.modes || []).map((m: string, i: number) => <span key={i} className={`radmin-badge${m === "enforce" ? " accent" : ""}`}>{m === "enforce" ? "Enforce" : "Shadow"}</span>)}
        </span>
        <span className="radmin-cust-right">
          <MiniSpark points={b.spark} />
          {lc?.state && <span className="radmin-badge" title={lc.next_action?.label || ""}>{lc.state}</span>}
          <span className="radmin-muted radmin-cust-evals">{Number(b.evaluations ?? 0).toLocaleString()} evals</span>
          {b.blocked > 0 && <span className="radmin-badge omega">{b.blocked} blocked</span>}
          <span className={`radmin-pill ${o.status === "active" ? "ok" : ""}`}>{o.plan || "pilot"}</span>
        </span>
      </button>
      {open && (
        <div className="radmin-cust-body">
          <code className="radmin-muted">{o.id}</code>
          <EngagementControl org={o} onChange={onChange} />
          <LifecyclePanel lc={lc} />
          <CustomerBadges b={o.badges} />
          <EvidenceHubControl org={o} />
          <RecommendationsControl org={o} />
          <CustomerNotifyControl org={o} />
          {(o.environments || []).map((e: any) => (
            <EnvRow key={e.id} org={o} env={e} onChange={onChange} />
          ))}
          <ArchiveControl org={o} onChange={onChange} />
        </div>
      )}
    </section>
  );
}

// Operator-only: archive (pause) a customer. Preserves all evidence; reversible.
function ArchiveControl({ org, onChange }: { org: any; onChange: () => void }) {
  const [busy, setBusy] = useState(false); const [note, setNote] = useState("");
  const archive = async () => {
    if (!window.confirm(`Archive ${org.name}?\n\nThe customer is removed from the active list, ingest credentials are disabled and notifications stop. All evidence, reports, packs, recommendations and engagement history are preserved. You can restore later.`)) return;
    setBusy(true); setNote("");
    try {
      const d = await api("archive", { method: "POST", body: JSON.stringify({ org_id: org.id, action: "archive" }) });
      if (d.error) setNote(`✗ ${d.error}`); else onChange();
    } catch (e: any) { setNote(`✗ ${e.message}`); } finally { setBusy(false); }
  };
  return (
    <div className="radmin-row" style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--line-2)", justifyContent: "flex-end", gap: 8 }}>
      {note && <span className="radmin-muted" style={{ fontSize: 11 }}>{note}</span>}
      <button className="radmin-btn sm" disabled={busy} onClick={archive} title="Pause this customer — reversible; preserves all evidence">
        {busy ? "…" : "Archive customer"}
      </button>
    </div>
  );
}

// Operator-only: PERMANENT deletion of a (test) organisation. Two gates — a
// dependency preview and typing the exact org name/slug — then fail-closed delete.
function DeleteControl({ org, onDeleted }: { org: any; onDeleted: () => void }) {
  const [stage, setStage] = useState<"idle" | "preview">("idle");
  const [preview, setPreview] = useState<any>(null);
  const [typed, setTyped] = useState(""); const [busy, setBusy] = useState(false); const [note, setNote] = useState("");
  const openPreview = async () => {
    setBusy(true); setNote(""); setTyped("");
    try { const d = await api(`delete-customer?org_id=${encodeURIComponent(org.id)}`); setPreview(d.preview); setStage("preview"); }
    catch (e: any) { setNote(`✗ ${e.message}`); } finally { setBusy(false); }
  };
  const matches = typed.trim() === org.name || (org.slug && typed.trim() === org.slug);
  const doDelete = async () => {
    if (!matches) return;
    setBusy(true); setNote("");
    try {
      const d = await api("delete-customer", { method: "POST", body: JSON.stringify({ org_id: org.id, confirm: typed.trim() }) });
      if (d.error) setNote(`✗ ${d.error}${d.failed_step ? ` (at ${d.failed_step})` : ""}`);
      else onDeleted();
    } catch (e: any) { setNote(`✗ ${e.message}`); } finally { setBusy(false); }
  };
  if (stage === "idle") {
    return (
      <div className="radmin-row" style={{ marginTop: 8, justifyContent: "flex-end", gap: 8 }}>
        {note && <span className="radmin-muted" style={{ fontSize: 11 }}>{note}</span>}
        <button className="radmin-btn sm" disabled={busy} onClick={openPreview} style={{ borderColor: "rgba(229,72,77,.5)", color: "#e5484d" }}>Delete permanently</button>
      </div>
    );
  }
  const c = preview?.counts || {};
  const rows: [string, number][] = [
    ["Environments", c.environments], ["Credentials", c.api_keys], ["Evaluations", c.decisions],
    ["Reports", c.reports], ["Audit packs", c.audit_packs], ["Deliverables", c.deliverables],
    ["Secure shares", c.shares], ["Evidence Hub", c.hubs], ["Recommendations", c.recommendations],
    ["Engagements", c.engagements],
  ];
  return (
    <div style={{ marginTop: 10, padding: "12px 14px", border: "1px solid rgba(229,72,77,.5)", borderRadius: 9, background: "rgba(229,72,77,.06)" }}>
      <div style={{ color: "#e5484d", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Permanent deletion — irreversible</div>
      <div className="radmin-muted" style={{ fontSize: 11, marginBottom: 8 }}>
        This deletes {preview?.total_records ?? 0} organisation-scoped records. The operator audit trail ({preview?.preserved?.operator_audit_entries ?? 0} entries) is preserved.
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 10px", display: "flex", flexWrap: "wrap", gap: "2px 16px" }}>
        {rows.map(([k, v]) => <li key={k} className="radmin-muted" style={{ fontSize: 11 }}>{k}: <span style={{ color: "var(--ink2, #aab2bd)" }}>{v ?? 0}</span></li>)}
      </ul>
      <div className="radmin-muted" style={{ fontSize: 11, marginBottom: 4 }}>Type <b style={{ color: "var(--ink, #f3f5f7)" }}>{org.name}</b>{org.slug ? <> or <b style={{ color: "var(--ink, #f3f5f7)" }}>{org.slug}</b></> : null} to confirm:</div>
      <div className="radmin-row" style={{ gap: 8, flexWrap: "wrap" }}>
        <input className="radmin-select" style={{ flex: 1, minWidth: 200 }} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="exact organisation name or slug" autoFocus />
        <button className="radmin-btn sm" disabled={!matches || busy} onClick={doDelete} style={{ borderColor: "rgba(229,72,77,.6)", color: matches ? "#e5484d" : undefined }}>{busy ? "Deleting…" : "Delete permanently"}</button>
        <button className="radmin-btn sm" disabled={busy} onClick={() => { setStage("idle"); setNote(""); }}>Cancel</button>
      </div>
      {note && <div className="radmin-muted" style={{ fontSize: 11, marginTop: 6 }}>{note}</div>}
    </div>
  );
}

// Operator-only: archived customers, restorable. Hidden when none.
function ArchivedSection({ refreshToken, onRestore }: { refreshToken: number; onRestore: () => void }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    try { const d = await api("archive?archived=1"); setItems(d.archived || []); } catch { setItems([]); }
  }, []);
  useEffect(() => { load(); }, [load, refreshToken]);
  const restore = async (org: any) => {
    setBusy(org.id);
    try { await api("archive", { method: "POST", body: JSON.stringify({ org_id: org.id, action: "restore" }) }); await load(); onRestore(); }
    catch { /* ignore */ } finally { setBusy(""); }
  };
  if (!items || !items.length) return null;
  return (
    <div style={{ marginTop: 18 }}>
      <button className="radmin-btn sm" onClick={() => setOpen((o) => !o)}>
        {open ? "▾" : "▸"} Archived customers ({items.length})
      </button>
      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((a) => (
            <div key={a.id} style={{ padding: "10px 12px", border: "1px solid var(--line-2)", borderRadius: 9, background: "var(--bg-1, #0b0d10)" }}>
              <div className="radmin-row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <span>
                  <span style={{ color: "var(--ink, #f3f5f7)", fontSize: 13 }}>{a.name}</span>
                  <span className="radmin-muted" style={{ fontSize: 11, marginLeft: 8 }}>
                    archived {a.archived_at ? String(a.archived_at).slice(0, 10) : "—"} · preserved: {a.preserved.reports} reports · {a.preserved.audit_packs} packs · {a.preserved.recommendations} recs
                  </span>
                </span>
                <button className="radmin-btn sm primary" disabled={busy === a.id} onClick={() => restore(a)}>{busy === a.id ? "…" : "Restore"}</button>
              </div>
              <DeleteControl org={a} onDeleted={() => { load(); onRestore(); }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EnvRow({ org, env, onChange }: { org: any; env: any; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<null | "evidence" | "reports" | "audit" | "keys">(null);
  const [newKey, setNewKey] = useState("");
  const [newKeyWarn, setNewKeyWarn] = useState("");
  const enforce = env.mode === "enforce";

  const toggle = async () => {
    const to = enforce ? "shadow" : "enforce";
    if (to === "enforce" && !window.confirm(`Enable ENFORCEMENT on ${org.name} / ${env.kind}?\n\nUnsafe trajectories will start being BLOCKED on the next evaluate call.`)) return;
    setBusy(true);
    try { await api("set-mode", { method: "POST", body: JSON.stringify({ environment_id: env.id, mode: to }) }); onChange(); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const rotate = async () => {
    if (!window.confirm("Rotate the ingest key for this environment? The old key keeps working until you revoke it; a new key is issued now.")) return;
    setBusy(true);
    try { const d = await api("keys", { method: "POST", body: JSON.stringify({ org_id: org.id, environment_id: env.id, label: `${env.kind} ingest` }) }); setNewKey(d.key); setNewKeyWarn(d.warning || ""); setOpen("keys"); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  return (
    <div className={`radmin-env${enforce ? " enforcing" : ""}`}>
      <div className="radmin-env-head">
        <div className="radmin-env-id">
          <span className="radmin-env-kind">{env.kind}</span>
          <code className="radmin-muted">{env.id}</code>
        </div>
        <div className="radmin-env-actions">
          <button className={`radmin-toggle${enforce ? " on" : ""}`} disabled={busy} onClick={toggle} title="Shadow ⇄ Enforce">
            <span className="radmin-toggle-knob" />
            <span className="radmin-toggle-label">{enforce ? "ENFORCE" : "SHADOW"}</span>
          </button>
          <button className="radmin-btn sm" onClick={() => setOpen(open === "evidence" ? null : "evidence")}>Evidence</button>
          <button className="radmin-btn sm" onClick={() => setOpen(open === "reports" ? null : "reports")}>Reports</button>
          <button className="radmin-btn sm" onClick={() => setOpen(open === "audit" ? null : "audit")}>Audit pack</button>
          <button className="radmin-btn sm" disabled={busy} onClick={rotate}>Rotate key</button>
        </div>
      </div>
      {open === "keys" && newKey && (
        <div className="radmin-env-body"><KeyReveal label="New ingest key (shown once)" value={newKey} warning={newKeyWarn} /></div>
      )}
      {open === "evidence" && <div className="radmin-env-body"><EvidenceView org={org} env={env} /></div>}
      {open === "reports" && <div className="radmin-env-body"><ReportsView org={org} env={env} /></div>}
      {open === "audit" && <div className="radmin-env-body"><DeliverablesView org={org} env={env} /></div>}
    </div>
  );
}

// ── Evidence ─────────────────────────────────────────────────────────────────
const WINDOWS: Array<[string, string]> = [["all", "All time"], ["24h", "Last 24h"], ["7d", "7 days"], ["30d", "30 days"]];
// pct change vs previous; goodUp=true means an increase is "good" (green).
function trendOf(cur: number, prev: number | null | undefined, goodUp: boolean) {
  if (prev == null || prev === 0) return null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return null;
  return { pct, good: pct > 0 === goodUp };
}
function EvidenceView({ org, env }: { org: any; env: any }) {
  const [data, setData] = useState<any>(null); const [err, setErr] = useState("");
  const [win, setWin] = useState("7d");
  const load = useCallback(async () => {
    setErr("");
    try { setData(await api(`evidence?org_id=${encodeURIComponent(org.id)}&environment_id=${encodeURIComponent(env.id)}&limit=25&window=${win}`)); }
    catch (e: any) { setErr(e.message); }
  }, [org.id, env.id, win]);
  useEffect(() => { load(); }, [load]);
  if (err) return <div className="radmin-err">{err}</div>;
  if (!data) return <div className="radmin-muted">Loading evidence…</div>;
  const s = data.summary || {}; const v = s.verdicts || {}; const lat = s.latency?.engine_compute_ms || {};
  const pv = data.previous?.verdicts || {}; const plat = data.previous?.latency?.engine_compute_ms || {};
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `evidence-${org.slug || org.id}-${env.kind}.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  return (
    <div className="radmin-evidence">
      <div className="radmin-windows">
        {WINDOWS.map(([w, label]) => (
          <button key={w} className={`radmin-win${win === w ? " on" : ""}`} onClick={() => setWin(w)}>{label}</button>
        ))}
        {data.previous && <span className="radmin-muted radmin-win-note">▲▼ vs previous period</span>}
      </div>
      <div className="radmin-stats">
        <Stat label="Total" value={s.total ?? 0} trend={trendOf(s.total ?? 0, data.previous?.total, true)} />
        <Stat label="Allow" value={v.ALLOW ?? 0} tone="ok" trend={trendOf(v.ALLOW ?? 0, pv.ALLOW, true)} />
        <Stat label="Escalate" value={v.ESCALATE ?? 0} tone="warn" trend={trendOf(v.ESCALATE ?? 0, pv.ESCALATE, false)} />
        <Stat label="Block" value={v.BLOCK ?? 0} tone="omega" trend={trendOf(v.BLOCK ?? 0, pv.BLOCK, false)} />
        <Stat label="Would-block (shadow)" value={s.would_block ?? 0} trend={trendOf(s.would_block ?? 0, data.previous?.would_block, false)} />
        <Stat label="Engine p95" value={lat.p95 != null ? `${lat.p95}ms` : "—"} trend={lat.p95 != null && plat.p95 != null ? trendOf(lat.p95, plat.p95, false) : null} />
      </div>
      <div className="radmin-charts radmin-anim" key={win}>
        <VolumeChart series={data.trends} />
        <RatioBar allow={v.ALLOW ?? 0} escalate={v.ESCALATE ?? 0} block={v.BLOCK ?? 0} />
        <LatencySpark series={data.trends} />
        <FreqBars title="Top rules" rows={s.rule_frequency} color="#6f97ff" />
        <FreqBars title="Top Ω domains" rows={s.omega_frequency} color="#d9a441" info={OMEGA_TIP} />
      </div>
      <div className="radmin-row"><span className="radmin-muted">Evidence export</span><button className="radmin-btn sm" onClick={exportJson}>Export window JSON</button></div>
      <DecisionSearch org={org} env={env} />
    </div>
  );
}

// Decision search — the MSSP query surface ("every BLOCK event for Customer A
// over the last month", without the CLI). Auto-runs; filters narrow it down.
function DecisionSearch({ org, env }: { org: any; env: any }) {
  const [verdict, setVerdict] = useState(""); const [omega, setOmega] = useState(""); const [rule, setRule] = useState("");
  const [since, setSince] = useState(""); const [until, setUntil] = useState(""); const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[] | null>(null); const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const qs = useCallback(() => {
    const p = new URLSearchParams({ org_id: org.id, environment_id: env.id, limit: "500" });
    if (verdict) p.set("verdict", verdict);
    if (omega) p.set("omega_domain", omega);
    if (rule) p.set("rule", rule);
    if (since) p.set("since", new Date(since).toISOString());
    if (until) p.set("until", new Date(until + "T23:59:59").toISOString());
    if (q) p.set("q", q);
    return p.toString();
  }, [org.id, env.id, verdict, omega, rule, since, until, q]);
  const search = useCallback(async () => {
    setBusy(true); setErr("");
    try { const d = await api(`decisions?${qs()}`); setRows(d.decisions || []); setCount(d.count || 0); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }, [qs]);
  useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const lastMonth = () => {
    const d = new Date(); const u = d.toISOString().slice(0, 10);
    d.setMonth(d.getMonth() - 1); setSince(d.toISOString().slice(0, 10)); setUntil(u); setVerdict("BLOCK");
  };
  return (
    <div className="radmin-search">
      <div className="radmin-search-bar">
        <select className="radmin-select" value={verdict} onChange={(e) => setVerdict(e.target.value)}>
          <option value="">Any verdict</option>{["ALLOW", "ESCALATE", "BLOCK"].map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <span className="radmin-search-omega"><input className="radmin-select" placeholder="Ω domain" value={omega} onChange={(e) => setOmega(e.target.value)} /><Info tip={OMEGA_TIP} /></span>
        <input className="radmin-select" placeholder="Rule" value={rule} onChange={(e) => setRule(e.target.value)} />
        <input className="radmin-select" type="date" value={since} onChange={(e) => setSince(e.target.value)} title="From" />
        <input className="radmin-select" type="date" value={until} onChange={(e) => setUntil(e.target.value)} title="To" />
        <button className="radmin-btn sm primary" disabled={busy} onClick={search}>{busy ? "…" : "Search"}</button>
        <button className="radmin-btn sm" onClick={lastMonth} title="Preset: BLOCK events, last month">BLOCK · last month</button>
        <a className="radmin-btn sm" href={`/api/runtime/admin/decisions?${qs()}&format=csv`}>Export CSV</a>
      </div>
      {err && <div className="radmin-err">{err}</div>}
      <div className="radmin-muted" style={{ fontSize: 11, margin: "2px 0 8px" }}>{rows ? `${count} decision${count === 1 ? "" : "s"}` : "Searching…"}</div>
      <div className="radmin-table-wrap">
        <table className="radmin-table">
          <thead><tr><th>Time</th><th>Verdict</th><th>Engine</th><th>Ω</th><th>Rule</th><th>ms</th></tr></thead>
          <tbody>
            {(rows || []).map((d: any, i: number) => (
              <tr key={i}>
                <td>{(d.created_at || "").replace("T", " ").slice(0, 19)}</td>
                <td><span className={`radmin-verdict ${String(d.verdict).toLowerCase()}`}>{d.verdict}</span></td>
                <td className="radmin-muted">{d.engine_verdict}</td>
                <td>{d.omega_domain || "—"}</td>
                <td className="radmin-muted">{d.rule || "—"}</td>
                <td>{d.engine_compute_ms ?? "—"}</td>
              </tr>
            ))}
            {rows && !rows.length && <tr><td colSpan={6} className="radmin-muted">No matching decisions.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Reports ──────────────────────────────────────────────────────────────────
function ReportsView({ org, env }: { org: any; env: any }) {
  const [reports, setReports] = useState<any[] | null>(null);
  const [period, setPeriod] = useState("monthly"); const [month, setMonth] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const load = useCallback(async () => {
    setErr("");
    try { const d = await api(`reports?org_id=${encodeURIComponent(org.id)}&environment_id=${encodeURIComponent(env.id)}${month ? `&month=${month}` : ""}`); setReports(d.reports || []); }
    catch (e: any) { setErr(e.message); }
  }, [org.id, env.id, month]);
  useEffect(() => { load(); }, [load]);
  const generate = async (p?: string) => {
    setBusy(true); setErr("");
    try { await api("reports", { method: "POST", body: JSON.stringify({ org_id: org.id, environment_id: env.id, period: p || period }) }); setMonth(""); await load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div>
      <div className="radmin-row" style={{ margin: "0 0 4px" }}>
        <span className="radmin-muted">Generate</span>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} className="radmin-select">
          {["daily", "weekly", "monthly", "quarterly"].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button className="radmin-btn sm primary" disabled={busy} onClick={() => generate()}>{busy ? "Generating…" : "Generate report"}</button>
        <span style={{ flex: 1 }} />
        <span className="radmin-muted">History</span>
        <input className="radmin-select" style={{ width: 130 }} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        {month && <button className="radmin-btn sm" onClick={() => setMonth("")}>Clear</button>}
      </div>
      {err && <div className="radmin-err">{err}</div>}
      {!reports ? <div className="radmin-muted">Loading…</div>
        : !reports.length ? <div className="radmin-muted">No reports{month ? " for this month" : " yet"}. Use <b>Generate report</b> above.</div>
          : <div className="radmin-repcards">{reports.map((r: any) => <ReportCard key={r.id} r={r} onRegenerate={() => generate(r.period)} regenBusy={busy} />)}</div>}
    </div>
  );
}

const RISK_TONE: Record<string, string> = { High: "omega", Medium: "warn", Low: "ok" };
function ReportCard({ r, onRegenerate, regenBusy }: { r: any; onRegenerate: () => void; regenBusy: boolean }) {
  const [open, setOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState(""); const [busy, setBusy] = useState(false);
  const ex = r.summary?.executive || {}; const te = r.summary?.technical || {};
  const t = r.totals || {};
  const fileUrl = (fmt: string) => `/api/runtime/admin/reports/file?id=${encodeURIComponent(r.id)}&format=${fmt}`;
  const share = async () => {
    setBusy(true);
    try { const d = await api("reports/share", { method: "POST", body: JSON.stringify({ id: r.id, expires_in_days: 7 }) }); setShareUrl(d.url); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="radmin-repcard">
      <button className="radmin-repcard-head" onClick={() => setOpen(!open)}>
        <span className="radmin-repcard-left">
          <span className={`radmin-chev${open ? " open" : ""}`}>▸</span>
          <span className="radmin-pill">{r.period}</span>
          <span className="radmin-repcard-date">{(r.generated_at || r.created_at || "").slice(0, 10)}</span>
          {ex.risk && <span className={`radmin-badge ${RISK_TONE[ex.risk] || "ghost"}`}>{ex.risk} risk</span>}
        </span>
        <span className="radmin-repcard-metrics">
          <span style={{ color: "#3fb27f" }}>{t.ALLOW ?? 0} A</span>
          <span style={{ color: "#d9a441" }}>{t.ESCALATE ?? 0} E</span>
          <span style={{ color: "#e5484d" }}>{t.BLOCK ?? 0} B</span>
          <span className="radmin-muted">· {r.trajectories ?? 0} evals</span>
        </span>
      </button>
      {open && (
        <div className="radmin-repcard-body">
          <p className="radmin-repcard-headline">{r.headline}</p>
          <div className="radmin-repcols">
            <section>
              <h4>Executive summary</h4>
              <p><b>Overall posture.</b> {ex.posture}</p>
              <p><b>Risk level.</b> <span className={`radmin-badge ${RISK_TONE[ex.risk] || "ghost"}`}>{ex.risk}</span></p>
              <p><b>Key findings</b></p><ul>{(ex.key_findings || []).map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
              <p><b>Business impact.</b> {ex.business_impact}</p>
              <p><b>Recommended actions</b></p><ul>{(ex.recommended_actions || []).map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
            </section>
            <section>
              <h4>Technical summary</h4>
              <div className="radmin-kv">
                <div><span>Decisions</span><code>{te.decisions ?? 0}</code></div>
                <div><span>Would-block</span><code>{te.would_block ?? 0}</code></div>
                <div><span>Enforced</span><code>{String(te.enforced)}</code></div>
                <div><span>Human review</span><code>{te.human_review ?? 0}</code></div>
                <div><span>Mean / p95 ms</span><code>{te.latency?.engine_compute_ms?.mean ?? "—"} / {te.latency?.engine_compute_ms?.p95 ?? "—"}</code></div>
              </div>
              <FreqBars title="Rules triggered" rows={te.rules} color="#6f97ff" />
              <FreqBars title="Ω domains" rows={te.omega} color="#d9a441" info={OMEGA_TIP} />
              <p className="radmin-muted" style={{ fontSize: 11, marginTop: 8 }}>Evidence: {te.evidence_ref}</p>
            </section>
          </div>
          <div className="radmin-repcard-actions">
            <a className="radmin-btn sm" href={fileUrl("html")}>Download HTML</a>
            <a className="radmin-btn sm" href={fileUrl("md")}>Download MD</a>
            <a className="radmin-btn sm" href={fileUrl("json")}>Download JSON</a>
            <button className="radmin-btn sm primary" disabled={busy} onClick={share}>{busy ? "…" : "Share securely"}</button>
            <button className="radmin-btn sm" disabled={regenBusy} onClick={onRegenerate}>Regenerate</button>
          </div>
          {shareUrl && <KeyReveal label="Secure link — expires in 7 days, revocable" value={shareUrl} />}
        </div>
      )}
    </div>
  );
}

// ── Audit pack / Deliverables (Secure Delivery) ──────────────────────────────
function DeliverablesView({ org, env }: { org: any; env: any }) {
  const [data, setData] = useState<any>(null); const [err, setErr] = useState("");
  const [shares, setShares] = useState<Record<string, string>>({}); const [busyId, setBusyId] = useState("");
  const [shareTok, setShareTok] = useState<Record<string, string>>({}); // token per deliverable (for delivery)
  const [emailTo, setEmailTo] = useState<Record<string, string>>({}); const [emailBusyId, setEmailBusyId] = useState("");
  const [emailNote, setEmailNote] = useState<Record<string, string>>({});
  const [genType, setGenType] = useState(""); const [pub, setPub] = useState(false);
  const [showUpload, setShowUpload] = useState(false); const [showDev, setShowDev] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null); const [packName, setPackName] = useState(""); const [packRef, setPackRef] = useState("");
  const [showManifest, setShowManifest] = useState(false); const [manifestText, setManifestText] = useState("");
  const [manifestDomains, setManifestDomains] = useState(""); const [manifestNote, setManifestNote] = useState("");
  const [manifestBusy, setManifestBusy] = useState(false); const [manifestStatus, setManifestStatus] = useState("");
  const load = useCallback(async () => {
    setErr("");
    try { setData(await api(`deliverables?org_id=${encodeURIComponent(org.id)}&environment_id=${encodeURIComponent(env.id)}`)); }
    catch (e: any) { setErr(e.message); }
  }, [org.id, env.id]);
  useEffect(() => { load(); }, [load]);
  // Relative, same-origin URL (see lib/deliverable-url): keeps Preview/Download
  // on the canonical host so the operator cookie rides along and iPad Safari
  // renders the PDF inline instead of crossing the apex→www 307.
  const fileUrl = (id: string, mode: string) => deliverableFileUrl(id, mode);
  const share = async (d: any) => {
    setBusyId(d.id);
    try {
      const r = await api("deliverables/share", { method: "POST", body: JSON.stringify({ deliverable_id: d.id, expires_in_days: 7 }) });
      setShares((s) => ({ ...s, [d.id]: r.url })); setShareTok((t) => ({ ...t, [d.id]: r.token }));
    }
    catch (e: any) { alert(e.message); } finally { setBusyId(""); }
  };
  // Managed-service delivery: email the existing secure link to a customer
  // contact. The link is unchanged (credential-free, expiring, revocable).
  const emailShare = async (d: any) => {
    const to = (emailTo[d.id] || "").trim(); const token = shareTok[d.id];
    if (!to || !token) return;
    setEmailBusyId(d.id); setEmailNote((n) => ({ ...n, [d.id]: "" }));
    try {
      const r = await api("deliverables/share", { method: "POST", body: JSON.stringify({ email_share: token, email: to }) });
      setEmailNote((n) => ({ ...n, [d.id]: `✓ Sent to ${r.emailed_to}` }));
    } catch (e: any) { setEmailNote((n) => ({ ...n, [d.id]: `✗ ${e.message}` })); }
    finally { setEmailBusyId(""); }
  };
  const generate = async (report_type: string) => {
    setGenType(report_type); setErr("");
    try { await api("deliverables/generate", { method: "POST", body: JSON.stringify({ org_id: org.id, environment_id: env.id, period: "monthly", report_type }) }); await load(); }
    catch (e: any) { setErr(e.message); } finally { setGenType(""); }
  };
  const publish = async () => {
    if (!files || !files.length) return;
    setPub(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("org_id", org.id); fd.append("environment_id", env.id);
      if (packName) fd.append("name", packName); if (packRef) fd.append("reference", packRef);
      for (const f of Array.from(files)) fd.append("files", f);
      const res = await fetch("/api/runtime/admin/deliverables/publish", { method: "POST", credentials: "same-origin", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || `HTTP ${res.status}`);
      setShowUpload(false); setFiles(null); setPackName(""); setPackRef(""); await load();
    } catch (e: any) { setErr(e.message); } finally { setPub(false); }
  };
  const chooseManifest = async (file?: File) => {
    if (!file) return;
    setManifestStatus("");
    try { setManifestText(await file.text()); }
    catch { setManifestStatus("✗ Could not read that file"); }
  };
  const uploadManifest = async () => {
    setManifestBusy(true); setManifestStatus(""); setErr("");
    try {
      let parsed: any;
      try { parsed = JSON.parse(manifestText); } catch { throw new Error("Manifest must be valid JSON"); }
      const manifest = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.tools) ? parsed.tools : null);
      if (!manifest?.length) throw new Error('Use a JSON tool array or an object containing a "tools" array');
      const domains = manifestDomains.split(",").map((x) => x.trim()).filter(Boolean);
      const result = await api("manifests", { method: "POST", body: JSON.stringify({ org_id: org.id, environment_id: env.id, manifest, domains, note: manifestNote }) });
      setManifestStatus(`✓ Manifest ready · ${result.tool_count} tools · version ${result.version?.version || "current"}`);
      setManifestText(""); setManifestNote(""); setShowManifest(false); await load();
    } catch (e: any) { setManifestStatus(`✗ ${e.message}`); }
    finally { setManifestBusy(false); }
  };
  const shareable = (f: string) => /\.(pdf|html)$/i.test(f);
  const packs: any[] = data?.packs || [];

  const fullAudit = data?.full_audit || { available: false };
  const enterpriseAssessment = data?.enterprise_assessment || { available: false };
  const busy = !!genType;
  const ActionBar = (
    <div>
      <div className="radmin-actionbar" style={{ flexWrap: "wrap", gap: 8 }}>
        <button className="radmin-btn primary" disabled={busy} onClick={() => generate("monthly_evidence")}>{genType === "monthly_evidence" ? "Generating…" : "Generate monthly evidence"}</button>
        <button className="radmin-btn" disabled={busy} onClick={() => generate("executive_summary")}>{genType === "executive_summary" ? "Generating…" : "Generate executive summary"}</button>
        <button className="radmin-btn" disabled={busy || !fullAudit.available} onClick={() => generate("full_audit")} title={fullAudit.available ? "48-Hour Runtime Governance Audit (manifest assessment)" : fullAudit.reason || "Customer manifest required"}>{genType === "full_audit" ? "Generating…" : "Generate full audit"}</button>
        <button className="radmin-btn" disabled={busy || !enterpriseAssessment.available} onClick={() => generate("enterprise_assessment")} title={enterpriseAssessment.available ? "Organisation-wide, multi-environment Enterprise Runtime Governance Assessment" : enterpriseAssessment.reason || "At least one customer manifest required"}>{genType === "enterprise_assessment" ? "Generating…" : "Generate enterprise assessment"}</button>
        <button className="radmin-btn" disabled={busy || manifestBusy} onClick={() => { setShowManifest(!showManifest); setManifestStatus(""); }}>{fullAudit.available ? "Replace manifest…" : "Upload customer manifest…"}</button>
        <button className="radmin-btn" onClick={() => setShowUpload(!showUpload)}>Publish (upload)…</button>
        <span style={{ flex: 1 }} />
        <button className="radmin-btn sm" onClick={() => setShowDev(!showDev)}>Developer</button>
      </div>
      {!fullAudit.available && (
        <div className="radmin-muted" style={{ fontSize: 11, margin: "4px 0 0" }}>
          <b>Full audit unavailable</b> — {fullAudit.reason || "customer manifest required."} Ingest the customer&rsquo;s tool manifest to enable the 48-Hour Audit.
        </div>
      )}
      {fullAudit.available && (
        <div className="radmin-muted" style={{ fontSize: 11, margin: "4px 0 0" }}>
          <b>Full audit ready</b> — {fullAudit.tool_count || 0} tools · manifest version {fullAudit.manifest_version || "current"}.
        </div>
      )}
      {enterpriseAssessment.available && (
        <div className="radmin-muted" style={{ fontSize: 11, margin: "4px 0 0" }}>
          <b>Enterprise assessment ready</b> — {enterpriseAssessment.assessed_environment_count || 0}/{enterpriseAssessment.environment_count || 0} environments · {enterpriseAssessment.tool_count || 0} tools in assessed scope.
        </div>
      )}
      {showManifest && (
        <div className="radmin-upload" style={{ alignItems: "stretch" }}>
          <input type="file" accept="application/json,.json" onChange={(e) => chooseManifest(e.target.files?.[0])} />
          <input className="radmin-select" placeholder="Domains: finance, cybersecurity" value={manifestDomains} onChange={(e) => setManifestDomains(e.target.value)} />
          <input className="radmin-select" placeholder="Note (optional)" value={manifestNote} onChange={(e) => setManifestNote(e.target.value)} />
          <textarea className="radmin-select" style={{ flexBasis: "100%", minHeight: 130, fontFamily: "ui-monospace, monospace" }} placeholder={'Paste JSON here, for example:\n[{"name":"read_account"},{"name":"transfer_funds"}]'} value={manifestText} onChange={(e) => setManifestText(e.target.value)} />
          <button className="radmin-btn sm primary" disabled={manifestBusy || !manifestText.trim()} onClick={uploadManifest}>{manifestBusy ? "Uploading & assessing…" : "Save manifest & enable full audit"}</button>
          <span className="radmin-muted" style={{ fontSize: 11, flexBasis: "100%" }}>Accepts a JSON tool array or an object with a <code>tools</code> array. The manifest is stored, versioned and assessed for this environment.</span>
        </div>
      )}
      {manifestStatus && <div className={manifestStatus.startsWith("✗") ? "radmin-err" : "radmin-muted"} style={{ marginTop: 8 }}>{manifestStatus}</div>}
      {showUpload && (
        <div className="radmin-upload">
          <input type="file" multiple onChange={(e) => setFiles(e.target.files)} />
          <input className="radmin-select" placeholder="Pack name (optional)" value={packName} onChange={(e) => setPackName(e.target.value)} />
          <input className="radmin-select" placeholder="Reference (optional)" value={packRef} onChange={(e) => setPackRef(e.target.value)} />
          <button className="radmin-btn sm primary" disabled={pub || !files?.length} onClick={publish}>{pub ? "Publishing…" : "Publish"}</button>
          <span className="radmin-muted" style={{ fontSize: 11, flexBasis: "100%" }}>Upload the files the console generated (audit.html/.md/.pdf, executive-report.*, run-summary.json).</span>
        </div>
      )}
      {showDev && (
        <div className="radmin-code">npm run runtime:publish-audit -- --org {org.id} --env {env.id} --dir deliverables/&lt;slug&gt;</div>
      )}
    </div>
  );

  if (err && !data) return <div className="radmin-err">{err}</div>;
  if (!data) return <div className="radmin-muted">Loading deliverables…</div>;
  return (
    <div>
      {ActionBar}
      {err && <div className="radmin-err">{err}</div>}
      {!packs.length && <div className="radmin-muted" style={{ marginTop: 10 }}>No audit packs yet. <b>Generate evidence pack</b> creates one from live evidence; <b>Publish (upload)</b> attaches the console-generated 48-Hour Audit (with branded PDFs).</div>}
      {packs.map((p) => (
        <div key={p.id} className="radmin-pack">
          <div className="radmin-row" style={{ margin: "0 0 6px" }}>
            <span className="radmin-pill">{p.name || "Audit pack"}</span>
            <span className="radmin-muted">{p.reference ? p.reference + " · " : ""}{(p.created_at || "").slice(0, 10)}</span>
          </div>
          {(() => {
            // Render ONLY a string. A pack's summary.assess_summary can be a
            // coverage OBJECT ({tools, risky, covered, …}); rendering that as a
            // React child throws (React #31) and crashes the whole Control Room
            // ("This page couldn't load"). Pick the first usable string, else skip.
            const s = [p.summary?.assess_summary, p.summary?.headline].find((x: any) => typeof x === "string" && x.trim());
            return s ? <div className="radmin-muted radmin-pack-sum">{s}</div> : null;
          })()}
          <ul className="radmin-deliv">
            {(p.deliverables || []).map((d: any) => (
              <li key={d.id} className="radmin-deliv-row">
                <div className="radmin-deliv-meta">
                  <div className="radmin-deliv-name">{d.filename}</div>
                  <div className="radmin-muted">{d.kind}{d.size ? ` · ${(d.size / 1024).toFixed(0)} KB` : ""}</div>
                </div>
                <div className="radmin-deliv-actions">
                  <a className="radmin-btn sm" href={fileUrl(d.id, "preview")} target="_blank" rel="noopener noreferrer">Preview</a>
                  <a className="radmin-btn sm" href={fileUrl(d.id, "download")}>Download</a>
                  {shareable(d.filename) && <button className="radmin-btn sm primary" disabled={busyId === d.id} onClick={() => share(d)}>{busyId === d.id ? "…" : "Share securely"}</button>}
                </div>
                {shares[d.id] && (
                  <div className="radmin-deliv-share">
                    <KeyReveal label="Secure link — expires in 7 days, revocable" value={shares[d.id]} />
                    <div className="radmin-row" style={{ margin: "8px 0 0", gap: 8 }}>
                      <input className="radmin-select" style={{ flex: 1, minWidth: 200 }} type="email" inputMode="email"
                        placeholder="Email this link to the customer (optional)"
                        value={emailTo[d.id] || ""} onChange={(e) => setEmailTo((t) => ({ ...t, [d.id]: e.target.value }))} />
                      <button className="radmin-btn sm" disabled={emailBusyId === d.id || !(emailTo[d.id] || "").trim()} onClick={() => emailShare(d)}>
                        {emailBusyId === d.id ? "Sending…" : "Send to customer"}
                      </button>
                    </div>
                    {emailNote[d.id] && <div className="radmin-muted" style={{ fontSize: 11, marginTop: 4 }}>{emailNote[d.id]}</div>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ── Readiness (preflight config audit) ───────────────────────────────────────
function ReadinessPanel() {
  const [data, setData] = useState<any>(null); const [err, setErr] = useState("");
  const load = useCallback(async () => { setErr(""); try { setData(await api("preflight")); } catch (e: any) { setErr(e.message); } }, []);
  useEffect(() => { load(); }, [load]);
  if (err) return <div className="radmin-err">{err}</div>;
  if (!data) return <div className="radmin-muted">Running readiness check…</div>;
  return (
    <section className="radmin-card">
      <div className="radmin-row">
        <h2>Production readiness</h2>
        <span className={`radmin-ready ${data.ready ? "ok" : "bad"}`}>{data.ready ? "ENTERPRISE-READY" : "NOT READY"}</span>
        <button className="radmin-btn sm" onClick={load}>Refresh</button>
      </div>
      <p className="radmin-muted">Configuration audit — reads the live environment + engine. (The shadow→enforce capability path is verified by <code>npm run runtime:preflight</code>.)</p>
      <ul className="radmin-checks">
        {(data.checks || []).map((c: any, i: number) => (
          <li key={i} className={`radmin-check ${c.status.toLowerCase()}`}>
            <span className="radmin-check-tag">{c.status}</span>
            <span className="radmin-check-name">{c.name}</span>
            <span className="radmin-check-detail radmin-muted">{c.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Alerts (Phase 3) ─────────────────────────────────────────────────────────
function AlertsPanel() {
  const [data, setData] = useState<any>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setErr(""); try { setData(await api("alerts?limit=100")); } catch (e: any) { setErr(e.message); } }, []);
  useEffect(() => { load(); }, [load]);
  const sweep = async () => { setBusy(true); try { await api("alerts", { method: "POST" }); await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  if (err) return <div className="radmin-err">{err}</div>;
  if (!data) return <div className="radmin-muted">Loading alerts…</div>;
  const conds: any[] = data.conditions || []; const recent: any[] = data.recent || [];
  return (
    <section className="radmin-card">
      <div className="radmin-row">
        <h2>Operational alerts</h2>
        <span className={`radmin-ready ${conds.length ? "bad" : "ok"}`}>{conds.length ? `${conds.length} FIRING` : "ALL CLEAR"}</span>
        <button className="radmin-btn sm" disabled={busy} onClick={sweep}>{busy ? "Sweeping…" : "Run sweep"}</button>
        <button className="radmin-btn sm" onClick={load}>Refresh</button>
      </div>
      <p className="radmin-muted">Live conditions across engine reachability, store durability, and BLOCK-spike thresholds. Record-failure alerts fire in real time from the gateway.</p>
      <ul className="radmin-checks">
        {conds.length === 0 && <li className="radmin-check pass"><span className="radmin-check-tag">OK</span><span className="radmin-check-name">No conditions firing</span><span className="radmin-check-detail radmin-muted">engine reachable · store durable · no BLOCK spike</span></li>}
        {conds.map((c, i) => (
          <li key={i} className={`radmin-check ${c.severity === "critical" ? "fail" : "warn"}`}>
            <span className="radmin-check-tag">{c.severity === "critical" ? "CRIT" : "WARN"}</span>
            <span className="radmin-check-name">{c.kind}</span>
            <span className="radmin-check-detail radmin-muted">{c.message}</span>
          </li>
        ))}
      </ul>
      <div className="radmin-row"><span className="radmin-muted">Recent alerts</span></div>
      {recent.length === 0 ? <div className="radmin-muted">No alerts recorded yet (durable once <code>rg_alerts</code> exists).</div> : (
        <div className="radmin-table-wrap">
          <table className="radmin-table">
            <thead><tr><th>Time</th><th>Severity</th><th>Kind</th><th>Message</th></tr></thead>
            <tbody>
              {recent.map((r, i) => (
                <tr key={i}>
                  <td>{(r.created_at || "").replace("T", " ").slice(0, 19)}</td>
                  <td><span className={`radmin-verdict ${r.severity === "critical" ? "block" : "escalate"}`}>{r.severity}</span></td>
                  <td className="radmin-muted">{r.kind}</td>
                  <td>{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── Audit log ────────────────────────────────────────────────────────────────
function AuditPanel() {
  const [rows, setRows] = useState<any[] | null>(null); const [err, setErr] = useState("");
  useEffect(() => { (async () => { try { const d = await api("audit?limit=100"); setRows(d.actions || []); } catch (e: any) { setErr(e.message); } })(); }, []);
  if (err) return <div className="radmin-err">{err}</div>;
  if (!rows) return <div className="radmin-muted">Loading audit log…</div>;
  return (
    <section className="radmin-card">
      <h2>Operator action log</h2>
      {!rows.length ? <div className="radmin-muted">No actions recorded yet (durable once <code>rg_admin_audit</code> exists).</div> : (
        <div className="radmin-table-wrap">
          <table className="radmin-table">
            <thead><tr><th>Time</th><th>Action</th><th>Actor</th><th>Via</th><th>Target</th></tr></thead>
            <tbody>
              {rows.map((r: any, i: number) => (
                <tr key={i}>
                  <td>{(r.created_at || "").replace("T", " ").slice(0, 19)}</td>
                  <td><span className="radmin-pill">{r.action}</span></td>
                  <td>{r.actor}</td><td className="radmin-muted">{r.via}</td><td className="radmin-muted">{r.target || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── Small shared pieces ──────────────────────────────────────────────────────
function Stat({ label, value, tone, trend }: { label: string; value: any; tone?: string; trend?: { pct: number; good: boolean } | null }) {
  return (
    <div className={`radmin-stat${tone ? " " + tone : ""}`}>
      <div className="radmin-stat-top">
        <div className="radmin-stat-v">{value}</div>
        {trend && <span className={`radmin-trend ${trend.good ? "good" : "bad"}`}>{trend.pct > 0 ? "▲" : "▼"} {Math.abs(trend.pct)}%</span>}
      </div>
      <div className="radmin-stat-l">{label}</div>
    </div>
  );
}
function KeyReveal({ label, value, warning }: { label: string; value: string; warning?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="radmin-keyreveal">
      <div className="radmin-muted">{label}</div>
      <div className="radmin-keyrow">
        <code>{value}</code>
        <button className="radmin-btn sm" onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ } }}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {warning && <div className="radmin-err" style={{ marginTop: 8 }}>{warning}</div>}
    </div>
  );
}
