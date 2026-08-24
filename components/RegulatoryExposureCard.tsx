import type { RegulatoryApplicability, RegulatoryExposure } from "@/lib/regulatory-exposure";

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency", currency, maximumFractionDigits: 0,
  }).format(amount);
}

const LABELS: Record<RegulatoryApplicability, string> = {
  CONFIRMED_BY_CONFIGURATION: "CONFIGURED APPLICABLE",
  POTENTIALLY_RELEVANT: "POTENTIALLY RELEVANT",
  INSUFFICIENT_INFORMATION: "INSUFFICIENT INFORMATION",
  NOT_APPLICABLE: "NOT APPLICABLE",
};

export default function RegulatoryExposureCard({
  exposure,
  runtimeVerdict,
  unauthorizedExecutions,
}: {
  exposure: RegulatoryExposure;
  runtimeVerdict?: string;
  unauthorizedExecutions?: number;
}) {
  const shadow = exposure.mode === "shadow";
  return (
    <section className="flab-panel flab-regulatory" aria-label="Regulatory and compliance exposure context">
      <h2>{shadow ? "REGULATORY EXPOSURE OBSERVED" : "REGULATORY / COMPLIANCE EXPOSURE CONTEXT"}</h2>
      <p className="flab-reg-intro">{exposure.runtime_mitigation_language}</p>
      <div className="flab-reg-facts">
        {runtimeVerdict && <div><span>Runtime verdict</span><strong>{runtimeVerdict}</strong></div>}
        {unauthorizedExecutions !== undefined && <div><span>Unauthorized executions</span><strong>{unauthorizedExecutions}</strong></div>}
        <div><span>Distinct control areas</span><strong>{exposure.distinct_obligation_areas}</strong></div>
        <div><span>Evidence category</span><strong>CONTEXTUAL</strong></div>
      </div>
      {exposure.highest_statutory_context_by_currency.length > 0 && (
        <div className="flab-statutory-summary">
          <span>STATUTORY MAXIMUM CONTEXT — NOT AGGREGATED</span>
          {exposure.highest_statutory_context_by_currency.map((item) => (
            <strong key={`${item.currency}-${item.framework_id}`}>
              {money(item.amount, item.currency)} <small>{item.framework_id.replaceAll("_", " ")}</small>
            </strong>
          ))}
          <p>Per-regime ceiling context only. Maximum values are never added together or counted as protected value.</p>
        </div>
      )}
      <div className="flab-register">
        <div className="flab-register-head"><span>Framework</span><span>Applicability</span><span>Exposure type</span></div>
        {exposure.frameworks.length ? exposure.frameworks.map((item) => (
          <details key={item.framework_id} className="flab-reg-row">
            <summary>
              <strong>{item.framework_name}</strong>
              <span className={`flab-applicability ${item.applicability.toLowerCase()}`}>{LABELS[item.applicability]}</span>
              <span>{item.exposure_types.join(" / ").replaceAll("_", " ")}</span>
            </summary>
            <div className="flab-reg-detail">
              <p>{item.applicability_reason}</p>
              <dl className="flab-kv">
                <div><dt>Triggering capabilities</dt><dd>{item.triggering_capabilities.join(", ") || "—"}</dd></div>
                <div><dt>Triggering steps</dt><dd>{item.triggering_steps.join(", ") || "Configured profile context"}</dd></div>
                <div><dt>Control areas</dt><dd>{item.obligation_categories.join("; ") || "—"}</dd></div>
                <div><dt>Profile version</dt><dd>{item.profile_version}</dd></div>
                <div><dt>Source verified</dt><dd>{item.source_last_verified}</dd></div>
              </dl>
              {item.calculation.available && item.calculation.maximum_context ? (
                <div className="flab-reg-calc">
                  <span>STATUTORY MAXIMUM CONTEXT</span>
                  <strong>{money(item.calculation.maximum_context.amount, item.calculation.maximum_context.currency)}</strong>
                  <p>{item.calculation.note}</p>
                </div>
              ) : (
                <div className="flab-reg-unavailable"><span>NO DETERMINISTIC STATUTORY MAXIMUM CALCULATED</span><p>{item.calculation.reason}</p></div>
              )}
              <a href={item.source.url} target="_blank" rel="noreferrer">Official source: {item.source.authority} · {item.source.reference}</a>
              <small>{item.disclaimer}</small>
            </div>
          </details>
        )) : <p className="flab-muted">No structured runtime capability matched a configured regulatory profile.</p>}
      </div>
      <p className="flab-reg-disclaimer">{exposure.disclaimer} This is technical context, not legal advice or compliance certification.</p>
    </section>
  );
}
