"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

const CAPABILITIES = [
  ["send", "Send email"], ["reply", "Reply on a thread"], ["draft", "Create draft"],
  ["list", "List messages"], ["read", "Read message"],
];

function badgeClass(value: string) {
  const v = String(value || "").toLowerCase();
  if (v.includes("healthy") || v.includes("executed") || v.includes("configured")) return "ok";
  if (v.includes("down") || v.includes("block") || v.includes("disabled") || v.includes("fail")) return "bad";
  if (v.includes("degraded") || v.includes("escalat") || v.includes("unknown")) return "warn";
  return "neutral";
}

export default function IntegrationGatewayPage() {
  const [orgId, setOrgId] = useState("");
  const [environmentId, setEnvironmentId] = useState("");
  const [connectors, setConnectors] = useState<any[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Gmail connector form. Credentials are held only until submit, posted once
  // over HTTPS, and sealed server-side by the Integration Gateway secret model.
  // Nothing here is persisted to local storage or echoed back by the API.
  const [name, setName] = useState("Enterprise Gmail");
  const [mailbox, setMailbox] = useState("");
  const [allowedDomains, setAllowedDomains] = useState("");
  const [capabilities, setCapabilities] = useState<string[]>(["send", "reply", "draft", "list", "read"]);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [lastGovernance, setLastGovernance] = useState<any>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setOrgId(query.get("org_id") || "");
    setEnvironmentId(query.get("environment_id") || "");
  }, []);

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      const params = new URLSearchParams({ org_id: orgId });
      if (environmentId) params.set("environment_id", environmentId);
      const response = await fetch(`/api/runtime/admin/communication?${params.toString()}`, { credentials: "include" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "unable to load connectors");
      setConnectors(body.connectors || []);
      setError("");
    } catch (e: any) { setError(e.message || "unable to load connectors"); }
  }, [orgId, environmentId]);

  useEffect(() => { load(); }, [load]);

  async function post(payload: any) {
    const response = await fetch("/api/runtime/admin/integration-gateway", {
      method: "POST", credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ org_id: orgId, ...payload }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `request failed (${response.status})`);
    return body;
  }

  async function createConnector(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await post({
        operation: "connector.create",
        environment_id: environmentId,
        type: "gmail",
        name,
        config: {
          mailbox: mailbox.trim().toLowerCase(),
          allowed_recipient_domains: allowedDomains.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean),
          capabilities,
        },
        secret: { client_id: clientId.trim(), client_secret: clientSecret.trim(), refresh_token: refreshToken.trim() },
      });
      setLastGovernance(result.governance || null);
      if (!result.ok) throw new Error("Runtime Governance did not permit connector creation");
      // Clear the credential fields the moment they are no longer needed.
      setClientId(""); setClientSecret(""); setRefreshToken("");
      const created = result.result;
      setNotice(`Connector ${created?.id} created. Run a credential check to validate against Gmail and mark it healthy.`);
      await load();
    } catch (e: any) { setError(e.message || "connector creation failed"); }
    finally { setBusy(false); }
  }

  async function act(operation: string, connector_id: string, extra: any = {}) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await post({ operation, connector_id, ...extra });
      setLastGovernance(result.governance || null);
      const detail = result.result?.mailbox ? ` (${result.result.mailbox})` : "";
      setNotice(result.ok ? `${operation} succeeded${detail}.` : `${operation} was not permitted.`);
      await load();
    } catch (e: any) { setError(e.message || `${operation} failed`); }
    finally { setBusy(false); }
  }

  const gmail = connectors.filter((c) => c.type === "gmail");
  const complete = mailbox.trim() && clientId.trim() && clientSecret.trim() && refreshToken.trim() && capabilities.length > 0;

  return (
    <main className="console-shell">
      <header className="console-header">
        <div>
          <p className="eyebrow">GuardianOS · Integration Gateway</p>
          <h1>Connector administration</h1>
          <p>Connectors are created through a governed proposal. Credentials are sealed by the Integration Gateway secret model and never returned by the API.</p>
        </div>
        <a href="/runtime/admin/bedrock-invocations" className="back-link">Bedrock console</a>
      </header>

      {!orgId && <section className="notice">Open this console with <code>?org_id=ORG_ID&amp;environment_id=ENVIRONMENT_ID</code>.</section>}
      {error && <section className="error-box">{error}</section>}
      {notice && <section className="notice">{notice}</section>}

      <div className="console-grid">
        <form className="panel" onSubmit={createConnector}>
          <div className="panel-title"><div><span>Provision</span><h2>Gmail connector</h2></div><span className="badge neutral">Server governed</span></div>
          <label>Organisation<input value={orgId} onChange={(e) => setOrgId(e.target.value)} required /></label>
          <label>Environment<input value={environmentId} onChange={(e) => setEnvironmentId(e.target.value)} placeholder="sandbox / staging / production environment id" required /></label>
          <label>Connector name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <label>Sender mailbox<input type="email" value={mailbox} onChange={(e) => setMailbox(e.target.value)} placeholder="governed@yourdomain.com" required /></label>
          <label>Allowed recipient domains <span className="optional">comma separated · empty means no connector-level restriction</span>
            <input value={allowedDomains} onChange={(e) => setAllowedDomains(e.target.value)} placeholder="yourdomain.com, partner.com" />
          </label>
          <fieldset className="caps">
            <legend>Capabilities</legend>
            <p className="hint">Narrowing capabilities narrows the OAuth scopes this connector needs and what it can ever do — a staging connector can be draft-only and unable to deliver.</p>
            {CAPABILITIES.map(([id, label]) => (
              <label key={id} className="check">
                <input type="checkbox" checked={capabilities.includes(id)}
                  onChange={(e) => setCapabilities((prev) => e.target.checked ? [...prev, id] : prev.filter((c) => c !== id))} />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          <div className="secret-box">
            <strong>OAuth 2.0 credentials</strong>
            <p className="hint">Encrypted with AES-256-GCM on receipt. Never stored in the connector configuration, never returned by the API, never written to evidence.</p>
            <label>Client ID<input value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" required /></label>
            <label>Client secret<input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="new-password" required /></label>
            <label>Refresh token<input type="password" value={refreshToken} onChange={(e) => setRefreshToken(e.target.value)} autoComplete="new-password" required /></label>
          </div>
          <div className="actions">
            <button type="submit" disabled={busy || !orgId || !environmentId || !complete}>{busy ? "Proposing…" : "Create connector"}</button>
            <button type="button" className="secondary" onClick={() => { setClientId(""); setClientSecret(""); setRefreshToken(""); setError(""); setNotice(""); }}>Clear credentials</button>
          </div>
        </form>

        <section className="panel">
          <div className="panel-title"><div><span>Fleet</span><h2>Gmail connectors</h2></div></div>
          {lastGovernance && (
            <div className="result-grid">
              <Metric label="Governance decision" value={lastGovernance.status || lastGovernance.verdict} badge />
              <Metric label="Proposal" value={lastGovernance.proposal_id} />
              <Metric label="Evidence" value={lastGovernance.evidence_id} />
              <Metric label="Reason" value={lastGovernance.reason} />
            </div>
          )}
          {!gmail.length && <p className="empty">No Gmail connector for this organisation and environment yet.</p>}
          {gmail.map((connector) => (
            <article key={connector.id} className="connector">
              <div className="connector-head">
                <div><strong>{connector.name}</strong><code>{connector.id}</code></div>
                <span className={`badge ${badgeClass(connector.health)}`}>{connector.health}</span>
              </div>
              <div className="result-grid">
                <Metric label="Mailbox" value={connector.mailbox} />
                <Metric label="Environment" value={connector.environment_id} />
                <Metric label="Status" value={connector.status} badge />
                <Metric label="Allowed domains" value={(connector.allowed_recipient_domains || []).join(", ") || "unrestricted"} />
              </div>
              <div className="actions">
                <button type="button" className="secondary" disabled={busy} onClick={() => act("gmail.credentials.check", connector.id)}>Validate credentials</button>
                <button type="button" className="secondary" disabled={busy} onClick={() => act("connector.status", connector.id, { status: connector.status === "disabled" ? "active" : "disabled" })}>
                  {connector.status === "disabled" ? "Enable" : "Disable"}
                </button>
                <button type="button" className="danger" disabled={busy}
                  onClick={() => { if (confirm(`Revoke credentials for ${connector.id}? This disables the connector and cannot be undone.`)) act("gmail.credentials.revoke", connector.id); }}>
                  Revoke
                </button>
              </div>
            </article>
          ))}
        </section>
      </div>

      <style jsx>{`
        :global(body){background:#080a0f;color:#f5f2e9}.console-shell{max-width:1500px;margin:auto;padding:36px 24px 72px;font-family:Inter,system-ui}.console-header,.panel-title,.actions,.connector-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.console-header{margin-bottom:28px}.console-header h1{font-size:clamp(28px,4vw,52px);margin:6px 0}.console-header p,.empty,.hint{color:#a9adb8}.hint{font-size:12px;font-weight:400;margin:6px 0 10px}.eyebrow,.panel-title span,.secret-box>strong,legend{color:#c8a95b;text-transform:uppercase;letter-spacing:.12em;font-size:12px;font-weight:700}.back-link{color:#d7bd79;border:1px solid #5a4b2b;padding:10px 14px;border-radius:10px;text-decoration:none}.console-grid{display:grid;grid-template-columns:1fr 1.05fr;gap:20px}.panel{background:#10141b;border:1px solid #282d37;border-radius:18px;padding:22px;margin-bottom:20px}.panel-title h2{margin:4px 0}label{display:grid;gap:8px;margin:14px 0;font-size:13px;font-weight:650}.optional{color:#858c99;font-weight:400}input,select,textarea{width:100%;box-sizing:border-box;background:#090c11;border:1px solid #303641;border-radius:10px;padding:12px;color:#fff}button{border:0;border-radius:10px;padding:12px 20px;background:#c8a95b;color:#100e08;font-weight:800}button:disabled{opacity:.5}.secondary{background:transparent;color:#ddd;border:1px solid #39404b}.danger{background:transparent;color:#ff8d8d;border:1px solid #7c3434}.actions{flex-wrap:wrap;gap:10px;justify-content:flex-start}.notice,.error-box,.secret-box,.caps,.connector{border:1px solid #343a45;border-radius:12px;padding:14px;margin:14px 0}.error-box{border-color:#7c3434}.secret-box{border-color:#5a4b2b}.caps{border:1px solid #303641}.check{display:flex;align-items:center;gap:10px;margin:8px 0;font-weight:500}.check input{width:auto}.result-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}.metric{background:#0a0d12;border:1px solid #292f39;border-radius:10px;padding:12px;min-width:0}.metric span{display:block;color:#858c99;font-size:11px;text-transform:uppercase}.metric strong{display:block;margin-top:6px;overflow-wrap:anywhere}.badge{display:inline-flex;padding:5px 8px;border-radius:999px;background:#252a33}.ok{color:#7be0a1}.bad{color:#ff8d8d}.warn{color:#f0cb72}.connector code{display:block;color:#858c99;font-size:11px;margin-top:4px}@media(max-width:900px){.console-grid{grid-template-columns:1fr}.console-header{display:block}.back-link{display:inline-block;margin-top:14px}.result-grid{grid-template-columns:1fr}}
      `}</style>
    </main>
  );
}

function Metric({ label, value, badge = false }: { label: string; value: any; badge?: boolean }) {
  const display = value == null || value === "" ? "Not recorded" : value;
  return <div className="metric"><span>{label}</span>{badge ? <b className={`badge ${badgeClass(String(display))}`}>{display}</b> : <strong>{display}</strong>}</div>;
}
