"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const TERMINAL = new Set(["completed", "blocked", "rejected", "failed", "expired", "cancelled"]);
const lifecycle = [
  ["preparing_request", "Preparing request"],
  ["creating_proposal", "Creating proposal"],
  ["runtime_governance_evaluating", "Runtime Governance evaluating"],
  ["decision_received", "Decision received"],
  ["awaiting_approval", "Approval status"],
  ["invoking_bedrock", "Invoking Amazon Bedrock"],
  ["recording_evidence", "Recording evidence"],
  ["complete", "Completed"],
];

const latency = (value: unknown) => value == null || value === "" ? "Not recorded" : `${Number(value)} ms`;

export default function CustomerSupportWorkflowPage() {
  const [orgId, setOrgId] = useState("");
  const [environmentId, setEnvironmentId] = useState("");
  const [connectors, setConnectors] = useState<any[]>([]);
  const [connectorId, setConnectorId] = useState("");
  const [modelId, setModelId] = useState("");
  const [form, setForm] = useState({ customer_name: "", customer_email: "", organisation: "", request_category: "technical", priority: "normal", message: "" });
  const [current, setCurrent] = useState<any>(null);
  const [executions, setExecutions] = useState<any[]>([]);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setOrgId(params.get("org_id") || "");
    setEnvironmentId(params.get("environment_id") || "");
  }, []);

  async function load(workflowRunId = "") {
    if (!orgId) return;
    const query = new URLSearchParams({ org_id: orgId });
    if (environmentId) query.set("environment_id", environmentId);
    if (workflowRunId) query.set("workflow_run_id", workflowRunId);
    const response = await fetch(`/api/runtime/admin/customer-support-workflow?${query}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Workflow state unavailable");
    setConnectors(payload.connectors || []);
    setExecutions(payload.executions || []);
    setEvidence(payload.evidence || []);
    setDashboard(payload.dashboard || {});
    if (payload.current) setCurrent(payload.current);
  }

  useEffect(() => { load().catch((e) => setError(e.message)); }, [orgId, environmentId]);

  useEffect(() => {
    if (!current || TERMINAL.has(current.status)) return;
    const timer = window.setInterval(() => load(current.id).catch((e) => setError(e.message)), 1200);
    return () => window.clearInterval(timer);
  }, [current?.id, current?.status, orgId, environmentId]);

  const selected = useMemo(() => connectors.find((item) => item.id === connectorId), [connectors, connectorId]);
  useEffect(() => { if (selected && !selected.models.includes(modelId)) setModelId(selected.models[0] || ""); }, [selected, modelId]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/runtime/admin/customer-support-workflow", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": `customer-support-${crypto.randomUUID()}` },
        body: JSON.stringify({ ...form, org_id: orgId, environment_id: environmentId, connector_id: connectorId, model_id: modelId, source_type: "form" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Workflow request rejected");
      setCurrent(payload);
      await load(payload.id);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }

  const stepIndex = lifecycle.findIndex(([key]) => key === current?.lifecycle_state);

  return <main className="shell">
    <header><div><p className="eyebrow">GuardianOS · Governed Enterprise Workflow</p><h1>Customer Support Assistant</h1><p>Structured customer requests become canonical GuardianOS actions before proposal creation, Runtime Governance and controlled Amazon Bedrock execution.</p></div><a href="/runtime/admin/integration-gateway">Integration Gateway</a></header>
    {!orgId && <div className="notice">Open with <code>?org_id=ORG_ID&amp;environment_id=ENV_ID</code>.</div>}
    {error && <div className="error">{error}</div>}

    <section className="metrics">
      <Metric label="Requests today" value={dashboard.requests_today ?? 0} />
      <Metric label="Completed" value={dashboard.completed ?? 0} />
      <Metric label="Blocked" value={dashboard.blocked ?? 0} />
      <Metric label="Escalated" value={dashboard.escalated ?? 0} />
      <Metric label="Average total latency" value={latency(dashboard.average_total_latency_ms)} />
      <Metric label="Average governance latency" value={latency(dashboard.average_governance_latency_ms)} />
      <Metric label="Average provider latency" value={latency(dashboard.average_provider_latency_ms)} />
    </section>

    <div className="grid">
      <form className="panel" onSubmit={submit}>
        <div className="title"><div><span>Incoming request</span><h2>Customer request form</h2></div><b>Canonicalised server-side</b></div>
        <label>Customer name<input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} required /></label>
        <label>Customer email<input type="email" value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} required /></label>
        <label>Organisation<input value={form.organisation} onChange={(e) => setForm({ ...form, organisation: e.target.value })} required /></label>
        <label>Request category<select value={form.request_category} onChange={(e) => setForm({ ...form, request_category: e.target.value })}><option value="account">Account</option><option value="billing">Billing</option><option value="technical">Technical</option><option value="product">Product</option><option value="complaint">Complaint</option><option value="general">General</option></select></label>
        <label>Priority<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
        <label>Message<textarea rows={8} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required /></label>
        <label>Healthy Amazon Bedrock connector<select value={connectorId} onChange={(e) => setConnectorId(e.target.value)} required><option value="">Select connector</option>{connectors.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.region} · {item.environment_id}</option>)}</select></label>
        <label>Configured model<select value={modelId} onChange={(e) => setModelId(e.target.value)} required><option value="">Select model</option>{(selected?.models || []).map((model: string) => <option key={model} value={model}>{model}</option>)}</select></label>
        <button disabled={busy || !orgId || !environmentId || !connectorId || !modelId}>{busy ? "Creating governed workflow…" : "Run governed workflow"}</button>
      </form>

      <section className="panel">
        <div className="title"><div><span>Live state</span><h2>Governance lifecycle</h2></div>{current && <b>{String(current.status).replaceAll("_", " ")}</b>}</div>
        <div className="timeline">{lifecycle.map(([key, label], index) => <div key={key} className={`${index < stepIndex || current?.lifecycle_state === "complete" ? "done" : ""} ${index === stepIndex ? "active" : ""}`}><i /> <strong>{label}</strong>{key === "awaiting_approval" && current?.approval_status ? <small>{current.approval_status}</small> : null}</div>)}</div>
        {current && <div className="details">
          <Metric label="Proposal ID" value={current.proposal_id || "Not recorded"} />
          <Metric label="Evidence ID" value={current.evidence_id || "Not recorded"} />
          <Metric label="Decision" value={current.governance_decision || current.status} />
          <Metric label="Approval" value={current.approval_status || "Not recorded"} />
          <Metric label="Connector" value={current.connector_name || current.connector_id} />
          <Metric label="Provider" value={current.provider} />
          <Metric label="Model" value={current.model_id} />
          <Metric label="Organisation" value={current.org_id} />
          <Metric label="Environment" value={current.environment_id} />
          <Metric label="AWS calls" value={current.provider_invocation_count ?? 0} />
          <Metric label="Governance latency" value={latency(current.governance_latency_ms)} />
          <Metric label="Provider latency" value={latency(current.provider_latency_ms)} />
          <Metric label="Total latency" value={latency(current.total_latency_ms)} />
        </div>}
        {current?.response_content != null && <div className="response"><span>Generated customer response</span><pre>{typeof current.response_content === "string" ? current.response_content : JSON.stringify(current.response_content, null, 2)}</pre></div>}
        {current?.safe_failure_reason && <div className="failure">{current.safe_failure_reason}</div>}
      </section>
    </div>

    <section className="panel table"><div className="title"><div><span>Audit trail</span><h2>Recent workflow executions</h2></div></div><div className="scroll"><table><thead><tr><th>Time</th><th>Customer</th><th>Category</th><th>Priority</th><th>Status</th><th>Decision</th><th>Proposal</th><th>Evidence</th><th>AWS calls</th><th>Total</th><th>Governance</th><th>Provider</th></tr></thead><tbody>{executions.map((row) => <tr key={row.id}><td>{new Date(row.created_at).toLocaleString()}</td><td>{row.customer_name}</td><td>{row.request_category}</td><td>{row.priority}</td><td>{row.status}</td><td>{row.governance_decision || "—"}</td><td>{row.proposal_id || "—"}</td><td>{row.evidence_id || "—"}</td><td>{row.provider_invocation_count || 0}</td><td>{latency(row.total_latency_ms)}</td><td>{latency(row.governance_latency_ms)}</td><td>{latency(row.provider_latency_ms)}</td></tr>)}</tbody></table></div></section>

    <section className="panel table"><div className="title"><div><span>Immutable records</span><h2>Recent evidence</h2></div></div><div className="scroll"><table><thead><tr><th>Recorded</th><th>Evidence ID</th><th>Workflow run</th><th>Proposal</th><th>Decision</th><th>Execution</th><th>Connector</th><th>Model</th></tr></thead><tbody>{evidence.map((row) => <tr key={row.id}><td>{new Date(row.created_at).toLocaleString()}</td><td>{row.id}</td><td>{row.evidence?.workflow_run_id}</td><td>{row.evidence?.proposal_id || "—"}</td><td>{row.evidence?.governance_decision}</td><td>{row.evidence?.execution_status}</td><td>{row.evidence?.connector_id}</td><td>{row.evidence?.model_id}</td></tr>)}</tbody></table></div></section>

    <style jsx>{`:global(body){background:#080a0f;color:#f5f2e9}.shell{max-width:1500px;margin:auto;padding:34px 22px 70px;font-family:Inter,system-ui}header,.title{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}header{margin-bottom:24px}h1{font-size:clamp(32px,5vw,58px);margin:6px 0 10px}header p{max-width:850px;color:#a9adb8}a{color:#d8bd76;border:1px solid #5c4c2b;border-radius:10px;padding:10px 14px;text-decoration:none}.eyebrow,.title span,.response span{color:#c8a95b;text-transform:uppercase;letter-spacing:.12em;font-size:12px;font-weight:800}.metrics{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px;margin-bottom:20px}.grid{display:grid;grid-template-columns:1fr 1.15fr;gap:20px}.panel{background:#10141b;border:1px solid #2a3039;border-radius:18px;padding:22px;margin-bottom:20px}.title h2{margin:4px 0}.title b{font-size:12px;color:#d9c078}label{display:grid;gap:7px;margin:13px 0;font-size:13px;font-weight:700}input,select,textarea{width:100%;box-sizing:border-box;background:#090c11;border:1px solid #343a44;border-radius:10px;padding:12px;color:#fff;font:inherit}button{background:#c8a95b;color:#100e08;border:0;border-radius:10px;padding:13px 18px;font-weight:900;width:100%;margin-top:12px}.timeline{display:grid;gap:7px;margin:16px 0}.timeline div{display:flex;align-items:center;gap:10px;padding:9px 10px;color:#69717e}.timeline i{width:10px;height:10px;border-radius:50%;background:#353c47}.timeline .active{background:#191e27;color:#fff;border-radius:9px}.timeline .active i,.timeline .done i{background:#c8a95b}.timeline small{margin-left:auto;color:#d8bd76}.details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.metric{background:#0a0d12;border:1px solid #292f39;border-radius:10px;padding:12px;min-width:0}.metric span{display:block;color:#858d99;font-size:10px;text-transform:uppercase;letter-spacing:.08em}.metric strong{display:block;margin-top:6px;overflow-wrap:anywhere}.response,.failure,.notice,.error{border:1px solid #323945;border-radius:12px;padding:15px;margin-top:15px}.response pre{white-space:pre-wrap;overflow-wrap:anywhere}.failure,.error{border-color:#74353d;color:#ffadb7}.table{overflow:hidden}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;min-width:1200px}th,td{text-align:left;padding:11px;border-bottom:1px solid #2b3039;font-size:12px;white-space:nowrap}th{color:#818996;text-transform:uppercase;font-size:10px;letter-spacing:.08em}@media(max-width:1100px){.metrics{grid-template-columns:repeat(3,1fr)}.grid{grid-template-columns:1fr}}@media(max-width:650px){.metrics,.details{grid-template-columns:1fr}.shell{padding:24px 13px}header{display:block}header a{display:inline-block;margin-top:12px}}`}</style>
  </main>;
}

function Metric({ label, value }: { label: string; value: any }) {
  return <div className="metric"><span>{label}</span><strong>{value == null || value === "" ? "Not recorded" : value}</strong></div>;
}
