"use client";

import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { CanvasScript } from "@/components/CanvasScript";
import { useSiteMotion } from "@/components/useSiteMotion";
import { track, Events } from "@/lib/analytics";

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
                Define the <span className="hero-cat">Admissible Operating Envelope</span>
                <br />
                Your <span className="grad">Autonomous System Can Actually Operate Within</span>
              </h1>
              <p className="hero-sub reveal in" data-d="2">
                Morrison Runtime Governance™ defines, tests, and enforces the <b>admissible operating envelope</b>{" "}
                between an autonomous system and real-world execution — before proposed actions become state transitions.
              </p>
              <div className="hero-chips reveal in" data-d="3">
                <span>Bounded reachability evidence in your environment</span>
                <span>Pre-execution enforcement of the operating boundary</span>
                <span>Audit-ready evidence for every governed transition</span>
              </div>
              <div className="hero-actions reveal in" data-d="4">
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

        {/* Keep the legacy anchor stable for existing inbound links. */}
        <section className="section section--tight" id="safety-envelope" aria-label="What an Admissible Operating Envelope is">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">What is an Admissible Operating Envelope?</span>
              <h2>The defined states, actions, transitions and conditions in which operation is permitted.</h2>
              <p>
                An <strong>Admissible Operating Envelope</strong> is the set of states, actions, transitions
                and operating conditions that a system is permitted to occupy or execute within a defined environment.
              </p>
              <p>
                Safety-critical engineering already uses operating envelopes, limits, constrained workspaces,
                interlocks and control boundaries wherever crossing the operating boundary has serious consequences:
              </p>
            </div>

            <div className="who-grid">
              {([
                ["Aviation", "Aircraft use flight envelopes to define the combinations of speed, altitude, load, and other conditions within which the aircraft is designed to operate."],
                ["Nuclear engineering", "High-consequence facilities use operating limits, interlocks and control boundaries around power, temperature, pressure, cooling and system state."],
                ["Industrial systems & robotics", "Industrial systems use operating limits; robots use constrained workspaces and motion envelopes around force, speed, position and other process variables."],
              ] as [string, string][]).map(([field, explanation]) => (
                <div className="who-card card reveal" key={field}>
                  <div className="who-role">{field}</div>
                  <div className="who-pain">{explanation}</div>
                </div>
              ))}
            </div>

            <p className="pull reveal" style={{ marginTop: "clamp(30px,4vw,52px)" }}>
              Aviation has flight envelopes. Industrial systems have operating limits. Robotics has constrained
              workspaces and motion envelopes. <span className="accent">Autonomous AI also needs a defined admissible
              operating envelope — and an independent mechanism that enforces it.</span>
            </p>

            <div className="callout reveal" style={{ marginTop: "clamp(28px,4vw,48px)" }}>
              <div>
                <div className="roi-multi-h">We apply the same idea to autonomous AI.</div>
                <p>
                  The envelope defines what is permitted under the environment, tools, permissions, authority
                  boundaries and workflows. Morrison independently evaluates proposed transitions before execution.
                  Reachability and causal verification provide bounded evidence of what became reachable or unreachable
                  under stated assumptions.
                </p>
              </div>
            </div>

            <p className="pull reveal" style={{ marginTop: "clamp(30px,4vw,52px)" }}>
              <span className="accent">Causal control over autonomous-system behaviour at execution time.</span>
            </p>

            <p className="pull reveal" style={{ marginTop: "clamp(22px,3vw,36px)" }}>
              Define the admissible operating envelope your autonomous system can actually operate within —
              <span className="accent"> in your environment, before actions execute.</span>
            </p>
          </div>
        </section>

        <hr className="divider" />

        <section className="section section--tight" id="knowledge-is-not-control" aria-label="Representation compared with causal enforcement">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Knowledge ≠ control</span>
              <h2>Knowing the rule does not enforce the rule.</h2>
              <p>
                <strong>Representation of the operating envelope is not causal enforcement of the operating envelope.</strong>
                {" "}A driver can know the speed limit and still exceed it. A trader can know their delegated authority
                and still submit a transaction if the system permits it. An administrator can know data must remain
                inside a trust boundary and still exfiltrate it if credentials and egress remain available.
              </p>
              <p className="knowledge-thesis">Constraint awareness changes information. Enforcement changes reachability.</p>
            </div>

            <div className="knowledge-compare reveal">
              <div className="knowledge-panel is-representation">
                <span className="knowledge-label">Rule represented</span>
                <strong>“I know I must not do X.”</strong>
                <span>X remains executable</span>
                <span className="knowledge-result">No causal guarantee</span>
              </div>
              <div className="knowledge-vs" aria-hidden="true">VS</div>
              <div className="knowledge-panel is-enforcement">
                <span className="knowledge-label">Operating envelope defined</span>
                <strong>Action X proposed</strong>
                <span>Independent authorization</span>
                <span className="knowledge-verdicts"><b>ALLOW</b> · <b>ESCALATE</b> · <b>BLOCK</b></span>
                <span className="knowledge-result">Prohibited transition does not execute</span>
              </div>
            </div>
          </div>
        </section>

        <hr className="divider" />

        {/* ===== 3 · WHY THIS MATTERS — pain before proof or architecture ===== */}
        <section className="section section--tight outcomes" id="why-it-matters" aria-label="Why Admissible Operating Envelopes matter">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Why this matters</span>
              <h2>AI is moving from generating answers to taking actions.</h2>
              <p>
                An autonomous system can send money, expose data, change infrastructure, approve workflows,
                call external tools, and coordinate with other agents. Once AI can act in the real world,
                the safety question changes: <strong>where is it actually safe for this system to operate?</strong>
              </p>
            </div>

            <div className="who-grid">
              {([
                ["Actions can be irreversible", "A bad answer can be corrected. A completed transfer, leaked credential, deleted record, or production change may already have created the consequence."],
                ["Risk emerges across trajectories", "Each individual step can look acceptable while a multi-step or multi-agent sequence moves the system toward an unsafe reachable state."],
                ["Policies do not enforce themselves", "Permissions, policy documents, prompts, and post-hoc monitoring describe intent. They do not by themselves stop an unsafe transition at the moment of execution."],
              ] as [string, string][]).map(([title, explanation]) => (
                <div className="who-card card reveal" key={title}>
                  <div className="who-role">{title}</div>
                  <div className="who-pain">{explanation}</div>
                </div>
              ))}
            </div>

            <div className="callout roi-multi reveal" style={{ marginTop: "clamp(30px,4vw,52px)" }}>
              <div>
                <div className="roi-multi-h">The missing layer is not another representation of the rule. It is causal enforcement of the operating boundary.</div>
                <p>
                  The engineering question is not only, “Does the system know the rule?” It is, “What independently
                  prevents the system from crossing the boundary?” Runtime control changes which transitions can
                  actually execute; verification tests what became unreachable within the defined environment.
                </p>
              </div>
            </div>

            <div className="demo-cta reveal">
              <Link href="/why-runtime-governance" className="btn btn--ghost btn--sm">
                Why Runtime Governance <span className="arr">→</span>
              </Link>
              <Link href="/live-demo" className="btn btn--ghost btn--sm">
                See it in action <span className="arr">→</span>
              </Link>
            </div>
          </div>
        </section>

        {/* ===== 4 · PROOF STRIP — one canonical validation section ===== */}
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

        {/* ===== 5 · WHAT RUNTIME GOVERNANCE IS — calm, static, canonical diagram. ===== */}
        <section className="section section--tight" id="what" aria-label="What Runtime Governance is">
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow">What Runtime Governance is</span>
              <h2>Define the boundary. Authorize independently. Enforce before execution.</h2>
              <p>
                Morrison Runtime Governance establishes and enforces an <strong>Admissible Operating Envelope</strong> at the
                execution boundary between autonomous systems and real infrastructure. Actions and trajectories
                that remain within the defined envelope may proceed. Proposed transitions that would leave it,
                violate authority, or enter <span className="om">Ω</span> — the prohibited region — are blocked
                or escalated before execution. No model retraining, no agent rebuild.
              </p>
              <p className="govd-agnostic">Local, bounded evidence — provider-, model-, agent-, and deployment-agnostic.</p>
            </div>

            <div className="govd">
              <div className="govd-layer">
                <div className="govd-k">Environment &amp; authority</div>
                <div className="govd-v">Defines the Admissible Operating Envelope · States · Actions · Tools · Permissions · Trajectories</div>
              </div>
              <div className="govd-conn" aria-hidden="true" />
              <div className="govd-layer">
                <div className="govd-k">Autonomous system</div>
                <div className="govd-v">Models · Agents · Planners · Proposes a transition</div>
              </div>
              <div className="govd-conn" aria-hidden="true" />
              <div className="govd-layer govd-gov">
                <div className="govd-tm">Morrison Runtime Governance™</div>
                <div className="govd-k">Independent pre-execution authority</div>
                <div className="govd-verbs">
                  EVALUATE&nbsp;→&nbsp;<span className="ok">ALLOW</span> · <span className="esc">ESCALATE</span> · <span className="blk">BLOCK</span>
                </div>
              </div>
              <div className="govd-conn" aria-hidden="true" />
              <div className="govd-layer">
                <div className="govd-k">Authorized execution</div>
                <div className="govd-v">Protected data · APIs · Infrastructure · Physical systems</div>
              </div>
              <div className="govd-conn" aria-hidden="true" />
              <div className="govd-layer">
                <div className="govd-k">Evidence &amp; verification</div>
                <div className="govd-v">Governed transition · Decision chain · Bounded reachability evidence</div>
              </div>
              <p className="govd-caption">
                Execution occurs only when authorized. Ω denotes prohibited states; claims remain bounded to the defined environment and stated assumptions.
              </p>
            </div>

            <div className="demo-cta">
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

        {/* ===== 6 · GUARDIAN OS — the governed operating system on the kernel ===== */}
        <section className="section section--tight" id="guardian" aria-label="Guardian OS — the governed enterprise operating system" data-screen-label="Guardian OS">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Guardian OS · governed autonomy</span>
              <h2>Not just a control point. A governed operating system.</h2>
              <p>
                Runtime Governance is the kernel. <strong>Guardian OS</strong> is the operating system
                built on top of it — where a council of specialised AI departments coordinates an entire
                enterprise as one governed, evidence-backed runtime. Every action any department takes is
                proposed, governed, approved, executed and recorded. No trusted agents. No bypasses.
              </p>
            </div>

            <div className="guardian-stack reveal" aria-hidden="true">
              <div className="guardian-layer">
                <div className="gl-k">AI departments — a governed council</div>
                <div className="gl-v">Sales · Deployment · Customer Success · Compliance · Finance · Security · Incident Response · Risk · Architecture · Policy · Partners</div>
              </div>
              <div className="guardian-conn" />
              <div className="guardian-layer is-os">
                <div className="gl-tm">Guardian OS</div>
                <div className="gl-k">Multi-agent orchestration · Digital enterprise twin · Executive command</div>
              </div>
              <div className="guardian-conn" />
              <div className="guardian-layer is-kernel">
                <div className="gl-tm">Morrison Runtime Governance™</div>
                <div className="gl-k">The kernel — Admissible Operating Envelope · deny-by-default <span className="om">Ω</span> · fail-closed</div>
              </div>
              <div className="guardian-conn" />
              <div className="guardian-layer">
                <div className="gl-k">Protected enterprise systems</div>
                <div className="gl-v">Data · APIs · Infrastructure · Internal workflows</div>
              </div>
              <p className="guardian-stack-caption">
                Every privileged action flows through the kernel before it runs — no department can reach the systems below except through governance.
              </p>
            </div>

            <div className="guardian-pillars">
              <div className="guardian-pillar reveal">
                <span className="guardian-pillar-n">01</span>
                <h3>Multi-agent orchestration</h3>
                <p>A council of specialised departments, each owning its slice of the enterprise and coordinating through governed handoffs. No department acts on another&rsquo;s authority, and none is trusted more than the engine allows.</p>
              </div>
              <div className="guardian-pillar reveal">
                <span className="guardian-pillar-n">02</span>
                <h3>Digital enterprise twin</h3>
                <p>A live, read-only model of the whole organisation — every customer, deployment, incident, dependency and risk — derived from authoritative records and replayable through time. One executive view of what&rsquo;s happening, what needs attention, and what happens if you do nothing.</p>
              </div>
              <div className="guardian-pillar reveal">
                <span className="guardian-pillar-n">03</span>
                <h3>One governed lifecycle</h3>
                <p>Every privileged action, from any department, follows the same path — deterministic, fail-closed and auditable — so autonomy never outruns oversight and nothing happens without evidence.</p>
              </div>
            </div>

            <div className="guardian-flow" role="img" aria-label="Proposal to Ω Governor to Approval to Execution to Evidence">
              <span className="guardian-flow-chip">Proposal</span>
              <span className="guardian-flow-arr">→</span>
              <span className="guardian-flow-chip is-omega">Ω Governor</span>
              <span className="guardian-flow-arr">→</span>
              <span className="guardian-flow-chip">Approval</span>
              <span className="guardian-flow-arr">→</span>
              <span className="guardian-flow-chip">Execution</span>
              <span className="guardian-flow-arr">→</span>
              <span className="guardian-flow-chip is-evidence">Evidence</span>
            </div>
            <p className="guardian-flow-note">The same governed path for every department — the agent proposes, the engine rules, a human approves what matters, and every decision is recorded.</p>

            <div className="demo-cta reveal">
              <Link href="/technology" className="btn btn--ghost btn--sm"
                    onClick={() => track(Events.CTA_CLICK, { location: "guardian", cta: "technology" })}>
                Explore the technology <span className="arr">→</span>
              </Link>
              <Link href="/pilot" className="btn btn--ghost btn--sm"
                    onClick={() => track(Events.CTA_CLICK, { location: "guardian", cta: "pilot" })}>
                Book a governed pilot <span className="arr">→</span>
              </Link>
            </div>
          </div>
        </section>

        <hr className="divider" />

        {/* ===== 7 · BUSINESS OUTCOMES — detailed consequences and value ===== */}
        <section className="section section--tight outcomes" id="outcomes" aria-label="What it prevents and what you get">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">The bottom line</span>
              <h2>Know where your AI can operate — and enforce the boundary.</h2>
              <p>
                The Admissible Operating Envelope defines the locally validated region of operation for your deployment.
                Morrison Runtime Governance independently controls whether proposed transitions are permitted to cross
                the execution boundary.
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
                    "A defined Admissible Operating Envelope for the deployment",
                    "Evidence of which trajectories remain inside or leave the boundary",
                    "Reduced regulatory and financial exposure",
                    "Faster, safer AI adoption with pre-execution controls",
                    "Audit-ready evidence for every governed decision",
                    "One governance layer across every model, agent, and vendor",
                  ].map((t) => <li key={t}>{t}</li>)}
                </ul>
              </div>
            </div>

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

        {/* ===== 8 · EU AI ACT — DEPLOYER POSITIONING ===== */}
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

        {/* ===== 9 · DEPLOYMENT PATHWAY — assessment to enforced governance ===== */}
        <section className="section section--tight pathway" id="onboarding" data-screen-label="Deployment pathway">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">From assessment to enforced governance</span>
              <h2>One pathway. Four stages. Nothing replaced.</h2>
              <p>
                The same pathway takes your organisation from mapping an Admissible Operating Envelope to
                enforced runtime governance and continuous verification — one layer inserted into your existing stack.
              </p>
            </div>

            <ol className="pathway-steps reveal">
              {([
                {
                  n: "01",
                  h: "Operating Envelope Assessment",
                  p: "Map the environment, tools, permissions, authority boundaries, reachable states and prohibited region Ω. Produce a bounded definition of where autonomous operation is admissible and which transitions require authorization, escalation or blocking.",
                  tag: "48 hours",
                },
                {
                  n: "02",
                  h: "Shadow Mode Pilot",
                  p: "Insert one layer; replace nothing. Governance observes trajectories in your environment and shows which remain inside the admissible operating envelope, which approach the boundary, and which would leave it — without touching a single existing tool.",
                  tag: "Insert one layer",
                  highlight: true,
                },
                {
                  n: "03",
                  h: "Enforced Runtime Governance",
                  p: "Observe-only becomes observe-and-enforce with one configuration change. Actions inside the envelope proceed; boundary violations are blocked or escalated before execution.",
                  tag: "One config change",
                },
                {
                  n: "04",
                  h: "Continuous Verification",
                  p: "Continuous revalidation, bounded reachability evidence, monthly reports, and executive visibility as models, tools, permissions, policies, and the operating environment evolve.",
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

            <div className="demo-cta reveal">
              <span>The complete seven-step onboarding pathway, engagement detail, and pricing</span>
              <Link href="/enterprise-pathways#onboarding-pathway" className="btn btn--ghost btn--sm">
                Enterprise pathways <span className="arr">→</span>
              </Link>
            </div>
          </div>
        </section>

        {/* ===== 10 · LIVE DEMO — the primary product experience ===== */}
        <section className="section cta-final" id="demo" aria-label="Live demo" data-screen-label="Live demo">
          <div className="wrap">
            <div className="inner reveal">
              <span className="eyebrow" style={{ justifyContent: "center" }}>Live demo</span>
              <h2 style={{ marginTop: 20 }}>See an Admissible Operating Envelope enforced in real time.</h2>
              <p>
                Watch Morrison evaluate proposed state transitions before execution and show which remain
                admissible, which require escalation, and which are removed from the executable path.
                No signup, no setup, nothing touches your systems.
              </p>
              <div className="hero-tryit reveal" style={{ justifyContent: "center", marginTop: 28 }}>
                <span className="hero-tryit-label">Open a live verdict in one click:</span>
                {[
                  ["credential-exfiltration", "Credential exfiltration", "block"],
                  ["multi-agent-leak", "Multi-agent leak", "block"],
                  ["safe-workflow", "Safe workflow", "allow"],
                ].map(([id, label, tone]) => (
                  <Link
                    key={id}
                    href={`/live-demo?example=${id}`}
                    className={`hero-tryit-chip hero-tryit-chip--${tone}`}
                    onClick={() => track(Events.CTA_CLICK, { location: "home-demo-band", cta: id })}
                  >
                    <span className="hero-tryit-dot" aria-hidden="true" />
                    {label}
                  </Link>
                ))}
              </div>
              <div className="hero-actions" style={{ marginTop: 32 }}>
                <Link
                  href="/live-demo"
                  className="btn btn--primary btn--live"
                  onClick={() => track(Events.CTA_CLICK, { location: "home-demo-band", cta: "live-demo" })}
                >
                  <span className="live-pip" aria-hidden="true" />
                  Open the Live Demo <span className="arr">→</span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <hr className="divider" />

        {/* ===== 11 · ROI — ONE CANONICAL FINANCIAL ARGUMENT ===== */}
        <section className="section section--tight" id="roi" aria-label="The cost of one unsafe execution">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Return on governance</span>
              <h2>The cost of one boundary violation.</h2>
            </div>
            <p className="roi-lede reveal">
              Governance cost is bounded. Exposure outside the validated Admissible Operating Envelope is not.
              Runtime Governance is priced against the consequences of unsafe reachable states —
              including <span className="om">Ω</span> — becoming executable.
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
                <div className="roi-multi-h">Multi-agent systems multiply boundary risk</div>
                <p>
                  A single unsafe decision in <b>Agent A</b> becomes the input to <b>Agent B</b> before
                  any human intervenes. Runtime Governance evaluates every trajectory at every execution
                  boundary — not just the first agent, not just the final output.
                </p>
              </div>
            </div>

            <p className="roi-close reveal">
              The assessment shows what your system can safely reach in its current environment —
              and where trajectories would leave the validated envelope.
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

        {/* ===== 12 · WHO IS THIS FOR ===== */}
        <section className="section section--tight" id="who" aria-label="Who this is for">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Who this is for</span>
              <h2>Runtime Governance for the people responsible for what the system does.</h2>
              <p>
                If you are accountable for autonomous behaviour, you need more than a global claim that
                a model is “safe.” You need bounded evidence of what it can safely do in your environment,
                and enforcement when a proposed trajectory leaves that envelope.
              </p>
            </div>
            <div className="who-grid">
              {([
                ["Head of AI / CTO", "You're deploying autonomous agents in production and need to know where safe operation ends in the real stack.", "A locally validated Admissible Operating Envelope around the deployment — before production autonomy expands."],
                ["Chief Risk Officer", "Your board is asking how AI risk is controlled in practice. 'We monitor outputs' is no longer enough.", "A documented Admissible Operating Envelope, Ω specification, formal test evidence, and continuous revalidation."],
                ["Compliance / Legal", "FCA, GDPR, DORA, AI Act — regulators increasingly expect demonstrable controls and evidence, not policy documents alone.", "Evidence-grade audit artefacts showing the environment, constraints, verdicts, and bounded scope of the safety claim."],
                ["Platform / DevOps Engineering", "You're responsible for the execution surface where autonomous systems touch real tools and infrastructure.", "Runtime constraints embedded directly in your deployment environment — not bolted on, not bypassable."],
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

        {/* ===== 13 · FOR DEVELOPERS — technical evaluation path ===== */}
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
                  <line className="dbf-conn" x1="84" y1="33" x2="110" y2="33" markerEnd="url(#dbfArrow)" />
                  <line className="dbf-conn" x1="190" y1="33" x2="216" y2="33" markerEnd="url(#dbfArrow)" />
                  <line className="dbf-conn" x1="150" y1="52" x2="150" y2="70" markerEnd="url(#dbfArrow)" />
                  <rect className="dbf-node" x="4" y="14" width="80" height="38" rx="9" />
                  <text className="dbf-label" x="44" y="37" textAnchor="middle">Agent plans</text>
                  <rect className="dbf-gate" x="110" y="14" width="80" height="38" rx="9" />
                  <text className="dbf-gate-label" x="150" y="31" textAnchor="middle">ℛ(t)</text>
                  <text className="dbf-sub" x="150" y="43" textAnchor="middle">GOVERNANCE</text>
                  <rect className="dbf-node" x="216" y="14" width="80" height="38" rx="9" />
                  <text className="dbf-label" x="256" y="37" textAnchor="middle">Tool runs</text>
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

        {/* ===== 14 · FINAL CTA ===== */}
        <section className="section cta-final" id="contact" data-screen-label="Contact">
          <div className="wrap">
            <div className="inner reveal">
              <span className="eyebrow" style={{ justifyContent: "center" }}>The next step</span>
              <h2 style={{ marginTop: 20 }}>Map the Admissible Operating Envelope of your autonomous system.</h2>
              <p>
                A 48-hour Operating Envelope Assessment maps your environment, tools, permissions, authority
                boundaries, reachable states and prohibited region Ω — under stated assumptions.
              </p>
              <div className="hero-actions" style={{ marginTop: 38 }}>
                <Link href="/book#assessment" className="btn btn--primary">Book an Operating Envelope Assessment <span className="arr">→</span></Link>
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
