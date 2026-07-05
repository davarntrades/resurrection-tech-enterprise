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

type Tab = "customers" | "onboard" | "readiness" | "alerts" | "audit";

export default function RuntimeAdminClient() {
  const [authed, setAuthed] = useState<boolean | null>(null); // null = checking
  const [tab, setTab] = useState<Tab>("customers");

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
          {(["customers", "onboard", "readiness", "alerts", "audit"] as Tab[]).map((t) => (
            <button key={t} className={`radmin-tab${tab === t ? " is-active" : ""}`} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
          <button className="radmin-logout" onClick={async () => { await api("logout", { method: "POST" }); setAuthed(false); }}>
            Sign out
          </button>
        </nav>
      </header>

      <main className="radmin-main">
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

// ── Customers (list + per-environment control) ───────────────────────────────
function CustomersPanel() {
  const [orgs, setOrgs] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    setErr("");
    try { const d = await api("orgs?withEnvironments=1"); setOrgs(d.orgs || []); }
    catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (err) return <div className="radmin-err">{err}</div>;
  if (!orgs) return <div className="radmin-muted">Loading customers…</div>;
  if (!orgs.length) return <div className="radmin-empty">No customers yet. Use the <b>Onboard</b> tab to create the first.</div>;

  return (
    <div className="radmin-orgs">
      {orgs.map((o) => (
        <section key={o.id} className="radmin-card">
          <div className="radmin-org-head">
            <div><h2>{o.name}</h2><code className="radmin-muted">{o.id}</code></div>
            <span className={`radmin-pill ${o.status === "active" ? "ok" : ""}`}>{o.plan || "pilot"}</span>
          </div>
          {(o.environments || []).map((e: any) => (
            <EnvRow key={e.id} org={o} env={e} onChange={load} />
          ))}
        </section>
      ))}
    </div>
  );
}

function EnvRow({ org, env, onChange }: { org: any; env: any; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<null | "evidence" | "reports" | "keys">(null);
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
          <button className="radmin-btn sm" disabled={busy} onClick={rotate}>Rotate key</button>
        </div>
      </div>
      {open === "keys" && newKey && (
        <div className="radmin-env-body"><KeyReveal label="New ingest key (shown once)" value={newKey} warning={newKeyWarn} /></div>
      )}
      {open === "evidence" && <div className="radmin-env-body"><EvidenceView org={org} env={env} /></div>}
      {open === "reports" && <div className="radmin-env-body"><ReportsView org={org} env={env} /></div>}
    </div>
  );
}

// ── Evidence ─────────────────────────────────────────────────────────────────
function EvidenceView({ org, env }: { org: any; env: any }) {
  const [data, setData] = useState<any>(null); const [err, setErr] = useState("");
  const load = useCallback(async () => {
    setErr("");
    try { setData(await api(`evidence?org_id=${encodeURIComponent(org.id)}&environment_id=${encodeURIComponent(env.id)}&limit=25`)); }
    catch (e: any) { setErr(e.message); }
  }, [org.id, env.id]);
  useEffect(() => { load(); }, [load]);
  if (err) return <div className="radmin-err">{err}</div>;
  if (!data) return <div className="radmin-muted">Loading evidence…</div>;
  const s = data.summary || {}; const v = s.verdicts || {}; const lat = s.latency?.engine_compute_ms || {};
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `evidence-${org.slug || org.id}-${env.kind}.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  return (
    <div className="radmin-evidence">
      <div className="radmin-stats">
        <Stat label="Total" value={s.total ?? 0} />
        <Stat label="Allow" value={v.ALLOW ?? 0} tone="ok" />
        <Stat label="Escalate" value={v.ESCALATE ?? 0} tone="warn" />
        <Stat label="Block" value={v.BLOCK ?? 0} tone="omega" />
        <Stat label="Would-block (shadow)" value={s.would_block ?? 0} />
        <Stat label="Engine p95" value={lat.p95 != null ? `${lat.p95}ms` : "—"} />
      </div>
      <div className="radmin-freq">
        <FreqList title="Top rules" rows={s.rule_frequency} />
        <FreqList title="Top Ω domains" rows={s.omega_frequency} />
      </div>
      <div className="radmin-row"><span className="radmin-muted">Recent decisions</span><button className="radmin-btn sm" onClick={exportJson}>Export JSON</button></div>
      <div className="radmin-table-wrap">
        <table className="radmin-table">
          <thead><tr><th>Time</th><th>Verdict</th><th>Engine</th><th>Ω</th><th>Rule</th><th>ms</th></tr></thead>
          <tbody>
            {(data.recent || []).map((d: any, i: number) => (
              <tr key={i}>
                <td>{(d.created_at || "").replace("T", " ").slice(0, 19)}</td>
                <td><span className={`radmin-verdict ${String(d.verdict).toLowerCase()}`}>{d.verdict}</span></td>
                <td className="radmin-muted">{d.engine_verdict}</td>
                <td>{d.omega_domain || "—"}</td>
                <td className="radmin-muted">{d.rule || "—"}</td>
                <td>{d.engine_compute_ms ?? "—"}</td>
              </tr>
            ))}
            {!(data.recent || []).length && <tr><td colSpan={6} className="radmin-muted">No decisions recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Reports ──────────────────────────────────────────────────────────────────
function ReportsView({ org, env }: { org: any; env: any }) {
  const [reports, setReports] = useState<any[] | null>(null);
  const [period, setPeriod] = useState("monthly"); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const load = useCallback(async () => {
    setErr("");
    try { const d = await api(`reports?org_id=${encodeURIComponent(org.id)}&environment_id=${encodeURIComponent(env.id)}`); setReports(d.reports || []); }
    catch (e: any) { setErr(e.message); }
  }, [org.id, env.id]);
  useEffect(() => { load(); }, [load]);
  const generate = async () => {
    setBusy(true); setErr("");
    try { await api("reports", { method: "POST", body: JSON.stringify({ org_id: org.id, environment_id: env.id, period }) }); await load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div>
      <div className="radmin-row">
        <select value={period} onChange={(e) => setPeriod(e.target.value)} className="radmin-select">
          {["daily", "weekly", "monthly", "quarterly"].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button className="radmin-btn sm" disabled={busy} onClick={generate}>{busy ? "Generating…" : "Generate report"}</button>
      </div>
      {err && <div className="radmin-err">{err}</div>}
      {!reports ? <div className="radmin-muted">Loading…</div> : !reports.length ? <div className="radmin-muted">No reports yet.</div> : (
        <ul className="radmin-reports">
          {reports.map((r: any, i: number) => (
            <li key={i}><span className="radmin-pill">{r.period}</span> <span>{r.headline || r.id}</span> <span className="radmin-muted">{(r.generated_at || r.created_at || "").slice(0, 10)}</span></li>
          ))}
        </ul>
      )}
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
function Stat({ label, value, tone }: { label: string; value: any; tone?: string }) {
  return <div className={`radmin-stat${tone ? " " + tone : ""}`}><div className="radmin-stat-v">{value}</div><div className="radmin-stat-l">{label}</div></div>;
}
function FreqList({ title, rows }: { title: string; rows?: any[] }) {
  return (
    <div className="radmin-freq-col">
      <div className="radmin-freq-title">{title}</div>
      {(rows || []).slice(0, 5).map((r: any, i: number) => (
        <div key={i} className="radmin-freq-row"><span>{r.key}</span><span className="radmin-muted">{r.count} · {r.pct}%</span></div>
      ))}
      {!(rows || []).length && <div className="radmin-muted">—</div>}
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
