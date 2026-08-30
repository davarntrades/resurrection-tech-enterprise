"use client";

import { displayValue, SAFETY_STATUS_COPY, type GovernedResult } from "@/lib/governed-result";

export default function GovernedEvidencePanels({ result, compact = false }: { result?: GovernedResult | null; compact?: boolean }) {
  if (!result) return (
    <section className="gev-panel gev-unavailable" aria-label="Admissible Operating Envelope unavailable">
      <div className="gev-kicker">Admissible Operating Envelope</div>
      <h3>OPERATING ENVELOPE EVIDENCE UNAVAILABLE</h3>
      <p>No canonical backend operating-envelope evidence was supplied. Runtime governance remains active.</p>
    </section>
  );
  const safety = result.safety_envelope;
  const status = SAFETY_STATUS_COPY[safety.status] || SAFETY_STATUS_COPY.UNAVAILABLE;
  const causal = result.causal_analysis;
  const conditions = Object.entries(safety.validated_conditions || {});
  const unsupported = safety.unsupported_unvalidated_region || [];
  const observed = causal.observed?.items || [];
  const derived = causal.derived?.items || [];
  const counterfactual = causal.counterfactual?.items || [];
  return <div className={`gev-stack${compact ? " gev-compact" : ""}`}>
    {!compact && <section className="gev-panel gev-governance" aria-label="Canonical Morrison governance result">
      <div className="gev-kicker">Governance Result</div>
      <h3>CANONICAL MORRISON VERDICT · {result.canonical_governance.verdict}</h3>
      <dl className="gev-grid">
        <div><dt>Forbidden state</dt><dd>{displayValue(result.canonical_governance.omega)}</dd></div>
        <div><dt>Responsible layer</dt><dd>{displayValue(result.canonical_governance.responsible_layer)}</dd></div>
        <div><dt>Ω reachable</dt><dd>{displayValue(result.canonical_governance.omega_reachable)}</dd></div>
        <div><dt>Execution occurred</dt><dd>{displayValue(result.canonical_governance.execution_occurred)}</dd></div>
      </dl>
    </section>}

    {!compact && <section className="gev-panel gev-causal" aria-label="Causal Analysis">
      <div className="gev-kicker">Causal Analysis · non-authoritative</div>
      {causal.status === "UNAVAILABLE" ? <><h3>CAUSAL ANALYSIS UNAVAILABLE</h3><p>{causal.error || "No causal evidence was supplied."}</p></> : <>
        <div className="gev-epistemic">
          <div><strong>OBSERVED</strong>{observed.length ? <ul>{observed.slice(0, 8).map((item, index) => <li key={`${item.label}-${index}`}><span>{item.label}</span><b>{displayValue(item.value)}</b></li>)}</ul> : <p>No observed causal variables claimed.</p>}</div>
          <div><strong>DERIVED</strong>{derived.length ? <ul>{derived.slice(0, 8).map((item, index) => <li key={`${item.parent}-${item.child}-${index}`}>{item.parent} → {item.child}<small>{item.relation}</small></li>)}</ul> : <p>No structural dependency claimed.</p>}</div>
          <div><strong>COUNTERFACTUAL</strong>{counterfactual.length ? <ul>{counterfactual.map((item) => <li key={item.intervention}><span>{item.question || item.intervention}</span><b>{item.result} · {item.verdict} · Ω {item.omega_reachable ? "reachable" : "unreachable"}</b></li>)}</ul> : <p>No eligible intervention question was answered.</p>}</div>
        </div>
        <div className="gev-resolution"><span>Causal resolution</span><strong>{causal.causal_resolution === undefined ? "NOT MEASURED" : `${counterfactual.length} answered · score ${causal.causal_resolution.toFixed(3)}`}</strong></div>
        <details><summary>Contributors, provenance and latency</summary><dl className="gev-grid">
          <div><dt>Necessary contributors</dt><dd>{displayValue(causal.necessary_contributors)}</dd></div>
          <div><dt>Sufficient interventions</dt><dd>{displayValue(causal.sufficient_preventive_interventions)}</dd></div>
          <div><dt>Source evidence hash</dt><dd className="mono">{displayValue(result.source_evidence_hash)}</dd></div>
          <div><dt>Latency</dt><dd>{displayValue(causal.latency)}</dd></div>
        </dl></details>
      </>}
    </section>}

    <section className={`gev-panel gev-safety gev-status-${safety.status.toLowerCase()}`} aria-label="Admissible Operating Envelope">
      <div className="gev-kicker">Admissible Operating Envelope · bounded assurance</div>
      <h3>{status.label}</h3>
      <p className="gev-status-detail">{status.detail}</p>
      {safety.safety_property && <p><b>Safety property:</b> {safety.safety_property}</p>}
      <div className="gev-summary-row"><span>Envelope</span><strong className="mono">{safety.envelope || "NOT ESTABLISHED"}</strong><span>Outside this configuration</span><strong>UNVALIDATED</strong></div>
      {safety.boundary_mutation && safety.boundary_mutation !== "none" && <div className="gev-runtime-active"><b>Boundary demonstration:</b> {safety.boundary_mutation.replaceAll("_", " ")} · Runtime governance remains active. Existing local-safety evidence does not automatically transfer to this configuration.</div>}
      <details open={!compact}><summary>Validated conditions</summary>{conditions.length ? <dl className="gev-grid">{conditions.map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{displayValue(value)}</dd></div>)}</dl> : <p>Validated conditions were not supplied.</p>}</details>
      <details><summary>Evidence coverage and provenance</summary><dl className="gev-grid">{Object.entries(safety.evidence || {}).map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd className={key.includes("hash") ? "mono" : ""}>{displayValue(value)}</dd></div>)}</dl></details>
      <details open={safety.status === "UNVALIDATED" || safety.status === "INSUFFICIENT_EVIDENCE"}><summary>Unsupported / unvalidated region</summary>{unsupported.length ? <ul className="gev-unsupported">{unsupported.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No additional unsupported condition was recorded for this operating point.</p>}</details>
      {safety.error && <p className="gev-error">{safety.error}</p>}
      <p className="gev-warning">{safety.warning || result.boundary_warning}</p>
      <p className="gev-noequivalence">Operating-envelope validity is separate from Protected Value and regulatory/compliance context. It is not a compliance certification or a universal safety claim.</p>
    </section>
  </div>;
}
