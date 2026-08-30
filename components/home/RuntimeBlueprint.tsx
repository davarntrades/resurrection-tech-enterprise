export function RuntimeBlueprint() {
  return (
    <figure className="bp-runtime" aria-labelledby="bp-runtime-title bp-runtime-desc">
      <figcaption className="sr-only">
        <span id="bp-runtime-title">Morrison Runtime Governance execution architecture</span>
        <span id="bp-runtime-desc">
          An autonomous system proposes a transition. Morrison independently authorizes it as allow,
          escalate, or block. Only allowed transitions execute against the real system, and every decision
          produces evidence.
        </span>
      </figcaption>

      <div className="bp-runtime-envelope" aria-hidden="true">
        <span>ADMISSIBLE OPERATING ENVELOPE</span>
        <small>DEFINED BY ENVIRONMENT · POLICY · AUTHORITY</small>
      </div>

      <div className="bp-runtime-node">
        <span className="bp-runtime-id">01 · PROPOSAL</span>
        <strong>AUTONOMOUS SYSTEM</strong>
        <small>Models · Agents · Planners</small>
      </div>
      <div className="bp-runtime-link"><span>PROPOSED TRANSITION</span></div>
      <div className="bp-runtime-node bp-runtime-node--gate">
        <span className="bp-runtime-id">02 · PRE-EXECUTION AUTHORITY</span>
        <strong>MORRISON RUNTIME GOVERNANCE™</strong>
        <small>Independent authorization at the execution boundary</small>
      </div>
      <div className="bp-runtime-verdicts" aria-label="Authorization outcomes">
        <span className="is-allow">ALLOW</span>
        <span className="is-escalate">ESCALATE</span>
        <span className="is-block">BLOCK</span>
      </div>
      <div className="bp-runtime-split" aria-hidden="true"><span /><span /><span /></div>
      <div className="bp-runtime-outcomes">
        <div>
          <span className="bp-runtime-id">03 · AUTHORIZED</span>
          <strong>EXECUTION</strong>
          <small>Real system</small>
        </div>
        <div className="is-stopped">
          <span className="bp-runtime-id">03 · NOT AUTHORIZED</span>
          <strong>STOP / REVIEW</strong>
          <small>No execution</small>
        </div>
      </div>
      <div className="bp-runtime-evidence">
        <span>04 · EVIDENCE</span>
        <strong>Verdict · rationale · policy · trajectory · timestamp</strong>
      </div>
    </figure>
  );
}
