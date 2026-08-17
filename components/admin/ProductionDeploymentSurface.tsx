"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const MODES = ["SHADOW", "GUARDED_PILOT", "ENFORCED", "PRODUCTION", "SOVEREIGN"] as const;

async function jsonFetch(path: string, options: RequestInit = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error: any = new Error(data.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function tone(status?: string) {
  if (status === "READY" || status === "PASS" || status === "active") return "#3fb27f";
  if (status === "BLOCKED" || status === "FAIL" || status === "broken") return "#e5484d";
  return "#d9a441";
}

export default function ProductionDeploymentSurface() {
  const [catalog, setCatalog] = useState<any>(null);
  const [production, setProduction] = useState<any>(null);
  const [error, setError] = useState("");
  const [environmentId, setEnvironmentId] = useState("");
  const [profile, setProfile] = useState<"PRODUCTION" | "SOVEREIGN">("SOVEREIGN");
  const [secretStoreRef, setSecretStoreRef] = useState("");
  const [evidenceStoreRef, setEvidenceStoreRef] = useState("");
  const [providerRefs, setProviderRefs] = useState("");
  const [preflight, setPreflight] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([
        jsonFetch("/api/runtime/admin/deployment"),
        jsonFetch("/api/runtime/admin/preflight"),
      ]);
      setCatalog(c); setProduction(p); setError("");
      if (!environmentId && c.environments?.length) setEnvironmentId(c.environments[0].id);
    } catch (e: any) {
      // Before operator login this page shares the Control Room route. Do not
      // turn the login screen into an error wall.
      if (e.status === 401) return;
      setError(e.message || "readiness unavailable");
    }
  }, [environmentId]);

  useEffect(() => { load(); }, [load]);

  const env = useMemo(() => catalog?.environments?.find((e: any) => e.id === environmentId), [catalog, environmentId]);
  const active = useMemo(() => catalog?.profiles?.find((p: any) => p.environment_id === environmentId), [catalog, environmentId]);
  const org = useMemo(() => catalog?.orgs?.find((o: any) => o.id === env?.org_id), [catalog, env]);

  if (!catalog && !production && !error) return null;
  if (error) return <section className="radmin-card"><div className="radmin-err">Production readiness unavailable — {error}. Treat posture as UNKNOWN.</div></section>;

  const config = profile === "SOVEREIGN" ? {
    sovereign_profile: "sovereign",
    customer_environment_ref: environmentId,
    secret_store_ref: secretStoreRef,
    customer_secret_store: secretStoreRef,
    evidence_store_ref: evidenceStoreRef,
    governance_engine_location: "local",
    local_engine: true,
    provider_endpoint_refs: providerRefs.split(",").map((x) => x.trim()).filter(Boolean),
  } : {};

  async function action(kind: "draft" | "preflight" | "activate") {
    if (!env) return;
    setBusy(true); setError("");
    try {
      const result = await jsonFetch("/api/runtime/admin/deployment", {
        method: "POST",
        body: JSON.stringify({ action: kind, org_id: env.org_id, environment_id: env.id, profile, config }),
      });
      setPreflight(result.readiness || null);
      await load();
    } catch (e: any) {
      setPreflight(e.data?.readiness || null);
      setError(e.message || "deployment operation failed");
    } finally { setBusy(false); }
  }

  const sovereignState = profile === "SOVEREIGN" ? preflight?.sovereign : null;
  return (
    <section className="radmin-card" style={{ marginBottom: 16 }}>
      <div className="radmin-row" style={{ alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ marginBottom: 3 }}>Production & Sovereign Deployment</h2>
          <div className="radmin-muted">Backend preflight is authoritative. A UI selection cannot create a READY production state.</div>
        </div>
        <span style={{ flex: 1 }} />
        <span className="radmin-ready" style={{ borderColor: tone(production?.status), color: tone(production?.status) }}>
          PRODUCTION {production?.status || "UNKNOWN"}
        </span>
        <button className="radmin-btn sm" onClick={load}>Refresh</button>
      </div>

      <div className="radmin-row" style={{ gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        <span className="radmin-muted">Deployment modes</span>
        {MODES.map((m) => <span key={m} className="radmin-pill">{m.replaceAll("_", " ")}</span>)}
      </div>

      <div className="radmin-kv" style={{ marginTop: 12 }}>
        {(production?.checks || []).filter((c: any) => [
          "tenant_isolation", "durable_evidence", "decision_chain", "connector_chain",
          "migrations", "engine_reachability", "alert_routing", "rollback_readiness", "source_health",
        ].includes(c.id)).map((c: any) => (
          <div key={c.id}><span>{c.name}</span><code style={{ color: tone(c.status) }}>{c.status}</code></div>
        ))}
        <div><span>Last verified</span><code>{production?.checked_at || "UNKNOWN"}</code></div>
      </div>

      <hr style={{ border: 0, borderTop: "1px solid var(--line-2)", margin: "18px 0" }} />
      <div className="radmin-row" style={{ alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0 }}>Enable Sovereign Deployment</h3>
          <div className="radmin-muted">Guided activation derives secure defaults; only customer-controlled infrastructure references are requested.</div>
        </div>
        {active && <span className="radmin-pill" style={{ marginLeft: "auto" }}>Current: {active.profile} · {active.status}</span>}
      </div>

      <div className="radmin-form" style={{ marginTop: 12 }}>
        <label>1. Environment
          <select className="radmin-select" value={environmentId} onChange={(e) => { setEnvironmentId(e.target.value); setPreflight(null); }}>
            {(catalog?.environments || []).map((e: any) => <option key={e.id} value={e.id}>{catalog?.orgs?.find((o: any) => o.id === e.org_id)?.name || e.org_id} · {e.name || e.kind} · {e.id}</option>)}
          </select>
        </label>
        <label>2. Deployment profile
          <select className="radmin-select" value={profile} onChange={(e) => { setProfile(e.target.value as any); setPreflight(null); }}>
            <option value="SOVEREIGN">Sovereign</option>
            <option value="PRODUCTION">Production</option>
          </select>
        </label>
        {profile === "SOVEREIGN" && <>
          <label>3. Customer secret-store reference
            <input className="radmin-select" value={secretStoreRef} onChange={(e) => setSecretStoreRef(e.target.value)} placeholder="e.g. customer-vault://guardian/runtime" />
          </label>
          <label>Customer evidence-store reference
            <input className="radmin-select" value={evidenceStoreRef} onChange={(e) => setEvidenceStoreRef(e.target.value)} placeholder="e.g. customer://evidence/guardian" />
          </label>
          <label>Approved provider endpoint references
            <input className="radmin-select" value={providerRefs} onChange={(e) => setProviderRefs(e.target.value)} placeholder="customer endpoint refs, comma-separated" />
          </label>
        </>}
      </div>

      <div className="radmin-row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
        <button className="radmin-btn" disabled={busy || !env} onClick={() => action("draft")}>Save profile</button>
        <button className="radmin-btn primary" disabled={busy || !env || (profile === "SOVEREIGN" && (!secretStoreRef || !evidenceStoreRef))} onClick={() => action("preflight")}>4. Run {profile === "SOVEREIGN" ? "Sovereign" : "Production"} Preflight</button>
        <button className="radmin-btn primary" disabled={busy || !preflight?.ready} onClick={() => action("activate")}>5. Activate {profile === "SOVEREIGN" ? "Sovereign Mode" : "Production"}</button>
        <span className="radmin-muted">{org?.name || ""}</span>
      </div>

      {error && <div className="radmin-err" style={{ marginTop: 10 }}>{error}</div>}
      {preflight && <div style={{ marginTop: 14 }}>
        <div className="radmin-row"><b>{profile} POSTURE</b><span style={{ color: tone(preflight.status), fontWeight: 700 }}>{preflight.status}</span><span className="radmin-muted">{preflight.checked_at}</span></div>
        <ul className="radmin-checks">
          {(preflight.checks || []).map((c: any) => <li key={c.id} className={`radmin-check ${c.status === "PASS" ? "pass" : c.status === "FAIL" ? "fail" : "warn"}`}>
            <span className="radmin-check-tag">{c.status}</span><span className="radmin-check-name">{c.name}</span><span className="radmin-check-detail radmin-muted">{c.detail}</span>
          </li>)}
        </ul>
        {sovereignState && <div className="radmin-kv">
          <div><span>Data residency</span><code>{sovereignState.data_residency}</code></div>
          <div><span>Secrets</span><code>{sovereignState.secrets}</code></div>
          <div><span>Governance engine</span><code>{sovereignState.governance_engine}</code></div>
          <div><span>Evidence</span><code>{sovereignState.evidence}</code></div>
          <div><span>Outbound telemetry</span><code>{sovereignState.outbound_telemetry}</code></div>
          <div><span>External control plane</span><code>{sovereignState.external_control_plane_dependency}</code></div>
          <div><span>Fail-closed</span><code>{sovereignState.fail_closed}</code></div>
          <div><span>Network egress</span><code>{sovereignState.network_egress}</code></div>
        </div>}
      </div>}
    </section>
  );
}
