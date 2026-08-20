/* ============================================================================
 * Production reporting wrapper.
 *
 * Keeps the existing report renderer/projection, but adds one integrity envelope
 * before persistence so a missing source can never masquerade as a clean zero
 * and monthly/quarterly packs explicitly state chain health.
 * ============================================================================ */
"use strict";

function wrapReports(base, store, readiness) {
  if (!base || !store || !readiness) throw new Error("reports + store + readiness are required");

  async function chainFor(org_id, environment_id) {
    const out = {};
    for (const name of ["integration_events", "ops_evidence"]) {
      const r = await store.rpcOptional("rg_verify_evidence_chain", { p_chain_name: name, p_org: org_id, p_env: environment_id || null });
      out[name] = r.ok ? (r.data || { status: "UNKNOWN", ok: false }) : { status: "UNKNOWN", ok: false, reason: r.detail || r.reason };
    }
    const broken = Object.values(out).some((x) => x && x.status === "BROKEN");
    const unknown = Object.values(out).some((x) => !x || ["UNKNOWN", "LEGACY_PRE_CHAIN"].includes(x.status));
    const legacy = Object.values(out).some((x) => x && x.status === "VERIFIED_WITH_LEGACY_PREFIX");
    return {
      status: broken ? "BROKEN" : unknown ? "UNKNOWN" : legacy ? "VERIFIED_WITH_LEGACY" : "VERIFIED",
      ok: !broken && !unknown,
      chains: out,
    };
  }

  async function integrityEnvelope(org_id, environment_id) {
    const [sources, connectorChain] = await Promise.all([readiness.sourceHealth(), chainFor(org_id, environment_id)]);
    const unavailable = Object.entries(sources.sources || {}).filter(([, v]) => v.state !== "available");
    return {
      source_health: sources.sources || {},
      evidence_complete: sources.ok && unavailable.length === 0,
      unavailable_sources: unavailable.map(([name, value]) => ({ name, state: value.state, detail: value.detail || null })),
      connector_chain: connectorChain,
      checked_at: new Date().toISOString(),
    };
  }

  async function generate({ org_id, environment_id, period, ref, persist = true }) {
    const report = await base.generate({ org_id, environment_id, period, ref, persist: false });
    const integrity = await integrityEnvelope(org_id, environment_id);

    // A projection may have returned [] because an additive table was missing.
    // Explicit source health is authoritative over that apparent zero.
    if (!integrity.evidence_complete) {
      report.connector_activity = {
        ...(report.connector_activity || {}),
        available: false,
        unavailable_reason: `evidence completeness could not be established: ${integrity.unavailable_sources.map((x) => `${x.name}:${x.state}`).join(", ")}`,
        totals: null,
      };
    }

    report.integrity = integrity;
    report.headline = `${report.headline || ""} Connector evidence chain: ${integrity.connector_chain.status}. Evidence completeness: ${integrity.evidence_complete ? "ESTABLISHED" : "NOT ESTABLISHED"}.`.trim();
    if (!persist) return report;

    try { return await store.insert("reports", report); }
    catch (error) {
      const text = String(error && error.message || error);
      if (!/(integrity|connector_activity).*(column|schema cache)|PGRST204|42703/i.test(text)) throw error;
      // Backwards-compatible pilot migration tolerance. This is never called a
      // successful production readiness state because preflight requires schema.
      const { integrity: omittedIntegrity, ...legacy } = report;
      try {
        const row = await store.insert("reports", legacy);
        return { ...row, integrity: omittedIntegrity, integrity_persisted: false };
      } catch {
        return base.generate({ org_id, environment_id, period, ref, persist: true });
      }
    }
  }

  async function generateAllDue({ period, ref } = {}) {
    const orgs = await store.find("orgs", {});
    const out = [];
    for (const org of orgs) {
      if (org.status && org.status !== "active") continue;
      try {
        const r = await generate({ org_id: org.id, period, ref });
        out.push({ org_id: org.id, period, report_id: r.id, trajectories: r.trajectories, integrity: r.integrity });
      } catch (error) {
        out.push({ org_id: org.id, period, error: error && error.message || String(error) });
      }
    }
    return { period, generated: out.length, reports: out };
  }

  return { ...base, generate, generateAllDue, integrityEnvelope };
}

module.exports = { wrapReports };
