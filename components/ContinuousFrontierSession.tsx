"use client";

import { useEffect, useMemo, useState } from "react";
import type { FrontierConfig } from "@/components/FrontierLabClient";

type Mode = "shadow" | "guarded_pilot" | "enforced";
type Decision = { verdict: string; rule?: string; layer?: string; reason?: string; latency_ms?: number; metadata?: { capabilities?: string[] } };
type Step = { step: number; timestamp: string; normalized_call: { tool: string; args: Record<string, unknown> }; morrison_decision: Decision; shadow_decision?: string | null; execution_occurred: boolean; simulator_result?: unknown; operator_decision?: unknown; model_latency_ms: number; governance_latency_ms: number; step_hash: string; previous_step_hash?: string | null };
type Snapshot = { session_id: string; provider: string; model: string; mode: Mode; scenario_id: string; status: string; current_step: number; max_steps: number; model_calls: number; started_at?: string; ended_at?: string; stop_reason?: string; pending_review?: { step: number; call: { tool: string; args: Record<string, unknown> }; action_hash: string }; approval_configured: boolean; steps: Step[]; events: Array<{ sequence: number; timestamp: string; kind: string; data: Record<string, unknown> }>; summary: { proposed_actions: number; allow: number; block: number; escalate: number; would_allow: number; would_block: number; would_escalate: number; executed_actions: number; unauthorized_executions: number; containment_events: number; policy_exposures: number; model_latency_ms: number; governance_latency_ms: number; average_governance_latency_ms: number }; last_step_hash?: string; session_evidence_hash?: string; evidence_verified?: boolean | null; morrison_evidence_integrity?: { evidence_verified?: boolean } };
type ApiResponse = { ok: boolean; session: Snapshot; persistence: { backend: string; restart_durable: boolean; volume_required: boolean } };

async function api(path: string, init: RequestInit = {}) {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, ...init });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

const LABELS: Record<Mode, string> = { shadow: "SHADOW MODE", guarded_pilot: "GUARDED PILOT", enforced: "ENFORCED" };
const FINAL = new Set(["completed", "stopped", "terminated", "failed"]);

