"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

const TERMINAL = new Set(["completed", "blocked", "rejected", "failed", "expired", "cancelled"]);
const steps = [
  ["preparing_request", "Preparing request"], ["creating_proposal", "Creating proposal"],
  ["runtime_governance_evaluating", "Runtime Governance evaluating"], ["decision_received", "Decision received"],
  ["awaiting_approval", "Awaiting approval"], ["invoking_bedrock", "Invoking Amazon Bedrock"],
  ["recording_evidence", "Recording evidence"], ["complete", "Complete"],
];

function badgeClass(value: string) {
  const v = String(value || "").toLowerCase();
  if (v.includes("completed") || v.includes("permit") || v.includes("executed")) return "ok";
  if (v.includes("block") || v.includes("reject") || v.includes("failed")) return "bad";
  if (v.includes("escalat") || v.includes("pending") || v.includes("approval")) return "warn";
  return "neutral";
}

function latency(value: unknown) {
  return value == null || value === "" ? "Not recorded" : `${Number(value)} ms`;
}

export default function BedrockInvocationConsolePage() {
  const [orgId, setOrgId] = useState("");
  const [environmentId, setEnvironmentId] = useState("");
  const [connectors, setConnectors] = useState<any[]>([]);
  const [connectorId, setConnectorId] = useState("");
  const [modelId, setModelId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [systemInstruction, setSystemInstruction] = useState("");
  const [maxOutputTokens, setMaxOutputTokens] = useState(512);
  const [batchMode, setBatchMode] = useState("single");
  const [requestCount, setRequestCount] = useState(1);
  const [concurrency, setConcurrency] = useState(1);
  const [batchId, setBatchId] = useState("");
  const [runs, setRuns] = useState<any[]>([]);
  const [aggregate, setAggregate] = useState<any>(null);
  const [limits, setLimits] = useState({ max_requests: 10, max_concurrency: 3 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setOrgId(query.get("org_id") || "");
    setEnvironmentId(query.get("environment_id") || "");
  }, []);

  const selected = useMemo(() => connectors.find((c) => c.id === connectorId), [connectors, connectorId]);
  const isActive = runs.some((run) => !TERMINAL.has(run.status));

  async function load(targetBatch = batchId) {
    if (!orgId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const params = new URLSearchParams({ org_id: orgId });
    if (environmentId) params.set("environment_id", environmentId);
    if (targetBatch) params.set("batch_id", targetBatch);
    const response = await fetch(`/api/runtime/admin/bedrock-invocations?${params}`, { cache: "no-store", signal: controller.signal });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load invocation state");
    setConnectors(payload.connectors || []);
    setRuns(payload.runs || []);
    setAggregate(payload.aggregate || null);
    setLimits(payload.limits || limits);
    if (!connectorId && payload.connectors?.length) {
      setConnectorId(payload.connectors[0].id);
      setEnvironmentId(payload.connectors[0].environment_id);
      setModelId(payload.connectors[0].models?.[0] || "");
    }
  }

  useEffect(() => {
    if (!orgId) return;
    load().catch((e) => setError(e.message));
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  useEffect(() => {
    if (!batchId || !isActive) return;
    let cancelled = false;
    const poll = async () => {
      try { await load(batchId); }
      catch (e: any) { if (!cancelled && e.name !== "AbortError") setError(e.message); }
    };
    const id = window.setInterval(poll, 1500);
    poll();
    return () => { cancelled = true; window.clearInterval(id); abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, isActive]);

  useEffect(() => {
    if (!selected) return;
    setEnvironmentId(selected.environment_id);
    if (!selected.models?.includes(modelId)) setModelId(selected.models?.[0] || "");
  }, [selected, modelId]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const response = await fetch("/api/runtime/admin/bedrock-invocations", {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": `console-${crypto.randomUUID()}` },
        body: JSON.stringify({ org_id: orgId, environment_id: environmentId, connector_id: connectorId, model_id: modelId, prompt, system_instruction: systemInstruction || undefined, max_output_tokens: maxOutputTokens, batch_mode: batchMode, request_count: batchMode === "single" ? 1 : requestCount, concurrency: batchMode === "concurrent" ? concurrency : 1 }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Invocation request rejected");
      setBatchId(payload.batch_id); setRuns(payload.runs || []); setAggregate(null);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }

  const current = runs[0] || null;
  return (
    <main className="console-shell">
      <header className="console-header"><div><p className="eyebrow">GuardianOS · Integration Gateway</p><h1>Governed Amazon Bedrock Invocation</h1><p>Every prompt passes through proposal creation, Runtime Governance, approval and immutable evidence before AWS execution.</p></div><a href="/runtime/admin/integration-gateway" className="back-link">Back to Integration Gateway</a></header>
      {!orgId && <section className="notice">Open this console with <code>?org_id=ORG_ID</code>.</section>}
      {error && <section className="error-box">{error}</section>}
      <div className="console-grid">
        <form className="panel" onSubmit={submit}>
          <div className="panel-title"><div><span>Request</span><h2>Invocation controls</h2></div><span className="badge neutral">Server governed</span></div>
          <label>Organisation<input value={orgId} onChange={(e) => setOrgId(e.target.value)} required /></label>
          <label>Healthy connector<select value={connectorId} onChange={(e) => setConnectorId(e.target.value)} required><option value="">Select connector</option>{connectors.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.region} · {c.environment_id}</option>)}</select></label>
          <label>Configured model<select value={modelId} onChange={(e) => setModelId(e.target.value)} required><option value="">Select model</option>{(selected?.models || []).map((m: string) => <option key={m} value={m}>{m}</option>)}</select></label>
          <label>System instruction <span className="optional">optional</span><textarea rows={3} value={systemInstruction} onChange={(e) => setSystemInstruction(e.target.value)} /></label>
          <label>Prompt<textarea rows={9} value={prompt} onChange={(e) => setPrompt(e.target.value)} required /></label>
          <label>Maximum output tokens<input type="number" min={1} max={4096} value={maxOutputTokens} onChange={(e) => setMaxOutputTokens(Number(e.target.value))} /></label>
          <div className="stress-box"><strong>Controlled test mode</strong><label>Mode<select value={batchMode} onChange={(e) => setBatchMode(e.target.value)}><option value="single">Single request</option><option value="sequential">Sequential batch</option><option value="concurrent">Concurrent batch</option></select></label>{batchMode !== "single" && <label>Requests<input type="number" min={1} max={limits.max_requests} value={requestCount} onChange={(e) => setRequestCount(Number(e.target.value))} /></label>}{batchMode === "concurrent" && <label>Concurrency<input type="number" min={1} max={limits.max_concurrency} value={concurrency} onChange={(e) => setConcurrency(Number(e.target.value))} /></label>}</div>
          <div className="actions"><button type="submit" disabled={busy || !connectorId || !modelId || !prompt.trim()}>{busy ? "Preparing…" : "Run"}</button><button type="button" className="secondary" onClick={() => { setPrompt(""); setSystemInstruction(""); setBatchId(""); setRuns([]); setAggregate(null); setError(""); }}>Clear</button></div>
        </form>
        <section className="panel lifecycle-panel">
          <div className="panel-title"><div><span>Live state</span><h2>Governance lifecycle</h2></div>{current && <span className={`badge ${badgeClass(current.status)}`}>{current.status.replaceAll("_", " ")}</span>}</div>
          <div className="timeline">{steps.map(([key, label]) => { const active = current?.lifecycle_state === key; const complete = current?.lifecycle_state === "complete" || steps.findIndex((s) => s[0] === current?.lifecycle_state) > steps.findIndex((s) => s[0] === key); return <div key={key} className={`timeline-row ${active ? "active" : ""} ${complete ? "done" : ""}`}><span className="dot" /><strong>{label}</strong></div>; })}</div>
          {current && <div className="result-grid">
            <Metric label="Decision" value={current.governance_decision || current.status} badge /><Metric label="Proposal" value={current.proposal_id} /><Metric label="Approval" value={current.approval_status} badge /><Metric label="Evidence" value={current.evidence_id} />
            <Metric label="Connector" value={`${current.connector_name || current.connector_id} · ${current.connector_health}`} /><Metric label="Model" value={current.model_id} /><Metric label="Organisation" value={current.org_id} /><Metric label="Environment" value={current.environment_id} />
            <Metric label="Governance evaluation latency" value={latency(current.governance_evaluation_latency_ms ?? current.governance_latency_ms)} /><Metric label="Approval wait latency" value={latency(current.approval_wait_latency_ms)} /><Metric label="Provider latency" value={latency(current.provider_latency_ms)} /><Metric label="Total latency" value={latency(current.total_latency_ms)} /><Metric label="AWS calls" value={String(current.provider_invocation_count ?? 0)} />
          </div>}
          {current?.response_content != null && <div className="response-box"><span>Model response</span><pre>{typeof current.response_content === "string" ? current.response_content : JSON.stringify(current.response_content, null, 2)}</pre></div>}
          {current?.safe_failure_reason && <div className="failure-box"><strong>{current.aws_called ? "Provider failure" : "AWS was not called"}</strong><p>{current.safe_failure_reason}</p></div>}
          {aggregate && <div className="aggregate"><h3>Batch results</h3><div className="aggregate-grid">{Object.entries(aggregate).map(([key, value]) => <Metric key={key} label={key.replaceAll("_", " ")} value={value == null ? "Not recorded" : String(value)} />)}</div></div>}
        </section>
      </div>
      <section className="panel recent"><div className="panel-title"><div><span>Audit view</span><h2>Recent governed runs</h2></div></div><div className="table-wrap"><table><thead><tr><th>Time</th><th>Status</th><th>Model</th><th>AWS calls</th><th>Governance</th><th>Approval wait</th><th>Provider</th><th>Total</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id}><td>{new Date(run.created_at).toLocaleString()}</td><td><span className={`badge ${badgeClass(run.status)}`}>{run.status}</span></td><td>{run.model_id}</td><td>{run.provider_invocation_count ?? 0}</td><td>{latency(run.governance_evaluation_latency_ms ?? run.governance_latency_ms)}</td><td>{latency(run.approval_wait_latency_ms)}</td><td>{latency(run.provider_latency_ms)}</td><td>{latency(run.total_latency_ms)}</td></tr>)}</tbody></table>{!runs.length && <p className="empty">No governed runs yet.</p>}</div></section>
      <style jsx>{`
        :global(body){background:#080a0f;color:#f5f2e9}.console-shell{max-width:1500px;margin:auto;padding:36px 24px 72px;font-family:Inter,system-ui}.console-header,.panel-title,.actions{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.console-header{margin-bottom:28px}.console-header h1{font-size:clamp(28px,4vw,52px);margin:6px 0}.console-header p,.empty{color:#a9adb8}.eyebrow,.panel-title span,.response-box>span{color:#c8a95b;text-transform:uppercase;letter-spacing:.12em;font-size:12px;font-weight:700}.back-link{color:#d7bd79;border:1px solid #5a4b2b;padding:10px 14px;border-radius:10px;text-decoration:none}.console-grid{display:grid;grid-template-columns:1fr 1.15fr;gap:20px}.panel{background:#10141b;border:1px solid #282d37;border-radius:18px;padding:22px;margin-bottom:20px}.panel-title h2{margin:4px 0}label{display:grid;gap:8px;margin:14px 0;font-size:13px;font-weight:650}input,select,textarea{width:100%;box-sizing:border-box;background:#090c11;border:1px solid #303641;border-radius:10px;padding:12px;color:#fff}button{border:0;border-radius:10px;padding:12px 20px;background:#c8a95b;color:#100e08;font-weight:800}.secondary{background:transparent;color:#ddd;border:1px solid #39404b}.stress-box,.notice,.error-box,.response-box,.failure-box{border:1px solid #343a45;border-radius:12px;padding:14px;margin:14px 0}.error-box,.failure-box{border-color:#7c3434}.timeline-row{display:flex;gap:10px;padding:7px;color:#727986}.timeline-row.done,.timeline-row.active{color:#f5f2e9}.dot{width:9px;height:9px;border-radius:50%;background:#444;margin-top:5px}.done .dot,.active .dot{background:#c8a95b}.result-grid,.aggregate-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:18px}.metric{background:#0a0d12;border:1px solid #292f39;border-radius:10px;padding:12px;min-width:0}.metric span{display:block;color:#858c99;font-size:11px;text-transform:uppercase}.metric strong{display:block;margin-top:6px;overflow-wrap:anywhere}.badge{display:inline-flex;padding:5px 8px;border-radius:999px;background:#252a33}.ok{color:#7be0a1}.bad{color:#ff8d8d}.warn{color:#f0cb72}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:1050px}th,td{text-align:left;padding:11px;border-bottom:1px solid #282d37;font-size:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:900px){.console-grid{grid-template-columns:1fr}.console-header{display:block}.back-link{display:inline-block;margin-top:14px}.result-grid,.aggregate-grid{grid-template-columns:1fr}}
      `}</style>
    </main>
  );
}

function Metric({ label, value, badge = false }: { label: string; value: any; badge?: boolean }) {
  const display = value == null || value === "" ? "Not recorded" : value;
  return <div className="metric"><span>{label}</span>{badge ? <b className={`badge ${badgeClass(String(display))}`}>{display}</b> : <strong>{display}</strong>}</div>;
}
