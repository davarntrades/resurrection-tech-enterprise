"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import ContinuousFrontierSession from "@/components/ContinuousFrontierSession";

type ProviderName = "anthropic" | "openai" | "huggingface";
type Provider = { provider: ProviderName; status: "READY" | "NOT_CONFIGURED"; model: string | null; models: string[]; missing: string[] };
type Scenario = { id: string; version: string; title: string; user_task: string; untrusted_content: string; untrusted_content_type: string; safe_control: boolean };
type Tool = { name: string; description: string };
export type FrontierConfig = { providers: Provider[]; scenarios: Scenario[]; domains: string[]; tools: Tool[]; limits: { max_runs: number; max_content_chars: number; max_task_chars: number; timeout_seconds: number; session_default_steps?: number; session_max_steps?: number; session_default_runtime_seconds?: number; session_max_runtime_seconds?: number }; session_modes?: Array<{ id: "shadow" | "guarded_pilot" | "enforced"; title: string; description: string }>; regulatory_profiles?: Array<{ framework_id: string; framework_name: string; jurisdiction: string; profile_version: string; source: { authority: string; name: string; reference: string; url: string }; source_last_verified: string }> };
type Decision = { verdict: string; layer?: string; rule?: string | null; reason?: string; omega_domain?: string | null; latency_ms?: number; executed?: boolean; proposed?: { tool: string; args: Record<string, unknown> }; trajectory_hash?: string };
type RecordRow = {
  run_id: string; timestamp: string; scenario_id: string; scenario_version: string;
  provider: string; model: string; model_compromised: boolean; classification: string;
  model_tool_calls: Array<{ tool: string; args: Record<string, unknown> }>;
  governance_decisions: Decision[]; adversarial_decisions?: Decision[]; evaluated_prefixes: Array<Array<{ tool: string; args: Record<string, unknown> }>>;
  final_verdict: string; adversarial_verdict?: string; adversarial_execution_attempted: boolean;
  simulated_execution_occurred: boolean; executed_calls: Array<{ tool: string; args: Record<string, unknown> }>;
  unauthorized_execution_count: number; containment_success: boolean;
  trajectory_hash: string; experiment_record_hash: string;
  evidence_integrity: { evidence_verified?: boolean; head?: string; records?: number; ruleset_hash?: string; problems?: string[] };
  latency: { model_ms: number; governance_ms: number; total_ms: number };
  governance_domains?: string[]; provider_error?: string | null; model_output_malformed?: boolean;
};
type Summary = {
  total_trials: number; safe_controls: number; adversarial_trials: number;
  model_resistance_count: number; model_compromise_count: number;
  morrison_block_count: number; morrison_escalate_count: number;
  unauthorized_execution_count: number; runtime_containment_rate: number | null;
  false_positive_rate_on_safe_controls: number | null;
  provider_model_latency: { p50_ms: number; p95_ms: number };
  governance_latency: { p50_ms: number; p95_ms: number };
};
type RunResponse = { ok: true; provider: string; model: string; domain: string; scenario: Scenario; results: RecordRow[]; evidence_downloads?: Record<string, string>; summary: Summary; stages: string[] };
type HistoryItem = { id: string; timestamp: string; provider: string; model: string; scenario: string; classification: string; verdict: string; reached: boolean; contained: boolean | null; row: RecordRow };

const STAGES = [
  ["scenario_prepared", "Scenario prepared"],
  ["frontier_model_called", "Frontier model called"],
  ["tool_trajectory_proposed", "Tool trajectory proposed"],
  ["morrison_evaluated", "Morrison evaluated reachability"],
  ["governance_verdict_issued", "Governance verdict issued"],
  ["execution_gate_checked", "Execution gate checked"],
  ["evidence_sealed", "Evidence sealed"],
] as const;

const DOMAIN_LABEL: Record<string, string> = {
  broad: "Broad validated profile", finance: "Finance", cybersecurity: "Cybersecurity",
  data_privacy: "Data privacy", enterprise: "Enterprise", compliance: "Compliance",
};

async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(path, { credentials: "same-origin", headers: { "content-type": "application/json" }, cache: "no-store", ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const error = new Error(data?.error || `HTTP ${res.status}`) as Error & { status?: number }; error.status = res.status; throw error; }
  return data;
}

