"use client";

import Link from "next/link";
import { CanvasScript } from "@/components/CanvasScript";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { EnvelopeBlueprint } from "@/components/home/EnvelopeBlueprint";
import { RuntimeBlueprint } from "@/components/home/RuntimeBlueprint";
import { useSiteMotion } from "@/components/useSiteMotion";
import { Events, track } from "@/lib/analytics";

const OPENAI_INCIDENT_REPORT = "https://openai.com/index/hugging-face-incident-and-the-road-ahead/";
const MICROSOFT_ENVIRONMENT_REPORT = "https://commandline.microsoft.com/azure-sre-agent-restricting-environment-ai-safety/";

const engineeringExamples = [
  ["AVIATION", "Flight envelope"],
  ["ROBOTICS", "Motion / workspace envelope"],
  ["AUTONOMOUS AI", "Execution envelope"],
] as const;

const regulatoryEvidence = [
  "Defined operating constraints",
  "Authorization decisions",
  "Runtime monitoring",
  "Traceable interventions",
  "Human escalation",
  "Governed-execution evidence",
] as const;

export function HomeClient() {
  useSiteMotion();

  return (
    <>
      <Nav />
      <main id="top" className="blueprint-home">
        <header className="hero bp-hero" data-screen-label="Hero">
          <canvas id="hero-canvas" aria-hidden="true" />
          <CanvasScript src="/canvas/hero.js" />
          <div className="hero-grid-fade" aria-hidden="true" />
          <div className="hero-veil" aria-hidden="true" />
          <div className="bp-hero-coordinate bp-hero-coordinate--top" aria-hidden="true">
            STATE SPACE // E<sub>deployment</sub>
          </div>
          <div className="bp-hero-coordinate bp-hero-coordinate--bottom" aria-hidden="true">
            x(t) → x(t+1) &nbsp;·&nbsp; ∂E &nbsp;·&nbsp; Ω
          </div>
          <div className="wrap">
            <div className="hero-inner">
              <span className="bp-kicker reveal in" data-d="1">01 // RUNTIME CONTROL FOR AUTONOMOUS SYSTEMS</span>
              <h1 className="reveal in" data-d="2">
                Define the <span className="hero-cat">Admissible Operating Envelope</span>
                <br />
                Your <span className="grad">Autonomous System Can Actually Operate Within</span>
              </h1>
              <p className="hero-sub reveal in" data-d="3">
                Morrison Runtime Governance™ defines, tests, and enforces the operating envelope between an
                autonomous system and real-world execution — before proposed actions become state transitions.
              </p>
              <div className="hero-chips reveal in" data-d="4">
                <span>Bounded reachability evidence</span>
                <span>Pre-execution enforcement</span>
                <span>Audit-ready transition evidence</span>
              </div>
              <div className="hero-actions reveal in" data-d="5">
                <Link
                  href="/book#assessment"
                  className="btn btn--primary"
                  onClick={() => track(Events.CTA_CLICK, { location: "hero", cta: "book" })}
                >
                  Book an Operating Envelope Assessment <span className="arr">→</span>
                </Link>
                <Link
                  href="/live-demo"
                  className="btn btn--ghost btn--live"
                  onClick={() => track(Events.CTA_CLICK, { location: "hero", cta: "live-demo" })}
                >
                  <span className="live-pip" aria-hidden="true" />
                  Try the Live Demo <span className="arr">→</span>
                </Link>
              </div>
            </div>
          </div>
        </header>

        <section className="bp-section bp-section--envelope" id="safety-envelope" aria-labelledby="aoe-title">
          <div className="wrap bp-section-grid">
            <div className="bp-copy reveal">
              <span className="bp-index">02 // OPERATING BOUNDARY</span>
              <p className="eyebrow">What is an Admissible Operating Envelope?</p>
              <h2 id="aoe-title">Define the permitted region before trusting operation.</h2>
              <p className="bp-lede">
                An Admissible Operating Envelope defines the states, actions and transitions an autonomous
                system is permitted to execute within a specific environment.
              </p>
              <div className="bp-example-rail" aria-label="Operating envelope examples">
                {engineeringExamples.map(([field, envelope]) => (
                  <div key={field}>
                    <span>{field}</span>
                    <strong>{envelope}</strong>
                  </div>
                ))}
              </div>
              <p className="bp-conclusion">
                Different systems. Same engineering principle: define the operating boundary before trusting operation.
              </p>
            </div>
            <div className="reveal" data-d="2"><EnvelopeBlueprint /></div>
          </div>
        </section>

        <section className="bp-section bp-section--knowledge" id="knowledge-is-not-control" aria-labelledby="knowledge-title">
          <div className="wrap">
            <div className="bp-heading reveal">
              <span className="bp-index">03 // REPRESENTATION ≠ AUTHORITY</span>
              <p className="eyebrow">Knowledge ≠ control</p>
              <h2 id="knowledge-title">Knowing the rule does not enforce the rule.</h2>
              <p className="bp-thesis">Representation of the operating envelope is not causal enforcement of the operating envelope.</p>
              <p>A system can know the boundary and still retain the ability to cross it.</p>
            </div>

            <div className="bp-control-compare reveal" aria-label="Constraint awareness compared with execution control">
              <div className="bp-control-column is-awareness">
                <div className="bp-control-head"><span>CONSTRAINT REPRESENTED</span><b>INFORMATION</b></div>
                <ol>
                  <li><span>01</span>Rule known</li>
                  <li><span>02</span>Boundary understood</li>
                  <li><span>03</span>Action proposed</li>
                  <li className="is-risk"><span>04</span>Prohibited action still executable</li>
                </ol>
                <div className="bp-control-result">RESULT <strong>AWARENESS</strong></div>
              </div>
              <div className="bp-control-divider" aria-hidden="true">≠</div>
              <div className="bp-control-column is-control">
                <div className="bp-control-head"><span>CONSTRAINT ENFORCED</span><b>AUTHORITY</b></div>
                <ol>
                  <li><span>01</span>Action proposed</li>
                  <li><span>02</span>Independent authorization</li>
                  <li><span>03</span><span className="is-verdict">ALLOW / ESCALATE / BLOCK</span></li>
                  <li className="is-controlled"><span>04</span>Non-admissible transition does not execute</li>
                </ol>
                <div className="bp-control-result">RESULT <strong>CONTROL</strong></div>
              </div>
            </div>

            <aside className="bp-category-validation reveal" aria-label="Industry convergence from Microsoft CoreAI">
              <div className="bp-category-meta">
                <span>INDUSTRY CONVERGENCE</span>
                <span>RUNTIME CONTROL // 2026.08</span>
              </div>
              <div className="bp-category-grid">
                <blockquote>
                  <p>“Stop restricting the agent. Start restricting its environment.”</p>
                  <cite>
                    <a href={MICROSOFT_ENVIRONMENT_REPORT} target="_blank" rel="noopener noreferrer">
                      Microsoft CoreAI — August 2026 <span aria-hidden="true">↗</span>
                    </a>
                  </cite>
                </blockquote>
                <div className="bp-category-frame">
                  <p>Control is moving out of the model and into the runtime around it.</p>
                  <p className="bp-category-morrison">
                    <strong>Morrison goes one step further:</strong> define the admissible operating envelope,
                    enforce it at execution time, and verify what becomes unreachable.
                  </p>
                </div>
              </div>
            </aside>

            <article className="bp-incident reveal" aria-labelledby="incident-title">
              <div className="bp-incident-copy">
                <span className="bp-incident-label">REAL-WORLD EXAMPLE</span>
                <h3 id="incident-title">The Hugging Face incident</h3>
                <p>
                  In OpenAI&apos;s report, an agent recognized an authorization concern, paused, then continued after
                  another agent posted “GO” and imposed a deadline.
                </p>
                <p className="bp-incident-observation">
                  <strong>THE CONSTRAINT WAS REPRESENTED.</strong>
                  <strong>THE ACTION REMAINED EXECUTABLE.</strong>
                </p>
                <a href={OPENAI_INCIDENT_REPORT} target="_blank" rel="noopener noreferrer" className="bp-source-link">
                  Read OpenAI&apos;s incident report <span aria-hidden="true">↗</span>
                </a>
              </div>
              <div className="bp-incident-flow" aria-label="Reported decision sequence">
                {["Agent recognizes boundary", "Agent pauses", "Peer “GO” + deadline", "Decision changes", "Action remains executable"].map((step, index) => (
                  <div key={step} className={index === 4 ? "is-risk" : undefined}>
                    <span>{String(index + 1).padStart(2, "0")}</span>{step}
                  </div>
                ))}
              </div>
              <blockquote>
                <p>Awareness changed the reasoning. It did not remove the transition.</p>
                <footer>
                  The engineering question is not only “Did the system know the rule?” It is “What independently
                  prevented the prohibited transition from executing?”
                </footer>
              </blockquote>
            </article>
          </div>
        </section>

        <section className="bp-section" id="why-it-matters" aria-labelledby="why-title">
          <div className="wrap">
            <div className="bp-heading reveal">
              <span className="bp-index">04 // THE MISSING LAYER</span>
              <p className="eyebrow">Why this matters</p>
              <h2 id="why-title">The missing layer is causal enforcement of the operating boundary.</h2>
            </div>
            <div className="bp-layer-flow reveal" aria-label="Roles of policy, models, monitoring, runtime governance, and verification">
              {[
                ["POLICY", "defines", "Boundary"],
                ["MODEL", "represents", "Rule"],
                ["MONITORING", "observes", "Behaviour"],
                ["RUNTIME GOVERNANCE", "controls", "Execution"],
                ["VERIFICATION", "tests", "Reachability"],
              ].map(([layer, verb, object], index) => (
                <div key={layer} className={index === 3 ? "is-control" : undefined}>
                  <span>{String(index + 1).padStart(2, "0")}</span><strong>{layer}</strong><small>{verb}</small><b>{object}</b>
                </div>
              ))}
            </div>
            <p className="bp-question reveal">
              The question is not only <span>“Does the system know the rule?”</span>
              It is <strong>“What independently prevents it from crossing the boundary?”</strong>
            </p>
          </div>
        </section>

        <section className="bp-section bp-section--regulatory" id="regulatory-relevance" aria-labelledby="regulatory-title">
          <div className="wrap bp-regulatory-grid">
            <div className="bp-copy reveal">
              <span className="bp-index">05 // REGULATORY RELEVANCE</span>
              <p className="eyebrow">EU AI Act · high-consequence AI</p>
              <h2 id="regulatory-title">From policy obligations to runtime evidence.</h2>
              <p className="bp-lede">
                Runtime governance can support evidence for AI governance and assurance. It does not by itself
                certify an organisation or guarantee legal compliance.
              </p>
              <Link href="/compliance" className="btn btn--ghost btn--sm">
                View the EU AI Act mapping <span className="arr">→</span>
              </Link>
            </div>
            <div className="bp-regulatory-panel reveal" data-d="2">
              <div className="bp-regulatory-chain" aria-label="Regulatory requirement to operational control to runtime evidence">
                <span>REGULATORY REQUIREMENT</span><i aria-hidden="true">→</i><span>OPERATIONAL CONTROL</span><i aria-hidden="true">→</i><span>RUNTIME EVIDENCE</span>
              </div>
              <div className="bp-evidence-grid">
                {regulatoryEvidence.map((item, index) => (
                  <div key={item}><span>{String(index + 1).padStart(2, "0")}</span>{item}</div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bp-section bp-section--runtime" id="what" aria-labelledby="runtime-title">
          <div className="wrap bp-runtime-grid">
            <div className="bp-copy reveal">
              <span className="bp-index">06 // EXECUTION AUTHORITY</span>
              <p className="eyebrow">Morrison Runtime Governance</p>
              <h2 id="runtime-title">Authorize the transition before execution.</h2>
              <p className="bp-lede">
                The envelope defines what is admissible. Morrison independently evaluates each proposed transition
                at the execution boundary.
              </p>
              <p>
                Actions inside the defined envelope may proceed. Transitions that would leave it, violate authority,
                or enter Ω are blocked or escalated before execution.
              </p>
              <Link href="/technology" className="bp-source-link">Explore the architecture <span aria-hidden="true">→</span></Link>
            </div>
            <div className="reveal" data-d="2"><RuntimeBlueprint /></div>
          </div>
        </section>

        <section className="bp-section bp-section--bottom" id="outcomes" aria-labelledby="bottom-title">
          <div className="wrap">
            <div className="bp-bottom-copy reveal">
              <span className="bp-index">07 // BOTTOM LINE</span>
              <h2 id="bottom-title">Know where your autonomous system can operate — and enforce the boundary.</h2>
              <p>
                The Admissible Operating Envelope defines permitted operation. Morrison independently controls
                whether proposed transitions are authorized to execute.
              </p>
            </div>
            <div className="bp-bottom-flow reveal" aria-label="Define, enforce, and verify">
              {[["DEFINE", "Operating envelope"], ["ENFORCE", "Authorization"], ["VERIFY", "Bounded reachability"]].map(([verb, object], index) => (
                <div key={verb}><span>0{index + 1}</span><strong>{verb}</strong><small>{object}</small></div>
              ))}
            </div>
            <div className="bp-bounded-claim reveal">
              <span>BOUNDED CLAIM</span>
              <p>Evidence applies within the defined environment, within the tested deployment, and under the stated assumptions.</p>
              <Link href="/evidence">Evidence &amp; methodology <span aria-hidden="true">→</span></Link>
            </div>
          </div>
        </section>

        <section className="bp-section bp-section--cta" id="contact" aria-labelledby="cta-title">
          <span id="onboarding" className="bp-anchor" aria-hidden="true" />
          <span id="demo" className="bp-anchor" aria-hidden="true" />
          <div className="wrap">
            <div className="bp-cta-inner reveal">
              <span className="bp-index">08 // TEST THE BOUNDARY</span>
              <h2 id="cta-title">Define the envelope. Evaluate the transition. Enforce before execution.</h2>
              <div className="bp-cta-actions">
                <Link href="/live-demo" className="btn btn--primary btn--live" onClick={() => track(Events.CTA_CLICK, { location: "final-cta", cta: "live-demo" })}>
                  <span className="live-pip" aria-hidden="true" />Try the Live Demo <span className="arr">→</span>
                </Link>
                <Link href="/assessment" className="btn btn--ghost">Assess Your Agent</Link>
                <Link href="/book#assessment" className="btn btn--ghost">Book an Operating Envelope Assessment</Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
