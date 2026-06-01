import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Evidence & Methodology",
  description:
    "How Morrison Runtime Governance is evaluated: benchmark counts, methodology, scope and limitations, reproducibility, and patent status. Written for independent technical review.",
  alternates: { canonical: "/evidence" },
};

export default function Page() {
  return (
    <PageShell>
      <section className="section section--tight tp" aria-label="Evidence and methodology">
        <div className="wrap">
          <span className="eyebrow">Due-diligence</span>
          <h1>Evidence &amp; Methodology</h1>
          <p className="tp-lede">
            What was tested, how it was tested, what the numbers mean — and, just as
            importantly, what they do not mean. Written so a technical reviewer can assess the
            claims independently rather than take them on trust.
          </p>

          {/* Evaluation summary */}
          <div className="tp-block">
            <h2>Evaluation summary</h2>
            <p className="tp-sub">
              Figures below are from Resurrection Tech&rsquo;s internal governance benchmark. They
              describe performance on defined test suites, not a universal guarantee (see Scope &amp;
              limitations).
            </p>
            <div className="tp-stats">
              <div className="tp-stat"><div className="v">129,857+</div><div className="l">Governed evaluations across model architectures</div></div>
              <div className="tp-stat"><div className="v">171/171</div><div className="l">Test cases passed across coverage scenarios</div></div>
              <div className="tp-stat"><div className="v">16/16</div><div className="l">Multi-agent / collusion evaluations passed</div></div>
              <div className="tp-stat"><div className="v">0.0%</div><div className="l">False positives on the governed test suite</div></div>
              <div className="tp-stat"><div className="v">0.0%</div><div className="l">False negatives on the governed test suite</div></div>
            </div>
            <div className="tp-grid" style={{ marginTop: 14 }}>
              <div className="tp-card">
                <span className="k">Tested models</span>
                <p>GPT, Claude, Gemini, Llama, and Mistral architectures — governance operates at the execution boundary, independent of the model.</p>
              </div>
              <div className="tp-card">
                <span className="k">Tested domains</span>
                <p>Finance / banking, healthcare / PHI, cybersecurity / credentials, and data privacy / GDPR, each with domain-specific Ω definitions.</p>
              </div>
              <div className="tp-card">
                <span className="k">Evaluation hierarchy</span>
                <p>V1 — single-step forbidden actions. V2 — multi-step source→sink trajectories, including cross-agent chains. Evaluated before execution.</p>
              </div>
            </div>
          </div>

          {/* Methodology */}
          <div className="tp-block tp-prose">
            <h2>Methodology</h2>
            <p>
              <b>Deterministic evaluation.</b> Governance verdicts are produced by deterministic
              evaluation of a proposed trajectory against a defined forbidden set Ω — not by a
              probabilistic model judging its own output. The same trajectory and the same Ω
              produce the same verdict.
            </p>
            <p>
              <b>Trajectory evaluation.</b> The unit of evaluation is the proposed sequence of
              actions (tool calls and their arguments), not the natural-language output of a model.
              The evaluator reasons about the states an action chain can reach.
            </p>
            <p>
              <b>Pre-execution enforcement.</b> Evaluation happens at the execution boundary,
              before any action runs. A trajectory that would reach Ω is intercepted; it is not
              detected after the fact.
            </p>
            <p>
              <b>Domain-specific Ω definitions.</b> The forbidden set is defined per domain — an
              unauthorised transfer in banking, PHI exfiltration in healthcare, a GDPR boundary
              violation in data privacy. The benchmark exercises each domain&rsquo;s Ω.
            </p>
            <div className="tp-todo">
              <b>Owner action:</b> link or attach the full written benchmark methodology (test-suite
              construction, scenario derivation, Ω definitions per domain) here, or note that it is
              available under NDA. This page describes the principles; reviewers will ask for the
              detailed protocol.
            </div>
          </div>

          {/* Scope & limitations */}
          <div className="tp-block">
            <h2>Scope &amp; limitations</h2>
            <p className="tp-sub">Stated plainly. These results are bounded; we do not present them as more than they are.</p>
            <div className="tp-note">
              <span className="k">What these results do NOT mean</span>
              <ul>
                <li>The metrics describe performance on <b>defined internal test suites</b>, not every possible input. &ldquo;Zero false negatives&rdquo; is scoped to the governed benchmark, not a universal guarantee of safety.</li>
                <li>Results were produced in <b>bounded evaluation environments</b>, not yet under independent third-party audit.</li>
                <li>The <Link href="/test-trajectory">public demo</Link> is a limited heuristic — it is <b>not</b> the evaluator behind these numbers, and trajectories it has no rule for return INCONCLUSIVE.</li>
                <li>Domain coverage reflects the sectors listed above; other domains require their own Ω definition and validation.</li>
              </ul>
            </div>
            <div className="tp-note" style={{ marginTop: 12 }}>
              <span className="k">Future validation work</span>
              <ul>
                <li>Independent third-party benchmark audit.</li>
                <li>A public reference verifier and reproducible benchmark (see Reproducibility).</li>
                <li>Expanded domain coverage and adversarial red-team evaluation.</li>
              </ul>
            </div>
          </div>

          {/* Reproducibility */}
          <div className="tp-block tp-prose">
            <h2>Reproducibility</h2>
            <p>
              We treat independent verification as the point, not a threat. The core governance
              repository is referenced below; a public reference verifier and a published benchmark
              with a signed report are in preparation so reviewers can reproduce the headline
              numbers themselves rather than take them on trust.
            </p>
            <div className="tp-facts">
              <div><dt>Core governance repository</dt><dd><a href="https://github.com/davarntrades/Morrison-Runtime-Governance">github.com/davarntrades/Morrison-Runtime-Governance</a></dd></div>
              <div><dt>Public reference verifier</dt><dd>In preparation</dd></div>
              <div><dt>Published benchmark + signed report</dt><dd>In preparation</dd></div>
            </div>
            <div className="tp-todo">
              <b>Owner action:</b> confirm the core repository is public and contains a runnable
              benchmark, or mark it private/under-NDA. Do not imply a public, runnable benchmark
              exists until it does — this is the single highest-leverage trust artifact to ship next.
            </div>
          </div>

          {/* Patent status */}
          <div className="tp-block">
            <h2>Patent status</h2>
            <p className="tp-sub">Stated precisely, with no ambiguity between filed, pending, and granted.</p>
            <div className="tp-facts">
              <div><dt>Application number</dt><dd>{SITE.patent}</dd></div>
              <div><dt>Jurisdiction</dt><dd>United Kingdom — UK Intellectual Property Office (UKIPO)</dd></div>
              <div><dt>Current status</dt><dd><span className="tp-pill warn">Confirm on UKIPO register</span></dd></div>
            </div>
            <div className="tp-todo">
              <b>Owner action — material claim:</b> state the exact current status (filed / published
              / pending grant / granted) as it appears on the UKIPO public register, and replace the
              placeholder above. Do not describe the application as &ldquo;granted&rdquo; unless the
              register confirms grant — incorrect patent marking is a legal exposure and the first
              thing a due-diligence reviewer checks.
            </div>
          </div>

          <div className="tp-cta">
            <Link href="/book#assessment" className="btn btn--primary">Book a Runtime Safety Assessment <span className="arr">→</span></Link>
            <Link href="/security" className="btn btn--ghost">Security &amp; deployment</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