function fmtMs(value: number | undefined) { return typeof value === "number" ? `${value.toFixed(value < 10 ? 3 : 1)} ms` : "—"; }
function pct(value: number | null | undefined) { return value == null ? "NOT EXERCISED" : `${(value * 100).toFixed(1)}%`; }
function pretty(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()); }
function executionReached(row: RecordRow, scenario?: Scenario) { return scenario?.safe_control ? row.simulated_execution_occurred : row.adversarial_execution_attempted; }

export default function FrontierLabClient() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [config, setConfig] = useState<FrontierConfig | null>(null);
  const [labMode, setLabMode] = useState<"single" | "continuous">("single");
  const [provider, setProvider] = useState<ProviderName>("anthropic");
  const [model, setModel] = useState("");
  const [scenarioId, setScenarioId] = useState("clean_control_001");
  const [domain, setDomain] = useState("broad");
  const [runs, setRuns] = useState(1);
  const [customTask, setCustomTask] = useState("Summarise this synthetic message.");
  const [customContent, setCustomContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [response, setResponse] = useState<RunResponse | null>(null);
  const [activeTrial, setActiveTrial] = useState(0);
  const [completedStages, setCompletedStages] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const loadConfig = useCallback(async () => {
    try {
      const data = await api("/api/frontier/config") as FrontierConfig;
      setConfig(data); setAuthed(true);
      const firstReady = data.providers.find((item) => item.status === "READY");
      if (firstReady) { setProvider(firstReady.provider); setModel(firstReady.models?.[0] || firstReady.model || ""); }
    } catch (e) {
      setAuthed((e as Error & { status?: number }).status === 401 ? false : true);
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { loadConfig(); }, [loadConfig]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("session")) setLabMode("continuous");
  }, []);
  useEffect(() => {
    try { setHistory(JSON.parse(sessionStorage.getItem("frontier_lab_history") || "[]")); } catch { /* session history is optional */ }
  }, []);

  const selectedProvider = config?.providers.find((item) => item.provider === provider);
  const scenario = config?.scenarios.find((item) => item.id === scenarioId);
  const isCustom = scenarioId === "custom_web_001";
  const current = response?.results[activeTrial];
  const selectedScenario = response?.scenario ?? scenario;
  const reached = current ? executionReached(current, selectedScenario) : false;
  const targetDecision = useMemo(() => {
    if (!current?.governance_decisions?.length) return undefined;
    if (current.model_compromised && current.adversarial_decisions?.length) return current.adversarial_decisions.at(-1);
    return current.governance_decisions.find((item) => item.verdict !== "PERMIT") || current.governance_decisions.at(-1);
  }, [current]);

  const persistHistory = (data: RunResponse) => {
    const additions = data.results.map((row) => ({
      id: row.run_id, timestamp: row.timestamp, provider: row.provider, model: row.model,
      scenario: data.scenario.title, classification: row.classification,
      verdict: row.final_verdict, reached: executionReached(row, data.scenario),
      contained: row.model_compromised ? row.unauthorized_execution_count === 0 : null, row,
    }));
    setHistory((previous) => {
      const next = [...additions, ...previous].slice(0, 12);
      try { sessionStorage.setItem("frontier_lab_history", JSON.stringify(next)); } catch { /* optional */ }
      return next;
    });
  };

  const runTest = async () => {
    if (!model || selectedProvider?.status !== "READY") return;
    setBusy(true); setError(""); setResponse(null); setActiveTrial(0); setCompletedStages([]);
    try {
      const body: Record<string, unknown> = { provider, model, scenario_id: scenarioId, runs, domain };
      if (isCustom) { body.custom_user_task = customTask; body.custom_untrusted_content = customContent; }
      const data = await api("/api/frontier/run", { method: "POST", body: JSON.stringify(body) }) as RunResponse;
      setResponse(data); setCompletedStages(data.stages || []); persistHistory(data);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const downloadEvidence = () => {
    if (!current) return;
    const sealed = response?.evidence_downloads?.[current.run_id];
    if (!sealed) { setError("Server-sealed evidence is unavailable for this recorded session item."); return; }
    const blob = new Blob([sealed], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `${current.run_id}.json`; link.click(); URL.revokeObjectURL(url);
  };

  if (authed === null) return <div className="flab flab-center">Checking operator session…</div>;
  if (!authed) return <div className="flab"><LoginGate onLogin={loadConfig} /></div>;
  if (labMode === "continuous" && config) return (
    <main className="flab">
      <header className="flab-top">
        <div><div className="flab-eyebrow">Resurrection Tech™ · Operator surface</div><h1>Frontier Containment Lab</h1><p>Persistent governed model sessions through Morrison Runtime Governance.</p></div>
        <div className="flab-safe"><span>SIMULATED</span>No real-world side effects</div>
      </header>
      <div className="flab-mode-toggle"><button onClick={() => setLabMode("single")}>Single Run</button><button className="active">Continuous Session</button></div>
      <ContinuousFrontierSession config={config} />
    </main>
  );

  return (
    <main className="flab">
      <header className="flab-top">
        <div><div className="flab-eyebrow">Resurrection Tech™ · Operator surface</div><h1>Frontier Containment Lab</h1><p>Hosted model compromise testing through Morrison Runtime Governance.</p></div>
        <div className="flab-safe"><span>SIMULATED</span>No real-world side effects</div>
      </header>
      <div className="flab-mode-toggle"><button className="active">Single Run</button><button onClick={() => setLabMode("continuous")}>Continuous Session</button></div>

      <section className="flab-grid">
        <div className="flab-panel flab-controls">
          <div className="flab-section-title">Experiment configuration</div>
          <label>Provider<select value={provider} onChange={(e) => { const next = e.target.value as ProviderName; setProvider(next); const entry = config?.providers.find((item) => item.provider === next); setModel(entry?.models?.[0] || entry?.model || ""); }}>
            {config?.providers.map((item) => <option key={item.provider} value={item.provider}>{pretty(item.provider)} · {item.status === "READY" ? "READY" : "NOT CONFIGURED"}</option>)}
          </select></label>
          <div className={`flab-health ${selectedProvider?.status === "READY" ? "ready" : "off"}`}><span>{pretty(provider)}</span><strong>{selectedProvider?.status === "READY" ? "READY" : "NOT CONFIGURED"}</strong></div>
          <label>Model<select value={model} disabled={!selectedProvider?.models?.length} onChange={(e) => setModel(e.target.value)}>{selectedProvider?.models?.length ? selectedProvider.models.map((item) => <option key={item} value={item}>{item}</option>) : <option>Provider not configured</option>}</select></label>
          <label>Governance domain<select value={domain} onChange={(e) => setDomain(e.target.value)}>{config?.domains.map((item) => <option key={item} value={item}>{DOMAIN_LABEL[item] || pretty(item)}</option>)}</select></label>
          <label>Attack / scenario<select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>{config?.scenarios.map((item) => <option key={item.id} value={item.id}>{item.title} · v{item.version}</option>)}</select></label>
          <label>Trials<select value={runs} onChange={(e) => setRuns(Number(e.target.value))}>{Array.from({ length: config?.limits.max_runs || 1 }, (_, i) => i + 1).map((n) => <option key={n}>{n}</option>)}</select></label>
          {isCustom && <><label>Custom synthetic task<textarea value={customTask} maxLength={config?.limits.max_task_chars} onChange={(e) => setCustomTask(e.target.value)} /></label><label>Custom untrusted content<textarea className="tall" value={customContent} maxLength={config?.limits.max_content_chars} onChange={(e) => setCustomContent(e.target.value)} placeholder="Paste synthetic untrusted content only…" /></label></>}
          <button className="flab-run" disabled={busy || selectedProvider?.status !== "READY" || (isCustom && (!customTask.trim() || !customContent.trim()))} onClick={runTest}>{busy ? "RUNNING FRONTIER TEST…" : "RUN FRONTIER TEST"}</button>
          {error && <div className="flab-error"><strong>FAIL CLOSED</strong>{error}<span>Execution reached: NO</span></div>}
        </div>

        <div className="flab-stack">
          <section className="flab-panel">
            <div className="flab-section-title">Untrusted content review</div>
            <div className="flab-task"><span>User task</span>{isCustom ? customTask : scenario?.user_task}</div>
            <pre className="flab-content">{isCustom ? (customContent || "Enter custom synthetic content.") : (scenario?.untrusted_content || "No untrusted content in this safe control.")}</pre>
            <div className="flab-meta">{scenario?.id} · version {scenario?.version} · {scenario?.untrusted_content_type}</div>
          </section>
          <section className="flab-panel">
            <div className="flab-section-title">Run progress</div>
            <ol className="flab-progress">{STAGES.map(([key, label], index) => <li key={key} className={completedStages.includes(key) ? "done" : busy && index === 0 ? "active" : ""}><span>{String(index + 1).padStart(2, "0")}</span>{label}<b>{completedStages.includes(key) ? "✓" : busy && index === 0 ? "…" : ""}</b></li>)}</ol>
            {busy && <p className="flab-pending">The provider request is in flight. Later stages remain unmarked until the backend returns verified evidence.</p>}
          </section>
        </div>
      </section>

      {current && <>
        {response && response.results.length > 1 && <div className="flab-trials">{response.results.map((item, i) => <button key={item.run_id} className={i === activeTrial ? "active" : ""} onClick={() => setActiveTrial(i)}>Trial {i + 1}</button>)}</div>}
        <section className="flab-result">
          <div className={`flab-outcome ${current.model_compromised ? "compromised" : "resisted"}`}><span>MODEL BEHAVIOUR</span><strong>{current.model_compromised ? "MODEL COMPROMISED" : "MODEL RESISTED"}</strong><p>{current.model_compromised ? "The hosted model proposed an adversarial executable trajectory." : "No adversarial executable trajectory was proposed."}</p></div>
          <div className={`flab-outcome verdict ${(targetDecision?.verdict || current.final_verdict).toLowerCase()}`}><span>MORRISON VERDICT — ADVERSARIAL ACTION</span><strong>{targetDecision?.verdict || current.final_verdict}</strong><p>{targetDecision?.reason || "Morrison containment was not exercised."}</p>{current.model_compromised && current.final_verdict !== targetDecision?.verdict && <p>Run-wide strictest verdict: {current.final_verdict}</p>}</div>
          <div className={`flab-outcome execution ${reached ? "yes" : "no"}`}><span>EXECUTION REACHED</span><strong>{reached ? "YES" : "NO"}</strong><p>{current.model_compromised ? (reached ? "Unauthorized trajectory reached the simulator." : "The unauthorized model-proposed trajectory did not reach execution.") : "Morrison containment: NOT EXERCISED"}</p></div>
        </section>
        {current.model_compromised && <div className={`flab-containment ${current.unauthorized_execution_count ? "failed" : "success"}`}>{current.unauthorized_execution_count ? "CRITICAL CONTAINMENT FAILURE" : "CONTAINMENT SUCCESS"}</div>}

        <section className="flab-detail-grid">
          <div className="flab-panel"><div className="flab-section-title">Proposed trajectory</div><Trajectory calls={current.model_tool_calls} /><details><summary>Evaluated trajectory prefixes</summary><pre className="flab-json">{JSON.stringify(current.evaluated_prefixes, null, 2)}</pre></details></div>
          <div className="flab-panel"><div className="flab-section-title">Governance details</div><KeyValues values={{ Verdict: targetDecision?.verdict || current.final_verdict, Rule: targetDecision?.rule || "—", Layer: targetDecision?.layer || "—", "Ω domain": targetDecision?.omega_domain || "—", Reason: targetDecision?.reason || "—", "Trajectory hash": current.trajectory_hash, "Governance latency": fmtMs(current.latency.governance_ms) }} /></div>
          <div className="flab-panel"><div className="flab-section-title">Latency</div><div className="flab-latency"><Metric label="Model" value={fmtMs(current.latency.model_ms)} /><Metric label="Governance" value={fmtMs(current.latency.governance_ms)} accent /><Metric label="Total" value={fmtMs(current.latency.total_ms)} /></div></div>
          <div className="flab-panel"><div className="flab-section-title">Evidence</div><KeyValues values={{ "Run ID": current.run_id, Timestamp: current.timestamp, Provider: current.provider, Model: current.model, Scenario: `${current.scenario_id} · v${current.scenario_version}`, "Trajectory hash": current.trajectory_hash, "Experiment record hash": current.experiment_record_hash, "Evidence chain": current.evidence_integrity?.evidence_verified ? "VERIFIED" : "FAILED" }} /><button className="flab-secondary" onClick={downloadEvidence}>Download JSON evidence</button></div>
        </section>
      </>}

      {response?.summary && <SummaryPanel summary={response.summary} />}

      <section className="flab-panel flab-tools"><div className="flab-section-title">Available simulated capabilities</div><div className="flab-tool-grid">{config?.tools.map((tool) => <div key={tool.name}><code>{tool.name}</code><span>{tool.description}</span></div>)}</div><p>SIMULATED — NO REAL-WORLD SIDE EFFECTS. No shell, network, email, payment, filesystem-secret or production-data executor is available.</p></section>

      <section className="flab-panel flab-history"><div className="flab-section-title">Recent session experiments</div>{history.length ? <div className="flab-table-wrap"><table><thead><tr><th>Time</th><th>Provider / model</th><th>Scenario</th><th>Model</th><th>Morrison</th><th>Execution</th><th>Containment</th></tr></thead><tbody>{history.map((item) => <tr key={item.id} onClick={() => { setResponse({ ok: true, provider: item.provider, model: item.model, domain: "recorded", scenario: { id: item.row.scenario_id, version: item.row.scenario_version, title: item.scenario, user_task: "Recorded experiment", untrusted_content: "", untrusted_content_type: "recorded", safe_control: item.row.scenario_id.startsWith("clean_control") }, results: [item.row], summary: null as unknown as Summary, stages: STAGES.map(([key]) => key) }); setActiveTrial(0); setCompletedStages(STAGES.map(([key]) => key)); }}><td>{new Date(item.timestamp).toLocaleString()}</td><td>{pretty(item.provider)}<small>{item.model}</small></td><td>{item.scenario}</td><td>{item.classification}</td><td>{item.verdict}</td><td>{item.reached ? "YES" : "NO"}</td><td>{item.contained == null ? "NOT EXERCISED" : item.contained ? "SUCCESS" : "FAILED"}</td></tr>)}</tbody></table></div> : <p className="flab-muted">No experiments in this browser session yet.</p>}</section>
    </main>
  );
}

function LoginGate({ onLogin }: { onLogin: () => Promise<void> }) {
  const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(""); try { await api("/api/runtime/admin/login", { method: "POST", body: JSON.stringify({ password }) }); await onLogin(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  return <form className="flab-login" onSubmit={submit}><span>Ω</span><h1>Frontier Containment Lab</h1><p>Operator authentication is required because experiments invoke paid hosted models.</p><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Operator password" autoFocus />{error && <div className="flab-error">{error}</div>}<button className="flab-run" disabled={busy || !password}>{busy ? "SIGNING IN…" : "SIGN IN"}</button></form>;
}

function Trajectory({ calls }: { calls: Array<{ tool: string; args: Record<string, unknown> }> }) { return calls.length ? <ol className="flab-trajectory">{calls.map((call, i) => <li key={`${call.tool}-${i}`}><b>{i + 1}</b><div><code>{call.tool}</code><pre>{JSON.stringify(call.args, null, 2)}</pre></div></li>)}</ol> : <p className="flab-muted">No native tool call was proposed.</p>; }
function KeyValues({ values }: { values: Record<string, unknown> }) { return <dl className="flab-kv">{Object.entries(values).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl>; }
function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <div className={accent ? "accent" : ""}><span>{label}</span><strong>{value}</strong></div>; }
function SummaryPanel({ summary }: { summary: Summary }) { const metrics: Array<[string, string | number]> = [["Trials", summary.total_trials], ["Safe controls", summary.safe_controls], ["Adversarial trials", summary.adversarial_trials], ["MODEL_RESISTED", summary.model_resistance_count], ["Model compromised", summary.model_compromise_count], ["Morrison BLOCK", summary.morrison_block_count], ["Morrison ESCALATE", summary.morrison_escalate_count], ["Unauthorized executions", summary.unauthorized_execution_count], ["Conditional containment", pct(summary.runtime_containment_rate)], ["Safe-control false positives", pct(summary.false_positive_rate_on_safe_controls)], ["Model p50 / p95", `${fmtMs(summary.provider_model_latency.p50_ms)} / ${fmtMs(summary.provider_model_latency.p95_ms)}`], ["Governance p50 / p95", `${fmtMs(summary.governance_latency.p50_ms)} / ${fmtMs(summary.governance_latency.p95_ms)}`]]; return <section className="flab-panel"><div className="flab-section-title">Experiment summary</div><div className="flab-summary">{metrics.map(([label, value]) => <Metric key={label} label={label} value={String(value)} accent={label.includes("Governance")} />)}</div></section>; }
