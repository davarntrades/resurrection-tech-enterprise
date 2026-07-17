"use client";

import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { CanvasScript } from "@/components/CanvasScript";
import { RuntimeGovernanceDemo } from "@/components/RuntimeGovernanceDemo";
import { useSiteMotion } from "@/components/useSiteMotion";
import { track, Events } from "@/lib/analytics";

const ArrowR = () => (
  <svg width="28" height="14" viewBox="0 0 28 14" fill="none">
    <path d="M0 7 H24 M19 2 L25 7 L19 12" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

export function HomeClient() {
  useSiteMotion();

  return (
    <>
      <Nav />
      <main id="top">
        {/* ===== 1 · HERO — one message, two actions ===== */}
        <header className="hero" data-screen-label="Hero">
          <canvas id="hero-canvas" aria-hidden="true" />
          <CanvasScript src="/canvas/hero.js" />
          <div className="hero-grid-fade" aria-hidden="true" />
          <div className="hero-veil" aria-hidden="true" />
          <div className="wrap">
            <div className="hero-inner">
              <h1 className="reveal in" data-d="1">
                Preventing <span className="hero-cat">Catastrophic</span> Outcomes
                <br />
                in <span className="grad">Autonomous Systems</span>
              </h1>
              <p className="hero-sub reveal in" data-d="2">
                Runtime Governance is the enforcement layer between your AI agents and your
                systems — every action is evaluated <b>before it executes</b>.
              </p>
              <div className="hero-chips reveal in" data-d="3">
                <span>Prevents unsafe actions before execution</span>
                <span>Works across your existing stack</span>
                <span>Audit-ready governance</span>
              </div>
              <div className="hero-actions reveal in" data-d="4">
                <Link
                  href="/book#assessment"
                  className="btn btn--primary"
                  onClick={() => track(Events.CTA_CLICK, { location: "hero", cta: "book" })}
                >
                  Book a Runtime Safety Assessment <span className="arr">→</span>
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
              <div className="hero-demo-hint reveal in" data-d="5">
                Live demo runs in seconds, no signup — or{" "}
                <Link
                  href="/assessment"
                  onClick={() => track(Events.CTA_CLICK, { location: "hero-hint", cta: "assess" })}
                >
                  assess your agent free
                </Link>
                .
              </div>
            </div>
          </div>
        </header>

        {/* ===== 2 · PROOF STRIP — one canonical validation section ===== */}
        <section className="metrics glow-top" id="validation" aria-label="Validation benchmarks">
          <div className="wrap">
            <Link
              href="/enterprise#performance"
              className="latency-banner reveal"
              aria-label="See the measured latency benchmarks on the Enterprise Readiness page"
            >
              <span className="lb-main">
                <span className="lb-eyebrow">Measured performance</span>
                <span className="lb-head">Microsecond-scale governance evaluation</span>
                <span className="lb-sub">
                  Typical governance evaluation latency ≈ <b>0.1&nbsp;ms</b>, with observed
                  deployed evaluations up to ≈ <b>0.4&nbsp;ms</b> — sub-millisecond, before any
                  action runs.
                </span>
              </span>
              <span className="lb-cta">See the benchmarks <span className="arr">→</span></span>
            </Link>
            <div className="metrics-head reveal">
              <span>Governance validation benchmark</span>
              <span className="ln" />
              <span>Patent GB2600765.8 · Cross-model · pre-execution</span>
            </div>
            <div className="metrics-grid">
              <div className="metric reveal">
                <div className="mval">
                  <span className="count" data-count="129857" data-suffix="+">0</span>
                </div>
                <div className="mlabel">Governed evaluations</div>
              </div>
              <div className="metric reveal" data-d="1">
                <div className="mval">
                  <span className="count" data-count="171">0</span> / 171
                </div>
                <div className="mlabel">Test cases passed</div>
              </div>
              <div className="metric zero reveal" data-d="2">
                <div className="mval"><span className="count" data-count="0">0</span></div>
                <div className="mlabel">False positives</div>
              </div>
              <div className="metric zero reveal" data-d="3">
                <div className="mval"><span className="count" data-count="0">0</span></div>
                <div className="mlabel">False negatives</div>
              </div>
              <div className="metric reveal" data-d="4">
                <div className="mval">
                  <span className="count" data-count="16">0</span> / 16
                </div>
                <div className="mlabel">Multi-agent evaluations</div>
              </div>
              <div className="metric reveal" data-d="5">
                <div className="mval" style={{ fontSize: "clamp(20px,2vw,26px)" }}>Cross-Model</div>
                <div className="mlabel">GPT · Claude · Gemini · Llama · Mistral</div>
              </div>
            </div>
            <div className="demo-cta reveal">
              <span>Reproducible methodology, scope, and limitations — published for independent review</span>
              <Link href="/evidence" className="btn btn--ghost btn--sm">
                Evidence &amp; methodology <span className="arr">→</span>
              </Link>
            </div>
          </div>
        </section>

        {/* ===== 3 · WHAT RUNTIME GOVERNANCE IS — the canonical stack diagram ===== */}
        <section className="section section--tight" id="what" aria-label="What Runtime Governance is">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">What Runtime Governance is</span>
              <h2>Most safety reacts. Governance prevents.</h2>
              <p>
                A universal governance layer at the execution boundary between your AI systems and
                your infrastructure. It does not depend on model weights, architectures, providers,
                or training methods — every proposed action is evaluated before it runs, and
                Ω-bound trajectories are blocked pre-execution. You do not rebuild your AI stack.
              </p>
            </div>

            <div className="mw-agnostic reveal" aria-label="Agnostic across the stack">
              {[
                "Provider-agnostic",
                "Model-agnostic",
                "Agent-framework agnostic",
                "Deployment-agnostic",
                "Third-party compatible",
                "Future-model compatible",
              ].map((t) => (
                <span key={t} className="mw-ag"><span className="mw-ag-dot" aria-hidden="true" />{t}</span>
              ))}
            </div>

            <div className="mw-arch reveal">
              <div className="mw-layer mw-models">
                <div className="mw-layer-label">Any provider · model · agent · system</div>
                <div className="mw-model-chips">
                  {["OpenAI", "Anthropic", "Google", "Meta", "DeepSeek", "Qwen", "Microsoft Phi", "Mistral", "Grok", "Custom Models", "Third-Party Agents", "Internal Systems"].map((m) => (
                    <span key={m} className="mw-chip">{m}</span>
                  ))}
                </div>
              </div>
              <div className="mw-arrow" aria-hidden="true">
                <div className="mw-arrow-line" />
                <div className="mw-arrow-cap">↓ every transition evaluated</div>
              </div>
              <div className="mw-layer mw-gov">
                <div className="mw-gov-inner">
                  <span className="mw-omega">Ω</span>
                  <div>
                    <div className="mw-gov-kicker">Runtime Governance Layer</div>
                    <div className="mw-gov-title">Morrison Runtime Governance<span className="tm">™</span></div>
                    <div className="mw-gov-sub">Trajectory evaluation · Boundary enforcement · Pre-execution interception</div>
                  </div>
                </div>
              </div>
              <div className="mw-arrow" aria-hidden="true">
                <div className="mw-arrow-line" />
                <div className="mw-arrow-cap">↓ only safe actions reach your systems</div>
              </div>
              <div className="mw-layer mw-system">
                <div className="mw-layer-label">Protected enterprise systems &amp; data</div>
                <div className="mw-model-chips">
                  {["Customer Data", "CRM Systems", "Banking APIs", "Email Systems", "Cloud Infrastructure", "Internal Tools", "Databases", "Autonomous Workflows"].map((a) => (
                    <span key={a} className="mw-chip mw-asset">{a}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mw-note reveal">
              <div className="mwn-row">
                <span className="mwn-dot safe" />
                <span>Safe actions pass through to your systems, unchanged</span>
              </div>
              <div className="mwn-row">
                <span className="mwn-dot blocked" />
                <span>Ω-bound actions are blocked pre-execution — regardless of model, agent, or where they originated</span>
              </div>
            </div>

            <div className="demo-cta reveal">
              <span>Models will change. The governance layer at the execution boundary does not.</span>
              <Link href="/integrations" className="btn btn--ghost btn--sm">
                How it integrates <span className="arr">→</span>
              </Link>
              <Link href="/technology" className="btn btn--ghost btn--sm">
                Explore the technology <span className="arr">→</span>
              </Link>
            </div>
          </div>
        </section>

        <hr className="divider" />

        {/* ===== 4 · BUSINESS OUTCOMES — what it prevents, what you get ===== */}
        <section className="section section--tight outcomes" id="outcomes" aria-label="What it prevents and what you get">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">The bottom line</span>
              <h2>What it prevents, and what you get.</h2>
              <p>
                Runtime Governance sits between your AI agents and your live systems, blocking the
                action chains that lead to catastrophic outcomes — before they execute.
              </p>
            </div>
            <div className="outcomes-grid">
              <div className="outcomes-col reveal is-prevents">
                <div className="outcomes-h"><span className="outcomes-dot block" aria-hidden="true" />What it prevents</div>
                <ul>
                  {[
                    "Unauthorised funds transfers",
                    "Customer-data exfiltration",
                    "Privilege escalation across internal tools",
                    "Regulatory-boundary violations (FCA / AML / GDPR)",
                    "Cascading failures across multi-agent pipelines",
                    "Hallucination-driven irreversible actions",
                  ].map((t) => <li key={t}>{t}</li>)}
                </ul>
              </div>
              <div className="outcomes-col reveal is-get">
                <div className="outcomes-h"><span className="outcomes-dot ok" aria-hidden="true" />What you get</div>
                <ul>
                  {[
                    "Fewer catastrophic incidents — risk removed before execution",
                    "Reduced regulatory and financial exposure",
                    "Faster, safer AI adoption — deploy with governance built in",
                    "Audit-ready evidence for every governed decision",
                    "One governance layer across every model, agent, and vendor",
                    "No rebuild — it works inside your existing stack",
                  ].map((t) => <li key={t}>{t}</li>)}
                </ul>
              </div>
            </div>

            {/* The failure mode event-level monitoring cannot see */}
            <div className="tcov-featured reveal" style={{ marginTop: "clamp(36px,4.5vw,60px)" }}>
              <div className="tcov-featured-tag">Featured risk</div>
              <h3>Cascading Failures Across Agent Pipelines</h3>
              <p>Multiple individually safe agents can combine into an unsafe system.</p>
              <div className="tcov-chain" aria-hidden="true">
                <span className="tcov-chain-node ok">Agent A — safe</span>
                <span className="tcov-chain-plus">+</span>
                <span className="tcov-chain-node ok">Agent B — safe</span>
                <span className="tcov-chain-plus">+</span>
                <span className="tcov-chain-node ok">Agent C — safe</span>
                <span className="tcov-chain-eq">=</span>
                <span className="tcov-chain-node bad">Combined trajectory — unsafe</span>
              </div>
              <p className="tcov-featured-close">Runtime Governance evaluates the full trajectory across the pipeline — not each agent in isolation — and denies the combined unsafe path before any agent acts.</p>
            </div>

            <div className="outcomes-cta reveal">
              <Link href="/why-runtime-governance" className="btn btn--ghost btn--sm">Why this matters <span className="arr">→</span></Link>
              <Link href="/technology#threats" className="btn btn--ghost btn--sm">Full threat coverage <span className="arr">→</span></Link>
              <Link href="/solutions" className="btn btn--ghost btn--sm">Industries we govern <span className="arr">→</span></Link>
            </div>
          </div>
        </section>

        <hr className="divider" />

        {/* ===== 5 · INTERACTIVE DEMO ===== */}
        <section className="section section--tight" id="demo" aria-label="Interactive governance demonstration">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Interactive demo</span>
              <h2>See governance intercept in real time.</h2>
              <p>
                Select a scenario. Runtime Governance evaluates the agent&rsquo;s proposed
                trajectory before execution — safe paths flow through to execution, while
                Ω-bound paths are intercepted at the governance layer, pre-action.
              </p>
            </div>
            <RuntimeGovernanceDemo />
            <div className="hero-tryit reveal">
              <span className="hero-tryit-label">Or open a live verdict in one click:</span>
              {[
                ["credential-exfiltration", "Credential exfiltration", "block"],
                ["multi-agent-leak", "Multi-agent leak", "block"],
                ["safe-workflow", "Safe workflow", "allow"],
              ].map(([id, label, tone]) => (
                <Link
                  key={id}
                  href={`/live-demo?example=${id}`}
                  className={`hero-tryit-chip hero-tryit-chip--${tone}`}
                  onClick={() => track(Events.CTA_CLICK, { location: "demo-tryit", cta: id })}
                >
                  <span className="hero-tryit-dot" aria-hidden="true" />
                  {label}
                </Link>
              ))}
            </div>
            <div className="demo-cta reveal">
              <span>Want to test your own action chain — or don&rsquo;t have an agent yet?</span>
              <Link href="/test-trajectory" className="btn btn--ghost btn--sm">
                Try the trajectory demo <span className="arr">→</span>
              </Link>
              <Link
                href="/test-without-agent"
                className="btn btn--ghost btn--sm"
                onClick={() => track(Events.CTA_CLICK, { location: "demo-cta", cta: "test-without-agent" })}
              >
                Test without your own agent <span className="arr">→</span>
              </Link>
            </div>
          </div>
        </section>

        <hr className="divider" />

        {/* ===== 6 · EU AI ACT — DEPLOYER POSITIONING ===== */}
        <section className="eu-trust" aria-label="EU AI Act alignment">
          <div className="wrap">
            <div className="eu-trust-card reveal">
              <p className="eu-trust-eyebrow">EU AI Act · agentic AI</p>
              <h2 className="eu-trust-title">Built for AI Deployers, Not Just AI Providers</h2>
              <p className="eu-trust-lede">
                Runtime Governance provides enforcement, evidence and audit-trail controls that
                support organisations in meeting key EU AI Act obligations for agentic AI
                deployments — it is not a legal certification.
              </p>
              <div className="eu-trust-tiers">
                <div className="eu-trust-tier">
                  <span className="eu-trust-tier-label">Primary alignment</span>
                  <div className="eu-trust-arts">
                    {["9", "12", "14", "15"].map((n) => (
                      <span key={n} className="eu-art">{n}</span>
                    ))}
                  </div>
                  <span className="eu-trust-tier-cap">Risk management · Record-keeping &amp; traceability · Human oversight · Robustness &amp; cybersecurity</span>
                </div>
                <div className="eu-trust-tier">
                  <span className="eu-trust-tier-label">Strong additional alignment</span>
                  <div className="eu-trust-arts">
                    {["26", "19"].map((n) => (
                      <span key={n} className="eu-art eu-art--strong">{n}</span>
                    ))}
                  </div>
                  <span className="eu-trust-tier-cap">Deployer obligations · Automatically generated logs</span>
                </div>
              </div>
              <Link href="/compliance" className="eu-trust-link"
                    onClick={() => track(Events.CTA_CLICK, { location: "eu-trust", cta: "eu-ai-act" })}>
                See the full EU AI Act article mapping <span className="arr">→</span>
              </Link>
            </div>
          </div>
        </section>

        <hr className="divider" />

        {/* ===== 7 · ROI — ONE CANONICAL FINANCIAL ARGUMENT ===== */}
        <section className="section section--tight" id="roi" aria-label="The cost of one unsafe execution">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Return on governance</span>
              <h2>The Cost of One Unsafe Execution</h2>
            </div>
            <p className="roi-lede reveal">
              Governance cost is bounded. Catastrophic exposure is not. Runtime Governance is
              priced against the cost of <span className="om">Ω</span> becoming reachable — not
              the complexity of the software.
            </p>

            <div className="tbl-wrap reveal" data-rowreveal>
              <table className="tbl">
                <thead>
                  <tr><th>Sector</th><th>Incident type</th><th>Documented cost</th></tr>
                </thead>
                <tbody>
                  {[
                    ["Banking / Finance", "Unauthorised wire transfer", "$2B+ single historical losses"],
                    ["Healthcare", "PHI exposure", "$9.77M average per breach (IBM 2024)"],
                    ["Cybersecurity", "Credential exfiltration", "$10.22M average per breach (IBM 2024)"],
                    ["Data Privacy", "GDPR automated processing violation", "€290M–€530M single regulatory fines"],
                    ["Enterprise", "Unauthorised data access", "$4.88M global average (IBM 2024)"],
                  ].map(([sector, incident, cost]) => (
                    <tr key={sector}>
                      <td data-l="Sector" className="t-main">{sector}</td>
                      <td data-l="Incident type">{incident}</td>
                      <td data-l="Documented cost" className="t-cost">{cost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="callout roi-multi reveal">
              <div>
                <div className="roi-multi-h">Multi-agent systems multiply catastrophic risk</div>
                <p>
                  A single unsafe decision in <b>Agent A</b> becomes the input to <b>Agent B</b> before
                  any human intervenes. Runtime Governance evaluates every trajectory at every execution
                  boundary — not just the first agent, not just the final output.
                </p>
              </div>
            </div>

            <p className="roi-close reveal">
              If one catastrophic execution is prevented, governance pays for itself many times
              over — the assessment identifies which catastrophic states are currently reachable
              in your system, before they become a business event.
            </p>

            <div className="demo-cta reveal">
              <span>The full financial comparison and pathway pricing live on the pricing page</span>
              <Link href="/enterprise-pathways#cost-of-failure" className="btn btn--ghost btn--sm">
                Financial comparison &amp; pricing <span className="arr">→</span>
              </Link>
            </div>
          </div>
        </section>

        <hr className="divider" />

        {/* ===== 8 · DEPLOYMENT PATHWAY — assessment to enforced governance ===== */}
        <section className="section section--tight pathway" id="onboarding" data-screen-label="Deployment pathway">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">From assessment to enforced governance</span>
              <h2>One pathway. Four stages. Nothing replaced.</h2>
              <p>
                The same pathway takes your organisation from first assessment to enforced,
                monthly-reported governance — one layer inserted into your existing stack,
                nothing rebuilt.
              </p>
            </div>

            <ol className="pathway-steps reveal">
              {([
                {
                  n: "01",
                  h: "Runtime Assessment",
                  p: "A 48-hour assessment of your architecture, deployment model, and reachable risks — with a recommended pathway and a domain-specific Ω definition.",
                  tag: "48 hours",
                },
                {
                  n: "02",
                  h: "Shadow Mode Pilot",
                  p: "Insert one layer; replace nothing. Governance observes every trajectory in production without touching a single existing tool — a 4–8 week limited pilot, with evidence gathered inside your own environment.",
                  tag: "Insert one layer",
                  highlight: true,
                },
                {
                  n: "03",
                  h: "Enable Enforcement",
                  p: "Observe-only becomes observe-and-enforce with one configuration change. No agent rebuild, no redeployment.",
                  tag: "One config change",
                },
                {
                  n: "04",
                  h: "Ongoing Governance",
                  p: "Continuous revalidation, monthly evidence reports, and executive visibility as your models, agents, and threat surface evolve.",
                  tag: "Standing assurance",
                },
              ] as { n: string; h: string; p: string; tag: string; highlight?: boolean }[]).map((s) => (
                <li key={s.n} className={`pathway-step${s.highlight ? " is-key" : ""}`}>
                  <div className="pathway-node" aria-hidden="true">
                    <span className="pathway-n">{s.n}</span>
                  </div>
                  <div className="pathway-body">
                    <div className="pathway-step-head">
                      <h3>{s.h}</h3>
                      <span className="pathway-tag">{s.tag}</span>
                    </div>
                    <p>{s.p}</p>
                    {s.highlight && (
                      <div className="pathway-insert">
                        <div className="pathway-insert-col">
                          <span className="pathway-insert-label">Before</span>
                          <div className="pathway-flow">
                            <span className="pf-node">LLM / Agent</span>
                            <span className="pf-arr" aria-hidden="true">→</span>
                            <span className="pf-node">Tools</span>
                            <span className="pf-arr" aria-hidden="true">→</span>
                            <span className="pf-node">Production</span>
                          </div>
                        </div>
                        <div className="pathway-insert-col">
                          <span className="pathway-insert-label is-after">After</span>
                          <div className="pathway-flow">
                            <span className="pf-node">LLM / Agent</span>
                            <span className="pf-arr" aria-hidden="true">→</span>
                            <span className="pf-node pf-gov">Runtime Governance<span className="pf-verdicts">ALLOW · ESCALATE · BLOCK</span></span>
                            <span className="pf-arr" aria-hidden="true">→</span>
                            <span className="pf-node">Tools</span>
                            <span className="pf-arr" aria-hidden="true">→</span>
                            <span className="pf-node">Production</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>

            <div className="flow reveal">
              <div className="engage-track">
                <EngageStage name="Audit" dur="48 hours" kind="One-time engagement" />
                <div className="engage-arrow" aria-hidden="true"><ArrowR /></div>
                <EngageStage name="Pilot" dur="4–8 weeks" kind="One-time engagement" />
                <div className="engage-arrow" aria-hidden="true"><ArrowR /></div>
                <EngageStage name="Integration" dur="Deployment phase" kind="One-time engagement" />
                <div className="engage-arrow" aria-hidden="true"><ArrowR /></div>
                <EngageStage name="Retainer" dur="Monthly or annual" kind="Ongoing governance assurance" recurring />
              </div>
            </div>

            <div className="demo-cta reveal">
              <span>The complete seven-step onboarding pathway, engagement detail, and pricing</span>
              <Link href="/enterprise-pathways#onboarding-pathway" className="btn btn--ghost btn--sm">
                Enterprise pathways <span className="arr">→</span>
              </Link>
            </div>
          </div>
        </section>

        <hr className="divider" />

        {/* ===== 9 · WHO IS THIS FOR ===== */}
        <section className="section section--tight" id="who" aria-label="Who this is for">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Who this is for</span>
              <h2>Runtime Governance for the people responsible for what the system does.</h2>
              <p>
                If an autonomous system causes a catastrophic outcome on your watch,
                you own the consequence. Runtime Governance gives you verifiable protection
                — not assurances.
              </p>
            </div>
            <div className="who-grid">
              {([
                ["Head of AI / CTO", "You're deploying autonomous agents in production and the blast radius of a misaligned trajectory is existential.", "A verified governance boundary around every catastrophic reachable state — before deployment."],
                ["Chief Risk Officer", "Your board is asking how AI risk is managed. 'We monitor outputs' is no longer an acceptable answer.", "A documented Ω specification, formal test evidence, and continuous revalidation."],
                ["Compliance / Legal", "FCA, GDPR, DORA, AI Act — regulators are requiring demonstrable runtime controls, not policy documents.", "Evidence-grade audit artefacts suitable for regulatory submission and institutional sign-off."],
                ["Platform / DevOps Engineering", "You're responsible for the AI infrastructure. Safety is your problem when something goes catastrophically wrong.", "Runtime constraints embedded directly in your deployment environment — not bolted on, not bypassable."],
              ] as [string, string, string][]).map(([role, pain, outcome]) => (
                <div className="who-card card reveal" key={role}>
                  <div className="who-role">{role}</div>
                  <div className="who-pain">{pain}</div>
                  <div className="who-divider" />
                  <div className="who-outcome"><span className="who-check">→</span>{outcome}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== 10 · FOR DEVELOPERS — technical evaluation path ===== */}
        <section className="devband" aria-label="For developers">
          <div className="wrap">
            <div className="devband-card reveal">
              <div className="devband-main">
                <p className="devband-eyebrow">For developers</p>
                <h2 className="devband-title">Connect Runtime Governance to your agent in ~15 minutes</h2>
                <p className="devband-sub">
                  Copy-paste examples, framework hooks, and live API contracts. No engine modifications required.
                </p>
                <div className="devband-frameworks" aria-label="Supported integrations">
                  {["LangChain", "LangGraph", "OpenAI Agents", "MCP", "Generic API"].map((f) => (
                    <span key={f} className="devband-chip">{f}</span>
                  ))}
                </div>
              </div>
              <div className="devband-aside">
                <svg className="devband-svg" viewBox="0 0 300 122" role="img"
                     aria-label="A single API call sits between the agent's plan and tool execution, returning PERMIT, ESCALATE, or BLOCK before anything runs.">
                  <defs>
                    <marker id="dbfArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
                      <path d="M0,0 L10,5 L0,10 z" className="dbf-arrowhead" />
                    </marker>
                  </defs>
                  {/* connectors: plan -> gate -> act */}
                  <line className="dbf-conn" x1="84" y1="33" x2="110" y2="33" markerEnd="url(#dbfArrow)" />
                  <line className="dbf-conn" x1="190" y1="33" x2="216" y2="33" markerEnd="url(#dbfArrow)" />
                  {/* gate -> verdicts */}
                  <line className="dbf-conn" x1="150" y1="52" x2="150" y2="70" markerEnd="url(#dbfArrow)" />
                  {/* nodes */}
                  <rect className="dbf-node" x="4" y="14" width="80" height="38" rx="9" />
                  <text className="dbf-label" x="44" y="37" textAnchor="middle">Agent plans</text>
                  <rect className="dbf-gate" x="110" y="14" width="80" height="38" rx="9" />
                  <text className="dbf-gate-label" x="150" y="31" textAnchor="middle">ℛ(t)</text>
                  <text className="dbf-sub" x="150" y="43" textAnchor="middle">GOVERNANCE</text>
                  <rect className="dbf-node" x="216" y="14" width="80" height="38" rx="9" />
                  <text className="dbf-label" x="256" y="37" textAnchor="middle">Tool runs</text>
                  {/* verdict chips */}
                  <rect className="dbf-chip dbf-chip--allow" x="38" y="74" width="66" height="20" rx="10" />
                  <text className="dbf-chip-t dbf-chip-t--allow" x="71" y="87" textAnchor="middle">PERMIT</text>
                  <rect className="dbf-chip dbf-chip--esc" x="112" y="74" width="76" height="20" rx="10" />
                  <text className="dbf-chip-t dbf-chip-t--esc" x="150" y="87" textAnchor="middle">ESCALATE</text>
                  <rect className="dbf-chip dbf-chip--block" x="196" y="74" width="66" height="20" rx="10" />
                  <text className="dbf-chip-t dbf-chip-t--block" x="229" y="87" textAnchor="middle">BLOCK</text>
                  <text className="dbf-foot" x="150" y="113" textAnchor="middle">Pre-execution · deterministic · &lt; 1 ms</text>
                </svg>
                <p className="devband-caption">One API call between planning and execution.</p>
                <Link
                  href="/quickstart"
                  className="btn btn--ghost devband-cta"
                  onClick={() => track(Events.CTA_CLICK, { location: "devband", cta: "quickstart" })}
                >
                  View Developer Quickstart <span className="arr">→</span>
                </Link>
                <span className="devband-note">Technical evaluation path</span>
              </div>
            </div>
          </div>
        </section>

        {/* ===== 11 · FINAL CTA ===== */}
        <section className="section cta-final" id="contact" data-screen-label="Contact">
          <div className="wrap">
            <div className="inner reveal">
              <span className="eyebrow" style={{ justifyContent: "center" }}>The next step</span>
              <h2 style={{ marginTop: 20 }}>Find out which unsafe states are reachable in your systems.</h2>
              <p>
                A 48-hour Runtime Safety Assessment identifies the catastrophic states reachable in
                your autonomous systems — before they execute. Consultation, strategy session, and
                pilot are the steps that follow.
              </p>
              <div className="hero-actions" style={{ marginTop: 38 }}>
                <Link href="/book#assessment" className="btn btn--primary">Book a Runtime Safety Assessment <span className="arr">→</span></Link>
                <Link href="/enterprise-pathways" className="btn btn--ghost">See enterprise pathways</Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function EngageStage({ name, dur, kind, recurring = false }: { name: string; dur: string; kind: string; recurring?: boolean }) {
  return (
    <div className={`engage-stage${recurring ? " recurring" : ""}`}>
      <div className="es-top">
        <span className="es-name">{name}</span>
        <span className={`engage-tag${recurring ? " rec" : " one"}`}>
          {recurring ? "Recurring" : "One-time"}
        </span>
      </div>
      <h3>{name}</h3>
      <div className="es-dur">{dur}</div>
      <div className="es-kind">{kind}</div>
      {recurring && (
        <span className="es-loop" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M15 9 a6 6 0 1 1 -1.8 -4.3 M13.5 1.5 V5 H10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </div>
  );
}
