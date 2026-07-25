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

type View = "guardian" | "workspaces" | "industry" | "sovereign" | "provision" | "governance" | "briefing" | "command" | "policies" | "customers" | "agents" | "handoffs" | "memory" | "approvals" | "blocked" | "systems" | "evidence";
const VIEWS: View[] = ["guardian", "workspaces", "industry", "sovereign", "provision", "governance", "briefing", "command", "policies", "customers", "agents", "handoffs", "memory", "approvals", "blocked", "systems", "evidence"];
const VIEW_LABEL: Record<View, string> = { guardian: "Guardian", workspaces: "Workspaces", industry: "Industry", sovereign: "Sovereign", provision: "Provision", governance: "Governance", briefing: "Briefing", command: "Command", policies: "Policies", customers: "Customers", agents: "Agents", handoffs: "Handoffs", memory: "Memory", approvals: "Approvals", blocked: "Blocked", systems: "Systems", evidence: "Evidence" };

const scoreClass = (band: string) =>
  ["healthy", "ready", "strong", "low"].includes(band) ? "ok"
  : ["watch", "emerging", "developing", "elevated"].includes(band) ? "warn"
  : ["at_risk", "not_ready", "weak", "high"].includes(band) ? "bad" : "";

export default function OperationsClient() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [view, setView] = useState<View>("guardian");
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

        {view === "guardian" && <GuardianView onOpen={openHref} go={go} />}
        {view === "workspaces" && <WorkspacesView onOpen={openHref} go={go} />}
        {view === "industry" && <IndustryView onOpen={openHref} go={go} />}
        {view === "sovereign" && <SovereignView onOpen={openHref} go={go} />}
        {view === "provision" && <ProvisionView onOpen={openHref} go={go} />}
        {view === "governance" && <GovernanceView onOpen={openHref} go={go} />}
        {view === "briefing" && <BriefingView brief={brief} dash={dash} busy={busy} onRefresh={load} onGenerate={runCycle} onOpen={openHref} onDecide={decide} onPropose={propose} go={go} />}
        {view === "command" && <CommandView onOpen={openHref} />}
        {view === "policies" && <PoliciesView onOpen={openHref} go={go} />}
        {view === "customers" && <CustomersView brief={brief} onOpen={openHref} />}
        {view === "agents" && <AgentsView onOpen={openHref} />}
        {view === "handoffs" && <HandoffsView onOpen={openHref} />}
        {view === "memory" && <MemoryView />}
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
            <p className="radmin-sub">Six governed specialists — Sales, Deployment, Customer Success, Compliance, Finance and a cross-cutting Security &amp; Threat watchdog — share one governance, evidence, proposal and state-machine spine. Each advances the <em>same</em> lifecycle within its charter — no agent invents a workflow, and none gets elevated trust: high-risk transitions still escalate for your approval.</p>
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

