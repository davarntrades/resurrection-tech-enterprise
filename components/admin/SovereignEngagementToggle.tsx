"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Org = { id: string; name: string; environments?: Array<{ id: string; name?: string; kind?: string; mode?: string }> };
type Stage = { key: string; label: string };
type Profile = { key: string; label: string };

async function request(path: string, opts: RequestInit = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export default function SovereignEngagementToggle() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState("");
  const [environmentId, setEnvironmentId] = useState("");
  const [engagement, setEngagement] = useState<any>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    request("/api/runtime/admin/orgs?withEnvironments=1")
      .then((d) => {
        const list = d.orgs || [];
        setOrgs(list);
        if (list[0]) setOrgId(list[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);

  const selectedOrg = useMemo(() => orgs.find((o) => o.id === orgId) || null, [orgs, orgId]);

  useEffect(() => {
    const envs = selectedOrg?.environments || [];
    setEnvironmentId(envs[0]?.id || "");
  }, [selectedOrg]);

  const loadEngagement = useCallback(async () => {
    if (!orgId) return;
    try {
      const d = await request(`/api/runtime/admin/engagement?org_id=${encodeURIComponent(orgId)}`);
      setEngagement(d.engagement);
      setStages(d.stages || []);
      setProfiles(d.sovereign_profiles || []);
      setError(null);
    } catch (e: any) { setError(e.message); }
  }, [orgId]);

  useEffect(() => { loadEngagement(); }, [loadEngagement]);

  const save = async (patch: Record<string, unknown>) => {
    setBusy(true); setMessage(null); setError(null);
    try {
      const d = await request("/api/runtime/admin/engagement", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId, ...patch }),
      });
      setEngagement(d.engagement);
      setMessage(d.engagement?.sovereign
        ? `Sovereign mode active — ${d.engagement.sovereign_profile_label}. Standard engagement features remain enabled.`
        : "Standard mode active — existing Audit/Pilot/evidence behaviour is unchanged.");
    } catch (e: any) { setError(e.message); }
    setBusy(false);
  };

  const generate = async (action: "monthly" | "audit" | "pilot" | "closeout") => {
    if (!environmentId) { setError("Select an environment first."); return; }
    setBusy(true); setMessage(null); setError(null);
    try {
      const d = await request("/api/runtime/admin/sovereign-evidence", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId, environment_id: environmentId, action }),
      });
      setMessage(`${d.pack_name} generated — ${d.deliverables} deliverable(s).`);
    } catch (e: any) { setError(e.message); }
    setBusy(false);
  };

  if (!orgs.length && !error) return null;
  const sovereign = engagement?.deployment_mode === "sovereign";
  const envs = selectedOrg?.environments || [];
  const stage = engagement?.stage || "prospect";

  return (
    <div className="radmin sov-eng-wrap">
      <section className={`radmin-card sov-eng-card${sovereign ? " is-sovereign" : ""}`}>
        <div className="sov-eng-head">
          <div>
            <div className="sov-eng-eyebrow">ENGAGEMENT DEPLOYMENT POSTURE</div>
            <h2>{sovereign ? "Sovereign engagement" : "Standard engagement"}</h2>
            <p className="radmin-sub">
              One engagement path, one Morrison governance kernel. Sovereign adds deployment-bound assurance,
              residency/authority evidence and sovereign reporting; Standard remains exactly as before.
            </p>
          </div>
          <div className="sov-eng-switch" role="group" aria-label="Deployment posture">
            <button disabled={busy || !orgId} className={!sovereign ? "is-active" : ""} onClick={() => save({ deployment_mode: "standard" })}>Standard</button>
            <button disabled={busy || !orgId} className={sovereign ? "is-active sovereign" : ""} onClick={() => save({ deployment_mode: "sovereign" })}>Sovereign</button>
          </div>
        </div>

        <div className="sov-eng-fields">
          <label>
            <span>Customer</span>
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)} disabled={busy}>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label>
            <span>Engagement</span>
            <select value={stage} onChange={(e) => save({ stage: e.target.value })} disabled={busy || !engagement}>
              {stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          <label>
            <span>Environment</span>
            <select value={environmentId} onChange={(e) => setEnvironmentId(e.target.value)} disabled={busy || !envs.length}>
              {envs.map((e) => <option key={e.id} value={e.id}>{e.name || e.kind || e.id} · {e.mode || "—"}</option>)}
            </select>
          </label>
          {sovereign && (
            <label>
              <span>Sovereign profile</span>
              <select value={engagement?.sovereign_profile || "customer_cloud"} onChange={(e) => save({ sovereign_profile: e.target.value })} disabled={busy}>
                {profiles.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </label>
          )}
        </div>

        {sovereign ? (
          <div className="sov-eng-mode-panel">
            <div>
              <b>Standard capability retained</b>
              <p>Runtime evidence · monthly evidence · executive summaries · Audit · Limited Pilot · secure publishing/sharing · review cadence.</p>
            </div>
            <div>
              <b>Sovereign capability added</b>
              <p>Sovereign monthly evidence · deployment verification · policy authority · evidence residency · credential ownership · egress/provider boundaries · trust/signing readiness · offline update/rollback evidence where applicable.</p>
            </div>
            {engagement?.sovereign_requirements?.length > 0 && (
              <div className="sov-eng-reqs">
                <b>Acceptance evidence · {engagement.sovereign_profile_label}</b>
                <div>{engagement.sovereign_requirements.map((r: string) => <span key={r}>{r}</span>)}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="sov-eng-standard-note">Normal engagement behaviour is unchanged. Existing standard evidence, audits, pilots, reports and delivery flows continue to run normally.</div>
        )}

        {sovereign && (
          <div className="sov-eng-actions">
            <button className="radmin-btn primary" disabled={busy || !environmentId} onClick={() => generate("monthly")}>{busy ? "Working…" : "Generate sovereign monthly evidence"}</button>
            {stage === "audit" && <button className="radmin-btn" disabled={busy || !environmentId} onClick={() => generate("audit")}>Generate sovereign 48-Hour Audit</button>}
            {stage === "limited_pilot" && <button className="radmin-btn" disabled={busy || !environmentId} onClick={() => generate("pilot")}>Generate sovereign pilot evidence</button>}
            <button className="radmin-btn" disabled={busy || !environmentId} onClick={() => generate("closeout")}>Generate sovereign closeout</button>
          </div>
        )}

        <div className="sov-eng-invariant">Morrison verdict semantics · Ω · reachability · execution behaviour: <b>unchanged</b></div>
        {message && <div className="sov-eng-message">{message}</div>}
        {error && <div className="radmin-err">{error}</div>}
      </section>
    </div>
  );
}
