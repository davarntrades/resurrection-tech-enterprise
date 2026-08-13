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
import IntegrationGatewayPanel from "./IntegrationGatewayPanel";

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

type Tab = "overview" | "sessions" | "customers" | "onboard" | "integrations" | "readiness" | "assurance" | "alerts" | "audit";

export default function RuntimeAdminClient({ initialTab = "overview" }: { initialTab?: Tab } = {}) {
  const [authed, setAuthed] = useState<boolean | null>(null); // null = checking
  const [tab, setTab] = useState<Tab>(initialTab);

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
            <h1 className="radmin-title">Operator Control Room</h1>
            <div className="radmin-sub">Morrison Runtime Governance</div>
          </div>
        </div>
        <nav className="radmin-tabs">
          {(["overview", "sessions", "customers", "onboard", "integrations", "readiness", "assurance", "alerts", "audit"] as Tab[]).map((t) => (
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
        {tab === "sessions" && <GovernedSessionsPanel />}
        {tab === "customers" && <CustomersPanel />}
        {tab === "onboard" && <OnboardPanel onDone={() => setTab("customers")} />}
        {tab === "integrations" && <IntegrationGatewayPanel />}
        {tab === "readiness" && <ReadinessPanel />}
        {tab === "assurance" && <AssurancePanel />}
        {tab === "alerts" && <AlertsPanel />}
        {tab === "audit" && <AuditPanel />}
      </main>
    </div>
  );
}

function GovernedSessionsPanel() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [persistence, setPersistence] = useState<any>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    setErr("");
    try {
      const response = await fetch("/api/frontier/session", {
        credentials: "same-origin", cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      setSessions(data.sessions || []); setPersistence(data.persistence || null);
    } catch (reason) { setErr((reason as Error).message); }
  }, []);
  useEffect(() => { load(); const timer = window.setInterval(load, 5000); return () => window.clearInterval(timer); }, [load]);
  if (err) return <div className="radmin-err">{err}</div>;
  return <section className="radmin-card">
    <div className="radmin-row"><h2>Governed agent sessions</h2><span style={{ flex: 1 }} /><a className="radmin-btn" href="/lab">Open Frontier Lab</a><button className="radmin-btn sm" onClick={load}>Refresh</button></div>
    <p className="radmin-muted">Active and recent continuous sessions. Every recorded proposal uses the same Morrison runtime boundary as the single-run Lab.</p>
    {persistence?.volume_required && <div className="radmin-err">Session history is process-local until a Railway volume is mounted at the configured database path.</div>}
    {!sessions.length ? <div className="radmin-empty">No governed sessions recorded yet.</div> : <div className="radmin-table-wrap"><table className="radmin-table">
      <thead><tr><th>Session</th><th>Mode</th><th>Provider / model</th><th>Step</th><th>Highest risk</th><th>Last verdict</th><th>Status</th></tr></thead>
      <tbody>{sessions.map((session) => {
        const steps = session.steps || [];
        const risky = [...steps].reverse().find((step: any) => step.morrison_decision?.verdict !== "PERMIT");
        const last = steps.at(-1);
        return <tr key={session.session_id}>
          <td><a href={`/lab?session=${encodeURIComponent(session.session_id)}`}><code>{session.session_id}</code></a></td>
          <td>{String(session.mode || "").replaceAll("_", " ")}</td>
          <td>{session.provider}<br /><span className="radmin-muted">{session.model}</span></td>
          <td>{session.current_step} / {session.max_steps}</td>
          <td>{risky?.normalized_call?.tool || "—"}</td>
          <td>{last?.shadow_decision || last?.morrison_decision?.verdict || "—"}</td>
          <td>{String(session.status || "").replaceAll("_", " ")}</td>
        </tr>;
      })}</tbody>
    </table></div>}
  </section>;
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
        <p className="radmin-muted">Production, staging and sandbox environments created in shadow mode.</p>
        <KeyReveal label="Ingest key (shown once — send to the customer)" value={result.ingest_key} warning={result.warning} />
        <KeyReveal label="Sandbox integration key (shown once)" value={result.sandbox_key} />
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
      <p className="radmin-muted">Provisions the org, production + staging + sandbox environments, and one-time production and sandbox credentials.</p>
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
    // Backed by overview.avg_latency_ms -> latency.engine_compute_ms.mean,
    // which is the SERVICE HANDLER mean, not the governed decision. "Live
    // avg latency" read as governance latency and was ~10x too large for it.
    ["Live avg service handler", p.avg_latency_ms != null ? `${p.avg_latency_ms}ms` : "—"],
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

function CustomerCar…15646 tokens truncated…able
  proposal. A block is returned to the model for replanning by default.

The authenticated session endpoints are `/v1/frontier/session*` on Railway and
same-origin `/api/frontier/session*` proxies on Vercel. Polling is used for live
updates so the browser never owns the authoritative loop. Operator approval is
not exposed until the service can mint a signature bound to the exact session,
step, action, arguments, operator and expiry; denial and continue-without-action
remain available and fail closed.

## Deployment configuration

On Railway (`governance-service`):

- `GOVERNANCE_TOKEN`
- `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` and/or
  `OPENAI_API_KEY` and `OPENAI_MODEL`
- `HF_TOKEN` and comma-separated `HF_MODELS` for Hugging Face Inference
  Providers. Model IDs are a server-side allowlist; arbitrary endpoints are
  never accepted. `HF_TEMPERATURE` is optional and defaults to `0`.
  `FRONTIER_PROVIDER_TIMEOUT_S` bounds the remote inference request.
- optional `FRONTIER_MAX_RUNS`, `FRONTIER_MAX_CONTENT_CHARS`,
  `FRONTIER_MAX_TASK_CHARS`, `FRONTIER_TIMEOUT_S`,
  `FRONTIER_RATE_PER_MINUTE`
- optional `FRONTIER_SESSION_DEFAULT_STEPS`, `FRONTIER_SESSION_MAX_STEPS`,
  `FRONTIER_SESSION_DEFAULT_RUNTIME_S`, `FRONTIER_SESSION_MAX_RUNTIME_S`, and
  `FRONTIER_MAX_CONCURRENT_SESSIONS`
- `FRONTIER_SESSION_DB_PATH=/data/frontier_sessions.sqlite3` with a Railway
  persistent volume mounted at `/data` for restart-durable session history

On Vercel:

- `GOVERNANCE_URL`
- matching `GOVERNANCE_TOKEN`
- existing Runtime Control Room authentication variables
  (`RUNTIME_OPERATOR_PASSWORD` / `RUNTIME_ADMIN_KEY` and
  `RUNTIME_SESSION_SECRET`)
- optional `FRONTIER_UI_RATE_LIMIT` and `FRONTIER_PROXY_TIMEOUT_MS`
- optional `FRONTIER_SESSION_UI_RATE_LIMIT`

Provider keys must never be configured with a `NEXT_PUBLIC_` prefix.

## Evidence and persistence

Every single-run response contains the sealed experiment record. Continuous
sessions additionally seal every step into a previous-hash chain and seal a
session root containing the terminal step and Morrison evidence head. The UI
exports sanitized JSON or text. Session snapshots use SQLite on Railway; they
are restart-durable only when `FRONTIER_SESSION_DB_PATH` points into a mounted
persistent volume. Without that volume the UI explicitly labels persistence as
process-local, and completed evidence should be exported before redeployment.

## Safety boundary

Custom Test changes only the synthetic user task and untrusted text. It cannot
add tools, endpoints, credentials, shell commands, real HTTP clients, email
clients, payment clients or production data access. The server assigns the same
fixed simulated inventory and existing Morrison policy path.
