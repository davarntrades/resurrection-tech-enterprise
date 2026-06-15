import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { ConsultingCaseStudy } from "@/components/ConsultingCaseStudy";

export const metadata: Metadata = {
  title: "Evidence & Case Studies",
  description:
    "Independent validation, runtime enforcement results, deployment outcomes, and governance evaluations for Morrison Runtime Governance™.",
  alternates: { canonical: "/case-studies" },
};

type Metric = { v: string; l: string };

function CaseStudy(props: {
  n: string;
  title: string;
  headline: string;
  status?: string;
  metrics?: Metric[];
  tagLabel?: string;
  tags?: string[];
  insight?: string;
  problem?: string;
  risk?: string;
  approach?: string[];
  results?: string[];
  resultsLabel?: string;
  note?: string;
  cta?: { href: string; label: string };
}) {
  const { n, title, headline, status, metrics, tagLabel, tags, insight, problem, risk, approach, results, resultsLabel, note, cta } = props;
  return (
    <article className="cs-card reveal">
      <div className="cs-card-head">
        <span className="cs-n">Case Study {n}</span>
        {status && <span className="cs-status">{status}</span>}
      </div>
      <h2 className="cs-title">{title}</h2>
      <div className="cs-headline">{headline}</div>

      {metrics && (
        <div className="cs-metrics">
          {metrics.map((m) => (
            <div className="cs-metric" key={m.l}>
              <span className="cs-metric-v">{m.v}</span>
              <span className="cs-metric-l">{m.l}</span>
            </div>
          ))}
        </div>
      )}

      {tags && (
        <div className="cs-tags">
          {tagLabel && <span className="cs-tags-k">{tagLabel}</span>}
          <div className="cs-tags-row">
            {tags.map((t) => <span className="cs-tag" key={t}>{t}</span>)}
          </div>
        </div>
      )}

      {insight && (
        <div className="cs-insight">
          <span className="cs-insight-k">Key insight</span>
          <p>{insight}</p>
        </div>
      )}

      {(problem || risk || approach || results) && (
        <details className="cs-details">
          <summary>Read the full case study</summary>
          <div className="cs-details-body">
            {problem && (<div className="cs-block"><span className="cs-block-k">Problem</span><p>{problem}</p></div>)}
            {risk && (<div className="cs-block"><span className="cs-block-k">Risk</span><p>{risk}</p></div>)}
            {approach && (
              <div className="cs-block"><span className="cs-block-k">Approach</span>
                <ul>{approach.map((a) => <li key={a}>{a}</li>)}</ul>
              </div>
            )}
            {results && (
              <div className="cs-block"><span className="cs-block-k">{resultsLabel ?? "Results"}</span>
                <ul>{results.map((r) => <li key={r}>{r}</li>)}</ul>
              </div>
            )}
            {note && <p className="cs-note">{note}</p>}
          </div>
        </details>
      )}

      {cta && (
        <div className="cs-cta">
          <Link href={cta.href} className="btn btn--ghost btn--sm">{cta.label} <span className="arr">→</span></Link>
        </div>
      )}
    </article>
  );
}

