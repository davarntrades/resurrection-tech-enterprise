"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

const PROFILES = [
  ["customer_cloud", "Customer-controlled cloud"],
  ["on_prem", "On-premises"],
  ["sovereign_cloud", "Sovereign cloud"],
  ["air_gapped", "Air-gapped"],
] as const;

type PortalTarget = {
  orgId: string;
  customerName: string;
  mount: HTMLElement;
};

async function engagementApi(path: string, opts: RequestInit = {}) {
  const res = await fetch(`/api/runtime/admin/${path}`, {
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

function CustomerPostureControl({ orgId, customerName }: { orgId: string; customerName: string }) {
  const [engagement, setEngagement] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await engagementApi(`engagement?org_id=${encodeURIComponent(orgId)}`);
      setEngagement(data.engagement || null);
    } catch (error: any) {
      setNote(`✗ ${error?.message || "Could not load deployment posture"}`);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const save = async (patch: Record<string, unknown>) => {
    setBusy(true);
    setNote("");
    try {
      const data = await engagementApi("engagement", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId, ...patch }),
      });
      setEngagement(data.engagement || null);
      setNote("✓ Saved");
      window.dispatchEvent(new CustomEvent("rg:engagement-posture-changed", {
        detail: { org_id: orgId, engagement: data.engagement },
      }));
    } catch (error: any) {
      setNote(`✗ ${error?.message || "Could not save deployment posture"}`);
    } finally {
      setBusy(false);
    }
  };

  if (!engagement) {
    return <div className="radmin-muted" style={{ fontSize: 11, marginTop: 10 }}>Loading deployment posture…</div>;
  }

  const sovereign = engagement.deployment_mode === "sovereign";
  const profile = engagement.sovereign_profile || "customer_cloud";

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line-2)" }}>
      <div className="radmin-row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <div>
          <div className="radmin-muted" style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase" }}>Deployment posture</div>
          <div style={{ fontSize: 12, marginTop: 2 }}>
            {sovereign ? "Sovereign engagement" : "Standard engagement"}
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ display: "inline-flex", border: "1px solid var(--line-2)", borderRadius: 999, padding: 3, gap: 3 }} aria-label={`Deployment posture for ${customerName}`}>
          <button
            type="button"
            className={`radmin-btn sm${!sovereign ? " primary" : ""}`}
            style={{ borderRadius: 999, minWidth: 92 }}
            disabled={busy || !sovereign}
            onClick={() => save({ deployment_mode: "standard" })}
          >
            Standard
          </button>
          <button
            type="button"
            className={`radmin-btn sm${sovereign ? " primary" : ""}`}
            style={sovereign ? { borderRadius: 999, minWidth: 92, borderColor: "rgba(217,164,65,.65)", color: "#e4b84f", background: "rgba(217,164,65,.12)" } : { borderRadius: 999, minWidth: 92 }}
            disabled={busy || sovereign}
            onClick={() => save({ deployment_mode: "sovereign" })}
          >
            Sovereign
          </button>
        </div>
      </div>

      {sovereign ? (
        <div className="radmin-row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label className="radmin-muted" style={{ fontSize: 11 }}>
            Sovereign profile
            <select
              className="radmin-select"
              value={profile}
              disabled={busy}
              onChange={(event) => save({ sovereign_profile: event.target.value })}
              style={{ marginLeft: 8, minWidth: 210 }}
            >
              {PROFILES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <span className="radmin-badge warn">Sovereign</span>
          <span className="radmin-muted" style={{ fontSize: 11 }}>
            Standard Audit/Pilot/Integration features retained; sovereign assurance and evidence added.
          </span>
        </div>
      ) : (
        <div className="radmin-muted" style={{ fontSize: 11 }}>
          Normal engagement behaviour and existing evidence/reporting remain unchanged.
        </div>
      )}

      {note && <div className="radmin-muted" style={{ fontSize: 11, marginTop: 6 }}>{note}</div>}
    </div>
  );
}

/**
 * The legacy Control Room customer screen is intentionally large and stable.
 * This bridge mounts the persisted engagement posture next to the existing
 * engagement-stage controls without forking or duplicating customer lifecycle
 * logic. Both this control and Operations read/write the same engagement API.
 */
export default function CustomerSovereignControls() {
  const [targets, setTargets] = useState<PortalTarget[]>([]);

  useEffect(() => {
    let scheduled = false;

    const scan = () => {
      scheduled = false;
      const next: PortalTarget[] = [];
      const cards = Array.from(document.querySelectorAll<HTMLElement>(".radmin-card"));

      for (const card of cards) {
        const body = card.querySelector<HTMLElement>(".radmin-cust-body");
        if (!body) continue;
        const orgCode = body.querySelector<HTMLElement>(":scope > code");
        const orgId = orgCode?.textContent?.trim() || "";
        if (!orgId) continue;

        const engagementHub = Array.from(body.querySelectorAll<HTMLElement>(":scope > .radmin-hub"))
          .find((hub) => hub.textContent?.includes("Engagement"));
        if (!engagementHub) continue;

        let mount = engagementHub.querySelector<HTMLElement>(":scope > .rg-customer-sovereign-mount");
        if (!mount) {
          mount = document.createElement("div");
          mount.className = "rg-customer-sovereign-mount";

          const label = Array.from(engagementHub.querySelectorAll<HTMLElement>("div"))
            .find((node) => node.textContent?.trim() === "Set company stage");
          const stageBlock = label?.parentElement;
          if (stageBlock?.parentElement === engagementHub) stageBlock.after(mount);
          else engagementHub.appendChild(mount);
        }

        const customerName = card.querySelector<HTMLElement>(".radmin-cust-name")?.textContent?.trim() || orgId;
        next.push({ orgId, customerName, mount });
      }

      setTargets((current) => {
        if (current.length === next.length && current.every((item, index) => item.orgId === next[index]?.orgId && item.mount === next[index]?.mount)) return current;
        return next;
      });
    };

    const scheduleScan = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(scan);
    };

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true });
    scan();
    return () => observer.disconnect();
  }, []);

  return <>{targets.map((target) => createPortal(
    <CustomerPostureControl key={target.orgId} orgId={target.orgId} customerName={target.customerName} />,
    target.mount,
  ))}</>;
}