export default function ContinuousFrontierSession({ config }: { config: FrontierConfig }) {
  const firstReady = config.providers.find((entry) => entry.status === "READY") || config.providers[0];
  const [provider, setProvider] = useState(firstReady?.provider || "anthropic");
  const selectedProvider = config.providers.find((entry) => entry.provider === provider);
  const [model, setModel] = useState(firstReady?.models?.[0] || "");
  const [scenarioId, setScenarioId] = useState("clean_control_001");
  const [domain, setDomain] = useState("broad");
  const [mode, setMode] = useState<Mode>("guarded_pilot");
  const [objective, setObjective] = useState("Review the synthetic environment and complete the requested workflow.");
  const [maxSteps, setMaxSteps] = useState(config.limits.session_default_steps || 10);
  const [maxRuntime, setMaxRuntime] = useState(config.limits.session_default_runtime_seconds || 300);
  const [customTask, setCustomTask] = useState("Review this synthetic workflow note.");
  const [customContent, setCustomContent] = useState("");
  const [session, setSession] = useState<Snapshot | null>(null);
  const [persistence, setPersistence] = useState<ApiResponse["persistence"] | null>(null);
  const [recent, setRecent] = useState<Snapshot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scenario = config.scenarios.find((entry) => entry.id === scenarioId);
  const custom = scenarioId === "custom_web_001";
  const selectedMode = config.session_modes?.find((entry) => entry.id === mode);
  const running = session && !FINAL.has(session.status);

  useEffect(() => {
    api("/api/frontier/session").then((data) => { setRecent(data.sessions || []); setPersistence(data.persistence); }).catch(() => undefined);
    const requested = new URLSearchParams(window.location.search).get("session");
    if (requested) api(`/api/frontier/session/${encodeURIComponent(requested)}`).then((data: ApiResponse) => { setSession(data.session); setPersistence(data.persistence); }).catch((reason) => setError((reason as Error).message));
  }, []);
  useEffect(() => {
    if (!session || FINAL.has(session.status) || session.status === "paused" || session.status === "review_required") return;
    const timer = window.setInterval(async () => {
      try {
        const data = await api(`/api/frontier/session/${session.session_id}`) as ApiResponse;
        setSession(data.session); setPersistence(data.persistence);
        if (FINAL.has(data.session.status)) setRecent((old) => [data.session, ...old.filter((item) => item.session_id !== data.session.session_id)].slice(0, 20));
      } catch (reason) { setError((reason as Error).message); }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [session?.session_id, session?.status]);

  const start = async () => {
    setBusy(true); setError(""); setSession(null);
    const body: Record<string, unknown> = { provider, model, scenario_id: scenarioId, objective, mode, domain, max_steps: maxSteps, max_runtime_s: maxRuntime, block_behavior: "return_denial_and_replan" };
    if (custom) { body.custom_user_task = customTask; body.custom_untrusted_content = customContent; }
    try {
      const data = await api("/api/frontier/session", { method: "POST", body: JSON.stringify(body) }) as ApiResponse;
      setSession(data.session); setPersistence(data.persistence);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  const control = async (action: string) => {
    if (!session) return;
    setBusy(true); setError("");
    try { const data = await api(`/api/frontier/session/${session.session_id}/${action}`, { method: "POST", body: "{}" }) as ApiResponse; setSession(data.session); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  const download = (format: "json" | "txt") => {
    if (!session) return;
    const content = format === "json" ? JSON.stringify(session, null, 2) : session.steps.map((step) => `STEP ${step.step}\nMODEL: ${step.normalized_call.tool} ${JSON.stringify(step.normalized_call.args)}\nMORRISON: ${step.shadow_decision || step.morrison_decision.verdict}\nEXECUTED: ${step.execution_occurred ? "YES" : "NO"}\nHASH: ${step.step_hash}`).join("\n\n");
    const url = URL.createObjectURL(new Blob([content], { type: format === "json" ? "application/json" : "text/plain" }));
    const link = document.createElement("a"); link.href = url; link.download = `${session.session_id}.${format}`; link.click(); URL.revokeObjectURL(url);
  };
  const modeDescription = selectedMode?.description || "Every model-proposed action is evaluated before execution.";
  const highest = useMemo(() => session?.steps.findLast((step) => step.morrison_decision.verdict !== "PERMIT"), [session?.steps]);

  return <>
    <section className="flab-grid">
      <div className="flab-panel flab-controls">
        <div className="flab-section-title">Continuous session configuration</div>
        <label>Provider<select value={provider} onChange={(event) => { const next = event.target.value as typeof provider; setProvider(next); setModel(config.providers.find((item) => item.provider === next)?.models?.[0] || ""); }}>{config.providers.map((item) => <option key={item.provider} value={item.provider}>{item.provider} · {item.status}</option>)}</select></label>
        <label>Model<select value={model} onChange={(event) => setModel(event.target.value)}>{selectedProvider?.models.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Governance mode<select value={mode} onChange={(event) => setMode(event.target.value as Mode)}>{(config.session_modes || []).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <div className={`flab-mode-note ${mode}`}><strong>{LABELS[mode]}</strong><span>{modeDescription}</span></div>
        <label>Governance domain<select value={domain} onChange={(event) => setDomain(event.target.value)}>{config.domains.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Seed scenario<select value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>{config.scenarios.map((item) => <option key={item.id} value={item.id}>{item.title} · v{item.version}</option>)}</select></label>
        <label>Objective<textarea value={objective} maxLength={4000} onChange={(event) => setObjective(event.target.value)} /></label>
        {custom && <><label>Custom synthetic task<textarea value={customTask} maxLength={config.limits.max_task_chars} onChange={(event) => setCustomTask(event.target.value)} /></label><label>Custom untrusted content<textarea className="tall" value={customContent} maxLength={config.limits.max_content_chars} onChange={(event) => setCustomContent(event.target.value)} /></label></>}
        <div className="flab-inline"><label>Max steps<input type="number" value={maxSteps} min={1} max={config.limits.session_max_steps || 50} onChange={(event) => setMaxSteps(Number(event.target.value))} /></label><label>Max runtime (s)<input type="number" value={maxRuntime} min={10} max={config.limits.session_max_runtime_seconds || 900} onChange={(event) => setMaxRuntime(Number(event.target.value))} /></label></div>
        <button className="flab-run" disabled={busy || !!running || selectedProvider?.status !== "READY" || !objective.trim() || (custom && (!customTask.trim() || !customContent.trim()))} onClick={start}>{busy ? "STARTING…" : "START SESSION"}</button>
        {error && <div className="flab-error"><strong>FAIL CLOSED</strong>{error}<span>Protected execution reached: NO</span></div>}
      </div>
      <div className="flab-stack">
        <section className="flab-panel"><div className="flab-section-title">Seed context</div><div className="flab-task"><span>Session objective</span>{objective}</div><pre className="flab-content">{custom ? customContent : (scenario?.untrusted_content || "No untrusted content in this seed scenario.")}</pre><div className="flab-meta">{scenario?.id} · version {scenario?.version}</div></section>
        <section className="flab-panel"><div className="flab-section-title">Persistence status</div><KeyValues values={{ Backend: persistence?.backend || "checking", "Restart durable": persistence?.restart_durable ? "YES" : "NO — RAILWAY VOLUME REQUIRED", "Server owned": "YES" }} /></section>
      </div>
    </section>
    {session && <>
      <section className="flab-panel flab-session-head"><div><span>SESSION STATUS</span><strong className={`status-${session.status}`}>{session.status.replaceAll("_", " ").toUpperCase()}</strong><small>{session.session_id} · {LABELS[session.mode]}</small></div><div className="flab-session-actions">{session.status === "running" && <button onClick={() => control("pause")}>PAUSE</button>}{session.status === "paused" && <button onClick={() => control("resume")}>RESUME</button>}{!FINAL.has(session.status) && <><button onClick={() => control("stop")}>STOP</button><button className="danger" onClick={() => control("terminate")}>TERMINATE</button></>}</div></section>
      {session.status === "review_required" && session.pending_review && <section className="flab-review"><span>REVIEW ACTION</span><strong>{session.pending_review.call.tool}</strong><pre>{JSON.stringify(session.pending_review.call.args, null, 2)}</pre><div>{session.approval_configured && <button onClick={() => control("approve")}>APPROVE WITH BOUND ARTIFACT</button>}<button onClick={() => control("deny")}>DENY</button><button onClick={() => control("continue_without_action")}>CONTINUE WITHOUT ACTION</button><button onClick={() => control("terminate")}>TERMINATE SESSION</button></div></section>}
      <section className="flab-panel"><div className="flab-section-title">Live session timeline</div>{session.steps.length ? <ol className="flab-session-timeline">{session.steps.map((step) => <li key={step.step_hash}><b>{String(step.step).padStart(2, "0")}</b><div><strong>{step.normalized_call.tool}</strong><pre>{JSON.stringify(step.normalized_call.args, null, 2)}</pre><span>Morrison: {step.shadow_decision || step.morrison_decision.verdict} · Execution: {step.execution_occurred ? "SIMULATOR COMPLETED" : step.morrison_decision.verdict === "ESCALATE" ? "HELD" : "NO"}</span><small>{step.morrison_decision.reason}</small></div></li>)}</ol> : <p className="flab-muted">Waiting for the first model proposal…</p>}</section>
      <section className="flab-panel"><div className="flab-section-title">Session summary</div><div className="flab-summary"><Metric label="Current step" value={`${session.current_step} / ${session.max_steps}`} /><Metric label="Model calls" value={session.model_calls} /><Metric label="ALLOW" value={session.summary.allow} /><Metric label="BLOCK" value={session.summary.block} /><Metric label="ESCALATE" value={session.summary.escalate} /><Metric label="Would-block" value={session.summary.would_block} /><Metric label="Would-escalate" value={session.summary.would_escalate} /><Metric label="Executed actions" value={session.summary.executed_actions} /><Metric label="Unauthorized executions" value={session.summary.unauthorized_executions} /><Metric label="Policy exposures" value={session.summary.policy_exposures} /><Metric label="Model latency" value={`${session.summary.model_latency_ms.toFixed(1)} ms`} /><Metric label="Governance latency" value={`${session.summary.governance_latency_ms.toFixed(3)} ms`} accent /></div></section>
      <section className="flab-detail-grid"><div className="flab-panel"><div className="flab-section-title">Model session trace</div><pre className="flab-json">{JSON.stringify(session.events, null, 2)}</pre></div><div className="flab-panel"><div className="flab-section-title">Session evidence</div><KeyValues values={{ "Session ID": session.session_id, Provider: session.provider, Model: session.model, "Last verdict": highest?.morrison_decision.verdict || "—", "Last step hash": session.last_step_hash || "PENDING", "Session root hash": session.session_evidence_hash || "PENDING", "Step chain": session.evidence_verified == null ? "IN PROGRESS" : session.evidence_verified ? "VERIFIED" : "FAILED", "Morrison chain": session.morrison_evidence_integrity?.evidence_verified ? "VERIFIED" : "IN PROGRESS" }} /><button className="flab-secondary" onClick={() => download("json")}>Download JSON</button> <button className="flab-secondary" onClick={() => download("txt")}>Download TXT</button></div></section>
    </>}
    <section className="flab-panel flab-history"><div className="flab-section-title">Recent governed sessions</div>{recent.length ? <div className="flab-table-wrap"><table><thead><tr><th>Started</th><th>Provider / model</th><th>Mode</th><th>Step</th><th>Last verdict</th><th>Status</th></tr></thead><tbody>{recent.map((item) => <tr key={item.session_id} onClick={() => setSession(item)}><td>{item.started_at ? new Date(item.started_at).toLocaleString() : "—"}</td><td>{item.provider}<small>{item.model}</small></td><td>{LABELS[item.mode]}</td><td>{item.current_step}</td><td>{item.steps.at(-1)?.shadow_decision || item.steps.at(-1)?.morrison_decision.verdict || "—"}</td><td>{item.status}</td></tr>)}</tbody></table></div> : <p className="flab-muted">No persistent sessions recorded yet.</p>}</section>
    <section className="flab-panel flab-tools"><div className="flab-section-title">Available simulated capabilities</div><div className="flab-tool-grid">{config.tools.map((tool) => <div key={tool.name}><code>{tool.name}</code><span>{tool.description}</span></div>)}</div><p>SIMULATED — NO REAL-WORLD SIDE EFFECTS. Every proposed action is evaluated before this inert simulator is reachable.</p></section>
  </>;
}

function KeyValues({ values }: { values: Record<string, unknown> }) { return <dl className="flab-kv">{Object.entries(values).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl>; }
function Metric({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) { return <div className={accent ? "accent" : ""}><span>{label}</span><strong>{value}</strong></div>; }
