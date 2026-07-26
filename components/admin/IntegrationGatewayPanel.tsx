"use client";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

async function gateway(path = "", opts: RequestInit = {}) {
  const res = await fetch(`/api/runtime/admin/integration-gateway${path}`, {
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const ago = (iso?: string | null) => {
  if (!iso) return "—";
  const n = Date.now() - Date.parse(iso);
  if (!Number.isFinite(n)) return "—";
  if (n < 60000) return "just now";
  if (n < 3600000) return `${Math.floor(n / 60000)}m ago`;
  if (n < 86400000) return `${Math.floor(n / 3600000)}h ago`;
  return `${Math.floor(n / 86400000)}d ago`;
};

export default function IntegrationGatewayPanel() {
  const [data, setData] = useState<any>(null);
  const [orgId, setOrgId] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (selected = orgId) => {
    setError("");
    try { setData(await gateway(selected ? `?org_id=${encodeURIComponent(selected)}` : "")); }
    catch (e: any) { setError(e.message); }
  }, [orgId]);
  useEffect(() => { load(""); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const org = useMemo(() => data?.organisations?.find((o: any) => o.id === orgId), [data, orgId]);
  const envs = org?.environments || [];

  const chooseOrg = async (id: string) => { setOrgId(id); await load(id); };
  const mutate = async (body: any) => {
    setBusy(true); setError(""); setNote("");
    try {
      const result = await gateway("", { method: "POST", body: JSON.stringify({ ...body, org_id: orgId }) });
      if (result.key) setNote(`Credential (shown once): ${result.key}`);
      else if (result.signing_secret) setNote(`Webhook signing secret (shown once): ${result.signing_secret}`);
      else setNote(result.ok ? `Governed operation completed · evidence ${result.governance?.evidence_id || "recorded"}` : `Governance status: ${result.governance?.status}`);
      await load(orgId);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  if (!data && !error) return <div className="radmin-muted">Loading Integration Gateway…</div>;
  const s = data?.summary || {};
  const cards: Array<[string, any, string?]> = [
    ["Connected organisations", s.organisations ?? 0],
    ["Connected systems", s.connected_systems ?? 0],
    ["Healthy connectors", s.connectors_healthy ?? 0, "ok"],
    ["Webhook success", s.webhook_success_rate == null ? "—" : `${s.webhook_success_rate}%`, s.webhook_success_rate >= 99 ? "ok" : undefined],
    ["Sandbox deployments", s.sandbox_deployments ?? 0],
    ["Production deployments", s.production_deployments ?? 0],
    ["API requests", s.api_requests ?? 0],
    ["API latency", s.avg_api_latency_ms == null ? "—" : `${s.avg_api_latency_ms}ms`],
    ["Errors", s.errors ?? 0, s.errors ? "warn" : "ok"],
    ["Evidence generated", s.evidence_generated ?? 0],
    ["Governance decisions", s.governance_decisions ?? 0],
    ["Rate limit", s.rate_limit || "deployment policy"],
  ];

  return (
    <>
      <section className="radmin-card">
        <div className="radmin-row" style={{ margin: "0 0 10px" }}>
          <div>
            <h2>Integration Gateway</h2>
            <p className="radmin-muted">Enterprise onboarding, governed connectors, SDKs, credentials, webhooks and deployments.</p>
          </div>
          <span style={{ flex: 1 }} />
          <button className="radmin-btn sm" onClick={() => load()}>Refresh</button>
        </div>
        {error && <div className="radmin-err">{error}</div>}
        {note && <div className="radmin-keyreveal" style={{ overflowWrap: "anywhere" }}>{note}</div>}
        <div className="radmin-kpis">
          {cards.map(([label, value, tone]) => <div key={label} className={`radmin-kpi${tone ? ` ${tone}` : ""}`}><div className="radmin-kpi-v">{value}</div><div className="radmin-kpi-l">{label}</div></div>)}
        </div>
      </section>

      <section className="radmin-card">
        <div className="radmin-row">
          <h2>Organisation environment</h2>
          <select className="radmin-select" value={orgId} onChange={(e) => chooseOrg(e.target.value)}>
            <option value="">Select an organisation</option>
            {(data?.organisations || []).map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        {!orgId ? <p className="radmin-muted">Select a customer to manage its isolated gateway resources.</p> : (
          <div className="radmin-badges">
            {envs.map((e: any) => <span className={`radmin-badge${e.kind === "sandbox" ? " ok" : e.kind === "production" ? " accent" : ""}`} key={e.id}>{e.kind} · {e.mode}</span>)}
            {Object.entries(s.sdk_usage || {}).map(([sdk, count]) => <span className="radmin-badge ghost" key={sdk}>SDK {sdk}: {String(count)}</span>)}
          </div>
        )}
      </section>

      {orgId && <GatewayActions key={orgId} envs={envs} definitions={data.connector_definitions || []} busy={busy} mutate={mutate} />}

      {orgId && (
        <section className="radmin-card">
          <h2>Connected systems</h2>
          {!(data.connectors || []).length ? <p className="radmin-muted">No connectors configured.</p> : <div className="radmin-table-wrap"><table className="radmin-table"><thead><tr><th>Name</th><th>Type</th><th>Health</th><th>Endpoint</th><th>Status</th><th>Action</th></tr></thead><tbody>
            {(data.connectors || []).map((c: any) => <tr key={c.id}><td>{c.name}</td><td>{c.type}</td><td>{c.health}</td><td>{c.endpoint || "—"}</td><td>{c.status}</td><td><div className="radmin-row"><button className="radmin-btn sm" disabled={busy || c.status === "disabled"} onClick={() => mutate({ operation: "connector.check", connector_id: c.id })}>Check</button><button className="radmin-btn sm" disabled={busy} onClick={() => mutate({ operation: "connector.status", connector_id: c.id, status: c.status === "disabled" ? "active" : "disabled" })}>{c.status === "disabled" ? "Enable" : "Disable"}</button></div></td></tr>)}
          </tbody></table></div>}
          <h2 style={{ marginTop: 24 }}>API credentials</h2>
          {!(data.credentials || []).length ? <p className="radmin-muted">No credentials.</p> : <div className="radmin-table-wrap"><table className="radmin-table"><thead><tr><th>Label</th><th>Prefix</th><th>Role</th><th>Status</th><th>Last use</th><th>Actions</th></tr></thead><tbody>
            {(data.credentials || []).map((k: any) => <tr key={k.id}><td>{k.label || "Credential"}</td><td>{k.prefix}</td><td>{k.role}</td><td>{k.status}</td><td>{ago(k.last_used_at)}</td><td>{k.status === "active" && <div className="radmin-row"><button className="radmin-btn sm" disabled={busy} onClick={() => mutate({ operation: "credential.rotate", key_id: k.id })}>Rotate</button><button className="radmin-btn sm" disabled={busy} onClick={() => mutate({ operation: "credential.revoke", key_id: k.id })}>Revoke</button></div>}</td></tr>)}
          </tbody></table></div>}
          <h2 style={{ marginTop: 24 }}>Webhook endpoints</h2>
          {!(data.webhooks || []).length ? <p className="radmin-muted">No webhooks registered.</p> : <div className="radmin-table-wrap"><table className="radmin-table"><thead><tr><th>Name</th><th>Endpoint</th><th>Status</th><th>Failures</th><th>Last success</th><th>Action</th></tr></thead><tbody>
            {(data.webhooks || []).map((w: any) => <tr key={w.id}><td>{w.name}</td><td>{w.url}</td><td>{w.status}</td><td>{w.failure_count || 0}</td><td>{ago(w.last_success_at)}</td><td>{w.status !== "revoked" && <button className="radmin-btn sm" disabled={busy} onClick={() => mutate({ operation: "webhook.status", webhook_id: w.id, status: w.status === "paused" ? "active" : "paused" })}>{w.status === "paused" ? "Resume" : "Pause"}</button>}</td></tr>)}
          </tbody></table></div>}
          <h2 style={{ marginTop: 24 }}>Webhook delivery history</h2>
          {!(data.deliveries || []).length ? <p className="radmin-muted">No webhook deliveries.</p> : (
            <div className="radmin-table-wrap"><table className="radmin-table"><thead><tr><th>Event</th><th>Status</th><th>HTTP</th><th>Latency</th><th>Attempt</th><th>When</th><th>Action</th></tr></thead><tbody>
              {(data.deliveries || []).map((d: any) => <tr key={d.id}><td>{d.event_type}</td><td>{d.status}</td><td>{d.response_status || "—"}</td><td>{d.latency_ms == null ? "—" : `${d.latency_ms}ms`}</td><td>{d.attempt}</td><td>{ago(d.created_at)}</td><td><button className="radmin-btn sm" disabled={busy} onClick={() => mutate({ operation: "webhook.replay", delivery_id: d.id })}>Replay</button></td></tr>)}
            </tbody></table></div>
          )}
          <h2 style={{ marginTop: 24 }}>Deployments</h2>
          <DataTable empty="No gateway deployments." rows={(data.deployments || []).map((d: any) => [d.name, d.target, d.model, d.status, d.health])} headings={["Name", "Target", "Model", "Status", "Health"]} />
          <h2 style={{ marginTop: 24 }}>Recent events</h2>
          <DataTable empty="No integration events." rows={(s.recent_events || []).map((e: any) => [e.type, e.actor || "—", e.evidence_hash?.slice(0, 12) || "—", ago(e.created_at)])} headings={["Event", "Actor", "Evidence hash", "When"]} />
        </section>
      )}
    </>
  );
}

function GatewayActions({ envs, definitions, busy, mutate }: { envs: any[]; definitions: any[]; busy: boolean; mutate: (body: any) => Promise<void> }) {
  const [kind, setKind] = useState("connector");
  const [environmentId, setEnvironmentId] = useState(envs[0]?.id || "");
  const [type, setType] = useState("rest");
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (kind === "connector") await mutate({ operation: "connector.create", environment_id: environmentId, type, name, endpoint });
    if (kind === "webhook") await mutate({ operation: "webhook.create", environment_id: environmentId, name, url: endpoint, events: ["decision.created"] });
    if (kind === "credential") await mutate({ operation: "credential.issue", environment_id: environmentId, label: name || "Integration credential", role: "admin", scopes: ["runtime:read", "runtime:write", "integrations:read", "integrations:manage", "webhooks:read", "webhooks:manage", "evidence:read", "evidence:write", "deployments:read", "deployments:manage"] });
    if (kind === "deployment") await mutate({ operation: "deployment.create", environment_id: environmentId, name: name || "GuardianOS deployment", target: envs.find((e) => e.id === environmentId)?.kind, model: "platform" });
  };
  return (
    <section className="radmin-card">
      <h2>Governed setup</h2>
      <p className="radmin-muted">Every operation below is evaluated by Runtime Governance and produces evidence before it changes gateway state.</p>
      <form className="radmin-form" onSubmit={submit}>
        <div className="radmin-row">
          <label>Resource<select className="radmin-select" value={kind} onChange={(e) => setKind(e.target.value)}><option value="connector">Connector</option><option value="webhook">Webhook</option><option value="credential">API credential</option><option value="deployment">Deployment</option></select></label>
          <label>Environment<select className="radmin-select" value={environmentId} onChange={(e) => setEnvironmentId(e.target.value)}>{envs.map((e) => <option key={e.id} value={e.id}>{e.kind} · {e.name}</option>)}</select></label>
          {kind === "connector" && <label>Connector type<select className="radmin-select" value={type} onChange={(e) => setType(e.target.value)}>{definitions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}
        </div>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "credential" ? "Production automation" : "Customer system"} /></label>
        {(kind === "connector" || kind === "webhook") && <label>HTTPS endpoint<input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://customer.example.com/guardian" required /></label>}
        <button className="radmin-btn primary" disabled={busy || !environmentId}>{busy ? "Governing…" : `Create ${kind}`}</button>
      </form>
    </section>
  );
}

function DataTable({ headings, rows, empty }: { headings: string[]; rows: any[][]; empty: string }) {
  if (!rows.length) return <p className="radmin-muted">{empty}</p>;
  return <div className="radmin-table-wrap"><table className="radmin-table"><thead><tr>{headings.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{String(v ?? "—")}</td>)}</tr>)}</tbody></table></div>;
}
