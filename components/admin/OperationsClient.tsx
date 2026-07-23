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

type View = "briefing" | "customers" | "agents" | "handoffs" | "approvals" | "blocked" | "systems" | "evidence";
const VIEWS: View[] = ["briefing", "customers", "agents", "handoffs", "approvals", "blocked", "systems", "evidence"];
const VIEW_LABEL: Record<View, string> = { briefing: "Briefing", customers: "Customers", agents: "Agents", handoffs: "Handoffs", approvals: "Approvals", blocked: "Blocked", systems: "Systems", evidence: "Evidence" };

const scoreClass = (band: string) =>
  ["healthy", "ready", "strong", "low"].includes(band) ? "ok"
  : ["watch", "emerging", "developing", "elevated"].includes(band) ? "warn"
  : ["at_risk", "not_ready", "weak", "high"].includes(band) ? "bad" : "";

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
      const u = new URL(href, window.location.origin);
      const v = u.searchParams.get("view") as View | null;
      if (v && VIEWS.includes(v)) {
        const cur = new URL(window.location.href);
        cur.searchParams.set("view", v);
        const org = u.searchParams.get("org");
        if (org) cur.searchParams.set("org", org); else cur.searchParams.delete("org");
        window.history.replaceState(null, "", cur.toString());
        setView(v);
        return;
      }
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
        {view === "customers" && <CustomersView brief={brief} onOpen={openHref} />}
        {view === "agents" && <AgentsView onOpen={openHref} />}
        {view === "handoffs" && <HandoffsView onOpen={openHref} />}
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

        {brief?.top_priority && (
          <div className="ops-priority">
            <div className="ops-priority-label">Recommended priority</div>
            <div className="ops-priority-main">
              {brief.top_priority.org && <span className="ops-priority-org">{brief.top_priority.org}</span>}
              <span className="ops-priority-title">{brief.top_priority.title}</span>
              <span className="ops-priority-conf">{Math.round(brief.top_priority.confidence * 100)}% confidence</span>
            </div>
            <div className="ops-priority-reason">{brief.top_priority.reason}</div>
            <div className="ops-brief-actions">
              <button className="radmin-btn" onClick={() => onOpen(brief.top_priority.evidence_url)}>Open</button>
              <button className="radmin-btn" onClick={() => go("customers")}>Customer intelligence</button>
            </div>
          </div>
        )}

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

