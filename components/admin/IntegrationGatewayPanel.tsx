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
  const [governanceResult, setGovernanceResult] = useState<any>(null);

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
    setBusy(true); setError(""); setNote(""); setGovernanceResult(null);
    try {
      const result = await gateway("", { method: "POST", body: JSON.stringify({ ...body, org_id: orgId }) });
      if (result.governance) setGovernanceResult({ operation: body.operation, ok: !!result.ok, ...result.governance });
      // Credential validation is a provider-health result, not a governance
      // decision. Always refresh the row, then show Google's normalized reason
      // verbatim when it failed instead of leaving an unhelpful "unknown".
      if (body.operation === "gmail.credentials.check") {
        await load(orgId);
        const health = result.result || {};
        if (result.ok) setNote(`Gmail validated · ${health.mailbox || "mailbox confirmed"} · ${health.latency_ms ?? "—"}ms`);
        else setError(`${health.code ? `${health.code}: ` : ""}${health.error || "Gmail credential validation failed"}`);
        return;
      }
      if (["salesforce.credentials.check", "servicenow.credentials.check"].includes(body.operation)) {
        await load(orgId);
        const health = result.result || {};
        if (result.ok) setNote(`${health.provider} validated · ${health.identity || "identity confirmed"} · ${health.latency_ms ?? "—"}ms`);
        else setError(`${health.code ? `${health.code}: ` : ""}${health.error || "Provider credential validation failed"}`);
        return;
      }
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
        {governanceResult && (
          <div className="radmin-keyreveal" style={{ overflowWrap: "anywhere" }}>
            <strong>{governanceResult.operation} · {governanceResult.ok ? "permitted" : `not permitted (${governanceResult.status || "unknown"})`}</strong>
            <div className="radmin-muted" style={{ marginTop: 6 }}>
              Governance decision: {governanceResult.verdict || governanceResult.status || "—"}
              {" · "}Proposal: {governanceResult.proposal_id || "—"}
              {" · "}Evidence: {governanceResult.evidence_id || "—"}
              {governanceResult.rule ? ` · Rule: ${governanceResult.rule}` : ""}
            </div>
            {(governanceResult.safe_failure_reason || (!governanceResult.ok && governanceResult.reason)) && (
              <div className="radmin-muted" style={{ marginTop: 6 }}>
                Safe failure reason: {governanceResult.safe_failure_reason || governanceResult.reason}
              </div>
            )}
          </div>
        )}
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

      {orgId && <BedrockPanel organisation={org} envs={envs} connectors={data.bedrock || []} busy={busy} mutate={mutate} />}

      {orgId && <GmailPanel connectors={(data.connectors || []).filter((c: any) => c.type === "gmail")} busy={busy} mutate={mutate} />}

      {orgId && <EnterpriseConnectorPanel connectors={(data.connectors || []).filter((c: any) => ["salesforce", "servicenow"].includes(c.type))} executions={data.enterprise_executions || []} dashboard={data.enterprise_dashboard || {}} busy={busy} mutate={mutate} />}

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
  const [awsRegion, setAwsRegion] = useState("eu-west-2");
  const [awsAuth, setAwsAuth] = useState("role");
  const [roleArn, setRoleArn] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [externalId, setExternalId] = useState("");
  const [modelIds, setModelIds] = useState("");
  const [inferenceProfiles, setInferenceProfiles] = useState("");
  const [agentIds, setAgentIds] = useState("");
  const [agentAliases, setAgentAliases] = useState("");
  const [actionGroups, setActionGroups] = useState("");
  // Gmail connector fields. Credentials live in component state only until
  // submit, then are cleared immediately — they are posted once, sealed
  // server-side by the Integration Gateway secret model, and never read back.
  const [mailbox, setMailbox] = useState("");
  const [allowedDomains, setAllowedDomains] = useState("");
  const [capabilities, setCapabilities] = useState<string[]>(["send", "reply", "draft", "list", "read"]);
  const [gmailClientId, setGmailClientId] = useState("");
  const [gmailClientSecret, setGmailClientSecret] = useState("");
  const [gmailRefreshToken, setGmailRefreshToken] = useState("");
  const [enterpriseInstanceUrl, setEnterpriseInstanceUrl] = useState("");
  const [enterpriseLoginUrl, setEnterpriseLoginUrl] = useState("https://login.salesforce.com");
  const [enterpriseClientId, setEnterpriseClientId] = useState("");
  const [enterpriseClientSecret, setEnterpriseClientSecret] = useState("");
  const [enterpriseRefreshToken, setEnterpriseRefreshToken] = useState("");
  const [enterpriseCapabilities, setEnterpriseCapabilities] = useState("");
  const [enterpriseTargets, setEnterpriseTargets] = useState("");
  const clearGmailSecrets = () => { setGmailClientId(""); setGmailClientSecret(""); setGmailRefreshToken(""); };
  const split = (value: string) => value.split(",").map((x) => x.trim()).filter(Boolean);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (kind === "connector" && type === "gmail") {
      try {
        await mutate({
          operation: "connector.create", environment_id: environmentId, type, name: name || "Gmail",
          config: {
            mailbox: mailbox.trim().toLowerCase(),
            allowed_recipient_domains: split(allowedDomains).map((d) => d.toLowerCase()),
            capabilities,
          },
          secret: {
            client_id: gmailClientId.trim(),
            client_secret: gmailClientSecret.trim(),
            refresh_token: gmailRefreshToken.trim(),
          },
        });
      } finally {
        // Cleared on success AND failure: a rejected submission must not leave
        // a refresh token sitting in the browser.
        clearGmailSecrets();
      }
      return;
    }
    if (kind === "connector" && ["salesforce", "servicenow"].includes(type)) {
      try {
        const targets = split(enterpriseTargets);
        await mutate({
          operation: "connector.create", environment_id: environmentId, type,
          name: name || (type === "salesforce" ? "Salesforce" : "ServiceNow"),
          config: {
            instance_url: enterpriseInstanceUrl.trim(),
            ...(type === "salesforce" ? {
              login_url: enterpriseLoginUrl.trim(), api_version: "v61.0",
              allowed_objects: targets.length ? targets : ["Account", "Contact", "Lead", "Case", "CaseComment", "Task"],
            } : {
              allowed_tables: targets.length ? targets : ["incident", "change_request"],
            }),
            capabilities: split(enterpriseCapabilities),
          },
          secret: {
            client_id: enterpriseClientId.trim(), client_secret: enterpriseClientSecret.trim(),
            refresh_token: enterpriseRefreshToken.trim(),
          },
        });
      } finally {
        setEnterpriseClientId(""); setEnterpriseClientSecret(""); setEnterpriseRefreshToken("");
      }
      return;
    }
    if (kind === "connector" && type === "aws-bedrock") await mutate({
      operation: "connector.create", environment_id: environmentId, type, name: name || "Amazon Bedrock",
      config: {
        region: awsRegion, auth_method: awsAuth, role_arn: roleArn || undefined,
        model_ids: split(modelIds), inference_profiles: split(inferenceProfiles),
        agent_ids: split(agentIds), agent_aliases: split(agentAliases),
        action_groups: split(actionGroups), timeout_ms: 30000, max_retries: 2,
      },
      secret: {
        access_key_id: accessKeyId || undefined, secret_access_key: secretAccessKey || undefined,
        session_token: sessionToken || undefined, external_id: externalId || undefined,
      },
    });
    if (kind === "connector" && !["aws-bedrock", "gmail", "salesforce", "servicenow"].includes(type)) await mutate({ operation: "connector.create", environment_id: environmentId, type, name, endpoint });
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
        {(kind === "webhook" || (kind === "connector" && type !== "aws-bedrock" && type !== "gmail")) && <label hidden={kind === "connector" && ["salesforce", "servicenow"].includes(type)}>HTTPS endpoint<input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://customer.example.com/guardian" required={kind === "webhook" || !["salesforce", "servicenow"].includes(type)} /></label>}
        {kind === "connector" && ["salesforce", "servicenow"].includes(type) && <>
          <div className="radmin-row">
            <label>Instance URL<input value={enterpriseInstanceUrl} onChange={(e) => setEnterpriseInstanceUrl(e.target.value)} placeholder={type === "salesforce" ? "https://acme.my.salesforce.com" : "https://acme.service-now.com"} required /></label>
            {type === "salesforce" && <label>OAuth login URL<input value={enterpriseLoginUrl} onChange={(e) => setEnterpriseLoginUrl(e.target.value)} required /></label>}
          </div>
          <div className="radmin-row">
            <label>OAuth client ID<input autoComplete="off" value={enterpriseClientId} onChange={(e) => setEnterpriseClientId(e.target.value)} required /></label>
            <label>OAuth client secret<input type="password" autoComplete="new-password" value={enterpriseClientSecret} onChange={(e) => setEnterpriseClientSecret(e.target.value)} required /></label>
            <label>Refresh token<input type="password" autoComplete="new-password" value={enterpriseRefreshToken} onChange={(e) => setEnterpriseRefreshToken(e.target.value)} required /></label>
          </div>
          <label>{type === "salesforce" ? "Allowed objects" : "Allowed tables"}<input value={enterpriseTargets} onChange={(e) => setEnterpriseTargets(e.target.value)} placeholder={type === "salesforce" ? "Account, Contact, Lead, Case" : "incident, change_request"} /></label>
          <label>Capabilities<input value={enterpriseCapabilities} onChange={(e) => setEnterpriseCapabilities(e.target.value)} placeholder="Comma-separated · empty enables the provider catalog" /></label>
          <p className="radmin-muted">Credentials are encrypted before storage and never returned. Object/table, field and capability allowlists are re-applied after approval. The connector remains unusable until live OAuth validation succeeds.</p>
        </>}
        {kind === "connector" && type === "gmail" && <>
          <div className="radmin-row">
            <label>Sender mailbox<input type="email" value={mailbox} onChange={(e) => setMailbox(e.target.value)} placeholder="governed@yourdomain.com" required /></label>
            <label>Allowed recipient domains<input value={allowedDomains} onChange={(e) => setAllowedDomains(e.target.value)} placeholder="Comma-separated · empty means no connector-level restriction" /></label>
          </div>
          <fieldset className="radmin-fieldset">
            <legend>Capabilities</legend>
            {[["send", "Send"], ["reply", "Reply"], ["draft", "Draft"], ["list", "List messages"], ["read", "Read message"]].map(([id, label]) => (
              <label key={id} className="radmin-check">
                <input type="checkbox" checked={capabilities.includes(id)} onChange={(ev) => setCapabilities((prev) => ev.target.checked ? [...prev, id] : prev.filter((c) => c !== id))} />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          <div className="radmin-row">
            <label>OAuth client ID<input autoComplete="off" value={gmailClientId} onChange={(e) => setGmailClientId(e.target.value)} required /></label>
            <label>OAuth client secret<input type="password" autoComplete="new-password" value={gmailClientSecret} onChange={(e) => setGmailClientSecret(e.target.value)} required /></label>
            <label>Refresh token<input type="password" autoComplete="new-password" value={gmailRefreshToken} onChange={(e) => setGmailRefreshToken(e.target.value)} required /></label>
          </div>
          <p className="radmin-muted">Narrowing capabilities narrows the OAuth scopes this connector needs and what it can ever do — a staging connector can be draft-only and unable to deliver. Credentials are encrypted before storage, cleared from this form on submit, and never appear in proposal records, logs, evidence or this dashboard. A new connector starts <strong>unknown</strong> and cannot send until credential validation succeeds.</p>
        </>}
        {kind === "connector" && type === "aws-bedrock" && <>
          <div className="radmin-row">
            <label>AWS region<input value={awsRegion} onChange={(e) => setAwsRegion(e.target.value)} placeholder="eu-west-2" required /></label>
            <label>IAM method<select className="radmin-select" value={awsAuth} onChange={(e) => setAwsAuth(e.target.value)}><option value="role">Assume IAM role</option><option value="access_key">Access key</option></select></label>
            {awsAuth === "role" && <label>Role ARN<input value={roleArn} onChange={(e) => setRoleArn(e.target.value)} placeholder="arn:aws:iam::123456789012:role/GuardianOSBedrock" required /></label>}
          </div>
          <div className="radmin-row">
            <label>Access key ID<input autoComplete="off" value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} placeholder={awsAuth === "role" ? "Optional source credential" : "AKIA…"} required={awsAuth === "access_key"} /></label>
            <label>Secret access key<input type="password" autoComplete="new-password" value={secretAccessKey} onChange={(e) => setSecretAccessKey(e.target.value)} required={awsAuth === "access_key"} /></label>
            <label>Session token<input type="password" autoComplete="new-password" value={sessionToken} onChange={(e) => setSessionToken(e.target.value)} placeholder="Optional" /></label>
            <label>External ID<input type="password" autoComplete="new-password" value={externalId} onChange={(e) => setExternalId(e.target.value)} placeholder="Optional role trust value" /></label>
          </div>
          <label>Model IDs<input value={modelIds} onChange={(e) => setModelIds(e.target.value)} placeholder="Comma-separated Bedrock model IDs" /></label>
          <label>Inference profiles<input value={inferenceProfiles} onChange={(e) => setInferenceProfiles(e.target.value)} placeholder="Comma-separated inference profile IDs or ARNs" /></label>
          <div className="radmin-row">
            <label>Agent IDs<input value={agentIds} onChange={(e) => setAgentIds(e.target.value)} placeholder="Comma-separated" /></label>
            <label>Agent aliases<input value={agentAliases} onChange={(e) => setAgentAliases(e.target.value)} placeholder="Comma-separated" /></label>
            <label>Action groups<input value={actionGroups} onChange={(e) => setActionGroups(e.target.value)} placeholder="Comma-separated" /></label>
          </div>
          <p className="radmin-muted">AWS secrets are encrypted before storage and never appear in proposal records, logs, evidence or this dashboard.</p>
        </>}
        <button className="radmin-btn primary" disabled={busy || !environmentId || (kind === "connector" && type === "gmail" && !(mailbox.trim() && gmailClientId.trim() && gmailClientSecret.trim() && gmailRefreshToken.trim() && capabilities.length))}>{busy ? "Governing…" : `Create ${kind}`}</button>
      </form>
    </section>
  );
}

/* Post-creation Gmail administration. Every button is a governed operation
 * against the SAME communication connector framework the runtime uses — this
 * panel adds no second Gmail path, it only drives the existing one. */
function GmailPanel({ connectors, busy, mutate }: { connectors: any[]; busy: boolean; mutate: (body: any) => Promise<void> }) {
  const [rotating, setRotating] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const clear = () => { setClientId(""); setClientSecret(""); setRefreshToken(""); setRotating(""); };
  const rotate = async (connector_id: string) => {
    try {
      await mutate({
        operation: "gmail.credentials.rotate", connector_id,
        credentials: { client_id: clientId.trim(), client_secret: clientSecret.trim(), refresh_token: refreshToken.trim() },
      });
    } finally { clear(); }
  };
  return (
    <section className="radmin-card">
      <h2>Gmail connectors</h2>
      <p className="radmin-muted">A new Gmail connector starts <strong>unknown</strong> and cannot send, reply, draft, list or read until credential validation succeeds and health becomes healthy.</p>
      {!connectors.length ? <p className="radmin-muted">No Gmail connector configured for this organisation.</p> : (
        <div className="radmin-table-wrap"><table className="radmin-table">
          <thead><tr><th>Name</th><th>Mailbox</th><th>Environment</th><th>Health</th><th>Status</th><th>Capabilities</th><th>Actions</th></tr></thead>
          <tbody>
            {connectors.map((c: any) => (
              <tr key={c.id}>
                <td>{c.name}<div className="radmin-muted" style={{ fontSize: 11 }}>{c.id}</div></td>
                <td>{c.config?.mailbox || "—"}</td>
                <td>{c.environment_id}</td>
                <td>{c.health}{c.health !== "healthy" && <div className="radmin-muted" style={{ fontSize: 11 }}>not usable</div>}</td>
                <td>{c.status}</td>
                <td>{(c.config?.capabilities || []).join(", ") || "—"}</td>
                <td><div className="radmin-row" style={{ flexWrap: "wrap", gap: 6 }}>
                  <button className="radmin-btn sm" disabled={busy} onClick={() => mutate({ operation: "gmail.credentials.check", connector_id: c.id })}>Validate</button>
                  <button className="radmin-btn sm" disabled={busy} onClick={() => mutate({ operation: "connector.status", connector_id: c.id, status: c.status === "disabled" ? "active" : "disabled" })}>{c.status === "disabled" ? "Enable" : "Disable"}</button>
                  <button className="radmin-btn sm" disabled={busy} onClick={() => setRotating(rotating === c.id ? "" : c.id)}>Rotate</button>
                  <button className="radmin-btn sm" disabled={busy} onClick={() => { if (confirm(`Revoke credentials for ${c.id}? This disables the connector and cannot be undone.`)) mutate({ operation: "gmail.credentials.revoke", connector_id: c.id }); }}>Revoke</button>
                </div>
                {rotating === c.id && (
                  <div className="radmin-form" style={{ marginTop: 10 }}>
                    <label>New OAuth client ID<input autoComplete="off" value={clientId} onChange={(e) => setClientId(e.target.value)} /></label>
                    <label>New client secret<input type="password" autoComplete="new-password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} /></label>
                    <label>New refresh token<input type="password" autoComplete="new-password" value={refreshToken} onChange={(e) => setRefreshToken(e.target.value)} /></label>
                    <div className="radmin-row">
                      <button className="radmin-btn primary sm" disabled={busy || !clientId.trim() || !clientSecret.trim() || !refreshToken.trim()} onClick={() => rotate(c.id)}>Rotate credentials</button>
                      <button className="radmin-btn sm" disabled={busy} onClick={clear}>Cancel</button>
                    </div>
                    <p className="radmin-muted">The replacement is validated against Gmail before it is stored, and the superseded token is revoked at Google.</p>
                  </div>
                )}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </section>
  );
}

function EnterpriseConnectorPanel({ connectors, executions, dashboard, busy, mutate }: { connectors: any[]; executions: any[]; dashboard: any; busy: boolean; mutate: (body: any) => Promise<void> }) {
  const [rotating, setRotating] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const clear = () => { setRotating(""); setClientId(""); setClientSecret(""); setRefreshToken(""); };
  const rotate = async (connector: any) => {
    try {
      await mutate({
        operation: `${connector.type}.credentials.rotate`, connector_id: connector.id,
        credentials: { client_id: clientId.trim(), client_secret: clientSecret.trim(), refresh_token: refreshToken.trim() },
      });
    } finally { clear(); }
  };
  return (
    <section className="radmin-card">
      <h2>Governed CRM &amp; Service Management</h2>
      <p className="radmin-muted">Salesforce and ServiceNow actions share the canonical proposal → Runtime Governance → approval → permit → at-most-once provider → immutable evidence path.</p>
      <div className="radmin-badges" style={{ marginBottom: 12 }}>
        <span className="radmin-badge ghost">Runs {dashboard.total || 0}</span>
        <span className="radmin-badge ok">Completed {dashboard.completed || 0}</span>
        <span className="radmin-badge">Awaiting approval {dashboard.awaiting_approval || 0}</span>
        <span className="radmin-badge">Blocked {dashboard.blocked || 0}</span>
        <span className="radmin-badge ghost">Provider calls {dashboard.provider_invocations || 0}</span>
      </div>
      {!connectors.length ? <p className="radmin-muted">No Salesforce or ServiceNow connectors configured.</p> : (
        <div className="radmin-table-wrap"><table className="radmin-table">
          <thead><tr><th>Name</th><th>Provider</th><th>Environment</th><th>Health</th><th>Scope</th><th>Actions</th></tr></thead>
          <tbody>{connectors.map((c: any) => <tr key={c.id}>
            <td>{c.name}<div className="radmin-muted" style={{ fontSize: 11 }}>{c.id}</div></td>
            <td>{c.type}</td><td>{c.environment_id}</td>
            <td>{c.health}{c.last_error && <div className="radmin-muted" style={{ fontSize: 11 }}>{c.last_error}</div>}</td>
            <td>{(c.config?.allowed_objects || c.config?.allowed_tables || []).join(", ")}<div className="radmin-muted" style={{ fontSize: 11 }}>{(c.config?.capabilities || []).join(", ")}</div></td>
            <td>
              <div className="radmin-row" style={{ flexWrap: "wrap", gap: 6 }}>
                <button className="radmin-btn sm" disabled={busy} onClick={() => mutate({ operation: `${c.type}.credentials.check`, connector_id: c.id })}>Validate</button>
                <button className="radmin-btn sm" disabled={busy} onClick={() => setRotating(rotating === c.id ? "" : c.id)}>Rotate</button>
                <button className="radmin-btn sm" disabled={busy} onClick={() => mutate({ operation: "connector.status", connector_id: c.id, status: c.status === "disabled" ? "active" : "disabled" })}>{c.status === "disabled" ? "Enable" : "Disable"}</button>
              </div>
              {rotating === c.id && <div className="radmin-form" style={{ marginTop: 10 }}>
                <label>New OAuth client ID<input autoComplete="off" value={clientId} onChange={(e) => setClientId(e.target.value)} /></label>
                <label>New client secret<input type="password" autoComplete="new-password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} /></label>
                <label>New refresh token<input type="password" autoComplete="new-password" value={refreshToken} onChange={(e) => setRefreshToken(e.target.value)} /></label>
                <div className="radmin-row">
                  <button className="radmin-btn primary sm" disabled={busy || !clientId.trim() || !clientSecret.trim() || !refreshToken.trim()} onClick={() => rotate(c)}>Validate and rotate</button>
                  <button className="radmin-btn sm" disabled={busy} onClick={clear}>Cancel</button>
                </div>
              </div>}
            </td>
          </tr>)}</tbody>
        </table></div>
      )}
      {!!executions.length && <>
        <h3 style={{ marginTop: 20 }}>Recent governed record actions</h3>
        <div className="radmin-table-wrap"><table className="radmin-table">
          <thead><tr><th>Action</th><th>Provider</th><th>State</th><th>Governance</th><th>Approval</th><th>Provider calls</th><th>Record ID</th><th>Evidence</th></tr></thead>
          <tbody>{executions.map((run: any) => <tr key={run.id}>
            <td>{run.action_id}<div className="radmin-muted" style={{ fontSize: 11 }}>{run.id}</div></td>
            <td>{run.provider}</td><td>{run.lifecycle_state}</td><td>{run.governance_decision || "—"}</td>
            <td>{run.approval_status || "—"}</td><td>{run.provider_invocation_count || 0}</td>
            <td>{run.external_record_id || "—"}</td><td>{run.evidence_id || "—"}</td>
          </tr>)}</tbody>
        </table></div>
      </>}
    </section>
  );
}

function BedrockPanel({ organisation, envs, connectors, busy, mutate }: { organisation: any; envs: any[]; connectors: any[]; busy: boolean; mutate: (body: any) => Promise<void> }) {
  const [connectorId, setConnectorId] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [externalId, setExternalId] = useState("");
  const rotate = async (e: FormEvent) => {
    e.preventDefault();
    if (!connectorId) return;
    await mutate({
      operation: "bedrock.credentials.rotate", connector_id: connectorId,
      credentials: {
        access_key_id: accessKeyId || undefined, secret_access_key: secretAccessKey || undefined,
        session_token: sessionToken || undefined, external_id: externalId || undefined,
      },
    });
    setAccessKeyId(""); setSecretAccessKey(""); setSessionToken(""); setExternalId("");
  };
  return (
    <section className="radmin-card">
      <h2>AWS Bedrock</h2>
      <p className="radmin-muted">First-class Bedrock Runtime and Agent action-group connections. Secrets remain redacted.</p>
      {!connectors.length ? <p className="radmin-muted">No Amazon Bedrock connectors configured.</p> : (
        <>
          <div className="radmin-table-wrap"><table className="radmin-table"><thead><tr><th>Organisation</th><th>Environment</th><th>AWS account</th><th>Region</th><th>IAM</th><th>Models / profiles</th><th>Agents / aliases</th><th>Action groups</th><th>Health</th><th>Last success</th><th>Failures</th><th>Decisions</th><th>Evidence</th></tr></thead><tbody>
            {connectors.map((c: any) => <tr key={c.id}>
              <td>{organisation?.name || c.organisation_id}</td>
              <td>{envs.find((e: any) => e.id === c.environment_id)?.kind || c.environment_id}</td>
              <td>{c.aws_account_id || "Unvalidated"}</td><td>{c.region}</td><td>{c.iam_authentication_method === "role" ? "IAM role" : "Access key"}</td>
              <td>{[...(c.model_ids || []), ...(c.inference_profiles || [])].join(", ") || "—"}</td>
              <td>{[...(c.agent_ids || []), ...(c.agent_aliases || [])].join(", ") || "—"}</td>
              <td>{(c.action_groups || []).join(", ") || "—"}</td><td>{c.health}</td><td>{ago(c.last_successful_request)}</td>
              <td>{(c.recent_failures || []).length}</td>
              <td>{`${c.governance_decision_counts?.permit || 0}/${c.governance_decision_counts?.block || 0}/${c.governance_decision_counts?.escalate || 0}`}</td>
              <td>{c.evidence_generated || 0}</td>
            </tr>)}
          </tbody></table></div>
          <form className="radmin-form" onSubmit={rotate} style={{ marginTop: 20 }}>
            <h3>Rotate Bedrock IAM credentials</h3>
            <select className="radmin-select" value={connectorId} onChange={(e) => setConnectorId(e.target.value)} required>
              <option value="">Select Bedrock connector</option>
              {connectors.map((c: any) => <option key={c.id} value={c.id}>{c.name} · {c.region}</option>)}
            </select>
            <div className="radmin-row">
              <label>Access key ID<input autoComplete="off" value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} /></label>
              <label>Secret access key<input type="password" autoComplete="new-password" value={secretAccessKey} onChange={(e) => setSecretAccessKey(e.target.value)} /></label>
              <label>Session token<input type="password" autoComplete="new-password" value={sessionToken} onChange={(e) => setSessionToken(e.target.value)} /></label>
              <label>External ID<input type="password" autoComplete="new-password" value={externalId} onChange={(e) => setExternalId(e.target.value)} /></label>
            </div>
            <button className="radmin-btn" disabled={busy || !connectorId}>Validate and rotate</button>
          </form>
        </>
      )}
    </section>
  );
}

function DataTable({ headings, rows, empty }: { headings: string[]; rows: any[][]; empty: string }) {
  if (!rows.length) return <p className="radmin-muted">{empty}</p>;
  return <div className="radmin-table-wrap"><table className="radmin-table"><thead><tr>{headings.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{String(v ?? "—")}</td>)}</tr>)}</tbody></table></div>;
}
