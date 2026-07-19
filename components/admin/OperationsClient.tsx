"use client";
/**
 * Operations Agent — executive dashboard (Control Room extension).
 *
 * Browser surface over /api/ops/*. Auth rides the SAME operator session cookie
 * as the Runtime Control Room (/admin/runtime) — sign in there first. Reuses
 * the approved radmin design system (styles/runtime-admin.css); no business
 * logic here: every number comes from the tested lib/ops modules via the API.
 */
import "@/styles/runtime-admin.css";
import { useCallback, useEffect, useState } from "react";

async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(`/api/ops/${path}`, {
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e: any = new Error(data?.error || `HTTP ${res.status}`); e.status = res.status; throw e; }
  return data;
}

const fmtWhen = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

export default function OperationsClient() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [dash, setDash] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api("dashboard");
      setDash(d); setAuthed(true); setErr(null);
    } catch (e: any) {
      if (e.status === 401) setAuthed(false);
      else setErr(e.message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const runCycle = async () => {
    setBusy(true); setNote(null);
    try {
      const r = await api("run", { method: "POST" });
      setNote(r.error ? `Cycle failed: ${r.error}` : `Cycle complete — ${r.proposals?.length ?? 0} proposal(s): ${JSON.stringify(r.outcomes)}`);
      await load();
    } catch (e: any) { setNote(e.message); }
    setBusy(false);
  };

  const decide = async (id: string, decision: "approve" | "deny") => {
    setBusy(true); setNote(null);
    try {
      const r = await api("proposals", { method: "POST", body: JSON.stringify({ id, decision }) });
      setNote(`Proposal ${decision === "approve" ? "approved" : "denied"} — outcome: ${r.proposal?.status}`);
      await load();
    } catch (e: any) { setNote(e.message); }
    setBusy(false);
  };

  if (authed === null) return <div className="radmin radmin-loading">Loading operations…</div>;
  if (authed === false) {
    return (
      <div className="radmin">
        <div className="radmin-card">
          <h2>Operator session required</h2>
          <p className="radmin-sub">Sign in to the <a href="/admin/runtime">Operator Control Room</a> first — the Operations Dashboard shares the same session.</p>
        </div>
      </div>
    );
  }

  const b = dash?.briefing;
  const c = b?.counts || {};
  const violations = dash?.policy_violations_24h ?? 0;
  const awaiting: any[] = dash?.awaiting_approval || [];
  const integrations: any[] = dash?.integrations?.integrations || [];
  const runs: any[] = dash?.recent_runs || [];
  const rt24 = dash?.runtime_24h;

  return (
    <div className="radmin">
      <header className="radmin-top">
        <div className="radmin-brand">
          <span className="radmin-omega">Ω</span>
          <div>
            <div className="radmin-title">Operations Agent</div>
            <div className="radmin-sub">Autonomous operations · governed by Runtime Governance</div>
          </div>
        </div>
        <nav className="radmin-tabs">
          <a className="radmin-tab" href="/admin/runtime">Control Room</a>
          <button className="radmin-btn" onClick={runCycle} disabled={busy}>{busy ? "Working…" : "Run agent cycle"}</button>
        </nav>
      </header>

      <main className="radmin-main">
        {err && <div className="radmin-err">{err}</div>}
        {note && <div className="radmin-card"><p>{note}</p></div>}

        <section className="radmin-card">
          <h2>Executive summary</h2>
          <p className="radmin-sub">Generated {fmtWhen(b?.generated_at)}</p>
          <ul>{(b?.lines || []).map((l: string, i: number) => <li key={i}>{l}</li>)}</ul>
          <div className="radmin-kpis">
            <div className="radmin-kpi"><div className="radmin-kpi-v">{c.customers ?? "—"}</div><div className="radmin-kpi-l">Customers</div></div>
            <div className="radmin-kpi ok"><div className="radmin-kpi-v">{c.new_customers_7d ?? 0}</div><div className="radmin-kpi-l">New customers · 7d</div></div>
            <div className="radmin-kpi"><div className="radmin-kpi-v">{c.reports_completed_24h ?? 0}</div><div className="radmin-kpi-l">Reports completed · 24h</div></div>
            <div className="radmin-kpi omega"><div className="radmin-kpi-v">{violations}</div><div className="radmin-kpi-l">Policy violations blocked · 24h</div></div>
            <div className="radmin-kpi warn"><div className="radmin-kpi-v">{c.proposals_awaiting_approval ?? 0}</div><div className="radmin-kpi-l">Actions awaiting approval</div></div>
            <div className="radmin-kpi"><div className="radmin-kpi-v">{rt24?.total ?? 0}</div><div className="radmin-kpi-l">Runtime evaluations · 24h</div></div>
            <div className="radmin-kpi omega"><div className="radmin-kpi-v">{(rt24?.verdicts?.BLOCK ?? 0) + (rt24?.verdicts?.ENGINE_UNAVAILABLE ?? 0)}</div><div className="radmin-kpi-l">Failed / blocked evals · 24h</div></div>
            <div className="radmin-kpi warn"><div className="radmin-kpi-v">{c.critical_alerts_24h ?? 0}</div><div className="radmin-kpi-l">Critical alerts · 24h</div></div>
          </div>
        </section>

        <section className="radmin-card">
          <h2>Agent recommendations awaiting your approval</h2>
          <p className="radmin-sub">Approval re-evaluates the action through Runtime Governance with your authorisation attached — the engine issues the final permit.</p>
          {awaiting.length === 0 && <div className="radmin-empty">Nothing awaiting approval.</div>}
          {awaiting.map((p) => (
            <div key={p.id} className="radmin-deliv-row">
              <div>
                <div className="radmin-deliv-name">{p.action_id} <span className="radmin-badge">{p.risk}</span></div>
                <div className="radmin-deliv-meta">
                  {p.reasoning?.reason || p.decision?.reason || ""}
                  {p.reasoning?.confidence != null && <> · confidence {Math.round(p.reasoning.confidence * 100)}%</>}
                  {" · "}{fmtWhen(p.created_at)}
                </div>
              </div>
              <div className="radmin-deliv-actions">
                <button className="radmin-btn" disabled={busy} onClick={() => decide(p.id, "approve")}>Approve</button>
                <button className="radmin-btn" disabled={busy} onClick={() => decide(p.id, "deny")}>Deny</button>
              </div>
            </div>
          ))}
        </section>

        <section className="radmin-card">
          <h2>Deployment &amp; integration health</h2>
          <div className="radmin-checks">
            {integrations.map((it) => (
              <div key={it.name} className="radmin-check">
                <span className={`radmin-check-tag ${it.status === "healthy" ? "ok" : it.status === "unconfigured" ? "" : "warn"}`}>{it.status}</span>
                <span className="radmin-check-name">{it.name}</span>
                <span className="radmin-check-detail">{it.error || it.warning || ""}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="radmin-card">
          <h2>Recent agent cycles</h2>
          {runs.length === 0 && <div className="radmin-empty">No cycles recorded yet — run one above, or wait for the schedule.</div>}
          {runs.map((r) => (
            <div key={r.id} className="radmin-deliv-row">
              <div>
                <div className="radmin-deliv-name">{r.trigger} <span className="radmin-badge">{r.status}</span></div>
                <div className="radmin-deliv-meta">
                  {fmtWhen(r.started_at)} · {r.observations} observation(s) · {r.recommendations} recommendation(s)
                  {r.outcomes && <> · executed {r.outcomes.executed} / escalated {r.outcomes.escalated} / blocked {r.outcomes.blocked}</>}
                  {r.reasoning_source && <> · reasoning: {r.reasoning_source}</>}
                  {r.error && <> · error: {r.error}</>}
                </div>
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
