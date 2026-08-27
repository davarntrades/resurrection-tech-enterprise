"use client";

import { useEffect, useMemo, useState } from "react";
import type { FrontierConfig } from "@/components/FrontierLabClient";
import GovernedEvidencePanels from "@/components/GovernedEvidencePanels";
import type { GovernedResult } from "@/lib/governed-result";
import RegulatoryExposureCard from "@/components/RegulatoryExposureCard";
import type { RegulatoryExposure } from "@/lib/regulatory-exposure";

type Mode = "shadow" | "guarded_pilot" | "enforced";
type Decision = { verdict: string; rule?: string; layer?: string; reason?: string; latency_ms?: number; metadata?: { capabilities?: string[] } };
type ExecutionEvidence = { execution_environment?: string; adapter?: string; environment_id?: string | null; twin_id?: string | null; morrison_decision_id?: string | null; verdict: string; executed: boolean | null; external_state_changed: boolean | null; state_observability?: string; state_before_hash?: string | null; state_after_hash?: string | null; state_delta?: unknown; execution_receipt?: unknown; correlation_id?: string | null; evidence_verified?: boolean };
type Step = { step: number; timestamp: string; normalized_call: { tool: string; args: Record<string, unknown> }; morrison_decision: Decision; shadow_decision?: string | null; execution_occurred: boolean; execution_evidence?: ExecutionEvidence; simulator_result?: unknown; operator_decision?: unknown; model_latency_ms: number; governance_latency_ms: number; step_hash: string; previous_step_hash?: string | null };
type ValueImpact = { mode: Mode; measurement_type: "illustrative"; currency: "GBP"; measured_facts: { total_proposed_actions: number; permitted_actions: number; blocked_actions: number; escalated_actions: number; unauthorized_executions: number }; direct_simulated_exposure_identified: number | null; direct_simulated_exposure_prevented: number | null; estimated_enterprise_impact: { min: number; max: number; basis: string; aggregation: string; profiles: string[] } | null; incident_classes: Array<{ id: string; label: string }>; possible_costs: string[]; workflow_continuity: { preserved: boolean; permitted_actions: number; intercepted_actions: number; continued_after_intervention: boolean }; would_guarded_pilot_intervene: boolean | null; disclaimer: string };
type Snapshot = { session_id: string; provider: string; model: string; mode: Mode; scenario_id: string; status: string; current_step: number; max_steps: number; model_calls: number; started_at?: string; ended_at?: string; stop_reason?: string; pending_review?: { step: number; call: { tool: string; args: Record<string, unknown> }; action_hash: string }; approval_configured: boolean; steps: Step[]; events: Array<{ sequence: number; timestamp: string; kind: string; data: Record<string, unknown> }>; summary: { proposed_actions: number; allow: number; block: number; escalate: number; would_allow: number; would_block: number; would_escalate: number; executed_actions: number; unauthorized_executions: number; containment_events: number; policy_exposures: number; model_latency_ms: number; governance_latency_ms: number; average_governance_latency_ms: number }; value_impact?: ValueImpact; regulatory_exposure?: RegulatoryExposure; governed_result?: GovernedResult; last_step_hash?: string; session_evidence_hash?: string; evidence_verified?: boolean | null; morrison_evidence_integrity?: { evidence_verified?: boolean } };
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
  const [boundaryMutation, setBoundaryMutation] = useState("none");
  const [customTask, setCustomTask] = useState("Review this synthetic workflow note.");
  const [customContent, setCustomContent] = useState("");
  const [jurisdictions, setJurisdictions] = useState<string[]>([]);
  const [frameworks, setFrameworks] = useState<string[]>([]);
  const [dataCategories, setDataCategories] = useState<string[]>([]);
  const [financialEntity, setFinancialEntity] = useState(false);
  const [turnover, setTurnover] = useState("");
  const [turnoverCurrency, setTurnoverCurrency] = useState("GBP");
  const [gdprTier, setGdprTier] = useState("unknown");
  const [nis2Class, setNis2Class] = useState("unknown");
  const [aiActClass, setAiActClass] = useState("unknown");
  const [aiActTier, setAiActTier] = useState("unknown");
  const [aiActSme, setAiActSme] = useState("unknown");
  const [session, setSession] = useState<Snapshot | null>(null);
  const [persistence, setPersistence] = useState<ApiResponse["persistence"] | null>(null);
  const [recent, setRecent] = useState<Snapshot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scenario = config.scenarios.find((entry) => entry.id === scenarioId);
  const custom = scenarioId === "custom_web_001";
  const selectedMode = config.session_modes?.find((entry) => entry.id === mode);
  const running = session && !FINAL.has(session.status);
  const activeSessionId = session?.session_id;
  const activeSessionStatus = session?.status;

  useEffect(() => {
    api("/api/frontier/session").then((data) => { setRecent(data.sessions || []); setPersistence(data.persistence); }).catch(() => undefined);
    const requested = new URLSearchParams(window.location.search).get("session");
    if (requested) api(`/api/frontier/session/${encodeURIComponent(requested)}`).then((data: ApiResponse) => { setSession(data.session); setPersistence(data.persistence); }).catch((reason) => setError((reason as Error).message));
  }, []);
  useEffect(() => {
    if (!activeSessionId || !activeSessionStatus || FINAL.has(activeSessionStatus) || activeSessionStatus === "paused" || activeSessionStatus === "review_required") return;
    const timer = window.setInterval(async () => {
      try {
        const data = await api(`/api/frontier/session/${activeSessionId}`) as ApiResponse;
        setSession(data.session); setPersistence(data.persistence);
        if (FINAL.has(data.session.status)) setRecent((old) => [data.session, ...old.filter((item) => item.session_id !== data.session.session_id)].slice(0, 20));
      } catch (reason) { setError((reason as Error).message); }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [activeSessionId, activeSessionStatus]);

  const start = async () => {
    setBusy(true); setError(""); setSession(null);
    const parsedTurnover = Number(turnover);
    const body: Record<string, unknown> = { provider, model, scenario_id: scenarioId, objective, mode, domain, max_steps: maxSteps, max_runtime_s: maxRuntime, block_behavior: "return_denial_and_replan", safety_boundary_mutation: boundaryMutation, organization_profile: {
      organization_id: "operator-configured-pilot", jurisdictions, sector: financialEntity ? "financial_services" : "unknown",
      annual_global_turnover: turnover.trim() && Number.isFinite(parsedTurnover) && parsedTurnover > 0 ? { amount: parsedTurnover, currency: turnoverCurrency, year: new Date().getFullYear() - 1 } : null,
      data_categories: dataCategories, regulated_entities: financialEntity ? ["financial_services"] : [], frameworks_enabled: frameworks,
      ai_system_classification: { eu_ai_act: aiActClass, eu_ai_act_penalty_tier: aiActTier },
      entity_classifications: { eu_gdpr_penalty_tier: gdprTier, uk_gdpr_penalty_tier: gdprTier, nis2: nis2Class, eu_ai_act_sme: aiActSme, hipaa_hitech: "unknown" },
      contractual_frameworks: frameworks.includes("pci_dss") ? ["pci_dss"] : [],
    } };
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
        <label>Safety evidence operating point<select value={boundaryMutation} onChange={(event) => setBoundaryMutation(event.target.value)}><option value="none">Declared tested envelope</option><option value="agent_count_2">Boundary demo · 2 agents</option><option value="new_tool">Boundary demo · new tool</option><option value="horizon_expansion">Boundary demo · expanded horizon</option></select></label>
        {boundaryMutation !== "none" && <p className="flab-pending">Evidence-only mutation. Runtime governance remains active; the prior local-safety claim will not transfer.</p>}
        <details className="flab-reg-config"><summary>Regulatory context profile (operator configured)</summary>
          <p>Optional applicability inputs. Missing values remain unknown; the Lab does not infer legal scope or turnover.</p>
          <OptionChecks title="Jurisdictions" values={["UK", "EU", "US"]} selected={jurisdictions} setSelected={setJurisdictions} />
          <OptionChecks title="Data in scope" values={["personal_data", "financial_data", "payment_card_data", "health_data"]} selected={dataCategories} setSelected={setDataCategories} />
          <OptionChecks title="Frameworks enabled" values={(config.regulatory_profiles || []).map((item) => item.framework_id)} selected={frameworks} setSelected={setFrameworks} />
          <label className="flab-check"><input type="checkbox" checked={financialEntity} onChange={(event) => setFinancialEntity(event.target.checked)} /> Configured regulated financial-services entity</label>
          <div className="flab-inline"><label>Annual global turnover (optional)<input inputMode="decimal" value={turnover} placeholder="Not configured" onChange={(event) => setTurnover(event.target.value.replace(/[^0-9.]/g, ""))} /></label><label>Turnover currency<select value={turnoverCurrency} onChange={(event) => setTurnoverCurrency(event.target.value)}><option>GBP</option><option>EUR</option><option>USD</option></select></label></div>
          <div className="flab-inline"><label>GDPR penalty tier<select value={gdprTier} onChange={(event) => setGdprTier(event.target.value)}><option value="unknown">Unknown</option><option value="standard">Standard tier</option><option value="higher">Higher tier</option></select></label><label>NIS2 entity class<select value={nis2Class} onChange={(event) => setNis2Class(event.target.value)}><option value="unknown">Unknown</option><option value="essential">Essential</option><option value="important">Important</option><option value="not_applicable">Not applicable</option></select></label></div>
          <div className="flab-inline"><label>EU AI Act classification<select value={aiActClass} onChange={(event) => setAiActClass(event.target.value)}><option value="unknown">Unknown</option><option value="high_risk">High-risk (configured)</option><option value="prohibited">Prohibited practice (configured)</option><option value="not_applicable">Not applicable</option></select></label><label>EU AI Act context tier<select value={aiActTier} onChange={(event) => setAiActTier(event.target.value)}><option value="unknown">Unknown</option><option value="prohibited_practice">Prohibited practice</option><option value="other_obligation">Other obligation</option><option value="incorrect_information">Incorrect information</option></select></label></div>
          <label>EU AI Act SME classification<select value={aiActSme} onChange={(event) => setAiActSme(event.target.value)}><option value="unknown">Unknown</option><option value="true">SME (configured)</option><option value="false">Not an SME (configured)</option></select></label>
        </details>
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
      {session.steps.some((step) => step.execution_evidence) && <section className="flab-panel"><div className="flab-section-title">External execution evidence</div>{session.steps.filter((step) => step.execution_evidence).map((step) => <StepExecutionEvidence key={step.step_hash} step={step} />)}</section>}
      <section className="flab-panel"><div className="flab-section-title">Session summary</div><div className="flab-summary"><Metric label="Current step" value={`${session.current_step} / ${session.max_steps}`} /><Metric label="Model calls" value={session.model_calls} /><Metric label="ALLOW" value={session.summary.allow} /><Metric label="BLOCK" value={session.summary.block} /><Metric label="ESCALATE" value={session.summary.escalate} /><Metric label="Would-block" value={session.summary.would_block} /><Metric label="Would-escalate" value={session.summary.would_escalate} /><Metric label="Executed actions" value={session.summary.executed_actions} /><Metric label="Unauthorized executions" value={session.summary.unauthorized_executions} /><Metric label="Policy exposures" value={session.summary.policy_exposures} /><Metric label="Model latency" value={`${session.summary.model_latency_ms.toFixed(1)} ms`} /><Metric label="Governance latency" value={`${session.summary.governance_latency_ms.toFixed(3)} ms`} accent /></div></section>
      <GovernedEvidencePanels result={session.governed_result} />
      {session.value_impact && <SessionValueImpact impact={session.value_impact} evidenceVerified={session.evidence_verified === true} />}
      {session.regulatory_exposure && <SessionRegulatoryExposure exposure={session.regulatory_exposure} runtimeVerdict={session.steps.at(-1)?.shadow_decision || session.steps.at(-1)?.morrison_decision.verdict} unauthorizedExecutions={session.summary.unauthorized_executions} />}
      <section className="flab-detail-grid"><div className="flab-panel"><div className="flab-section-title">Model session trace</div><pre className="flab-json">{JSON.stringify(session.events, null, 2)}</pre></div><div className="flab-panel"><div className="flab-section-title">Session evidence</div><KeyValues values={{ "Session ID": session.session_id, Provider: session.provider, Model: session.model, "Last verdict": highest?.morrison_decision.verdict || "—", "Last step hash": session.last_step_hash || "PENDING", "Session root hash": session.session_evidence_hash || "PENDING", "Step chain": session.evidence_verified == null ? "IN PROGRESS" : session.evidence_verified ? "VERIFIED" : "FAILED", "Morrison chain": session.morrison_evidence_integrity?.evidence_verified ? "VERIFIED" : "IN PROGRESS" }} /><button className="flab-secondary" onClick={() => download("json")}>Download JSON</button> <button className="flab-secondary" onClick={() => download("txt")}>Download TXT</button></div></section>
    </>}
    <section className="flab-panel flab-history"><div className="flab-section-title">Recent governed sessions</div>{recent.length ? <div className="flab-table-wrap"><table><thead><tr><th>Started</th><th>Provider / model</th><th>Mode</th><th>Step</th><th>Last verdict</th><th>Envelope</th><th>Boundary state</th><th>Status</th></tr></thead><tbody>{recent.map((item) => { const safety = item.governed_result?.safety_envelope; return <tr key={item.session_id} onClick={() => setSession(item)}><td>{item.started_at ? new Date(item.started_at).toLocaleString() : "—"}</td><td>{item.provider}<small>{item.model}</small></td><td>{LABELS[item.mode]}</td><td>{item.current_step}</td><td>{item.steps.at(-1)?.shadow_decision || item.steps.at(-1)?.morrison_decision.verdict || "—"}</td><td>{safety?.envelope || "NOT ESTABLISHED"}<small>{safety?.status || "UNAVAILABLE"}</small></td><td>{(safety?.unsupported_unvalidated_region || [])[0] || "Inside declared envelope"}</td><td>{item.status}</td></tr>; })}</tbody></table></div> : <p className="flab-muted">No persistent sessions recorded yet.</p>}</section>
    <section className="flab-panel flab-tools"><div className="flab-section-title">Available simulated capabilities</div><div className="flab-tool-grid">{config.tools.map((tool) => <div key={tool.name}><code>{tool.name}</code><span>{tool.description}</span></div>)}</div><p>SIMULATED — NO REAL-WORLD SIDE EFFECTS. Every proposed action is evaluated before this inert simulator is reachable.</p></section>
  </>;
}

function KeyValues({ values }: { values: Record<string, unknown> }) { return <dl className="flab-kv">{Object.entries(values).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl>; }
function Metric({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) { return <div className={accent ? "accent" : ""}><span>{label}</span><strong>{value}</strong></div>; }

function StepExecutionEvidence({ step }: { step: Step }) {
  const ev = step.execution_evidence!;
  const blocked = ev.verdict === "BLOCK";
  return <div className="flab-panel" style={{ marginTop: 12 }}>
    <strong>{blocked ? "MORRISON BLOCK" : `STEP ${step.step} · ${ev.verdict}`}</strong>
    {blocked && <p>EXTERNAL EXECUTION: NOT ATTEMPTED · STATE CHANGE: {ev.state_observability === "NOT_APPLICABLE" ? "NOT APPLICABLE" : "UNKNOWN"}</p>}
    <KeyValues values={{
      "Execution environment": ev.execution_environment || ev.environment_id || ev.twin_id || "—",
      Adapter: ev.adapter || "—", "Environment / twin ID": ev.environment_id || ev.twin_id || "—",
      "Morrison decision ID": ev.morrison_decision_id || "—", Verdict: ev.verdict,
      "Executed?": ev.executed === true ? "YES" : ev.executed === false ? "NO" : "UNKNOWN",
      "External state changed?": ev.external_state_changed === true ? "YES" : ev.external_state_changed === false ? "NO" : "UNKNOWN",
      "State before hash": ev.state_before_hash || "UNAVAILABLE", "State after hash": ev.state_after_hash || "UNAVAILABLE",
      "State delta": ev.state_delta == null ? "UNAVAILABLE" : JSON.stringify(ev.state_delta),
      "Execution receipt": ev.execution_receipt == null ? "UNAVAILABLE" : JSON.stringify(ev.execution_receipt),
      "Correlation ID": ev.correlation_id || "—", "Evidence verified": ev.evidence_verified ? "YES" : "NO",
    }} />
  </div>;
}

function SessionRegulatoryExposure({ exposure, runtimeVerdict, unauthorizedExecutions }: { exposure: RegulatoryExposure; runtimeVerdict?: string; unauthorizedExecutions: number }) {
  // Protected Value and regulatory/compliance context remain separate evidence
  // projections; neither is used to derive or rewrite the Morrison verdict.
  return <RegulatoryExposureCard exposure={exposure} runtimeVerdict={runtimeVerdict} unauthorizedExecutions={unauthorizedExecutions} />;
}

function OptionChecks({ title, values, selected, setSelected }: { title: string; values: string[]; selected: string[]; setSelected: (value: string[]) => void }) {
  return <fieldset className="flab-options"><legend>{title}</legend>{values.map((value) => <label className="flab-check" key={value}><input type="checkbox" checked={selected.includes(value)} onChange={(event) => setSelected(event.target.checked ? [...selected, value] : selected.filter((item) => item !== value))} />{value.replaceAll("_", " ")}</label>)}</fieldset>;
}

function gbp(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);
}

function SessionValueImpact({ impact, evidenceVerified }: { impact: ValueImpact; evidenceVerified: boolean }) {
  const shadow = impact.mode === "shadow";
  const direct = shadow ? impact.direct_simulated_exposure_identified : impact.direct_simulated_exposure_prevented;
  const continuity = impact.workflow_continuity;
  const estimated = impact.estimated_enterprise_impact;
  return <section className={`flab-panel flab-value-impact ${shadow ? "shadow" : "protected"}`}>
    <div className="flab-value-heading">
      <div><span>MEASURED SESSION FACTS</span><h2>{shadow ? "VALUE AT RISK" : "VALUE PROTECTED"}</h2></div>
      <span className="flab-value-badge">SIMULATED</span>
    </div>
    <div className="flab-value-facts">
      <div className="hero"><span>{shadow ? "Direct simulated exposure identified" : "Direct simulated exposure prevented"}</span><strong>{direct == null ? "NOT MEASURED" : gbp(direct)}</strong>{direct == null && <small>No defensible monetary amount was present in the governed action arguments.</small>}</div>
      <div><span>Proposed actions</span><strong>{impact.measured_facts.total_proposed_actions}</strong></div>
      <div><span>Permitted actions</span><strong>{impact.measured_facts.permitted_actions}</strong></div>
      <div><span>{shadow ? "Observed unsafe proposals" : "Unsafe actions intercepted"}</span><strong>{shadow ? impact.measured_facts.blocked_actions + impact.measured_facts.escalated_actions : continuity.intercepted_actions}</strong></div>
      <div><span>Unauthorized executions</span><strong>{impact.measured_facts.unauthorized_executions}</strong></div>
      <div><span>Evidence chain</span><strong>{evidenceVerified ? "VERIFIED" : "IN PROGRESS"}</strong></div>
    </div>
    <div className="flab-value-estimate">
      <span>ILLUSTRATIVE ESTIMATE</span>
      <h3>{shadow ? "Projected downstream enterprise impact" : "Estimated enterprise impact avoided"}</h3>
      <strong>{estimated ? `${gbp(estimated.min)} – ${gbp(estimated.max)}+` : "NO MATCHED IMPACT PROFILE"}</strong>
      <p>{impact.disclaimer}</p>
      {impact.incident_classes.length > 0 && <div className="flab-value-classes">{impact.incident_classes.map((item) => <span key={item.id}>{item.label}</span>)}</div>}
    </div>
    {shadow && <div className="flab-value-intervene"><span>Would Guarded Pilot intervene?</span><strong>{impact.would_guarded_pilot_intervene ? "YES" : "NO"}</strong><small>Shadow Mode observes policy decisions; it does not claim prevention.</small></div>}
    {impact.possible_costs.length > 0 && <div className="flab-value-costs"><span>{shadow ? "Potential enterprise costs represented" : "Potential costs avoided"}</span><ul>{impact.possible_costs.map((cost) => <li key={cost}>{cost}</li>)}</ul></div>}
    <div className={`flab-value-continuity ${continuity.preserved ? "preserved" : "not-preserved"}`}><span>WORKFLOW CONTINUITY</span><strong>{continuity.preserved ? `${continuity.permitted_actions} legitimate action${continuity.permitted_actions === 1 ? "" : "s"} preserved` : "NOT DEMONSTRATED"}</strong><p>{continuity.preserved ? (continuity.continued_after_intervention ? "The session continued after governance intervention." : "Legitimate work remained reachable in the same governed session.") : "This session did not contain both an intervention and a permitted legitimate action."}</p></div>
    <p className="flab-value-boundary">Illustrative demo assumptions only. No real transaction, loss, breach, or saving occurred.</p>
  </section>;
}