export default function Page() {
  return (
    <PageShell>
      <section className="section section--tight cs" aria-label="Evidence and case studies">
        <div className="wrap">
          <span className="eyebrow">Evidence</span>
          <h1 className="cs-h1">Evidence &amp; Case Studies</h1>
          <p className="cs-sub">
            Independent validation, runtime enforcement results, deployment outcomes, and governance
            evaluations.
          </p>

          <div className="cs-opening reveal">
            <p className="cs-opening-lead">Claims are easy. Evidence matters.</p>
            <p>
              The following case studies document the development, evaluation, deployment, and
              validation of Morrison Runtime Governance™ across multiple models, environments, and
              risk domains.
            </p>
          </div>

          {/* Evidence journey timeline */}
          <div className="cs-timeline reveal" aria-label="Evidence journey">
            {[
              ["01", "Stress test", "100,000 scenarios"],
              ["02", "Cross-model", "Architecture-independent"],
              ["03", "Live enforcement", "100 / 100 passed"],
              ["04", "Pilot pathway", "Illustrative deployment"],
              ["05", "Open-weight", "Live model governance"],
            ].map(([n, h, p]) => (
              <div className="cs-tl-step" key={n}>
                <span className="cs-tl-dot" aria-hidden="true" />
                <span className="cs-tl-n">{n}</span>
                <span className="cs-tl-h">{h}</span>
                <span className="cs-tl-p">{p}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--tight cs" aria-label="Case studies">
        <div className="wrap cs-list">
          <CaseStudy
            n="01"
            title="100,000 Scenario Runtime Governance Stress Test"
            headline="100,000 Evaluations · 0 False Positives · 0 False Negatives"
            metrics={[
              { v: "100,000", l: "Evaluated scenarios" },
              { v: "0", l: "False positives" },
              { v: "0", l: "False negatives" },
            ]}
            insight="Safety was enforced as a property of reachable trajectories rather than generated outputs."
            problem="Traditional AI safety approaches focus on outputs rather than reachable execution states."
            approach={["Runtime governance layer enforcing forbidden-state constraints before execution."]}
            results={["100,000 evaluated scenarios", "0 false positives", "0 false negatives", "Cross-domain validation", "Deterministic replay"]}
            cta={{ href: "/evidence", label: "View technical evidence" }}
          />

          <CaseStudy
            n="02"
            title="Cross-Model Validation"
            headline="Governance independent of model architecture"
            tagLabel="Models"
            tags={["GPT-4o", "Qwen 2.5", "Llama 3.1", "Additional open-weight planners"]}
            insight="Safety should not depend on model weights."
            problem="Most safety approaches are tied to a specific model."
            approach={["Keep the planner untrusted.", "Governance layer evaluates proposed actions before execution."]}
            results={["Consistent permit / block behaviour across models."]}
          />

          <CaseStudy
            n="03"
            title="Live Planner + Runtime Enforcement"
            headline="100 / 100 Passed"
            metrics={[
              { v: "100 / 100", l: "Scenarios passed" },
              { v: "100%", l: "Accuracy" },
              { v: "0", l: "Observed regressions" },
            ]}
            tagLabel="Domains"
            tags={["Finance", "FinTech", "Cybersecurity", "Healthcare", "Enterprise Systems", "Data Privacy"]}
            results={["100% accuracy", "Unsafe trajectories blocked", "Safe trajectories executed", "No observed regressions"]}
          />

          <CaseStudy
            n="04"
            title="Limited Pilot Example"
            headline="Illustrative enterprise deployment pathway"
            status="Illustrative Enterprise Scenario"
            problem="Enterprise deploying autonomous agents into production environments."
            risk="Unauthorized actions become reachable."
            approach={["Define forbidden states.", "Deploy runtime governance.", "Monitor admissible execution paths."]}
            resultsLabel="Expected outcomes"
            results={["Reduced operational risk", "Increased deployment confidence", "Governance visibility", "Auditable enforcement"]}
            note="This example illustrates a typical deployment pathway."
          />

          <CaseStudy
            n="05"
            title="Live Open-Weight Governance Validation"
            headline="Live Hugging Face Models Governed Successfully"
            tagLabel="Models"
            tags={["Qwen 2.5-7B", "TinyLlama", "Phi"]}
            results={["Live GPU execution", "Real planner outputs", "Runtime enforcement active", "Cross-model consistency observed"]}
          />
        </div>
      </section>

      <section className="section section--tight cs" aria-label="Structured case-study format">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Engagement format</span>
            <h2>Structured Case-Study Format</h2>
            <p>The format used to document customer engagements — enterprise consulting style. The example below is illustrative.</p>
          </div>
          <ConsultingCaseStudy
            illustrative
            organisation="Tier-1 European Bank"
            industry="Banking & Capital Markets"
            systems={["Treasury-operations agent", "Reconciliation agent", "Customer-service agent"]}
            problem="Autonomous agents executed payments and data operations without a human in the loop. Existing controls — RBAC, post-hoc transaction monitoring, and human sampling — reduced likelihood but left catastrophic states reachable."
            assessment="Runtime Governance evaluated each agent's proposed trajectories at the execution boundary, projecting the reachable future states of every action chain across treasury, reconciliation, and customer-data workflows."
            findings={[
              "Unverified-destination transfers were reachable from normal operation (Ω: unauthorized_transfer).",
              "Limit breaches without approval were admissible (Ω: limit_breach).",
              "Customer-data reads could egress to external sinks (Ω: data_exfiltration).",
            ]}
            governanceActions={[
              "Defined Ω for treasury operations.",
              "Placed runtime governance at each agent's tool-call boundary.",
              "Enforced verified-destination and approval invariants on all transfers.",
              "Restricted customer-data reads to internal sinks; denied external egress.",
            ]}
            outcome="The three reachable catastrophic states were made unreachable by construction. Legitimate operations executed unchanged; only Ω-bound trajectories were intercepted, each producing a regulator-ready audit record."
            executiveSummary="Had the unverified-transfer path remained undiscovered, a single unauthorised transfer carried multi-billion-pound exposure and FCA / AML liability. The engagement removed that reachable path before it could become a business event."
          />
        </div>
      </section>

      <section className="section section--tight cs" aria-label="Why this matters">
        <div className="wrap">
          <div className="cs-why reveal">
            <span className="eyebrow">Why this matters</span>
            <p>Enterprise AI adoption is accelerating.</p>
            <p>The challenge is no longer generating intelligent behaviour.</p>
            <p>The challenge is preventing catastrophic reachable outcomes before execution.</p>
            <p>These case studies document a different approach:</p>
            <p className="cs-why-strong">Runtime Governance™.</p>
          </div>
          <div className="cs-foot-cta reveal">
            <Link href="/book#assessment" className="btn btn--primary">Book a Runtime Safety Assessment <span className="arr">→</span></Link>
            <Link href="/evidence" className="btn btn--ghost">Evidence &amp; methodology</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
