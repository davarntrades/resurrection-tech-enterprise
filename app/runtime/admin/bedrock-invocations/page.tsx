"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

const TERMINAL = new Set(["completed", "blocked", "rejected", "failed", "expired", "cancelled"]);
const steps = [
  ["preparing_request", "Preparing request"],
  ["creating_proposal", "Creating proposal"],
  ["runtime_governance_evaluating", "Runtime Governance evaluating"],
  ["decision_received", "Decision received"],
  ["awaiting_approval", "Awaiting approval"],
  ["invoking_bedrock", "Invoking Amazon Bedrock"],
  ["recording_evidence", "Recording evidence"],
  ["complete", "Complete"],
];

function badgeClass(value: string) {
  const v = String(value || "").toLowerCase();
  if (v.includes("completed") || v.includes("permit") || v.includes("executed")) return "ok";
  if (v.includes("block") || v.includes("reject") || v.includes("failed")) return "bad";
  if (v.includes("escalat") || v.includes("pending") || v.includes("approval")) return "warn";
  return "neutral";
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
      try {
        await load(batchId);
      } catch (e: any) {
        if (!cancelled && e.name !== "AbortError") setError(e.message);
      }
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
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const idempotencyKey = `console-${crypto.randomUUID()}`;
      const response = await fetch("/api/runtime/admin/bedrock-invocations", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({
          org_id: orgId,
          environment_id: environmentId,
          connector_id: connectorId,
          model_id: modelId,
          prompt,
          system_instruction: systemInstruction || undefined,
          max_output_tokens: maxOutputTokens,
          batch_mode: batchMode,
          request_count: batchMode === "single" ? 1 : requestCount,
          concurrency: batchMode === "concurrent" ? concurrency : 1,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Invocation request rejected");
      setBatchId(payload.batch_id);
      setRuns(payload.runs || []);
      setAggregate(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setPrompt("");
    setSystemInstruction("");
    setBatchId("");
    setRuns([]);
    setAggregate(null);
    setError("");
  }

  const current = runs[0] || null;

  return (
    <main className="console-shell">
      <header className="console-header">
        <div><p className="eyebrow">GuardianOS · Integration Gateway</p><h1>Governed Amazon Bedrock Invocation</h1><p>Every prompt passes through proposal creation, Runtime Governance, approval and immutable evidence before AWS execution.</p></div>
        <a href="/runtime/admin/integration-gateway" className="back-link">Back to Integration Gateway</a>
      </header>

      {!orgId && <section className="notice">Open this console with <code>?org_id=ORG_ID</code>. An optional <code>&amp;environment_id=ENV_ID</code> narrows eligible connectors.</section>}
      {error && <section className="error-box">{error}</section>}

      <div className="console-grid">
        <form className="panel" onSubmit={submit}>
          <div className="panel-title"><div><span>Request</span><h2>Invocation controls</h2></div><span className="badge neutral">Server governed</span></div>
          <label>Organisation<input value={orgId} onChange={(e) => setOrgId(e.target.value)} required /></label>
          <label>Healthy connector<select value={connectorId} onChange={(e) => setConnectorId(e.target.value)} required><option value="">Select connector</option>{connectors.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.region} · {c.environment_id}</option>)}</select></label>
          <label>Configured model<select value={modelId} onChange={(e) => setModelId(e.target.value)} required><option value="">Select model</option>{(selected?.models || []).map((m: string) => <option key={m} value={m}>{m}</option>)}</select></label>
          <label>System instruction <span className="optional">optional</span><textarea rows={3} value={systemInstruction} onChange={(e) => setSystemInstruction(e.target.value)} /></label>
          <label>Prompt<textarea rows={9} value={prompt} onChange={(e) => setPrompt(e.target.value)} required placeholder="Enter a governed model request" /></label>
          <label>Maximum output tokens<input type="number" min={1} max={4096} value={maxOutputTokens} onChange={(e) => setMaxOutputTokens(Number(e.target.value))} /></label>

          <div className="stress-box">
            <div><strong>Controlled test mode</strong><p>Every request receives an independent proposal, decision and evidence record.</p></div>
            <label>Mode<select value={batchMode} onChange={(e) => setBatchMode(e.target.value)}><option value="single">Single request</option><option value="sequential">Sequential batch</option><option value="concurrent">Concurrent batch</option></select></label>
            {batchMode !== "single" && <label>Requests<input type="number" min={1} max={limits.max_requests} value={requestCount} onChange={(e) => setRequestCount(Number(e.target.value))} /></label>}
            {batchMode === "concurrent" && <label>Concurrency<input type="number" min={1} max={limits.max_concurrency} value={concurrency} onChange={(e) => setConcurrency(Number(e.target.value))} /></label>}
            <small>Hard limits: {limits.max_requests} requests, {limits.max_concurrency} concurrent.</small>
          </div>

          <div className="actions"><button type="submit" disabled={busy || !connectorId || !modelId || !prompt.trim()}>{busy ? "Preparing…" : "Run"}</button><button type="button" className="secondary" onClick={clear}>Clear</button></div>
        </form>

        <section className="panel lifecycle-panel">
          <div className="panel-title"><div><span>Live state</span><h2>Governance lifecycle</h2></div>{current && <span className={`badge ${badgeClass(current.status)}`}>{current.status.replaceAll("_", " ")}</span>}</div>
          <div className="timeline">
            {steps.map(([key, label]) => {
              const active = current?.lifecycle_state === key;
              const complete = current?.lifecycle_state === "complete" || steps.findIndex((s) => s[0] === current?.lifecycle_state) > steps.findIndex((s) => s[0] === key);
              return <div key={key} className={`timeline-row ${active ? "active" : ""} ${complete ? "done" : ""}`}><span className="dot" /><div><strong>{label}</strong>{active && <small>Live</small>}</div></div>;
            })}
          </div>
          {!current && <p className="empty">Submit a request to begin the governed lifecycle.</p>}

          {current && <div className="result-grid">
            <Metric label="Decision" value={current.governance_decision || current.status} badge />
            <Metric label="Proposal" value={current.proposal_id} />
            <Metric label="Approval" value={current.approval_status} badge />
            <Metric label="Evidence" value={current.evidence_id} />
            <Metric label="Connector" value={`${current.connector_name || current.connector_id} · ${current.connector_health}`} />
            <Metric label="Model" value={current.model_id} />
            <Metric label="Organisation" value={current.org_id} />
            <Metric label="Environment" value={current.environment_id} />
            <Metric label="Total latency" value={current.total_latency_ms == null ? null : `${current.total_latency_ms} ms`} />
            <Metric label="Governance latency" value={current.governance_latency_ms == null ? null : `${current.governance_latency_ms} ms`} />
            <Metric label="Provider latency" value={current.provider_latency_ms == null ? null : `${current.provider_latency_ms} ms`} />
            <Metric label="AWS calls" value={String(current.provider_invocation_count ?? 0)} />
          </div>}

          {current?.response_content != null && <div className="response-box"><span>Model response</span><pre>{typeof current.response_content === "string" ? current.response_content : JSON.stringify(current.response_content, null, 2)}</pre></div>}
          {current?.safe_failure_reason && <div className="failure-box"><strong>{current.aws_called ? "Provider failure" : "AWS was not called"}</strong><p>{current.safe_failure_reason}</p></div>}

          {aggregate && <div className="aggregate"><h3>Batch results</h3><div className="aggregate-grid">{Object.entries(aggregate).map(([key, value]) => <Metric key={key} label={key.replaceAll("_", " ")} value={value == null ? "—" : String(value)} />)}</div></div>}
        </section>
      </div>

      <section className="panel recent"><div className="panel-title"><div><span>Audit view</span><h2>Recent governed runs</h2></div></div><div className="table-wrap"><table><thead><tr><th>Time</th><th>Status</th><th>Model</th><th>Proposal</th><th>Evidence</th><th>AWS calls</th><th>Latency</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id}><td>{new Date(run.created_at).toLocaleString()}</td><td><span className={`badge ${badgeClass(run.status)}`}>{run.status}</span></td><td>{run.model_id}</td><td>{run.proposal_id || "—"}</td><td>{run.evidence_id || "—"}</td><td>{run.provider_invocation_count || 0}</td><td>{run.total_latency_ms == null ? "—" : `${run.total_latency_ms} ms`}</td></tr>)}</tbody></table>{!runs.length && <p className="empty">No governed runs yet.</p>}</div></section>

      <style jsx>{`
        :global(body){background:#080a0f;color:#f5f2e9}.console-shell{max-width:1500px;margin:0 auto;padding:36px 24px 72px;font-family:Inter,ui-sans-serif,system-ui}.console-header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:28px}.console-header h1{font-size:clamp(28px,4vw,52px);line-height:1.02;margin:6px 0 12px;max-width:900px}.console-header p{color:#a9adb8;max-width:820px}.eyebrow,.panel-title span,.response-box>span{color:#c8a95b;text-transform:uppercase;letter-spacing:.14em;font-size:12px;font-weight:700}.back-link{color:#d7bd79;border:1px solid #5a4b2b;padding:10px 14px;border-radius:10px;text-decoration:none}.console-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:20px}.panel{background:linear-gradient(180deg,#12151d,#0d1016);border:1px solid #282d37;border-radius:18px;padding:22px;box-shadow:0 22px 70px rgba(0,0,0,.26)}.panel-title{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:18px}.panel-title h2{margin:4px 0 0;font-size:22px}label{display:grid;gap:8px;margin:14px 0;color:#d9dce3;font-size:13px;font-weight:650}input,select,textarea{width:100%;box-sizing:border-box;background:#090c11;border:1px solid #303641;border-radius:10px;padding:12px;color:#fff;font:inherit}textarea{resize:vertical}.optional{color:#747b88;text-transform:none;letter-spacing:0;font-weight:500}.actions{display:flex;gap:10px;margin-top:18px}button{border:0;border-radius:10px;padding:12px 20px;background:#c8a95b;color:#100e08;font-weight:800;cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}.secondary{background:transparent;color:#ddd;border:1px solid #39404b}.stress-box{border:1px solid #343a45;background:#0b0e14;padding:16px;border-radius:14px;margin-top:16px}.stress-box p,.stress-box small{color:#8f96a3;margin:5px 0}.badge{display:inline-flex;align-items:center;border-radius:999px;padding:5px 9px;font-size:11px!important;letter-spacing:.04em!important;text-transform:uppercase!important}.badge.ok{background:#173d2c;color:#8ce0b5}.badge.bad{background:#451d23;color:#ff9aa7}.badge.warn{background:#463815;color:#f0d27a}.badge.neutral{background:#262c36;color:#c9d0dc}.timeline{display:grid;gap:6px;margin:12px 0 22px}.timeline-row{display:flex;gap:12px;align-items:center;padding:10px 12px;border-radius:10px;color:#666e7c}.timeline-row .dot{width:10px;height:10px;border-radius:50%;background:#303744}.timeline-row.active{background:#191d25;color:#fff}.timeline-row.active .dot{background:#d7bd79;box-shadow:0 0 0 6px rgba(215,189,121,.12)}.timeline-row.done{color:#aab0bb}.timeline-row.done .dot{background:#4eb47b}.timeline-row div{display:flex;justify-content:space-between;width:100%}.timeline-row small{color:#d7bd79}.result-grid,.aggregate-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.metric{background:#0a0d12;border:1px solid #242a34;border-radius:10px;padding:12px;min-width:0}.metric span{display:block;color:#7f8794;font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}.metric strong{display:block;overflow-wrap:anywhere;font-size:13px}.response-box,.failure-box{margin-top:16px;border-radius:12px;padding:16px;background:#090c11;border:1px solid #2b313b}.response-box pre{white-space:pre-wrap;word-break:break-word;margin:10px 0 0;color:#e8e3d8}.failure-box{border-color:#5d2830}.failure-box strong{color:#ff9aa7}.failure-box p{color:#c8cbd2}.aggregate{margin-top:18px}.aggregate h3{margin-bottom:10px}.recent{margin-top:20px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:12px;border-bottom:1px solid #262c35;white-space:nowrap}th{color:#858c98;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.empty,.notice{color:#8c94a1}.notice,.error-box{padding:14px 16px;border-radius:12px;margin-bottom:18px;background:#121720;border:1px solid #303846}.error-box{border-color:#69313a;color:#ffb2bc}@media(max-width:980px){.console-grid{grid-template-columns:1fr}.console-header{display:block}.back-link{display:inline-block;margin-top:16px}}@media(max-width:600px){.result-grid,.aggregate-grid{grid-template-columns:1fr}.console-shell{padding:24px 14px 54px}.panel{padding:16px}}
      `}</style>
    </main>
  );
}

function Metric({ label, value, badge = false }: { label: string; value: any; badge?: boolean }) {
  return <div className="metric"><span>{label}</span>{badge ? <b className={`badge ${badgeClass(String(value || ""))}`}>{value || "—"}</b> : <strong>{value || "—"}</strong>}</div>;
}