// ── Enterprise Memory / Evidence Graph (Phase 3) ─────────────────────────────
const PROV_LABEL: Record<string, string> = {
  observed_fact: "Observed fact", deterministic_derivation: "Derivation",
  model_interpretation: "Model interpretation", recommendation: "Recommendation", approved_decision: "Approved decision",
};
const PROV_CLASS: Record<string, string> = {
  observed_fact: "ok", deterministic_derivation: "accent", model_interpretation: "warn", recommendation: "", approved_decision: "accent",
};
function MemoryView() {
  const [orgs, setOrgs] = useState<any[] | null>(null);
  const [org, setOrg] = useState<string>("");
  const [graph, setGraph] = useState<any>(null);
  const [trace, setTrace] = useState<any>(null);
  const [replay, setReplay] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api("customers").then((d) => {
      const rows = d.customers || d.rows || d || [];
      setOrgs(rows);
      const pre = new URLSearchParams(window.location.search).get("org") || (rows[0] && (rows[0].org_id || rows[0].id)) || "";
      if (pre) setOrg(pre);
    }).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => {
    if (!org) return;
    setTrace(null); setReplay(null);
    api(`graph?org_id=${encodeURIComponent(org)}`).then((d) => setGraph(d.graph)).catch((e) => setErr(e.message));
  }, [org]);
  const openTrace = async (nodeId: string) => {
    try { const d = await api(`graph?org_id=${encodeURIComponent(org)}&node=${encodeURIComponent(nodeId)}`); setTrace(d.trace); } catch (e: any) { setErr(e.message); }
  };
  const loadReplay = async () => {
    try { const d = await api(`graph?org_id=${encodeURIComponent(org)}&view=replay`); setReplay(d.replay || []); } catch (e: any) { setErr(e.message); }
  };

  if (err) return <div className="radmin-err">{err}</div>;
  if (!orgs) return <div className="radmin-loading">Loading memory…</div>;

  const byProv: Record<string, any[]> = {};
  for (const n of (graph?.nodes || [])) (byProv[n.provenance] = byProv[n.provenance] || []).push(n);

  return (
    <>
      <section className="radmin-card">
        <div className="ops-brief-head">
          <div>
            <h2>Enterprise memory — evidence graph</h2>
            <p className="radmin-sub">A read-only projection over authoritative records — every agent can query it, none can rewrite it. Each node is classified by provenance; derivations link back to the facts behind them; contradictions are surfaced, never silently resolved. Strictly tenant-scoped.</p>
          </div>
          <select className="radmin-select" value={org} onChange={(e) => setOrg(e.target.value)}>
            {orgs.map((o) => <option key={o.org_id || o.id} value={o.org_id || o.id}>{o.name}</option>)}
          </select>
        </div>
        {graph && (
          <div className="ops-prov-legend">
            {Object.entries(graph.provenance || {}).filter(([, n]: any) => n).map(([k, n]: any) => (
              <span key={k} className={`radmin-badge ${PROV_CLASS[k] || ""}`}>{PROV_LABEL[k] || k}: {n}</span>
            ))}
            <button className="radmin-linkbtn" onClick={loadReplay}>Replay decision timeline →</button>
          </div>
        )}
      </section>

      {graph && graph.contradictions.length > 0 && (
        <section className="radmin-card ops-contradictions">
          <h3>⚠ Contradictions surfaced ({graph.contradictions.length})</h3>
          <p className="radmin-sub">Flagged for you to resolve — the memory never silently reconciles conflicting records.</p>
          {graph.contradictions.map((c: any, i: number) => (
            <div key={i} className={`ops-ho-row sev-${c.severity === "info" ? "warning" : c.severity}`}>
              <div className="ops-ho-flow"><code>{c.type}</code></div>
              <div className="radmin-deliv-meta">{c.detail}</div>
            </div>
          ))}
        </section>
      )}

      {replay && (
        <section className="radmin-card">
          <div className="ops-brief-head"><h3>Decision replay ({replay.length})</h3><button className="radmin-btn sm" onClick={() => setReplay(null)}>Close</button></div>
          <ol className="ops-ho-timeline">
            {replay.map((r, i) => (
              <li key={i} className="ops-ho-node ok">
                <div className="ops-ho-node-head"><span className="ops-ho-flow"><b>{r.kind.replace(/_/g, " ")}</b></span>{r.verdict && <span className="radmin-badge">Ω {r.verdict}</span>}</div>
                <div className="radmin-deliv-meta">{r.action} {r.detail ? `— ${r.detail}` : ""} · {fmtWhen(r.at)}{r.actor ? ` · ${r.actor}` : ""}</div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="ops-agent-grid">
        {graph && Object.entries(byProv).map(([prov, list]) => (
          <section key={prov} className="radmin-card ops-prov-col">
            <h3><span className={`radmin-badge ${PROV_CLASS[prov] || ""}`}>{PROV_LABEL[prov] || prov}</span> <span className="radmin-deliv-meta">{list.length}</span></h3>
            {list.slice(0, 25).map((n) => (
              <button key={n.id} className="ops-node" onClick={() => openTrace(n.id)}>
                <span className="ops-node-type">{n.type}</span> {n.label}
              </button>
            ))}
          </section>
        ))}
      </div>

      {trace && trace.node && (
        <section className="radmin-card ops-trace">
          <div className="ops-brief-head">
            <h3>Trace: {trace.node.type} <span className={`radmin-badge ${PROV_CLASS[trace.provenance] || ""}`}>{PROV_LABEL[trace.provenance]}</span></h3>
            <button className="radmin-btn sm" onClick={() => setTrace(null)}>Close</button>
          </div>
          <div className="radmin-deliv-meta">{trace.node.label} · source: <code>{trace.source_ref}</code></div>
          {trace.related.length > 0 && <>
            <div className="radmin-deliv-meta ops-trace-h">Connected</div>
            {trace.related.map((r: any, i: number) => (
              <button key={i} className="ops-node" onClick={() => openTrace(r.node.id)}>
                <span className="ops-node-type">{r.direction === "in" ? "←" : "→"} {r.kind}</span> {r.node.type}: {r.node.label}
              </button>
            ))}
          </>}
          {trace.to_evidence.length > 0 && <>
            <div className="radmin-deliv-meta ops-trace-h">Path to evidence</div>
            <div className="ops-trace-path">{trace.to_evidence.map((n: any, i: number) => <span key={i}>{i > 0 ? " → " : ""}<code>{n.type}</code></span>)}</div>
          </>}
        </section>
      )}
    </>
  );
}

// ── Executive Command (Phase 4 — autonomy, emergency pause, oversight) ────────
const MODE_CLASS: Record<string, string> = {
  emergency_pause: "omega", observe: "warn", recommend: "warn",
  execute_low_risk: "ok", governed_autonomy: "accent",
};
function CommandView({ onOpen }: { onOpen: (h?: string | null) => void }) {
  const [auto, setAuto] = useState<any>(null);
  const [perf, setPerf] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, p] = await Promise.all([api("autonomy"), api("performance")]);
      setAuto(a); setPerf(p); setErr(null);
    } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const post = async (body: any, describe: (r: any) => string) => {
    setBusy(true); setNote(null);
    try { const r = await api("autonomy", { method: "POST", body: JSON.stringify(body) }); setNote(describe(r)); await load(); }
    catch (e: any) { setNote(e.message); }
    setBusy(false);
  };
  const setMode = (mode: string) => post({ action: "set_mode", mode }, (r) =>
    r.direction === "raised"
      ? (r.ok ? `Autonomy raised to ${mode} — approved through Runtime Governance and recorded in evidence.`
              : `Raise to ${mode} was ${r.blocked ? "blocked by Runtime Governance" : "not applied"}${r.error ? `: ${r.error}` : "."}`)
      : r.direction === "unchanged" ? `Already in ${mode}.`
      : `Autonomy lowered to ${mode} — applied directly and audited (fail-safe brake).`);
  const emergencyPause = () => post({ action: "emergency_pause" }, () => "Emergency pause engaged — the council is halted. Nothing is proposed or executed until you raise autonomy again.");
  const toggleAgent = (id: string, paused: boolean) => post({ action: paused ? "resume_agent" : "pause_agent", agent_id: id }, () => `${id} ${paused ? "resumed" : "paused"}.`);

  if (err) return <div className="radmin-err">{err}</div>;
  if (!auto) return <div className="radmin-loading">Loading command…</div>;

  const st = auto.state;
  const modes = auto.modes || [];
  const curLevel = modes.find((m: any) => m.id === st.mode)?.level ?? 0;

  return (
    <>
      {note && <div className="radmin-card"><p>{note}</p></div>}

      <section className={`radmin-card ops-cmd-banner ${MODE_CLASS[st.mode] || ""}`}>
        <div className="ops-brief-head">
          <div>
            <h2>Executive Command</h2>
            <p className="radmin-sub">One control over how autonomously the council may act. Lowering autonomy is always allowed and audited — the fail-safe brake, which works even with the engine down. Raising autonomy is governed: it routes through Runtime Governance and requires operator approval. Operator-initiated actions are never gated here.</p>
          </div>
          <button className="ops-cmd-estop" disabled={busy || st.policy.halted} onClick={emergencyPause}>⏻ Emergency pause</button>
        </div>
        <div className="ops-cmd-current">
          <span className={`radmin-badge ${MODE_CLASS[st.mode] || ""}`}>Mode: {st.label}</span>
          {st.default && <span className="radmin-badge">default</span>}
          <span className="radmin-deliv-meta">{st.policy.halted ? "Council halted." : st.policy.holds ? "Proposals held for operator approval." : st.policy.autoExecutes ? "Low/medium auto-execute after PERMIT; high escalate." : st.policy.proposes ? "Proposing only." : "Observing only."}{st.updated_by ? ` · last changed by ${st.updated_by} · ${fmtWhen(st.updated_at)}` : ""}</span>
        </div>
      </section>

      <section className="radmin-card">
        <h3>Autonomy mode</h3>
        <p className="radmin-sub">Ordered least → most autonomous. Selecting a higher mode is a governed raise (approval recorded); a lower mode applies immediately.</p>
        <div className="ops-cmd-modes">
          {modes.map((m: any) => {
            const isRaise = m.level > curLevel;
            const active = m.id === st.mode;
            return (
              <button key={m.id} disabled={busy || active} onClick={() => setMode(m.id)}
                className={`ops-cmd-mode ${MODE_CLASS[m.id] || ""}${active ? " is-active" : ""}`}>
                <span className="ops-cmd-mode-name">{m.label}{active ? " ✓" : ""}</span>
                <span className="ops-cmd-mode-dir">{active ? "current" : isRaise ? "↑ governed raise" : "↓ direct brake"}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="radmin-card">
        <h3>Specialist pauses</h3>
        <p className="radmin-sub">Pause one specialist without changing the global mode. A paused specialist still plans (its work is recorded as handoffs), but proposes and executes nothing until resumed.</p>
        <div className="ops-cmd-agents">
          {(auto.agents || []).map((a: any) => (
            <div key={a.id} className={`ops-cmd-agent${a.paused ? " is-paused" : ""}`}>
              <div><b>{a.title}</b> <span className="radmin-deliv-meta">{a.paused ? "paused" : "active"}</span></div>
              <button className="radmin-btn sm" disabled={busy} onClick={() => toggleAgent(a.id, a.paused)}>{a.paused ? "Resume" : "Pause"}</button>
            </div>
          ))}
        </div>
      </section>

      {perf && (
        <>
          <section className="radmin-card">
            <div className="ops-brief-head">
              <h3>Council throughput</h3>
              <button className="radmin-linkbtn" onClick={() => onOpen("/admin/operations?view=handoffs")}>Handoff timeline →</button>
            </div>
            <div className="ops-cmd-stats">
              <div className="ops-cmd-stat"><b>{perf.council.total_runs}</b><span>council runs</span></div>
              <div className="ops-cmd-stat"><b>{perf.council.recent_outcomes.executed}</b><span>executed (recent)</span></div>
              <div className="ops-cmd-stat"><b>{perf.council.recent_outcomes.escalated}</b><span>escalated</span></div>
              <div className="ops-cmd-stat"><b>{perf.council.recent_outcomes.blocked}</b><span>blocked</span></div>
              <div className="ops-cmd-stat"><b>{perf.proposals.awaiting_operator ?? 0}</b><span>awaiting operator</span></div>
            </div>
            {perf.council.last_run && (
              <div className="radmin-deliv-meta">Last run: {perf.council.last_run.trigger} · {perf.council.last_run.status}{perf.council.last_run.halted ? " · halted" : ""} · mode {perf.council.last_run.autonomy_mode || "—"} · {perf.council.last_run.proposals} proposal(s) · {fmtWhen(perf.council.last_run.started_at)}</div>
            )}
          </section>

          <section className="radmin-card">
            <h3>Per-agent performance</h3>
            <div className="ops-cmd-perf">
              <div className="ops-cmd-perf-row ops-cmd-perf-head">
                <span>Specialist</span><span>Proposed</span><span>Executed</span><span>Escalated</span><span>Blocked</span><span>Verified</span><span>Handoffs</span>
              </div>
              {perf.agents.map((a: any) => (
                <div key={a.id} className="ops-cmd-perf-row">
                  <span>{a.title}</span>
                  <span>{a.proposals}</span>
                  <span>{a.executed}{a.execution_rate != null ? ` (${Math.round(a.execution_rate * 100)}%)` : ""}</span>
                  <span>{a.escalated}</span>
                  <span>{a.blocked + a.denied}</span>
                  <span>{a.verification_rate != null ? `${Math.round(a.verification_rate * 100)}%` : "—"}</span>
                  <span>{a.handoffs_resolved}/{a.handoffs_received}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}

// ── Guardian OS — the unified executive homepage (v0) ─────────────────────────
const HEALTH_CLASS: Record<string, string> = { ok: "ok", watch: "warn", at_risk: "bad" };
function GuardianView({ onOpen, go }: { onOpen: (h?: string | null) => void; go: (v: View) => void }) {
  const [home, setHome] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api("guardian").then(setHome).catch((e) => setErr(e.message)); }, []);
  if (err) return <div className="radmin-err">{err}</div>;
  if (!home) return <div className="radmin-loading">Loading Guardian OS…</div>;

  const h = home.what_is_happening;
  const sevClass = (s: string) => (s === "critical" ? "bad" : s === "warning" ? "warn" : "ok");

  return (
    <>
      <section className="radmin-card ops-guard-hero">
        <div className="ops-brief-head">
          <div>
            <h2>Guardian OS</h2>
            <p className="radmin-sub">The enterprise operating system over Runtime Governance. Runtime Governance is the kernel; Guardian OS coordinates the enterprise as one governed, evidence-backed runtime. Everything here is a read-only projection — every action flows proposal → Ω governor → approval → execution → evidence.</p>
          </div>
          {h.autonomy && <span className={`radmin-badge ${h.autonomy.halted ? "omega" : "ok"}`}>Autonomy: {h.autonomy.label}</span>}
        </div>
        <div className="ops-guard-happening">
          <span><b>{h.customers}</b> customers</span>
          <span><b>{h.live_customers}</b> live</span>
          <span><b>{h.departments}</b> departments</span>
          <span><b>{h.proposals_in_flight}</b> proposals in flight</span>
          {h.last_cycle && <span className="radmin-deliv-meta">last council cycle {fmtWhen(h.last_cycle.at)} · {h.last_cycle.status}{h.last_cycle.halted ? " · halted" : ""} · {h.last_cycle.proposals} proposal(s)</span>}
        </div>
        <div className="ops-guard-health">
          {home.enterprise_health.map((d: any) => (
            <span key={d.dimension} className={`ops-guard-hchip ${HEALTH_CLASS[d.band]}`} title={d.detail}>
              <span className="ops-guard-hdim">{d.dimension}</span>
              <span className="ops-guard-hband">{d.band.replace("_", " ")}</span>
            </span>
          ))}
        </div>
      </section>

      <div className="ops-guard-grid">
        <section className="radmin-card">
          <div className="ops-brief-head"><h3>What needs attention</h3><button className="radmin-linkbtn" onClick={() => go("approvals")}>Approvals →</button></div>
          {home.needs_attention.length === 0 ? <p className="radmin-sub">All quiet. Nothing needs your attention.</p> :
            home.needs_attention.map((n: any, i: number) => (
              <button key={i} className={`ops-guard-att sev-${sevClass(n.severity)}`} onClick={() => onOpen(n.ref)}>
                <span className="ops-guard-att-kind">{n.kind}</span>
                <span className="ops-guard-att-sum">{n.summary}</span>
                {n.why && <span className="radmin-deliv-meta">{n.why}</span>}
              </button>
            ))}
        </section>

        <section className="radmin-card">
          <h3>What to approve today</h3>
          {home.what_to_approve.length === 0 ? <p className="radmin-sub">No governed actions are awaiting your sign-off.</p> :
            home.what_to_approve.map((p: any) => (
              <button key={p.id} className="ops-guard-att sev-warn" onClick={() => go("approvals")}>
                <span className="ops-guard-att-kind">{p.risk}</span>
                <span className="ops-guard-att-sum">{p.action_id}{p.org_id ? "" : " · enterprise"}</span>
                {p.reason && <span className="radmin-deliv-meta">{p.reason}</span>}
              </button>
            ))}
        </section>
      </div>

      <div className="ops-guard-grid">
        {home.biggest_opportunity && (
          <section className="radmin-card ops-guard-opp">
            <h3>Biggest opportunity</h3>
            <button className="ops-guard-oppbtn" onClick={() => onOpen(home.biggest_opportunity.ref)}>
              <b>{home.biggest_opportunity.name}</b>
              <span className="radmin-deliv-meta">{home.biggest_opportunity.basis}</span>
            </button>
          </section>
        )}
        {home.biggest_risk && (
          <section className="radmin-card ops-guard-risk">
            <h3>Biggest risk</h3>
            <button className="ops-guard-oppbtn" onClick={() => onOpen(home.biggest_risk.ref)}>
              <b>{home.biggest_risk.subject}</b>
              <span className="radmin-deliv-meta">{home.biggest_risk.summary}</span>
            </button>
          </section>
        )}
      </div>

      <section className="radmin-card">
        <h3>What happens if we do nothing</h3>
        <p className="radmin-sub">A deterministic projection from the enterprise twin — every item traces back to a real record.</p>
        {home.if_we_do_nothing.length === 0 ? <p className="radmin-sub">Nothing is decaying right now.</p> :
          <ul className="ops-guard-conseq">
            {home.if_we_do_nothing.map((c: any, i: number) => (
              <li key={i} className={`area-${c.area}`}>
                <button className="radmin-linkbtn" onClick={() => onOpen(c.ref)}>
                  <span className="ops-guard-conseq-area">{c.area}</span> {c.if_ignored}
                  <span className="ops-guard-conseq-h"> · {c.horizon}</span>
                </button>
              </li>
            ))}
          </ul>}
      </section>

      {home.executive_questions && <GuardianDeptIntel eq={home.executive_questions} onOpen={onOpen} />}

      <section className="radmin-card">
        <div className="ops-brief-head"><h3>Departments</h3><button className="radmin-linkbtn" onClick={() => go("agents")}>Council →</button></div>
        <div className="ops-guard-depts">
          {home.departments.map((d: any) => (
            <div key={d.id} className={`ops-guard-dept${d.paused ? " is-paused" : ""}`}>
              <div><b>{d.title}</b>{d.cross_cutting && <span className="radmin-badge ghost"> cross-cutting</span>}{d.paused && <span className="radmin-badge warn"> paused</span>}</div>
              <span className="radmin-deliv-meta">{d.customers_owned} owned · {d.executed} executed · {d.awaiting_approval} awaiting</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

// Department intelligence — the additional executive questions Guardian OS answers.
function GuardianDeptIntel({ eq, onOpen }: { eq: any; onOpen: (h?: string | null) => void }) {
  return (
    <section className="radmin-card">
      <h3>Department intelligence</h3>
      <p className="radmin-sub">What the Guardian OS departments see right now — each grounded in real records.</p>
      <div className="ops-guard-intel">
        <div className="ops-guard-iq">
          <h4>What changed overnight</h4>
          {eq.what_changed_overnight.length === 0 ? <p className="radmin-deliv-meta">No adverse trend vs the prior period.</p> :
            <ul>{eq.what_changed_overnight.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>}
        </div>
        <div className="ops-guard-iq">
          <h4>Incidents needing attention</h4>
          {eq.incidents_need_attention.length === 0 ? <p className="radmin-deliv-meta">No open incidents.</p> :
            <ul>{eq.incidents_need_attention.map((i: any) => <li key={i.id}><button className="radmin-linkbtn" onClick={() => onOpen(i.ref)}>[{i.severity}] {i.summary} · {i.age_days}d</button></li>)}</ul>}
        </div>
        <div className="ops-guard-iq">
          <h4>Customers drifting to risk</h4>
          {eq.customers_drifting_to_risk.length === 0 ? <p className="radmin-deliv-meta">No customers drifting.</p> :
            <ul>{eq.customers_drifting_to_risk.map((c: any) => <li key={c.org_id}><button className="radmin-linkbtn" onClick={() => onOpen(c.ref)}>{c.name} · health {c.health}{c.delta ? ` (${c.delta})` : ""}</button></li>)}</ul>}
        </div>
        <div className="ops-guard-iq">
          <h4>Where governance slows execution</h4>
          <p className="radmin-deliv-meta">{eq.governance_friction.note}</p>
        </div>
        <div className="ops-guard-iq">
          <h4>Which partner needs attention</h4>
          {eq.partner_needs_attention.length === 0 ? <p className="radmin-deliv-meta">No partner needs attention.</p> :
            <ul>{eq.partner_needs_attention.map((p: any, i: number) => <li key={i}>{p.name} ({p.kind}) — {p.reason}</li>)}</ul>}
        </div>
        <div className="ops-guard-iq">
          <h4>What policy to create next</h4>
          {eq.policy_to_create_next.length === 0 && eq.policy_drafts_pending.length === 0 ? <p className="radmin-deliv-meta">No policy gaps detected.</p> : <>
            {eq.policy_to_create_next.map((g: any, i: number) => <p key={i} className="radmin-deliv-meta">{g.rule} refused {g.count}× — {g.suggestion}</p>)}
            {eq.policy_drafts_pending.length > 0 && <p className="radmin-deliv-meta">{eq.policy_drafts_pending.length} draft(s) awaiting your activation.</p>}
          </>}
        </div>
        <div className="ops-guard-iq">
          <h4>Architecture gaps</h4>
          <p className="radmin-deliv-meta">{eq.architecture_gaps.coverage_pct}% assessed · {eq.architecture_gaps.gaps} customer(s) need an assessment</p>
          {eq.architecture_gaps.customers.length > 0 && <ul>{eq.architecture_gaps.customers.slice(0, 4).map((c: any) => <li key={c.org_id}><button className="radmin-linkbtn" onClick={() => onOpen(c.ref)}>{c.name} ({c.lifecycle_stage})</button></li>)}</ul>}
        </div>
      </div>
    </section>
  );
}

// ── Policy Authoring — dynamic runtime Ω policies ─────────────────────────────
const POLICY_DOMAINS = ["enterprise", "compliance", "data_privacy", "finance", "banking", "fintech", "fraud", "cybersecurity", "healthcare"];
const POLICY_STATUS_CLASS: Record<string, string> = { draft: "", validated: "accent", active: "ok", superseded: "ghost", rolled_back: "warn" };
const listInput = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function summarizeSpec(spec: any): string {
  if (!spec) return "";
  const tools = ((spec.match && spec.match.tools) || []).join(", ");
  const c = spec.conditions || {};
  const parts: string[] = [];
  if ((c.unauthorized_unless || []).length) parts.push(`unless ${c.unauthorized_unless.join("/")}`);
  if ((c.flag_true_blocks || []).length) parts.push(`block if ${c.flag_true_blocks.join("/")}`);
  if (c.threshold) parts.push(`${c.threshold.field} ${c.threshold.op} ${c.threshold.value}`);
  return `${tools}${parts.length ? " — " + parts.join(" · ") : " (denylist)"}`;
}

function PoliciesView({ onOpen, go }: { onOpen: (h?: string | null) => void; go: (v: View) => void }) {
  const [data, setData] = useState<any>(null);
  const [active, setActive] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<any>(null);
  const [f, setF] = useState({ name: "", domain: "enterprise", tools: "", unauthorized_unless: "", flag_true_blocks: "", th_field: "", th_op: ">", th_value: "", severity: "high", notes: "" });

  const load = useCallback(async () => {
    try {
      const [d, a] = await Promise.all([api("governance-policies"), api("governance-policies?view=active")]);
      setData(d); setActive(a.active || []); setErr(null);
    } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const buildSpec = () => {
    const conditions: any = {};
    if (listInput(f.unauthorized_unless).length) conditions.unauthorized_unless = listInput(f.unauthorized_unless);
    if (listInput(f.flag_true_blocks).length) conditions.flag_true_blocks = listInput(f.flag_true_blocks);
    if (f.th_field.trim() && f.th_value !== "") conditions.threshold = { field: f.th_field.trim(), op: f.th_op, value: Number(f.th_value) };
    return { match: { tools: listInput(f.tools) }, conditions, severity: f.severity };
  };

  const post = async (body: any, describe: (r: any) => string) => {
    setBusy(true); setNote(null);
    try { const r = await api("governance-policies", { method: "POST", body: JSON.stringify(body) }); setNote(describe(r)); await load(); return r; }
    catch (e: any) { setNote(e.message); }
    finally { setBusy(false); }
  };
  const draft = () => post({ action: "draft", name: f.name.trim(), domain: f.domain, spec: buildSpec(), notes: f.notes || null }, (r) => r.policy ? `Drafted ${r.policy.name} v${r.policy.version} — nothing is live yet.` : "Drafted.");
  const validate = (id: string) => post({ action: "validate", id }, () => "Policy validated — ready to activate.");
  const activate = (id: string) => post({ action: "activate", id }, (r) => r.ok ? "Activated through Runtime Governance — the kernel is now loading this policy." : `Activation ${r.blocked ? "blocked by governance" : "not applied"}${r.error ? `: ${r.error}` : "."}`);
  const rollback = (name: string, to_version: number | null) => post({ action: "rollback", name, to_version }, () => to_version ? `Rolled back to v${to_version}.` : `Deactivated ${name} — the kernel returns to baseline.`);
  const openHistory = async (name: string, scope: string) => { try { setHistory(await api(`governance-policies?view=history&name=${encodeURIComponent(name)}&scope=${encodeURIComponent(scope)}`)); } catch (e: any) { setErr(e.message); } };

  if (err) return <div className="radmin-err">{err}</div>;
  if (!data) return <div className="radmin-loading">Loading policies…</div>;

  const groups: Record<string, any[]> = {};
  for (const p of data.policies || []) (groups[`${p.scope}:${p.name}`] = groups[`${p.scope}:${p.name}`] || []).push(p);
  const groupList = Object.values(groups).map((v) => ({ name: v[0].name, scope: v[0].scope, domain: v[0].domain, versions: v.slice().sort((a: any, b: any) => b.version - a.version) }));

  return (
    <>
      {note && <div className="radmin-card"><p>{note}</p></div>}

      <section className="radmin-card">
        <h2>Governance policies</h2>
        <p className="radmin-sub">Author customer-specific Ω policies the Runtime Governance kernel loads <em>at runtime</em> — no code change, no redeploy. Draft → validate → activate (governed by operator approval) → rollback. Policies are deny-only: they can only add constraints, never weaken the baseline.</p>
        <div className="ops-cmd-stats">
          <div className="ops-cmd-stat"><b>{data.summary.policies}</b><span>policies</span></div>
          <div className="ops-cmd-stat"><b>{active.length}</b><span>active in kernel</span></div>
          <div className="ops-cmd-stat"><b>{data.summary.by_status.draft}</b><span>drafts</span></div>
          <div className="ops-cmd-stat"><b>{data.summary.by_status.validated}</b><span>validated</span></div>
        </div>
      </section>

      <section className="radmin-card">
        <h3>Author a policy</h3>
        <div className="ops-pol-form">
          <label>Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="wire_transfer_limit" /></label>
          <label>Domain<select value={f.domain} onChange={(e) => setF({ ...f, domain: e.target.value })}>{POLICY_DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
          <label>Severity<select value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}>{["low", "medium", "high", "critical"].map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <label className="ops-pol-wide">Match tools (comma-separated)<input value={f.tools} onChange={(e) => setF({ ...f, tools: e.target.value })} placeholder="wire_transfer, send_payment" /></label>
          <label className="ops-pol-wide">Block unless approved — flags (optional)<input value={f.unauthorized_unless} onChange={(e) => setF({ ...f, unauthorized_unless: e.target.value })} placeholder="operator_approved, payment_approved" /></label>
          <label className="ops-pol-wide">Block if flag true (optional)<input value={f.flag_true_blocks} onChange={(e) => setF({ ...f, flag_true_blocks: e.target.value })} placeholder="destination_external" /></label>
          <label>Threshold field<input value={f.th_field} onChange={(e) => setF({ ...f, th_field: e.target.value })} placeholder="amount" /></label>
          <label>Op<select value={f.th_op} onChange={(e) => setF({ ...f, th_op: e.target.value })}>{[">", ">=", "<", "<=", "==", "!="].map((o) => <option key={o} value={o}>{o}</option>)}</select></label>
          <label>Value<input value={f.th_value} onChange={(e) => setF({ ...f, th_value: e.target.value })} placeholder="10000" inputMode="numeric" /></label>
        </div>
        <div className="ops-pol-preview"><span className="radmin-deliv-meta">Compiled Ω spec</span><pre>{JSON.stringify(buildSpec(), null, 2)}</pre></div>
        <button className="radmin-btn primary" disabled={busy || !f.name.trim() || !listInput(f.tools).length} onClick={draft}>Draft policy</button>
        <p className="radmin-sub">A draft changes nothing. Validate it, then activation flows through Runtime Governance (proposal → Ω governor → your approval → evidence) before the kernel loads it.</p>
      </section>

      {groupList.map((g) => (
        <section key={`${g.scope}:${g.name}`} className="radmin-card">
          <div className="ops-brief-head">
            <h3>{g.name} <span className="radmin-badge ghost">{g.domain}</span>{g.scope !== "global" && <span className="radmin-badge"> {g.scope}</span>}</h3>
            <button className="radmin-linkbtn" onClick={() => openHistory(g.name, g.scope)}>Version history →</button>
          </div>
          <div className="ops-pol-versions">
            {g.versions.map((p: any) => (
              <div key={p.id} className={`ops-pol-ver${p.status === "active" ? " is-active" : ""}`}>
                <div className="ops-pol-ver-head">
                  <span className="ops-pol-ver-n">v{p.version}</span>
                  <span className={`radmin-badge ${POLICY_STATUS_CLASS[p.status] || ""}`}>{p.status.replace("_", " ")}</span>
                  <span className="radmin-deliv-meta">{summarizeSpec(p.spec)}</span>
                </div>
                <div className="ops-pol-ver-actions">
                  {p.status === "draft" && <button className="radmin-btn sm" disabled={busy} onClick={() => validate(p.id)}>Validate</button>}
                  {["validated", "superseded", "rolled_back"].includes(p.status) && <button className="radmin-btn sm primary" disabled={busy} onClick={() => activate(p.id)}>Activate</button>}
                  {p.status === "active" && <button className="radmin-btn sm" disabled={busy} onClick={() => rollback(g.name, null)}>Deactivate</button>}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {history && (
        <section className="radmin-card">
          <div className="ops-brief-head"><h3>History — {history.name}</h3><button className="radmin-btn sm" onClick={() => setHistory(null)}>Close</button></div>
          <ol className="ops-ho-timeline">
            {(history.history || []).map((p: any) => (
              <li key={p.id} className="ops-ho-node ok">
                <div className="ops-ho-node-head"><span className="ops-pol-ver-n">v{p.version}</span><span className={`radmin-badge ${POLICY_STATUS_CLASS[p.status] || ""}`}>{p.status.replace("_", " ")}</span></div>
                <div className="radmin-deliv-meta">{summarizeSpec(p.spec)} · {p.activated_at ? `activated ${fmtWhen(p.activated_at)} by ${p.activated_by}` : p.validated_at ? `validated ${fmtWhen(p.validated_at)}` : `drafted ${fmtWhen(p.created_at)}`}</div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

// ── Guardian OS — Enterprise Provisioning ("the OS installation") ─────────────
const PHASE_META: [string, string, string][] = [
  ["identity", "1 · Enterprise Identity", "Org, business units, environments, regions, compliance"],
  ["estate", "2 · AI Estate", "Systems, models, agents, tools, MCP, APIs — relationships auto-mapped"],
  ["trust", "3 · Trust Architecture", "Boundaries, IdPs, approvers, operators, risk zones, protected assets"],
  ["governance", "4 · Runtime Governance", "Ω policies via the dynamic engine — validated, fail-closed, deny-only"],
  ["departments", "5 · Department Deployment", "Guardian OS departments enabled as governed agents"],
  ["twin", "6 · Digital Twin", "Six enterprise graphs generated immediately"],
];
function ProvisionView({ onOpen, go }: { onOpen: (h?: string | null) => void; go: (v: View) => void }) {
  const [runs, setRuns] = useState<any[] | null>(null);
  const [schema, setSchema] = useState<any>(null);
  const [spec, setSpec] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [command, setCommand] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, ex] = await Promise.all([api("provisioning"), api("provisioning?view=example")]);
      setRuns(r.runs || []); setSchema(r.schema || null); setSpec(ex.spec); setErr(null);
    } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openCommand = useCallback(async (org_id: string) => {
    setBusy(true); setErr(null);
    try { const c = await api(`provisioning?view=command&org_id=${encodeURIComponent(org_id)}`); setCommand(c.command); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  }, []);

  const install = async () => {
    setBusy(true); setNote(null); setErr(null); setResult(null); setCommand(null);
    try {
      const r = await api("provisioning", { method: "POST", body: JSON.stringify({ action: "provision" }) });
      setResult(r.result);
      setNote(r.ok ? `Guardian OS installed for ${r.result?.name || "the enterprise"} — the runtime is governed and Executive Command is live.` : `Provisioning failed: ${r.result?.result?.error || r.error || "unknown"}`);
      await load();
      if (r.result?.org_id) await openCommand(r.result.org_id);
    } catch (e: any) { setNote(e.message); }
    setBusy(false);
  };

  if (err && !runs) return <div className="radmin-err">{err}</div>;
  if (!runs) return <div className="radmin-loading">Loading installer…</div>;

  return (
    <>
      {note && <div className="radmin-card"><p>{note}</p></div>}
      {err && <div className="radmin-err">{err}</div>}
      {schema && schema.pending_migrations?.length > 0 && (
        <section className="radmin-card ops-prov-schema">
          <h3>Database migration pending</h3>
          <p className="radmin-sub">{schema.note}</p>
          <div className="ops-ind-regs">{schema.pending_migrations.map((t: string) => <span key={t} className="ops-ind-reg">{t}</span>)}</div>
          <p className="radmin-deliv-meta">Run <code>supabase/operations_agent.sql</code> against the production project (it is additive and idempotent — every statement is <code>create table if not exists</code> / <code>add column if not exists</code>). Installing is unaffected until then; history simply cannot be read.</p>
        </section>
      )}

      <section className="radmin-card ops-prov-hero">
        <div className="ops-brief-head">
          <div>
            <h2>Guardian OS · Enterprise Provisioning</h2>
            <p className="radmin-sub">Not an onboarding form — the operating-system installation for an autonomous enterprise. One install stands up a complete governed runtime: identity, the AI estate with relationships mapped, trust architecture, fail-closed Ω policies through the dynamic policy engine, Guardian OS departments, the six digital-twin graphs, and a populated Executive Command. There is never an empty dashboard.</p>
          </div>
          <button className="radmin-btn primary" disabled={busy} onClick={install}>{busy ? "Installing…" : "Install Guardian OS"}</button>
        </div>
        {spec && (
          <div className="ops-prov-spec">
            <span className="radmin-badge">{spec.name}</span>
            <span className="radmin-deliv-meta">{spec.industry} · {(spec.regions || []).join("/")} · {(spec.ai_systems || []).length} AI systems · {(spec.compliance || []).join(", ")}</span>
          </div>
        )}
      </section>

      {result && (
        <section className="radmin-card">
          <h3>Installation — {result.name}{" "}<span className={`radmin-badge ${result.status === "complete" ? "ok" : "bad"}`}>{result.status}</span></h3>
          <div className="ops-prov-phases">
            {PHASE_META.map(([key, title, desc]) => {
              const p = result.result?.[key] || result.phases?.[key];
              const done = p && (p.status === "complete" || p.count != null || p.active != null || p.enabled != null || p.facets != null);
              const detail = !p ? "—"
                : key === "governance" ? `${p.active ?? 0} policies active · fail-closed`
                : key === "departments" ? `${p.enabled ?? 0} departments enabled`
                : key === "twin" ? `${p.facets ? Object.keys(p.facets).length : 6} graphs`
                : `${p.count ?? 0} entities`;
              return (
                <div key={key} className={`ops-prov-phase${done ? " is-done" : ""}`}>
                  <span className="ops-prov-phase-mark">{done ? "✓" : "·"}</span>
                  <div><b>{title}</b><span className="radmin-deliv-meta">{desc}</span></div>
                  <span className="ops-prov-phase-detail">{detail}</span>
                </div>
              );
            })}
          </div>
          {result.org_id && <button className="radmin-linkbtn" onClick={() => openCommand(result.org_id)}>Open Executive Command →</button>}
        </section>
      )}

      {command && <CommandPreview command={command} onOpen={onOpen} />}

      <section className="radmin-card">
        <h3>Provisioned enterprises</h3>
        {runs.length === 0 ? (
          <p className="radmin-sub">No enterprises provisioned yet. Install Guardian OS above to stand up a complete governed runtime.</p>
        ) : (
          <div className="ops-prov-runs">
            {runs.map((r) => (
              <div key={r.id} className="ops-prov-run">
                <div>
                  <b>{r.name}</b>{" "}
                  <span className={`radmin-badge ${r.status === "complete" ? "ok" : r.status === "failed" ? "bad" : "warn"}`}>{r.status}</span>
                  <span className="radmin-deliv-meta"> · {r.result?.governance?.active ?? 0} policies · {r.result?.departments?.enabled ?? 0} departments · {fmtWhen(r.created_at)}</span>
                </div>
                {r.org_id && r.status === "complete" && <button className="radmin-btn sm" disabled={busy} onClick={() => openCommand(r.org_id)}>Executive Command →</button>}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

// The populated Executive Command payload for a freshly provisioned enterprise.
function CommandPreview({ command, onOpen }: { command: any; onOpen: (h?: string | null) => void }) {
  const c = command;
  return (
    <section className="radmin-card ops-prov-cmd">
      <div className="ops-brief-head">
        <h3>Executive Command — {c.name}</h3>
        {c.health && <span className={`radmin-badge ${scoreClass(c.health.band)}`}>Health: {c.health.score} · {c.health.band}</span>}
      </div>
      <div className="ops-cmd-stats">
        <div className="ops-cmd-stat"><b>{c.ai_systems?.systems ?? 0}</b><span>AI systems</span></div>
        <div className="ops-cmd-stat"><b>{c.ai_systems?.agents ?? 0}</b><span>agents</span></div>
        <div className="ops-cmd-stat"><b>{c.governance?.active_policies ?? 0}</b><span>Ω policies ({c.governance?.status})</span></div>
        <div className="ops-cmd-stat"><b>{c.open_approvals?.length ?? 0}</b><span>open approvals</span></div>
        <div className="ops-cmd-stat"><b>{c.risks?.open_incidents ?? 0}</b><span>open risks</span></div>
        <div className="ops-cmd-stat"><b>{c.departments?.length ?? 0}</b><span>departments</span></div>
      </div>
      {c.risks?.risk_zones?.length > 0 && <p className="radmin-deliv-meta">Risk zones: {c.risks.risk_zones.join(" · ")}</p>}
      {c.recommended_actions?.length > 0 && (
        <div className="ops-prov-actions">
          <b>Recommended actions</b>
          {c.recommended_actions.map((a: any, i: number) => (
            <button key={i} className="radmin-linkbtn" onClick={() => onOpen(a.ref)}>{a.title} →</button>
          ))}
        </div>
      )}
      <p className="radmin-deliv-meta">Governance: {c.governance?.fail_closed ? "fail-closed" : "open"} · Twin: {c.twin ? Object.keys(c.twin).length : 0} graphs · seeded with realistic example activity until live enterprise events replace it.</p>
    </section>
  );
}

// ── Guardian OS — Managed Governance (Phase 3): continuous governance ─────────
const GOV_SUBSCORES: [string, string][] = [
  ["governance_maturity", "Maturity"],
  ["policy_coverage", "Policy coverage"],
  ["runtime_health", "Runtime health"],
  ["approval_responsiveness", "Approval responsiveness"],
  ["evidence_completeness", "Evidence completeness"],
  ["drift_score", "Drift"],
];
const QUEUE_ICON: Record<string, string> = { approval: "✋", drift: "◈", incident: "⚠", recommendation: "✦" };
function GovernanceView({ onOpen, go }: { onOpen: (h?: string | null) => void; go: (v: View) => void }) {
  const [ov, setOv] = useState<any>(null);
  const [org, setOrg] = useState<string>("");
  const [health, setHealth] = useState<any>(null);
  const [drift, setDrift] = useState<any>(null);
  const [queue, setQueue] = useState<any>(null);
  const [packs, setPacks] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadOverview = useCallback(async () => {
    try { const d = await api("managed"); setOv(d.overview); setErr(null); if (!org && d.overview.list[0]) setOrg(d.overview.list[0].org_id); }
    catch (e: any) { setErr(e.message); }
  }, [org]);
  useEffect(() => { loadOverview(); }, [loadOverview]);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) return;
    setBusy(true);
    try {
      const [h, dr, q, pk] = await Promise.all([
        api(`managed?view=health&org_id=${encodeURIComponent(id)}`),
        api(`managed?view=drift&org_id=${encodeURIComponent(id)}`),
        api(`managed?view=queue&org_id=${encodeURIComponent(id)}`),
        api(`managed?view=packs&org_id=${encodeURIComponent(id)}`),
      ]);
      setHealth(h.health); setDrift(dr.drift); setQueue(q.queue); setPacks(pk.packs || []); setErr(null);
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }, []);
  useEffect(() => { if (org) loadDetail(org); }, [org, loadDetail]);

  const post = async (body: any, describe: (r: any) => string) => {
    setBusy(true); setNote(null);
    try { const r = await api("managed", { method: "POST", body: JSON.stringify(body) }); setNote(describe(r)); await Promise.all([loadOverview(), loadDetail(org)]); }
    catch (e: any) { setNote(e.message); }
    setBusy(false);
  };
  const monitor = () => post({ action: "monitor", org_id: org }, (r) => `Monitoring pass complete — ${r.result.drift.detected} new drift, health ${r.result.health?.overall ?? "—"}, ${r.result.recommended} recommendation(s) proposed.`);
  const makePack = () => post({ action: "evidence_pack", org_id: org }, (r) => `Evidence pack generated — signed ${r.pack.hash.slice(0, 16)}… for ${r.pack.period}.`);
  const ack = (id: string) => post({ action: "ack_drift", drift_id: id }, () => "Drift acknowledged.");

  if (err && !ov) return <div className="radmin-err">{err}</div>;
  if (!ov) return <div className="radmin-loading">Loading governance…</div>;

  const sel = ov.list.find((e: any) => e.org_id === org);
  return (
    <>
      {note && <div className="radmin-card"><p>{note}</p></div>}

      <section className="radmin-card ops-gov-hero">
        <div className="ops-brief-head">
          <div>
            <h2>Managed Governance</h2>
            <p className="radmin-sub">Guardian OS continuously watches every provisioned enterprise — drift, health, evidence and recommendations — and surfaces only what needs a human. You should never have to ask "is my customer's AI safe today?" — it already knows.</p>
          </div>
          <div className="ops-gov-hero-stats">
            <div className="ops-cmd-stat"><b>{ov.watching}</b><span>enterprises watched</span></div>
            <div className="ops-cmd-stat"><b>{ov.queue_total}</b><span>need a human</span></div>
            <div className="ops-cmd-stat"><b>{ov.drift_open_total}</b><span>open drift</span></div>
          </div>
        </div>
        {ov.list.length > 1 && (
          <div className="ops-gov-picker">
            {ov.list.map((e: any) => (
              <button key={e.org_id} className={`radmin-btn sm${e.org_id === org ? " primary" : ""}`} onClick={() => setOrg(e.org_id)}>
                {e.name}{e.health ? ` · ${e.health.overall}` : ""}
              </button>
            ))}
          </div>
        )}
      </section>

      {err && <div className="radmin-err">{err}</div>}

      {sel && (
        <section className="radmin-card">
          <div className="ops-brief-head">
            <div>
              <h3>{sel.name}</h3>
              {health && <span className="radmin-deliv-meta">Baseline v{sel.baseline_version ?? "—"} · trend {health.trend.direction} {health.trend.delta ? `(${health.trend.delta > 0 ? "+" : ""}${health.trend.delta})` : ""}{health.risk_trends ? ` · ${health.risk_trends}` : ""}</span>}
            </div>
            <div className="ops-gov-actions">
              <button className="radmin-btn sm" disabled={busy} onClick={monitor}>Run monitoring pass</button>
              <button className="radmin-btn sm" disabled={busy} onClick={makePack}>Generate evidence pack</button>
            </div>
          </div>
          {health && (
            <div className="ops-gov-health">
              <div className={`ops-gov-overall ${scoreClass(health.band)}`}>
                <b>{health.overall}</b><span>Governance confidence</span><em>{health.band}</em>
              </div>
              <div className="ops-gov-subs">
                {GOV_SUBSCORES.map(([k, label]) => {
                  const s = health.scores[k];
                  return (
                    <div key={k} className={`ops-gov-sub ${scoreClass(s.band)}`}>
                      <span className="ops-gov-sub-n">{s.score}</span>
                      <span className="ops-gov-sub-l">{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {queue && (
        <section className="radmin-card">
          <h3>Operator queue <span className="radmin-badge">{queue.count}</span></h3>
          <p className="radmin-sub">Only what genuinely needs a human. Everything else Guardian OS handles automatically.</p>
          {queue.items.length === 0 ? <p className="radmin-sub">Nothing needs attention — the enterprise is governed and quiet.</p> : (
            <div className="ops-gov-queue">
              {queue.items.map((i: any) => (
                <div key={`${i.type}-${i.id}`} className={`ops-gov-qitem ${scoreClass(i.severity === "critical" ? "high" : i.severity === "warning" ? "watch" : "low")}`}>
                  <span className="ops-gov-qicon">{QUEUE_ICON[i.type] || "·"}</span>
                  <div className="ops-gov-qbody">
                    <b>{i.title}</b>
                    {i.detail && <span className="radmin-deliv-meta">{i.detail}</span>}
                  </div>
                  <div className="ops-gov-qactions">
                    {i.type === "drift" && <button className="radmin-btn sm" disabled={busy} onClick={() => ack(i.id)}>Acknowledge</button>}
                    <button className="radmin-linkbtn" onClick={() => onOpen(i.ref)}>Open →</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {drift && drift.available && drift.open.length > 0 && (
        <section className="radmin-card">
          <h3>Governance drift <span className="radmin-badge">{drift.open.length}</span></h3>
          <p className="radmin-sub">Today's enterprise vs its governed baseline. Every event is evidence-backed.</p>
          <div className="ops-gov-drift">
            {drift.open.map((d: any) => (
              <div key={d.id} className={`ops-gov-drow ${scoreClass(d.severity === "critical" ? "high" : d.severity === "warning" ? "watch" : "low")}`}>
                <span className="radmin-badge">{d.kind.replace(/_/g, " ")}</span>
                <div className="ops-gov-dbody"><b>{d.subject}</b><span className="radmin-deliv-meta">{d.detail}</span></div>
                <span className={`radmin-badge ${d.status === "open" ? "warn" : ""}`}>{d.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {packs.length > 0 && (
        <section className="radmin-card">
          <h3>Evidence packs</h3>
          <p className="radmin-sub">Customer-ready, content-signed governance evidence — one export per period.</p>
          <div className="ops-gov-packs">
            {packs.map((p) => (
              <div key={p.id} className="ops-gov-pack">
                <div><b>{p.period}</b> <span className="radmin-deliv-meta">signed {String(p.hash).slice(0, 16)}… · {fmtWhen(p.created_at)}</span></div>
                <a className="radmin-linkbtn" href={`/api/ops/managed?view=pack&pack_id=${encodeURIComponent(p.id)}&org_id=${encodeURIComponent(org)}`} target="_blank" rel="noreferrer">View →</a>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// ── Guardian OS — Executive Workspaces (Phase 4): one twin, many perspectives ─
const WS_SECTION_SEV = (s: string) => (s === "critical" ? "bad" : s === "warning" ? "warn" : "");
function WorkspaceSection({ s }: { s: any }) {
  if (s.kind === "note") {
    return (
      <section className="radmin-card ops-ws-note">
        <h3>{s.title}</h3>
        <p className="radmin-sub">{s.reason}</p>
        <span className="radmin-badge">not yet instrumented</span>
      </section>
    );
  }
  if (s.kind === "score") {
    return (
      <section className="radmin-card">
        <div className="ops-brief-head"><h3>{s.title}</h3>{s.overall && <span className={`radmin-badge ${scoreClass(s.overall.band)}`}>{s.overall.score} · {s.overall.band}</span>}</div>
        <div className="ops-gov-subs">
          {s.subs.map((sub: any) => (
            <div key={sub.key} className={`ops-gov-sub ${scoreClass(sub.band)}`}>
              <span className="ops-gov-sub-n">{sub.score}</span>
              <span className="ops-gov-sub-l">{sub.label}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (s.kind === "stat") {
    return (
      <section className="radmin-card">
        <h3>{s.title}</h3>
        {s.items.length === 0 ? <p className="radmin-sub">—</p> : (
          <div className="ops-cmd-stats">
            {s.items.map((it: any, i: number) => (
              <div key={i} className="ops-cmd-stat"><b>{String(it.value)}</b><span>{it.label}</span>{it.hint && <span className="ops-ws-hint">{it.hint}</span>}</div>
            ))}
          </div>
        )}
      </section>
    );
  }
  // list | timeline
  return (
    <section className="radmin-card">
      <div className="ops-brief-head"><h3>{s.title}</h3><span className="radmin-badge">{s.items.length}</span></div>
      {s.items.length === 0 ? <p className="radmin-sub">{s.empty}</p> : (
        <div className={s.kind === "timeline" ? "ops-ws-timeline" : "ops-ws-list"}>
          {s.items.map((it: any, i: number) => (
            <div key={i} className={`ops-ws-row ${WS_SECTION_SEV(it.severity)}`}>
              <div className="ops-ws-rbody"><b>{it.title}</b>{it.meta && <span className="radmin-deliv-meta">{it.meta}</span>}</div>
              {it.severity && <span className={`radmin-badge ${scoreClass(it.severity === "critical" ? "high" : it.severity === "warning" ? "watch" : "low")}`}>{it.severity}</span>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function WorkspacesView({ onOpen, go }: { onOpen: (h?: string | null) => void; go: (v: View) => void }) {
  const [roles, setRoles] = useState<any[] | null>(null);
  const [overview, setOverview] = useState<any>(null);
  const [org, setOrg] = useState<string>("");
  const [role, setRole] = useState<string>("ceo");
  const [ws, setWs] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("workspaces").then((d) => {
      setRoles(d.roles || []); setOverview(d.overview);
      if (d.overview && d.overview.list[0]) setOrg(d.overview.list[0].org_id);
    }).catch((e) => setErr(e.message));
  }, []);

  const load = useCallback(async (r: string, o: string) => {
    if (!o) return;
    setBusy(true);
    try { const d = await api(`workspaces?role=${encodeURIComponent(r)}&org_id=${encodeURIComponent(o)}`); setWs(d.workspace); setErr(null); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  }, []);
  useEffect(() => { if (org) load(role, org); }, [role, org, load]);

  if (err && !roles) return <div className="radmin-err">{err}</div>;
  if (!roles) return <div className="radmin-loading">Loading workspaces…</div>;

  return (
    <>
      <section className="radmin-card ops-ws-hero">
        <h2>Executive Workspaces</h2>
        <p className="radmin-sub">One enterprise. One digital twin. One runtime governance engine. Many executive perspectives — each a lens over the same governed source of truth, never a separate dashboard.</p>
        {overview && overview.list.length > 1 && (
          <div className="ops-ws-orgpick">
            <span className="radmin-deliv-meta">Enterprise:</span>
            {overview.list.map((e: any) => (
              <button key={e.org_id} className={`radmin-btn sm${e.org_id === org ? " primary" : ""}`} onClick={() => setOrg(e.org_id)}>{e.name}</button>
            ))}
          </div>
        )}
        <nav className="ops-ws-nav">
          {roles.map((r) => (
            <button key={r.id} className={`ops-ws-tab${r.id === role ? " is-active" : ""}`} onClick={() => setRole(r.id)}>
              <span className="ops-ws-tab-t">{r.title}</span>
              <span className="ops-ws-tab-l">{r.label}</span>
            </button>
          ))}
        </nav>
      </section>

      {err && <div className="radmin-err">{err}</div>}
      {!org ? (
        <section className="radmin-card"><p className="radmin-sub">No enterprise provisioned yet. <button className="radmin-linkbtn" onClick={() => go("provision")}>Install Guardian OS →</button></p></section>
      ) : busy && !ws ? <div className="radmin-loading">Loading workspace…</div> : ws && (
        <>
          <section className="radmin-card ops-ws-head">
            <div className="ops-brief-head">
              <div><h3>{ws.title} · {ws.name}</h3><p className="radmin-sub">{ws.purpose}</p></div>
              {ws.header && ws.header.governance && (
                <div className="ops-ws-headstats">
                  <span className={`radmin-badge ${scoreClass(ws.header.governance.band)}`}>Governance {ws.header.governance.score}</span>
                  <span className="radmin-badge">{ws.header.queue} in queue</span>
                  <span className="radmin-badge">{ws.header.drift_open} drift</span>
                </div>
              )}
            </div>
          </section>
          {ws.sections.map((s: any) => <WorkspaceSection key={s.key} s={s} />)}
        </>
      )}
    </>
  );
}

// ── Guardian OS — Industry Intelligence Packs (Phase 5) ──────────────────────
// Packs extend Guardian OS; they never fork it. A pack's dashboard is rendered
// by the SAME <WorkspaceSection> renderer every executive workspace uses.
function IndustryView({ onOpen, go }: { onOpen: (h?: string | null) => void; go: (v: View) => void }) {
  const [catalog, setCatalog] = useState<any[] | null>(null);
  const [installed, setInstalled] = useState<any[]>([]);
  const [overview, setOverview] = useState<any>(null);
  const [org, setOrg] = useState<string>("");
  const [active, setActive] = useState<string>("");
  const [dash, setDash] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (o?: string) => {
    try {
      const d = await api(`industry${o ? `?org_id=${encodeURIComponent(o)}` : ""}`);
      setCatalog(d.catalog || []); setInstalled(d.installed || []); setOverview(d.overview); setErr(null);
      if (!o && d.overview && d.overview.list[0]) setOrg(d.overview.list[0].org_id);
    } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (org) load(org); }, [org, load]);

  const openDash = useCallback(async (pack: string) => {
    if (!org) return;
    setBusy(true); setActive(pack);
    try { const d = await api(`industry?view=dashboard&pack=${encodeURIComponent(pack)}&org_id=${encodeURIComponent(org)}`); setDash(d.dashboard); setErr(null); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  }, [org]);

  const act = async (action: string, pack: string) => {
    setBusy(true); setNote(null);
    try {
      const r = await api("industry", { method: "POST", body: JSON.stringify({ action, org_id: org, pack }) });
      setNote(action === "install"
        ? `${pack} pack installed — ${r.result.activated} Ω policies activated through the governed lifecycle.`
        : `${pack} pack removed — ${r.result.policies_rolled_back.length} policies rolled back.`);
      await load(org);
      if (action === "install") await openDash(pack); else { setDash(null); setActive(""); }
    } catch (e: any) { setNote(e.message); }
    setBusy(false);
  };

  const isOn = (id: string) => installed.some((i) => i.pack_id === id);
  if (err && !catalog) return <div className="radmin-err">{err}</div>;
  if (!catalog) return <div className="radmin-loading">Loading industry packs…</div>;

  return (
    <>
      {note && <div className="radmin-card"><p>{note}</p></div>}
      <section className="radmin-card ops-ind-hero">
        <h2>Industry Intelligence Packs</h2>
        <p className="radmin-sub">One Runtime Governance kernel. One Guardian OS. One digital twin. Industry Packs add domain intelligence — policies, dashboards, executive metrics, recommendations, templates and evidence mappings — without forking the platform. Installing a pack activates its deny-only Ω policies through the same governed lifecycle; removing it rolls them back.</p>
        {overview && overview.list.length > 1 && (
          <div className="ops-ws-orgpick">
            <span className="radmin-deliv-meta">Enterprise:</span>
            {overview.list.map((e: any) => (
              <button key={e.org_id} className={`radmin-btn sm${e.org_id === org ? " primary" : ""}`} onClick={() => { setOrg(e.org_id); setDash(null); setActive(""); }}>{e.name}</button>
            ))}
          </div>
        )}
      </section>

      {err && <div className="radmin-err">{err}</div>}
      {!org && <section className="radmin-card"><p className="radmin-sub">No enterprise provisioned yet. <button className="radmin-linkbtn" onClick={() => go("provision")}>Install Guardian OS →</button></p></section>}

      <section className="radmin-card">
        <div className="ops-brief-head"><h3>Pack catalog</h3><span className="radmin-badge">{catalog.length} available · {installed.length} installed</span></div>
        <div className="ops-ind-grid">
          {catalog.map((p) => (
            <div key={p.id} className={`ops-ind-card${isOn(p.id) ? " is-on" : ""}`}>
              <div className="ops-ind-head">
                <div>
                  <b>{p.title}</b>
                  <span className="radmin-deliv-meta">{p.industry} · v{p.version}</span>
                </div>
                {isOn(p.id) && <span className="radmin-badge ok">installed</span>}
              </div>
              <p className="ops-ind-purpose">{p.purpose}</p>
              <div className="ops-ind-counts">
                <span>{p.counts.policies} Ω policies</span><span>{p.counts.templates} templates</span>
                <span>{p.counts.mappings} evidence maps</span><span>{p.counts.workflows} workflows</span>
              </div>
              <div className="ops-ind-regs">{p.regulations.slice(0, 4).map((r: string) => <span key={r} className="ops-ind-reg">{r}</span>)}</div>
              <div className="ops-ind-actions">
                {isOn(p.id) ? (
                  <>
                    <button className="radmin-btn sm primary" disabled={busy} onClick={() => openDash(p.id)}>Open dashboard</button>
                    <button className="radmin-btn sm" disabled={busy} onClick={() => act("uninstall", p.id)}>Remove</button>
                  </>
                ) : (
                  <button className="radmin-btn sm" disabled={busy || !org} onClick={() => act("install", p.id)}>Install pack</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {dash && (
        <>
          <section className="radmin-card ops-ind-dashhead">
            <div className="ops-brief-head">
              <div><h3>{dash.title} · {dash.name}</h3><p className="radmin-sub">{dash.purpose}</p></div>
              <span className="radmin-badge">v{dash.version}</span>
            </div>
            {dash.metrics && dash.metrics.length > 0 && (
              <div className="ops-cmd-stats">
                {dash.metrics.map((m: any) => (
                  <div key={m.key} className={`ops-cmd-stat${m.band ? ` ops-ind-m-${scoreClass(m.band)}` : ""}`}>
                    <b>{String(m.value)}</b><span>{m.label}</span>{m.hint && <span className="ops-ws-hint">{m.hint}</span>}
                  </div>
                ))}
              </div>
            )}
            <div className="ops-ind-regs">{(dash.regulations || []).map((r: string) => <span key={r} className="ops-ind-reg">{r}</span>)}</div>
          </section>
          {dash.sections.map((s: any) => <WorkspaceSection key={s.key} s={s} />)}
        </>
      )}
    </>
  );
}

/* ============================================================================
 * Sovereign — where this deployment is running, and whether it can prove it.
 *
 * The rest of the Control Room answers "what is my estate doing?". This answers
 * "what IS this deployment, and is it actually what it claims to be?" — the
 * question an operator on a disconnected box, or an auditor standing behind
 * them, asks first.
 *
 * READ-ONLY BY DESIGN. Installing bundles and applying updates happen at the
 * console with `guardian`, where the media physically is. An air-gapped
 * estate's supply chain must not have a network-reachable write path, so there
 * is no install button here and there should never be one.
 * ========================================================================== */
function SovereignView({ go }: { onOpen: (h?: string | null) => void; go: (v: View) => void }) {
  const [d, setD] = useState<any>(null);
  const [ver, setVer] = useState<any>(null);
  const [updates, setUpdates] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setD(await api("sovereign")); setErr(null); } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const runVerify = useCallback(async () => {
    setBusy(true);
    try { const r = await api("sovereign?view=verify"); setVer(r.verification); setErr(null); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  }, []);

  const loadUpdates = useCallback(async () => {
    try { const r = await api("sovereign?view=updates"); setUpdates(r.updates || []); }
    catch (e: any) { setErr(e.message); }
  }, []);

  if (err && !d) return <div className="radmin-err">{err}</div>;
  if (!d) return <div className="radmin-loading">Reading deployment posture…</div>;

  const dep = d.deployment || {};
  const offline = ["on_prem", "sovereign", "air_gapped"].includes(dep.profile);
  const bundle = dep.policy_bundle;
  const trust = dep.trust_store || { keys: 0, dir: "—" };
  const MARK: Record<string, string> = { pass: "✓", warn: "⚠", fail: "✕" };
  const cls: Record<string, string> = { pass: "ok", warn: "warn", fail: "bad" };

  return (
    <>
      <section className="radmin-card ops-sov-hero">
        <div className="ops-brief-head">
          <h2>Sovereign deployment</h2>
          <span className={`radmin-badge${offline ? " ok" : ""}`}>{dep.title || dep.profile}</span>
        </div>
        <p className="radmin-sub">
          The Runtime Governance kernel is byte-for-byte identical in every deployment profile — only the
          providers behind it change. This tab reports what THIS deployment actually is, read from the running
          process rather than from configuration you were told about.
        </p>

        <div className="ops-sov-grid">
          {[
            { k: "Profile", v: dep.profile, hint: dep.summary },
            { k: "State storage", v: dep.storage, hint: dep.storage === "local" ? "on this box; never leaves the estate" : "managed cloud store" },
            { k: "Evidence", v: dep.evidence, hint: dep.evidence === "local" ? "written to the local data directory" : "cloud object storage" },
            { k: "Ω policy source", v: dep.policy_provider, hint: dep.policy_provider === "bundle" ? "signed filesystem bundle — no database" : "control plane over HTTPS" },
            { k: "Egress", v: dep.egress, hint: dep.egress === "denied" ? "no outbound connection is permitted" : "outbound permitted" },
            { k: "Runtime", v: dep.immutable && dep.immutable.immutable ? "immutable" : "mutable", hint: dep.immutable && dep.immutable.immutable ? "signed updates only; rollback stays available" : "policies may be authored here" },
          ].map((x) => (
            <div className="ops-sov-cell" key={x.k}>
              <span className="ops-sov-k">{x.k}</span>
              <b className="ops-sov-v">{String(x.v ?? "—")}</b>
              <span className="ops-sov-hint">{x.hint}</span>
            </div>
          ))}
        </div>

        {d.store && d.store.cloud_refused && (
          <p className="ops-sov-refused">
            <b>Cloud credentials present and REFUSED.</b> This profile pins state to the local filesystem, so the
            cloud client was never constructed. Remove the credentials so the deployment carries no unused secrets.
          </p>
        )}
      </section>

      {err && <div className="radmin-err">{err}</div>}

      <section className="radmin-card">
        <div className="ops-brief-head">
          <h3>Ω policy bundle</h3>
          {bundle ? <span className="radmin-badge">{bundle}</span> : <span className="radmin-deliv-meta">not configured</span>}
        </div>
        {offline && !bundle && (
          <p className="radmin-sub">
            This profile reads policies from a signed bundle, but <code>GUARDIAN_POLICY_BUNDLE</code> is not set —
            so only the static deployment baseline is enforcing. Install one at the console:
            <code className="ops-sov-cmd">guardian install ./policies-1.0.0.gos</code>
          </p>
        )}
        {!offline && (
          <p className="radmin-sub">
            This deployment reads Ω policies from the control plane. Bundle verification applies to on-premises,
            sovereign and air-gapped profiles.
          </p>
        )}
        <div className="ops-sov-trust">
          <span className="radmin-deliv-meta">Trust store</span>
          <b>{trust.keys} signing key{trust.keys === 1 ? "" : "s"}</b>
          <span className="radmin-deliv-meta">{trust.dir}{trust.hmac_configured ? " · HMAC configured" : ""}</span>
        </div>
        {offline && trust.keys === 0 && !trust.hmac_configured && (
          <p className="ops-sov-refused">
            <b>The trust store is empty.</b> Nothing can be installed or updated until a public signing key is
            provisioned out of band.
          </p>
        )}
      </section>

      <section className="radmin-card">
        <div className="ops-brief-head">
          <h3>Deployment verification</h3>
          <button className="radmin-btn primary" onClick={runVerify} disabled={busy}>
            {busy ? "Verifying…" : ver ? "Re-run verification" : "Run verification"}
          </button>
        </div>
        <p className="radmin-sub">
          Eight checks, diagnostic and never corrective — verification reads, it never activates, installs or
          &ldquo;fixes&rdquo; anything, so it is safe on a live system in front of an auditor. Anything unknown is
          reported as unknown, never assumed to pass.
        </p>
        {!ver && <p className="radmin-deliv-meta">Not yet run in this session.</p>}
        {ver && (
          <>
            <div className={`ops-sov-result ${ver.ok ? "ok" : "bad"}`}>
              <b>{ver.ok ? "Deployment verified" : "NOT verified"}</b>
              <span>{ver.summary.pass} passed · {ver.summary.warn} warning{ver.summary.warn === 1 ? "" : "s"} · {ver.summary.fail} failure{ver.summary.fail === 1 ? "" : "s"}</span>
            </div>
            <ul className="ops-sov-checks">
              {ver.checks.map((c: any) => (
                <li key={c.id} className={`ops-sov-check ${cls[c.status]}`}>
                  <span className="ops-sov-mark">{MARK[c.status]}</span>
                  <div>
                    <b>{c.title}</b>
                    <p>{c.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="radmin-card">
        <div className="ops-brief-head">
          <h3>Offline update history</h3>
          <button className="radmin-btn" onClick={loadUpdates}>{updates ? "Refresh" : "Load"}</button>
        </div>
        <p className="radmin-sub">
          Signed update packages applied at the console. Each captured a rollback plan <i>before</i> its first
          change, so any of them can be reversed with <code className="ops-sov-cmd">guardian update rollback &lt;id&gt;</code>.
        </p>
        {updates === null && <p className="radmin-deliv-meta">Not loaded.</p>}
        {updates !== null && updates.length === 0 && <p className="radmin-deliv-meta">No offline updates have been applied to this deployment.</p>}
        {updates !== null && updates.length > 0 && (
          <table className="radmin-table">
            <thead><tr><th>Applied</th><th>Bundle</th><th>Version</th><th>Status</th><th>Signature</th></tr></thead>
            <tbody>
              {updates.map((u) => (
                <tr key={u.id}>
                  <td>{fmtWhen(u.created_at)}</td>
                  <td>{u.bundle_id}</td>
                  <td>{u.version}</td>
                  <td><span className={`radmin-badge${u.status === "applied" ? " ok" : u.status === "rolled_back" ? " warn" : " bad"}`}>{u.status}</span></td>
                  <td>{u.signature || "—"}{u.key_id ? ` (${u.key_id})` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="radmin-card">
        <div className="ops-brief-head"><h3>Industry pack projections in this build</h3></div>
        <p className="radmin-sub">
          A pack installed from signed media carries <b>data, never code</b>. Where this build ships the pack&rsquo;s own
          projection code it renders bespoke analytics; where it does not, the Ω policies still enforce identically
          and the dashboard renders from declarative content. Enforcement is the same in both modes.
        </p>
        <div className="ops-sov-packs">
          {Object.entries(d.packs?.projections || {}).map(([id, mode]) => (
            <span key={id} className={`radmin-badge${mode === "builtin" ? " ok" : " warn"}`}>{id} · {String(mode)}</span>
          ))}
        </div>
        <p className="radmin-deliv-meta ops-sov-foot">
          Installing and updating happen at the console with <code>guardian</code>, never over HTTP — an air-gapped
          estate&rsquo;s supply chain should not have a network-reachable write path.
          <button className="radmin-linkbtn" onClick={() => go("industry")}> Industry packs →</button>
        </p>
      </section>
    </>
  );
}
