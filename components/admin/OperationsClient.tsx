"use client";
/**
 * Operations Agent — Control Room surface (executive briefing + operations).
 *
 * Browser surface over /api/ops/*. Auth rides the SAME operator session cookie
 * as the Runtime Control Room (/admin/runtime). No business logic here — every
 * number and sentence comes from lib/ops via the API, and every briefing
 * statement is clickable down to its backing records (provenance is part of
 * the payload, never invented in the UI).
 *
 * Views (deep-linkable): ?view=briefing|approvals|blocked|systems|evidence
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
const SEV_MARK: Record<string, string> = { ok: "✓", info: "·", warning: "⚠", critical: "✕" };

type View = "briefing" | "approvals" | "blocked" | "systems" | "evidence";
const VIEWS: View[] = ["briefing", "approvals", "blocked", "systems", "evidence"];
const VIEW_LABEL: Record<View, string> = { briefing: "Briefing", approvals: "Approvals", blocked: "Blocked", systems: "Systems", evidence: "Evidence" };

export default function OperationsClient() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [view, setView] = useState<View>("briefing");
  const [brief, setBrief] = useState<any>(null);
  const [dash, setDash] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Deep-link: /admin/operations?view=approvals etc.
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("view") as View | null;
    if (v && VIEWS.includes(v)) setView(v);
  }, []);
  const go = (v: View) => {
    setView(v);
    const url = new URL(window.location.href);
    url.searchParams.set("view", v);
    window.history.replaceState(null, "", url.toString());
  };
  // Internal evidenceUrl links (/admin/operations?view=x) switch views in place.
  const openHref = (href?: string | null) => {
    if (!href) return;
    if (href.startsWith("/admin/operations")) {
      const v = new URL(href, window.location.origin).searchParams.get("view") as View | null;
      if (v && VIEWS.includes(v)) { go(v); return; }
    }
    window.location.href = href;
  };

  const load = useCallback(async () => {
    try {
      const [b, d] = await Promise.all([api("briefing"), api("dashboard")]);
      setBrief(b); setDash(d); setAuthed(true); setErr(null);
    } catch (e: any) {
      if (e.status === 401) setAuthed(false); else setErr(e.message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const runCycle = async () => {
    setBusy(true); setNote(null);
    try {
      const r = await api("run", { method: "POST" });
      setNote(r.error ? `Agent cycle failed: ${r.error}` : `Agent cycle complete — ${r.proposals?.length ?? 0} proposal(s); outcomes: executed ${r.outcomes?.executed ?? 0}, escalated ${r.outcomes?.escalated ?? 0}, blocked ${r.outcomes?.blocked ?? 0}.`);
      await load();
    } catch (e: any) { setNote(e.message); }
    setBusy(false);
  };

  const decide = async (id: string, decision: "approve" | "deny") => {
    setBusy(true); setNote(null);
    try {
      const r = await api("proposals", { method: "POST", body: JSON.stringify({ id, decision }) });
      setNote(`Proposal ${decision === "approve" ? "approved" : "denied"} — Runtime Governance outcome: ${r.proposal?.status} (${r.proposal?.decision?.policy || ""}).`);
      await load();
    } catch (e: any) { setNote(e.message); }
    setBusy(false);
  };

  const propose = async (action_id: string, params: any, org_id?: string | null) => {
    setBusy(true); setNote(null);
    try {
      const r = await api("proposals", { method: "POST", body: JSON.stringify({ action_id, params, org_id }) });
      setNote(`Proposed ${action_id} — governance verdict: ${r.proposal?.status}.`);
      await load();
      if (r.proposal?.status === "escalated") go("approvals");
    } catch (e: any) { setNote(e.message); }
    setBusy(false);
  };

  if (authed === null) return <div className="radmin radmin-loading">Loading operations…</div>;
  if (authed === false) {
    return (
      <div className="radmin">
        <div className="radmin-card">
          <h2>Operator session required</h2>
          <p className="radmin-sub">Sign in to the <a href="/admin/runtime">Operator Control Room</a> first — the Operations page shares the same session.</p>
        </div>
      </div>
    );
  }

  const mode = brief?.mode;

  return (
    <div className="radmin">
      <header className="radmin-top">
        <div className="radmin-brand">
          <span className="radmin-omega">Ω</span>
          <div>
            <div className="radmin-title">Operations</div>
            <div className="radmin-sub">Autonomous operations · governed by Runtime Governance</div>
          </div>
        </div>
        <nav className="radmin-tabs">
          {VIEWS.map((v) => (
            <button key={v} className={`radmin-tab${view === v ? " is-active" : ""}`} onClick={() => go(v)}>{VIEW_LABEL[v]}</button>
          ))}
          <a className="radmin-tab" href="/admin/runtime">Control Room</a>
        </nav>
      </header>

      <main className="radmin-main">
        {mode && (
          <div className={`ops-mode ops-mode-${mode.mode}`}>
            <strong>{mode.label}</strong>
            <span> — {mode.detail}</span>
          </div>
        )}
        {err && <div className="radmin-err">{err}</div>}
        {note && <div className="radmin-card"><p>{note}</p></div>}

        {view === "briefing" && <BriefingView brief={brief} dash={dash} busy={busy} onRefresh={load} onGenerate={runCycle} onOpen={openHref} onDecide={decide} onPropose={propose} go={go} />}
        {view === "approvals" && <ApprovalsView dash={dash} busy={busy} onDecide={decide} />}
        {view === "blocked" && <BlockedView dash={dash} />}
        {view === "systems" && <SystemsView brief={brief} dash={dash} />}
        {view === "evidence" && <EvidenceView />}
      </main>
    </div>
  );
}

// ── Briefing ─────────────────────────────────────────────────────────────────
function BriefingView({ brief, dash, busy, onRefresh, onGenerate, onOpen, onDecide, onPropose, go }: any) {
  const [open, setOpen] = useState<string | null>(null);
  const items: any[] = brief?.items || [];
  const recs: any[] = brief?.recommended_actions || [];
  const counts = brief?.counts || {};
  const firstRec = recs[0];

  return (
    <>
      <section className="radmin-card ops-brief">
        <div className="ops-brief-head">
          <div>
            <h2 className="ops-greeting">{brief?.greeting?.text || "Briefing"}</h2>
            <p className="radmin-sub">Generated {fmtWhen(brief?.generated_at)} · every statement links to its source records</p>
          </div>
          <div className="ops-brief-actions">
            <button className="radmin-btn" onClick={onRefresh} disabled={busy}>Refresh briefing</button>
            <button className="radmin-btn" onClick={onGenerate} disabled={busy}>{busy ? "Working…" : "Generate briefing (run agent cycle)"}</button>
            <button className="radmin-btn" onClick={() => go("evidence")}>View evidence</button>
            <button className="radmin-btn" onClick={() => go("approvals")}>View proposals</button>
            {firstRec && <button className="radmin-btn" onClick={() => onOpen(firstRec.evidence_url)}>Open: {firstRec.title}</button>}
          </div>
        </div>

        <ul className="ops-items">
          {items.map((it) => (
            <li key={it.id} className={`ops-item sev-${it.severity}${it.available === false ? " is-unavailable" : ""}`}>
              <button className="ops-item-line" onClick={() => setOpen(open === it.id ? null : it.id)} title="Show source records">
                <span className="ops-item-mark">{SEV_MARK[it.severity] || "·"}</span>
                <span className="ops-item-msg">{it.message}</span>
              </button>
              {open === it.id && (
                <div className="ops-item-detail">
                  <div className="radmin-kv">
                    <span>source</span><code>{it.sourceType}</code>
                    {it.count != null && <><span>count</span><code>{it.count}</code></>}
                    {it.timeWindow && <><span>window</span><code>{it.timeWindow.from?.slice(0, 16)} → {it.timeWindow.to?.slice(0, 16)}</code></>}
                    {it.available === false && <><span>availability</span><code>{it.reason || "unavailable"}</code></>}
                  </div>
                  {it.sourceIds?.length > 0 && <div className="ops-ids">ids: {it.sourceIds.slice(0, 12).join(", ")}{it.sourceIds.length > 12 ? ` … (+${it.sourceIds.length - 12})` : ""}</div>}
                  {it.records?.length > 0 && <pre className="radmin-code ops-records">{JSON.stringify(it.records, null, 2)}</pre>}
                  {it.evidenceUrl && <button className="radmin-btn" onClick={() => onOpen(it.evidenceUrl)}>Open supporting view</button>}
                </div>
              )}
            </li>
          ))}
        </ul>

        <AskBox onOpen={onOpen} />
      </section>

      <section className="radmin-card">
        <h2>Operational counts</h2>
        <p className="radmin-sub">Live record counts — click any tile to open the corresponding view. “n/a” means the source is not configured, not zero.</p>
        <div className="radmin-kpis ops-counts">
          {Object.entries(counts).map(([key, c]: [string, any]) => (
            <button key={key} className={`radmin-kpi ops-count${c.unavailable ? " is-unavailable" : ""}`} onClick={() => onOpen(c.href)}>
              <div className="radmin-kpi-v">{c.unavailable ? "n/a" : c.value}</div>
              <div className="radmin-kpi-l">{key.replace(/_/g, " ")}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="radmin-card">
        <h2>Recommended actions</h2>
        <p className="radmin-sub">Prioritised by the agent from live records. Recommendations are never executed directly — privileged actions go through Runtime Governance and your approval.</p>
        {recs.length === 0 && <div className="radmin-empty">No immediate actions require your attention.</div>}
        {recs.map((r) => (
          <div key={`${r.priority}-${r.title}`} className="radmin-deliv-row ops-rec">
            <div>
              <div className="radmin-deliv-name">{r.priority}. {r.title} <span className="radmin-badge">{r.severity}</span> {r.governance_status !== "n/a" && <span className="radmin-badge">{r.governance_status}</span>}</div>
              <div className="radmin-deliv-meta">
                {r.org && <>org: {r.org} · </>}{r.reason}
                {r.confidence != null && <> · confidence {Math.round(r.confidence * 100)}%</>}
              </div>
            </div>
            <div className="radmin-deliv-actions">
              {r.proposed_action?.kind === "decide_proposal" && (
                <>
                  <button className="radmin-btn" disabled={busy} onClick={() => onDecide(r.proposed_action.proposal_id, "approve")}>Approve</button>
                  <button className="radmin-btn" disabled={busy} onClick={() => onDecide(r.proposed_action.proposal_id, "deny")}>Deny</button>
                </>
              )}
              {r.proposed_action?.kind === "propose" && (
                <button className="radmin-btn" disabled={busy} onClick={() => onPropose(r.proposed_action.action_id, r.proposed_action.params, r.org_id)}>Propose via governance</button>
              )}
              <button className="radmin-btn" onClick={() => onOpen(r.evidence_url)}>Evidence</button>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

// ── "Morning." input — restricted intent interface, not a chatbot ────────────
function AskBox({ onOpen }: any) {
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: any) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setBusy(true);
    try { setAnswer(await api("ask", { method: "POST", body: JSON.stringify({ prompt }) })); }
    catch (err: any) { setAnswer({ text: err.message }); }
    setBusy(false);
  };

  return (
    <div className="ops-ask">
      <form onSubmit={submit} className="ops-ask-form">
        <input
          className="ops-ask-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={'Type “Morning.” — or ask: What needs my attention? · Show blocked actions. · What is awaiting approval?'}
          aria-label="Ask the Operations Agent"
        />
        <button className="radmin-btn" disabled={busy}>{busy ? "…" : "Ask"}</button>
      </form>
      {answer && (
        <div className="ops-ask-answer">
          {answer.intent && <div className="radmin-deliv-meta">intent: {answer.intent} · answered from authorised operational data only</div>}
          <pre className="ops-ask-text">{answer.text || JSON.stringify(answer, null, 2)}</pre>
          {answer.evidenceUrl && <button className="radmin-btn" onClick={() => onOpen(answer.evidenceUrl)}>Open supporting view</button>}
        </div>
      )}
    </div>
  );
}

// ── Approvals ────────────────────────────────────────────────────────────────
function ApprovalsView({ dash, busy, onDecide }: any) {
  const awaiting: any[] = dash?.awaiting_approval || [];
  return (
    <section className="radmin-card">
      <h2>Pending approvals</h2>
      <p className="radmin-sub">Approving re-evaluates the SAME proposal through Runtime Governance with your operator identity and authorisation context attached — the engine issues the final permit. Denials are terminal and recorded as evidence.</p>
      {awaiting.length === 0 && <div className="radmin-empty">Nothing awaiting approval.</div>}
      {awaiting.map((p) => (
        <div key={p.id} className="radmin-deliv-row">
          <div>
            <div className="radmin-deliv-name">{p.action_id} <span className="radmin-badge">{p.risk}</span></div>
            <div className="radmin-deliv-meta">
              {p.org_id && <>org: {p.org_id} · </>}
              {p.reasoning?.reason || p.decision?.reason || ""}
              {p.reasoning?.confidence != null && <> · confidence {Math.round(p.reasoning.confidence * 100)}%</>}
              {" · proposed "}{fmtWhen(p.created_at)}
              {p.decision?.rule && <> · Ω rule: {p.decision.rule}</>}
            </div>
            {p.params && Object.keys(p.params).length > 0 && <pre className="radmin-code ops-records">{JSON.stringify(p.params, null, 2)}</pre>}
          </div>
          <div className="radmin-deliv-actions">
            <button className="radmin-btn" disabled={busy} onClick={() => onDecide(p.id, "approve")}>Approve</button>
            <button className="radmin-btn" disabled={busy} onClick={() => onDecide(p.id, "deny")}>Deny</button>
          </div>
        </div>
      ))}
    </section>
  );
}

// ── Blocked actions ──────────────────────────────────────────────────────────
function remediation(b: any): string {
  if (b.policy === "fail_closed_engine_unavailable") return "Remediable: retry once the governance engine is reachable.";
  if (b.policy === "operator_denied") return "Remediable: re-propose if circumstances change.";
  if (b.rule === "ops_evidence_destruction" || b.rule === "ops_credential_sharing") return "Not remediable: unconditionally prohibited — no authorisation overrides this.";
  return "Final for this proposal. A new proposal with proper authorisation may be evaluated.";
}
function BlockedView({ dash }: any) {
  const rows: any[] = dash?.blocked_evidence_7d || [];
  return (
    <section className="radmin-card">
      <h2>Blocked actions (last 7 days)</h2>
      <p className="radmin-sub">Verdicts issued by Runtime Governance. The agent cannot override a blocked verdict; evidence is write-once.</p>
      {rows.length === 0 && <div className="radmin-empty">No blocked actions in the last 7 days.</div>}
      {rows.map((b) => (
        <div key={b.id} className="radmin-deliv-row">
          <div>
            <div className="radmin-deliv-name">{b.action_id} <span className="radmin-badge">{b.risk || "—"}</span> <span className="radmin-badge">blocked</span></div>
            <div className="radmin-deliv-meta">
              actor: {b.actor} · agent: {b.agent}
              {b.org_id && <> · org: {b.org_id}</>}
              {" · policy: "}{b.policy}
              {b.rule && <> · Ω rule: {b.rule}</>}
              {" · "}{fmtWhen(b.created_at)}
            </div>
            <div className="radmin-deliv-meta">reason: {b.reason}</div>
            <div className="radmin-deliv-meta">{remediation(b)}</div>
            <div className="ops-ids">evidence id: {b.id}{b.trajectory_hash && <> · trajectory: {String(b.trajectory_hash).slice(0, 16)}…</>}</div>
          </div>
        </div>
      ))}
    </section>
  );
}

// ── Systems ──────────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  healthy: "Healthy", degraded: "Degraded", unavailable: "Unavailable",
  not_configured: "Not configured", awaiting_credentials: "Awaiting credentials",
};
function SystemsView({ brief, dash }: any) {
  const systems: any[] = brief?.systems || [];
  const runs: any[] = dash?.recent_runs || [];
  return (
    <>
      <section className="radmin-card">
        <h2>System health &amp; integration readiness</h2>
        <p className="radmin-sub">Statuses are verified, never assumed — an unverifiable component reports its state and the exact configuration it needs.</p>
        <div className="ops-systems">
          {systems.map((s) => (
            <div key={s.component} className={`ops-system st-${s.status}`}>
              <div className="ops-system-head">
                <span className="ops-system-name">{s.component.replace(/_/g, " ")}</span>
                <span className={`radmin-check-tag ${s.status === "healthy" ? "ok" : s.status === "not_configured" ? "" : "warn"}`}>{STATUS_LABEL[s.status] || s.status}</span>
              </div>
              <div className="radmin-deliv-meta">{s.detail}</div>
              {s.required_env?.length > 0 && <div className="ops-ids">requires: {s.required_env.join(", ")}</div>}
            </div>
          ))}
        </div>
      </section>
      <section className="radmin-card">
        <h2>Recent agent cycles</h2>
        {runs.length === 0 && <div className="radmin-empty">No cycles recorded yet — generate a briefing, or configure the schedule.</div>}
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
    </>
  );
}

// ── Evidence ─────────────────────────────────────────────────────────────────
function EvidenceView() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [verdict, setVerdict] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (v: string) => {
    try {
      const d = await api(`evidence?limit=100${v ? `&verdict=${v}` : ""}`);
      setRows(d.evidence || []); setErr(null);
    } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { load(verdict); }, [load, verdict]);

  return (
    <section className="radmin-card">
      <h2>Decision evidence</h2>
      <p className="radmin-sub">Write-once record of every governance decision on an agent action: timestamp · actor · agent · policy · risk · reason · verdict · execution result · organisation.</p>
      <div className="ops-brief-actions">
        {["", "allow", "escalate", "block"].map((v) => (
          <button key={v || "all"} className={`radmin-tab${verdict === v ? " is-active" : ""}`} onClick={() => setVerdict(v)}>{v || "all"}</button>
        ))}
      </div>
      {err && <div className="radmin-err">{err}</div>}
      {rows && rows.length === 0 && <div className="radmin-empty">No evidence rows for this filter.</div>}
      {(rows || []).map((b) => (
        <div key={b.id} className="radmin-deliv-row">
          <div>
            <div className="radmin-deliv-name">{b.action_id} <span className="radmin-badge">{b.verdict}</span> <span className="radmin-badge">{b.risk || "—"}</span></div>
            <div className="radmin-deliv-meta">
              {fmtWhen(b.created_at)} · actor: {b.actor} · policy: {b.policy}
              {b.rule && <> · Ω rule: {b.rule}</>}
              {b.org_id && <> · org: {b.org_id}</>}
              {b.execution && <> · executed: {String(b.execution.executed)}</>}
            </div>
            <div className="radmin-deliv-meta">{b.reason}</div>
          </div>
        </div>
      ))}
    </section>
  );
}
