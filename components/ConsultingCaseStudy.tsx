/**
 * Reusable enterprise consulting-style case-study format (Deloitte / PwC /
 * McKinsey / Accenture register). Fill the props per customer engagement.
 * No client JS — pure presentation.
 */
export interface ConsultingCaseStudyProps {
  organisation: string;
  industry: string;
  systems: string[];
  problem: string;
  assessment: string;
  findings: string[];
  governanceActions: string[];
  outcome: string;
  executiveSummary: string;
  illustrative?: boolean;
}

export function ConsultingCaseStudy(props: ConsultingCaseStudyProps) {
  const { organisation, industry, systems, problem, assessment, findings, governanceActions, outcome, executiveSummary, illustrative } = props;
  return (
    <article className="ccs reveal">
      <div className="ccs-head">
        <div className="ccs-meta">
          <div><span className="ccs-k">Organisation</span><span className="ccs-v">{organisation}</span></div>
          <div><span className="ccs-k">Industry</span><span className="ccs-v">{industry}</span></div>
          <div>
            <span className="ccs-k">Autonomous Systems Used</span>
            <span className="ccs-tags">{systems.map((s) => <span className="ccs-tag" key={s}>{s}</span>)}</span>
          </div>
        </div>
        {illustrative && <span className="ccs-illus">Illustrative</span>}
      </div>

      <div className="ccs-body">
        <section className="ccs-sec">
          <h4>Problem</h4>
          <p className="ccs-q">What risks existed before engagement?</p>
          <p>{problem}</p>
        </section>
        <section className="ccs-sec">
          <h4>Assessment</h4>
          <p className="ccs-q">What trajectories and reachable failure states were evaluated?</p>
          <p>{assessment}</p>
        </section>
        <section className="ccs-sec">
          <h4>Findings</h4>
          <p className="ccs-q">What unsafe paths were discovered?</p>
          <ul>{findings.map((f) => <li key={f}>{f}</li>)}</ul>
        </section>
        <section className="ccs-sec">
          <h4>Governance Actions</h4>
          <p className="ccs-q">What constraints were implemented?</p>
          <ul>{governanceActions.map((g) => <li key={g}>{g}</li>)}</ul>
        </section>
        <section className="ccs-sec">
          <h4>Outcome</h4>
          <p className="ccs-q">What risk exposure was reduced?</p>
          <p>{outcome}</p>
        </section>
        <section className="ccs-sec ccs-exec">
          <h4>Executive Summary</h4>
          <p className="ccs-q">What would have happened if the issue had remained undiscovered?</p>
          <p>{executiveSummary}</p>
        </section>
      </div>
    </article>
  );
}
