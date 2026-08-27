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

      {orgId && <ExecutionEnvironments environments={data.execution_environments || []} records={data.execution_records || []} comparisons={data.experiment_comparisons || []} />}

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
    if (kind === "connector" && type !== "aws-bedrock" && type !== "gmail") await mutate({ operation: "connector.create", environment_id: environmentId, type, name, endpoint });
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
        {(kind === "webhook" || (kind === "connector" && type !== "aws-bedrock" && type !== "gmail")) && <label>HTTPS endpoint<input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://customer.example.com/guardian" required /></label>}
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

function YesNo({ value }: { value: boolean }) {
  return <span className={`radmin-badge ${value ? "ok" : "ghost"}`}>{value ? "YES" : "NO"}</span>;
}

function ExecutionEnvironmentSetup({ environments }: { environments: any[] }) {
  const setupRows = environments.filter((row: any) => row.provisioning?.available);
  const [adapterId, setAdapterId] = useState(setupRows[0]?.adapter || "");
  const selected = setupRows.find((row: any) => row.adapter === adapterId) || setupRows[0];
  const provisioning = selected?.provisioning;
  const copy = async (command: string) => { try { await navigator.clipboard.writeText(command); } catch { /* clipboard can be blocked by browser policy */ } };
  if (!selected || !provisioning) return null;
  const lifecycle = Object.entries(provisioning.lifecycle || {}).filter(([, enabled]) => enabled).map(([name]) => name);
  return <div style={{ margin: "18px 0 24px", padding: 18, border: "1px solid var(--line-2)", borderRadius: "var(--radius-sm, 9px)", background: "var(--panel-2)" }}>
    <div className="radmin-row" style={{ alignItems: "flex-start", marginBottom: 14 }}>
      <div>
        <h3 style={{ margin: 0 }}>Provision an execution environment</h3>
        <p className="radmin-muted" style={{ margin: "5px 0 0" }}>Provider setup is separate from Morrison authorization. Provisioning never grants permission to execute.</p>
      </div>
      <span style={{ flex: 1 }} />
      <select className="radmin-select" aria-label="Execution environment provider" value={selected.adapter} onChange={(event) => setAdapterId(event.target.value)}>
        {setupRows.map((row: any) => <option value={row.adapter} key={row.adapter}>{row.provider}</option>)}
      </select>
    </div>
    <div className="radmin-kpis execution-setup-steps">
      <div className="radmin-kpi">
        <div className="radmin-kpi-l" style={{ marginTop: 0 }}>1 · Authenticate provider</div>
        <p style={{ margin: "10px 0 8px" }}>Create or connect a provider credential using its supported flow.</p>
        <div className="radmin-badges">{provisioning.credential_modes.map((mode: string) => <span className="radmin-badge ghost" key={mode}>{mode.replaceAll("_", " ")}</span>)}</div>
      </div>
      <div className="radmin-kpi">
        <div className="radmin-kpi-l" style={{ marginTop: 0 }}>2 · Set up transport</div>
        <p style={{ margin: "10px 0 8px" }}>Use a documented CLI, MCP, HTTP API or manual provider workflow.</p>
        <div className="radmin-badges">{provisioning.setup_transports.map((mode: string) => <span className="radmin-badge accent" key={mode}>{mode.replaceAll("_", " ")}</span>)}</div>
      </div>
      <div className="radmin-kpi">
        <div className="radmin-kpi-l" style={{ marginTop: 0 }}>3 · Hand off target</div>
        <p style={{ margin: "10px 0 8px" }}>{provisioning.endpoint_handoff || "Bind the provisioned run or endpoint to the adapter configuration."}</p>
        <span className="radmin-badge warn">AUTHORIZATION STILL REQUIRED</span>
      </div>
    </div>
    {!!provisioning.commands?.length && <div style={{ marginTop: 14 }}>
      <div className="radmin-muted" style={{ marginBottom: 7 }}>Documented setup commands (display only)</div>
      <div style={{ display: "grid", gap: 7 }}>{provisioning.commands.map((item: any) => <div className="radmin-row" key={item.id} style={{ padding: "8px 10px", border: "1px solid var(--line-2)", borderRadius: 7 }}>
        <div style={{ minWidth: 145 }}><strong>{item.label}</strong></div>
        <code style={{ flex: 1, overflowWrap: "anywhere" }}>{item.command}</code>
        <button className="radmin-btn sm" type="button" onClick={() => copy(item.command)}>Copy</button>
      </div>)}</div>
    </div>}
    <div className="radmin-badges" style={{ marginTop: 14 }}>
      {lifecycle.map((name) => <span className="radmin-badge ghost" key={name}>{name.replaceAll("_", " ")}</span>)}
      <span className="radmin-badge ghost">{provisioning.status.replaceAll("_", " ")}</span>
    </div>
    <p className="radmin-muted" style={{ margin: "10px 0 0" }}>Lifecycle availability describes the provider setup surface. Adapter capabilities and local-safety readiness remain independently assessed below.</p>
  </div>;
}

function ExecutionEnvironments({ environments, records, comparisons }: { environments: any[]; records: any[]; comparisons: any[] }) {
  return <section className="radmin-card">
    <h2>Execution environments</h2>
    <p className="radmin-muted">Universal governed targets. Readiness describes experimental control and observability—not a claim that an environment is safe.</p>
    <ExecutionEnvironmentSetup environments={environments} />
    <div className="radmin-table-wrap"><table className="radmin-table">
      <thead><tr><th>Adapter / type</th><th>Status</th><th>Environment</th><th>Pre-execution</th><th>State read</th><th>Replay</th><th>Multi-step</th><th>Permissions</th><th>Readiness</th><th>Last execution</th><th>Health</th></tr></thead>
      <tbody>{environments.map((row: any) => <tr key={row.adapter}>
        <td><strong>{row.provider}</strong><div className="radmin-muted" style={{ fontSize: 11 }}>{row.adapter_type}</div></td>
        <td><span className={`radmin-badge ${row.status === "adapter_available" ? "ok" : "ghost"}`}>{row.status}</span></td>
        <td>{row.environment?.environment_id || row.environment?.twin_id || row.environment?.server_id || row.environment?.endpoint || "Not observed"}</td>
        <td><YesNo value={row.capabilities?.pre_execution_hook === true} /></td>
        <td><YesNo value={row.capabilities?.state_read === true} /></td>
        <td><YesNo value={row.capabilities?.replay === true} /></td>
        <td><YesNo value={row.capabilities?.multi_step === true} /></td>
        <td><YesNo value={row.capabilities?.permission_control === true} /></td>
        <td><span className={`radmin-badge ${row.safety_claim_readiness?.supports_local_safety_experiment ? "ok" : "ghost"}`}>{row.safety_claim_readiness?.level || "UNKNOWN"}</span></td>
        <td>{ago(row.last_execution)}</td><td>{row.last_health_check ? ago(row.last_health_check) : "Not checked"}</td>
      </tr>)}</tbody>
    </table></div>
    <h3 style={{ marginTop: 22 }}>Recent governed execution evidence</h3>
    {!records.length ? <p className="radmin-muted">No external execution evidence recorded.</p> : <div className="radmin-table-wrap"><table className="radmin-table">
      <thead><tr><th>Decision</th><th>Verdict</th><th>Adapter</th><th>Environment / twin</th><th>Executed?</th><th>State changed?</th><th>State hashes</th><th>Receipt</th><th>Correlation</th><th>Evidence</th></tr></thead>
      <tbody>{records.map((row: any) => <tr key={row.id}>
        <td>{row.morrison_decision_id || "—"}</td>
        <td><strong>{row.verdict === "BLOCK" ? "MORRISON BLOCK" : row.verdict}</strong>{row.verdict === "BLOCK" && <div className="radmin-muted" style={{ fontSize: 11 }}>EXTERNAL EXECUTION: NOT ATTEMPTED</div>}</td>
        <td>{row.adapter_id}</td><td>{row.execution_target?.environment_id || row.execution_target?.twin_id || row.execution_target?.endpoint || "—"}</td>
        <td>{row.executed === true ? "YES" : row.executed === false ? "NO" : "UNKNOWN"}</td>
        <td>{row.external_state_changed === true ? "YES" : row.external_state_changed === false ? "NO" : row.state_observability === "NOT_APPLICABLE" ? "NOT APPLICABLE" : "UNKNOWN"}</td>
        <td><span className="radmin-muted">{row.state_before_hash?.slice(0, 10) || "—"} → {row.state_after_hash?.slice(0, 10) || "—"}</span></td>
        <td>{row.execution_receipt ? "CAPTURED" : "—"}</td><td>{row.correlation_id || "—"}</td>
        <td>{row.evidence_verified ? "VERIFIED" : "UNVERIFIED"}</td>
      </tr>)}</tbody>
    </table></div>}
    <h3 style={{ marginTop: 22 }}>Pilot comparisons</h3>
    {!comparisons.length ? <p className="radmin-muted">No baseline/governed pair has been recorded by a trusted pilot harness.</p> : <div className="radmin-table-wrap"><table className="radmin-table">
      <thead><tr><th>Scenario / correlation</th><th>Same starting state?</th><th>Trajectory</th><th>Baseline outcome</th><th>Governed verdict</th><th>Governed execution</th><th>State delta</th><th>Prevented transition</th><th>Evidence</th></tr></thead>
      <tbody>{comparisons.map((row: any) => <tr key={`${row.scenario_id}-${row.correlation_id}`}>
        <td>{row.scenario_id}<div className="radmin-muted" style={{ fontSize: 11 }}>{row.correlation_id}</div></td>
        <td>{row.comparison?.equivalent_initial_state ? "ESTABLISHED" : "NOT ESTABLISHED"}<div className="radmin-muted" style={{ fontSize: 11 }}>{(row.comparison?.reasons || []).join("; ")}</div></td>
        <td>{row.governed?.trajectory_hash?.slice(0, 12) || "—"}</td>
        <td>{row.baseline?.execution_status} · state changed {row.baseline?.external_state_changed ? "YES" : "NO"}</td>
        <td>{row.governed?.verdict}</td><td>{row.governed?.execution_attempted ? row.governed?.execution_status : "NOT ATTEMPTED"}</td>
        <td>{row.governed?.state_delta ? JSON.stringify(row.governed.state_delta) : "—"}</td>
        <td>{row.prevented_unsafe_transition ? "YES" : "NOT ESTABLISHED"}</td>
        <td>{row.baseline?.evidence_verified && row.governed?.evidence_verified ? "VERIFIED" : "INCOMPLETE"}</td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
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