// ── Customers (Customer Intelligence) ────────────────────────────────────────
function ScoreChip({ label, score, band }: any) {
  return (
    <div className={`ops-chip ${scoreClass(band)}`} title={band}>
      <span className="ops-chip-v">{score}</span>
      <span className="ops-chip-l">{label}</span>
    </div>
  );
}
function CustomersView({ brief, onOpen }: any) {
  const [rows, setRows] = useState<any[] | null>(brief?.customer_intelligence || null);
  const [detail, setDetail] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  // Deep-linked org (?view=customers&org=...) opens that customer's detail.
  useEffect(() => {
    const org = new URLSearchParams(window.location.search).get("org");
    (async () => {
      try {
        const list = await api("customers");
        setRows(list.customers.map((c: any) => ({
          org_id: c.org_id, name: c.name, stage: c.stage_label, lifecycle: c.lifecycle_label, stalled: c.stalled,
          health: c.scores.health.score, health_band: c.scores.health.band,
          pilot_readiness: c.scores.pilot_readiness.score, pilot_band: c.scores.pilot_readiness.band,
          runtime_risk: c.scores.runtime_risk.score, risk_band: c.scores.runtime_risk.band,
          engagement: c.scores.engagement.score,
          integration: c.integration_status.status, business_value: c.business_value.band,
          next_recommendation: c.next_recommendation.title,
        })));
        if (org) openDetail(org);
      } catch (e: any) { setErr(e.message); }
    })();
  }, []);

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const openDetail = async (org_id: string) => {
    try { const d = await api(`customers?org_id=${encodeURIComponent(org_id)}`); setDetail(d.customer); }
    catch (e: any) { setErr(e.message); }
  };
  const advance = async (org_id: string) => {
    setBusy(true); setNote(null);
    try {
      const r = await api("lifecycle", { method: "POST", body: JSON.stringify({ org_id }) });
      const res = r.result || {};
      setNote(res.advanced ? `Transition ${res.from} → ${res.to} executed after governance PERMIT.`
        : res.status === "escalated" ? `Transition ${res.from} → ${res.to} proposed — awaiting your approval (see Approvals).`
        : res.status === "blocked" ? `Transition blocked by Runtime Governance.`
        : res.note || "No advance available.");
      await openDetail(org_id);
    } catch (e: any) { setNote(e.message); }
    setBusy(false);
  };

  if (detail) {
    const s = detail.scores;
    const lc = detail.lifecycle;
    const na = lc?.next_action;
    return (
      <section className="radmin-card">
        <div className="ops-brief-head">
          <div><h2>{detail.name}</h2><p className="radmin-sub">Lifecycle: <strong>{lc?.current_label}</strong> · engagement: {detail.stage_label} · integration: {detail.integration_status.status}{detail.stalled ? " · stalled" : ""}</p></div>
          <button className="radmin-btn" onClick={() => setDetail(null)}>← All customers</button>
        </div>

        {lc && (
          <div className="ops-lifecycle">
            <div className="ops-track">
              {lc.stages.map((st: any) => (
                <div key={st.key} className={`ops-track-node ${st.status}`} title={st.status}>
                  <span className="ops-track-dot">{st.status === "completed" ? "✓" : st.status === "current" ? "●" : "○"}</span>
                  <span className="ops-track-label">{st.label}</span>
                </div>
              ))}
            </div>
            <div className="ops-track-derivation">Stage derived from: {lc.derivation}</div>
            {na?.action_id ? (
              <div className="ops-next-action">
                <div>
                  <div className="radmin-deliv-name">Next governed action: {na.title} <span className="radmin-badge">{na.risk}</span>{na.requires_approval && <span className="radmin-badge">approval required</span>}</div>
                  <div className="radmin-deliv-meta">{na.from} → {na.to} · {na.governance}</div>
                </div>
                <button className="radmin-btn" disabled={busy} onClick={() => advance(detail.org_id)}>{busy ? "Working…" : na.requires_approval ? "Propose transition" : "Advance"}</button>
              </div>
            ) : <p className="radmin-sub">At the terminal stage — renewal / expansion.</p>}
            {note && <p className="radmin-sub">{note}</p>}
          </div>
        )}

        <div className="ops-chips">
          <ScoreChip label="Health" score={s.health.score} band={s.health.band} />
          <ScoreChip label="Pilot readiness" score={s.pilot_readiness.score} band={s.pilot_readiness.band} />
          <ScoreChip label="Runtime risk" score={s.runtime_risk.score} band={s.runtime_risk.band} />
          <ScoreChip label="Engagement" score={s.engagement.score} band={s.engagement.band} />
        </div>
        <p className="radmin-sub" style={{ marginTop: 12 }}>Next recommendation: <strong>{detail.next_recommendation.title}</strong></p>
        {(["health", "pilot_readiness", "runtime_risk", "engagement"] as const).map((k) => (
          <details key={k} className="ops-score-formula">
            <summary>{k.replace(/_/g, " ")} — {s[k].score}/100 ({s[k].band}) · how it's computed</summary>
            <div className="radmin-kv"><span>formula</span><code>{s[k].formula}</code></div>
            <ul className="radmin-sub">{s[k].inputs.map((i: any, n: number) => <li key={n}>{i.label}: {i.points >= 0 ? "+" : ""}{i.points}{i.detail ? ` — ${i.detail}` : ""}</li>)}</ul>
          </details>
        ))}
        <h2 style={{ marginTop: 18 }}>Evidence timeline</h2>
        {(detail.timeline || []).length === 0 && <div className="radmin-empty">No recorded events yet.</div>}
        {(detail.timeline || []).map((t: any, i: number) => (
          <div key={i} className="radmin-deliv-row">
            <div><div className="radmin-deliv-name">{t.kind.replace(/_/g, " ")} <span className="radmin-badge">{fmtWhen(t.at)}</span></div><div className="radmin-deliv-meta">{t.detail}</div></div>
          </div>
        ))}

        <h2 style={{ marginTop: 18 }}>Transition history</h2>
        <p className="radmin-sub">Every governed lifecycle transition, linked to its proposal + governance verdict.</p>
        {(detail.transition_history || []).length === 0 && <div className="radmin-empty">No governed transitions recorded yet.</div>}
        {(detail.transition_history || []).map((h: any) => (
          <div key={h.id} className="radmin-deliv-row">
            <div>
              <div className="radmin-deliv-name">{h.from} → {h.to} <span className="radmin-badge">{h.status}</span>{h.governance?.rule && <span className="radmin-badge">Ω {h.governance.rule}</span>}</div>
              <div className="radmin-deliv-meta">
                {h.action_id} · {fmtWhen(h.at)} · initiated by {h.initiated_by}
                {h.governance && <> · verdict {h.governance.verdict} ({h.governance.policy})</>}
                {h.approval && <> · {h.approval.action} by {h.approval.actor}</>}
              </div>
            </div>
          </div>
        ))}

        {(detail.approval_history || []).length > 0 && (
          <>
            <h2 style={{ marginTop: 18 }}>Approval history</h2>
            {(detail.approval_history || []).map((a: any, i: number) => (
              <div key={i} className="radmin-deliv-row">
                <div><div className="radmin-deliv-name">{a.transition} <span className="radmin-badge">{a.action}</span> <span className="radmin-badge">{a.outcome}</span></div>
                <div className="radmin-deliv-meta">{a.actor} · {fmtWhen(a.at)}{a.note ? ` · ${a.note}` : ""}</div></div>
              </div>
            ))}
          </>
        )}
      </section>
    );
  }

  return (
    <section className="radmin-card">
      <h2>Customer intelligence</h2>
      <p className="radmin-sub">Every organisation as a living object — deterministic scores from real records (click a row for the formula + evidence timeline). Sorted most-at-risk first.</p>
      {err && <div className="radmin-err">{err}</div>}
      {rows === null && <div className="radmin-empty">Loading…</div>}
      {rows && rows.length === 0 && <div className="radmin-empty">No organisations yet.</div>}
      {(rows || []).map((c: any) => (
        <button key={c.org_id} className="ops-cust-card" onClick={() => openDetail(c.org_id)}>
          <div className="ops-cust-top">
            <span className="ops-cust-name">{c.name}</span>
            {c.lifecycle && <span className="radmin-badge ops-badge-lc">{c.lifecycle}</span>}
            {c.stalled && <span className="radmin-badge">stalled</span>}
            <span className="radmin-badge">{c.integration}</span>
          </div>
          <div className="ops-chips">
            <ScoreChip label="Health" score={c.health} band={c.health_band} />
            <ScoreChip label="Pilot" score={c.pilot_readiness} band={c.pilot_band} />
            <ScoreChip label="Risk" score={c.runtime_risk} band={c.risk_band} />
            <ScoreChip label="Engage" score={c.engagement} band={""} />
          </div>
          <div className="radmin-deliv-meta">Next: {c.next_recommendation}</div>
        </button>
      ))}
    </section>
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
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const g = new URLSearchParams(window.location.search).get("gmail");
    if (g === "connected") setNote("Gmail connected — read-only inbox monitoring is active.");
    else if (g === "error") setNote("Gmail connection failed — check OAuth configuration and try again.");
  }, []);
  const gmailAction = async (action: "poll" | "disconnect") => {
    setBusy(true); setNote(null);
    try {
      const r = await api("gmail", { method: "POST", body: JSON.stringify({ action }) });
      setNote(action === "poll" ? `Inbox polled — ${r.result?.new ?? 0} new email(s), ${r.result?.matched ?? 0} matched to customers.` : "Gmail disconnected — token revoked and dropped.");
    } catch (e: any) { setNote(e.message); }
    setBusy(false);
  };

  return (
    <>
      <section className="radmin-card">
        <h2>System health &amp; integration readiness</h2>
        <p className="radmin-sub">Statuses are verified, never assumed — an unverifiable component reports its state and the exact configuration it needs.</p>
        {note && <div className="ops-note">{note}</div>}
        <div className="ops-systems">
          {systems.map((s) => (
            <div key={s.component} className={`ops-system st-${s.status}`}>
              <div className="ops-system-head">
                <span className="ops-system-name">{s.component.replace(/_/g, " ")}</span>
                <span className={`radmin-check-tag ${s.status === "healthy" ? "ok" : s.status === "not_configured" ? "" : "warn"}`}>{STATUS_LABEL[s.status] || s.status}</span>
              </div>
              <div className="radmin-deliv-meta">{s.detail}</div>
              {s.required_env?.length > 0 && <div className="ops-ids">requires: {s.required_env.join(", ")}</div>}
              {s.component === "email" && s.status === "awaiting_credentials" && (
                <a className="radmin-btn sm" href="/api/ops/gmail/auth" style={{ marginTop: 8, display: "inline-flex" }}>Connect Gmail (read-only)</a>
              )}
              {s.component === "email" && s.status === "healthy" && (
                <div className="ops-brief-actions" style={{ marginTop: 8 }}>
                  <button className="radmin-btn sm" disabled={busy} onClick={() => gmailAction("poll")}>Poll now</button>
                  <button className="radmin-btn sm" disabled={busy} onClick={() => gmailAction("disconnect")}>Disconnect</button>
                </div>
              )}
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

// ── Multi-Agent Core (Pillar 4) ──────────────────────────────────────────────
const AGENT_ICON: Record<string, string> = { sales: "◆", deployment: "▲", customer_success: "●", compliance: "⬢", finance: "$" };
function AgentsView({ onOpen }: { onOpen: (href?: string | null) => void }) {
  const [roster, setRoster] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setRoster(await api("agents")); setErr(null); }
    catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const runCouncil = async () => {
    setBusy(true); setNote(null);
    try {
      const r = await api("agents", { method: "POST" });
      const o = r.result?.outcomes || {};
      setNote(r.result?.error ? `Council failed: ${r.result.error}` : `Council cycle complete — ${r.result?.proposals?.length ?? 0} governed proposal(s): executed ${o.executed ?? 0}, escalated ${o.escalated ?? 0}, blocked ${o.blocked ?? 0}. Each proposal passed Runtime Governance.`);
      await load();
    } catch (e: any) { setNote(e.message); }
    setBusy(false);
  };

  if (err) return <div className="radmin-err">{err}</div>;
  if (!roster) return <div className="radmin-loading">Loading agents…</div>;

  return (
    <>
      <section className="radmin-card">
        <div className="ops-brief-head">
          <div>
            <h2>Multi-Agent Core</h2>
            <p className="radmin-sub">Five governed specialists share one governance, evidence, proposal and state-machine spine. Each advances the <em>same</em> lifecycle within its charter — no agent invents a workflow, and none gets elevated trust: high-risk transitions still escalate for your approval.</p>
          </div>
          <button className="radmin-btn" disabled={busy} onClick={runCouncil}>{busy ? "Running…" : "Run council cycle"}</button>
        </div>
        {note && <div className="ops-note">{note}</div>}
      </section>

      <div className="ops-agent-grid">
        {roster.agents.map((a: any) => (
          <section key={a.id} className="radmin-card ops-agent">
            <div className="ops-agent-head">
              <span className="ops-agent-icon" aria-hidden>{AGENT_ICON[a.id] || "◈"}</span>
              <div>
                <h3>{a.title}</h3>
                <div className="ops-agent-stages">{a.charter.stages.length ? a.charter.stages.map((s: string) => <span key={s} className="ops-badge-lc">{s.replace(/_/g, " ")}</span>) : <span className="radmin-sub">cross-cutting · owns no lifecycle transition</span>}</div>
              </div>
            </div>
            <p className="radmin-sub ops-agent-mandate">{a.mandate}</p>

            <div className="ops-agent-workload">
              <span className="ops-wl"><b>{a.workload.total}</b> total</span>
              <span className="ops-wl ops-wl-esc"><b>{a.workload.escalated}</b> awaiting approval</span>
              <span className="ops-wl ops-wl-ok"><b>{a.workload.executed}</b> executed</span>
              {a.workload.blocked > 0 && <span className="ops-wl ops-wl-bad"><b>{a.workload.blocked}</b> blocked</span>}
            </div>

            <div className="ops-agent-charter">
              <div className="radmin-deliv-meta">Chartered actions</div>
              <div className="ops-charter-actions">
                {a.charter.actions.map((c: any) => (
                  <span key={c.id} className={`ops-charter-act${c.refuse ? " is-refuse" : c.auto ? " is-auto" : " is-approval"}`} title={`${c.risk} risk · ${c.refuse ? "never executed" : c.auto ? "auto after PERMIT" : "requires approval"}`}>{c.title}</span>
                ))}
              </div>
            </div>

            {a.recent.length > 0 && (
              <div className="ops-agent-recent">
                <div className="radmin-deliv-meta">Recent governed proposals</div>
                {a.recent.slice(0, 5).map((p: any) => (
                  <div key={p.id} className="ops-agent-prop">
                    <span className="ops-agent-prop-act">{p.action_id.replace(/_/g, " ")}</span>
                    <span className={`radmin-badge ${p.status === "executed" ? "ok" : p.status === "escalated" ? "warn" : p.status === "blocked" || p.status === "denied" ? "bad" : ""}`}>{p.status}</span>
                    {p.verdict && <span className="radmin-deliv-meta"> · Ω {p.verdict}</span>}
                    <span className="radmin-deliv-meta"> · {fmtWhen(p.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
            <button className="radmin-linkbtn" onClick={() => onOpen("/admin/operations?view=approvals")}>Review approvals →</button>
          </section>
        ))}
      </div>
    </>
  );
}

// ── Agent Handoff Timeline (Pillar 5) ────────────────────────────────────────
const hoStatusClass = (s: string) => s === "resolved" ? "ok" : s === "escalated" ? "warn" : (s === "blocked" ? "bad" : "");
function HandoffsView({ onOpen }: { onOpen: (href?: string | null) => void }) {
  const [data, setData] = useState<any>(null);
  const [integ, setInteg] = useState<any>(null);
  const [org, setOrg] = useState<string>("");
  const [timeline, setTimeline] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const o = new URLSearchParams(window.location.search).get("org") || "";
    if (o) setOrg(o);
  }, []);
  const loadSummary = useCallback(async () => {
    try {
      const [d, i] = await Promise.all([api("handoffs"), api("integrity").catch(() => null)]);
      setData(d); setInteg(i); setErr(null);
    } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => {
    if (!org) { setTimeline(null); return; }
    api(`handoffs?org_id=${encodeURIComponent(org)}`).then((d) => setTimeline(d.timeline || [])).catch((e) => setErr(e.message));
  }, [org]);

  if (err) return <div className="radmin-err">{err}</div>;
  if (!data) return <div className="radmin-loading">Loading handoffs…</div>;
  const s = data.summary || { by_status: {}, by_agent: {} };

  return (
    <>
      {integ && (
        <div className={`ops-integrity ${integ.ok ? "ok" : "bad"}`}>
          <div className="ops-integrity-head">
            <span className="ops-integrity-dot">{integ.ok ? "✓" : "✕"}</span>
            <strong>Coordination integrity: {integ.ok ? "all checks passed" : `${integ.anomalies.length} anomaly(ies)`}</strong>
            <span className="radmin-deliv-meta">· {integ.handoffs_checked} handoff(s), {integ.council_cycles?.recent || 0} council cycle(s) in {integ.window_days}d · {integ.audit?.approvals_audited || 0}/{integ.audit?.approvals_seen || 0} approvals audited · coordination {integ.council_cycles?.last_coordinating ? "on" : "off"}</span>
          </div>
          {!integ.ok && (
            <ul className="ops-integrity-list">
              {integ.anomalies.slice(0, 8).map((a: any, i: number) => (
                <li key={i}><code>{a.type}</code> — {a.from_agent}→{a.to_agent} {a.action_id ? `(${a.action_id})` : ""}: {a.detail}{a.org_id && <> · <button className="radmin-linkbtn ops-inline" onClick={() => setOrg(a.org_id)}>chain</button></>}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <section className="radmin-card">
        <h2>Agent handoffs — chain of responsibility</h2>
        <p className="radmin-sub">Every baton pass between agents is a typed, durable, auditable record. A handoff is a <em>coordination</em> record only — work still changes state solely through the governed proposal it links to. Open inbound handoffs are an agent&rsquo;s task queue; blocked / escalated ones are your work items.</p>
        <div className="ops-ho-status">
          {["open", "accepted", "escalated", "blocked", "resolved"].map((k) => (
            <span key={k} className={`ops-ho-chip ${hoStatusClass(k)}`}><b>{s.by_status?.[k] || 0}</b> {k}</span>
          ))}
        </div>
        <div className="ops-ho-queues">
          {Object.entries(s.by_agent || {}).map(([agent, q]: any) => (
            <span key={agent} className="ops-ho-queue">{agent.replace(/_/g, " ")}: <b>{q.open}</b> open / {q.total}</span>
          ))}
        </div>
      </section>

      {(data.blocked_work || []).length > 0 && (
        <section className="radmin-card">
          <h3>Needs your attention</h3>
          {data.blocked_work.map((h: any) => (
            <div key={h.id} className={`ops-ho-row sev-${h.status === "blocked" ? "critical" : "warning"}`}>
              <div className="ops-ho-flow"><b>{h.from_agent}</b> → <b>{h.to_agent}</b> <span className="radmin-badge">{h.kind}</span> <span className={`radmin-badge ${hoStatusClass(h.status)}`}>{h.status}</span></div>
              <div className="radmin-deliv-meta">{(h.proposed_action?.action_id || "—").replace(/_/g, " ")} · {h.reason}</div>
              <button className="radmin-linkbtn" onClick={() => setOrg(h.org_id)}>View chain →</button>
            </div>
          ))}
        </section>
      )}

      <section className="radmin-card">
        <div className="ops-brief-head">
          <h3>{org ? "Chain of responsibility" : "Select a customer to trace a chain"}</h3>
          {org && <button className="radmin-btn sm" onClick={() => { setOrg(""); setTimeline(null); }}>Clear</button>}
        </div>
        {!org && <p className="radmin-sub">Open a handoff above, or a customer from the Customers tab, to see its full governed handoff chain.</p>}
        {org && timeline && timeline.length === 0 && <div className="radmin-empty">No handoffs recorded for this customer yet.</div>}
        {org && timeline && timeline.length > 0 && (
          <ol className="ops-ho-timeline">
            {timeline.map((h: any) => (
              <li key={h.id} className={`ops-ho-node ${hoStatusClass(h.status)}`}>
                <div className="ops-ho-node-head">
                  <span className="ops-ho-flow"><b>{h.from_agent}</b> → <b>{h.to_agent}</b></span>
                  <span className={`radmin-badge ${hoStatusClass(h.status)}`}>{h.status}</span>
                  {h.governance && <span className="radmin-badge">Ω {h.governance.verdict}</span>}
                </div>
                <div className="radmin-deliv-meta">{(h.proposed_action?.action_id || "—").replace(/_/g, " ")} — {h.reason}</div>
                <div className="radmin-deliv-meta">
                  {fmtWhen(h.created_at)}
                  {h.approval && <> · approved by {h.approval.actor}</>}
                  {h.proposal_id && <> · <button className="radmin-linkbtn ops-inline" onClick={() => onOpen("/admin/operations?view=approvals")}>proposal</button></>}
                  {h.attempts > 0 && <> · {h.attempts} attempt(s)</>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
