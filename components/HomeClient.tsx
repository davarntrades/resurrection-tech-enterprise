"use client";

import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { CanvasScript } from "@/components/CanvasScript";
import { RuntimeGovernanceDemo } from "@/components/RuntimeGovernanceDemo";
import { FinancialComparison } from "@/components/FinancialComparison";
import { useSiteMotion } from "@/components/useSiteMotion";
import { track, Events } from "@/lib/analytics";

const Check = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M3 8.5 L6.5 12 L13 4" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);
const Cross = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M3 3 L11 11 M11 3 L3 11" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);
const ArrowR = () => (
  <svg width="28" height="14" viewBox="0 0 28 14" fill="none">
    <path d="M0 7 H24 M19 2 L25 7 L19 12" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);
const ArrowDown = () => (
  <svg width="14" height="22" viewBox="0 0 14 22" fill="none">
    <path d="M7 0 V18 M2 13 L7 19 L12 13" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);
const Lock = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <rect x="2.5" y="6.5" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
    <path d="M5 6.5 V4.5 a2.5 2.5 0 0 1 5 0 V6.5" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

export function HomeClient() {
  useSiteMotion();

  return (
    <>
      <TrustBar />
      <Nav />
      <main id="top">
        {/* ===== HERO ===== */}
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
                <b>Your AI can cost millions before traditional controls detect it.</b>
              </p>
              <p className="hero-sub2 reveal in" data-d="2">
                Autonomous systems now have access to money, customer data, critical infrastructure,
                and regulated workflows. If you cannot identify which catastrophic states remain
                reachable within your AI stack today, you may already be carrying risks that only
                become visible after the damage is done.
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
                  onClick={() => track(Events.CTA_CLICK, { location: "hero" })}
                >
                  Book a Runtime Safety Assessment <span className="arr">→</span>
                </Link>
                <Link href="/enterprise-pathways" className="btn btn--ghost">
                  View Enterprise Pathways
                </Link>
                <Link
                  href="/integrations"
                  className="btn btn--ghost"
                  onClick={() => track(Events.CTA_CLICK, { location: "hero-integrations" })}
                >
                  See How It Integrates <span className="arr">→</span>
                </Link>
              </div>
              <div className="hero-meta reveal in" data-d="5">
                <span className="line" />
                SAFE TRAJECTORIES ROUTE AROUND Ω · UNSAFE TRAJECTORIES INTERCEPTED PRE-EXECUTION
              </div>
            </div>
          </div>
        </header>

        {/* ===== VALIDATION METRICS ===== */}
        <section className="metrics glow-top" id="validation" aria-label="Validation benchmarks">
          <div className="wrap">
            <div className="metrics-head reveal">
              <span>Governance validation benchmark</span>
              <span className="ln" />
              <span>Cross-model · pre-execution</span>
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
                <div className="mval"><span className="count" data-count="100" data-suffix="%">0</span></div>
                <div className="mlabel">Pass rate</div>
              </div>
              <div className="metric reveal" data-d="5">
                <div className="mval" style={{ fontSize: "clamp(20px,2vw,26px)" }}>Cross-Model</div>
                <div className="mlabel">Validation coverage</div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== WHAT IT PREVENTS / WHAT YOU GET ===== */}
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
            <div className="outcomes-cta reveal">
              <Link href="/why-runtime-governance" className="btn btn--ghost btn--sm">Why this matters <span className="arr">→</span></Link>
              <Link href="/integrations" className="btn btn--ghost btn--sm">How it integrates <span className="arr">→</span></Link>
            </div>
          </div>
        </section>

        {/* ===== BEFORE EXECUTION — TWO-PATH DIAGRAM ===== */}
        <section className="section section--tight twopath" id="before-execution" aria-label="Runtime Governance before execution">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Runtime Governance — before execution</span>
              <h2>Every action is checked before it runs.</h2>
              <p>Unsafe action chains are intercepted at the governance layer. Approved actions execute normally.</p>
            </div>
            <div className="tp2-grid reveal">
              <div className="tp2-path is-block">
                {["AI Agent", "Unsafe action chain", "Runtime Governance", "BLOCKED"].map((n, i, a) => (
                  <div className="tp2-step" key={n}>
                    <div className={`tp2-node${n === "Runtime Governance" ? " gov" : ""}${n === "BLOCKED" ? " verdict block" : ""}`}>{n}</div>
                    {i < a.length - 1 && <div className="tp2-arrow" aria-hidden="true">↓</div>}
                  </div>
                ))}
              </div>
              <div className="tp2-path is-allow">
                {["AI Agent", "Approved action", "Runtime Governance", "Execution"].map((n, i, a) => (
                  <div className="tp2-step" key={n}>
                    <div className={`tp2-node${n === "Runtime Governance" ? " gov" : ""}${n === "Execution" ? " verdict ok" : ""}`}>{n}</div>
                    {i < a.length - 1 && <div className="tp2-arrow" aria-hidden="true">↓</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ===== THREAT COVERAGE (TIERED, BUYER-FIRST) ===== */}
        <section className="section section--tight tcov" id="threats" aria-label="Threat coverage">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Threat coverage</span>
              <h2>The business risks Runtime Governance prevents.</h2>
              <p>
                Traditional security evaluates individual events. Runtime Governance evaluates the
                trajectory those events create — and denies it before execution.
              </p>
            </div>

            {/* Tier 1 — Enterprise critical */}
            <div className="tcov-tier reveal">
              <div className="tcov-tier-h"><span className="tcov-dot crit" aria-hidden="true" />Enterprise critical risks</div>
              <div className="tcov-grid">
                {([
                  ["Unauthorized Financial Execution", "An agent moves money — a transfer, payment, or refund — outside approved limits or to an unverified destination.", "The transfer is denied before it executes, preventing irreversible financial loss."],
                  ["Credential & Secret Exfiltration", "An agent reads API keys, tokens, or secrets and routes them toward an external destination.", "The credential-to-external path is blocked before any secret leaves the boundary."],
                  ["Data Leakage (PII / PHI / customer data)", "Customer or regulated data is read and then sent beyond the approved boundary.", "The exfiltration trajectory is stopped before a notifiable breach can occur."],
                  ["Privilege Escalation", "An agent acquires permissions — for itself or another agent — beyond its authorised scope.", "Escalation is denied before elevated access is ever granted."],
                ] as [string, string, string][]).map(([t, what, prevent]) => (
                  <div className="tcov-card crit" key={t}>
                    <div className="tcov-card-h">{t}</div>
                    <p className="tcov-what">{what}</p>
                    <p className="tcov-prevent"><span>Prevented</span>{prevent}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tier 2 — Autonomous agent risks */}
            <div className="tcov-tier reveal">
              <div className="tcov-tier-h"><span className="tcov-dot auto" aria-hidden="true" />Autonomous agent risks</div>
              <p className="tcov-tier-sub">Failure modes that point-in-time monitoring cannot see, because the danger only exists across the full trajectory.</p>
              <div className="tcov-grid">
                {([
                  ["Chained Multi-Step Attacks", "Each step looks benign in isolation; the risk only appears across the full sequence. Event-level monitoring never sees the chain."],
                  ["Cross-Agent Delayed Intent", "Intent formed by one agent executes through another, later — breaking the cause-and-effect link monitoring relies on."],
                  ["Silent Trajectory Collapse", "The system drifts toward an unsafe state with no single alerting event. Nothing trips a threshold until it is too late."],
                  ["Long-Horizon Agent Drift", "Over many steps an agent migrates outside its original mandate — gradually, below the radar of point-in-time checks."],
                ] as [string, string][]).map(([t, d]) => (
                  <div className="tcov-card auto" key={t}>
                    <div className="tcov-card-h">{t}</div>
                    <p className="tcov-what">{d}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tier 3 — Advanced multi-agent catastrophic */}
            <div className="tcov-tier reveal">
              <div className="tcov-tier-h"><span className="tcov-dot adv" aria-hidden="true" />Advanced multi-agent catastrophic risks</div>

              <div className="tcov-featured">
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

              <div className="tcov-grid tcov-grid--adv">
                {([
                  ["Multi-Agent Collusion", "Agents coordinate to achieve together what none could alone.", ["Collusive exfiltration", "Role-split credential theft", "Split unauthorized transfer", "Tool delegation chains"]],
                  ["Composite Cross-Domain Risk", "Separate risk categories combine into one unsafe trajectory.", ["Financial execution + data exfiltration", "Credential theft + privilege escalation", "Multiple risk categories in one trajectory"]],
                ] as [string, string, string[]][]).map(([t, d, subs]) => (
                  <div className="tcov-card adv" key={t}>
                    <div className="tcov-card-h">{t}</div>
                    <p className="tcov-what">{d}</p>
                    <ul className="tcov-sub">{subs.map((s) => <li key={s}>{s}</li>)}</ul>
                  </div>
                ))}
                {([
                  ["Hidden-Trajectory Catastrophic Risk", "An unsafe path that never surfaces as an obvious unsafe step."],
                  ["Multi-Representation Forbidden-State Reachability", "The same forbidden outcome reached through different encodings or tools."],
                  ["Memory Contamination Between Agents", "Unsafe state passed between agents through shared memory or context."],
                ] as [string, string][]).map(([t, d]) => (
                  <div className="tcov-card adv" key={t}>
                    <div className="tcov-card-h">{t}</div>
                    <p className="tcov-what">{d}</p>
                  </div>
                ))}
              </div>

              <div className="tcov-keymsg reveal">
                <span className="tcov-keymsg-dot" aria-hidden="true" />
                Existing controls watch individual events. Multi-agent systems fail across the whole
                trajectory — which is exactly what Runtime Governance evaluates, before execution.
              </div>
            </div>
          </div>
        </section>

        {/* ===== EVIDENCE / TRUST METRICS ===== */}
        <section className="section section--tight" id="evidence" aria-label="Evidence and trust">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Evidence &amp; trust</span>
              <h2>Verifiable governance, not vendor claims.</h2>
              <p>
                Every assurance is backed by reproducible methodology, documented test cases,
                and transparent validation criteria — not marketing language.
              </p>
            </div>
            <div className="ev-trust-grid">
              {([
                ["Validated evaluations", "129,857+", "Governed evaluations across model architectures", true, false],
                ["Test suite pass rate", "100%", "171 of 171 test cases across all coverage scenarios", true, false],
                ["False positive rate", "0.0%", "Zero false positives across all governed evaluations", true, false],
                ["False negative rate", "0.0%", "Zero false negatives — no unsafe trajectory passed governance", true, false],
                ["Patent protection", "GB2600765.8", "Filed IP protecting the runtime governance methodology", true, true],
                ["Validation scope", "Cross-model", "GPT, Claude, Gemini, Llama, Mistral architectures covered", true, true],
              ] as [string, string, string, boolean, boolean][]).map(([label, value, note, accent, mono]) => (
                <div className="ev-trust-card card reveal" key={label}>
                  <div className="etc-label">{label}</div>
                  <div className={`etc-value${mono ? " mono" : ""}${accent ? " accent" : ""}`}>{value}</div>
                  <div className="etc-note">{note}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <hr className="divider" />

        {/* ===== WHO IS THIS FOR ===== */}
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
                ["Head of AI / CTO", "You're deploying autonomous agents in production and the blast radius of a misaligned trajectory is existential.", "Runtime Governance gives you a formally audited boundary around every catastrophic reachable state — before deployment."],
                ["Chief Risk Officer", "Your board is asking how AI risk is managed. 'We monitor outputs' is no longer an acceptable answer.", "You receive a documented Ω specification, formal test evidence, and an ongoing retainer providing continuous revalidation."],
                ["Compliance / Legal", "FCA, GDPR, DORA, AI Act — regulators are requiring demonstrable runtime controls, not policy documents.", "Resurrection Tech produces evidence-grade audit artefacts suitable for regulatory submission and institutional sign-off."],
                ["Platform / DevOps Engineering", "You're responsible for the AI infrastructure. Safety is your problem when something goes catastrophically wrong.", "Runtime constraints are embedded directly in your deployment environment — not bolted on, not optional, not bypassable."],
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

        <hr className="divider" />

        {/* ===== WHAT WE DO ===== */}
        <section className="section" id="what" data-screen-label="What we do">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">What Resurrection Tech does</span>
              <h2>Operational assurance for systems that act on their own.</h2>
              <p>
                Autonomous systems navigate enormous state-spaces. Some of those states are
                catastrophic. We make the forbidden region — Ω — unreachable at runtime.
              </p>
            </div>
            <div className="dowork reveal">
              {[
                ["01 — IDENTIFY", "Identify", "Map the reachable Ω exposure across the system's full operational state-space."],
                ["02 — CONSTRAIN", "Constrain", "Define and validate the geometric boundaries that trajectories must never cross."],
                ["03 — EMBED", "Embed", "Integrate runtime governance directly into the client's deployment environment."],
                ["04 — MONITOR", "Monitor", "Maintain protection as the model, planner, and threat-surface evolve over time."],
              ].map(([num, h, p]) => (
                <div className="cell" key={h}>
                  <div className="num">{num}</div>
                  <h3>{h}</h3>
                  <p>{p}</p>
                </div>
              ))}
            </div>
            <div className="reveal" style={{ marginTop: "clamp(48px,6vw,88px)" }}>
              <p className="pull">
                We make the forbidden region <span className="accent">Ω</span> unreachable at
                runtime — identified, constrained, embedded, and monitored as the operational
                environment evolves.
              </p>
            </div>
          </div>
        </section>

        <hr className="divider" />

        {/* ===== COST OF FAILURE (QUALITATIVE) ===== */}
        <section className="section section--tight cof" id="cost-of-failure-overview" aria-label="The cost of failure">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Cost of failure</span>
              <h2>What happens if an autonomous system makes a bad decision in production?</h2>
              <p>
                When an AI agent acts on its own, a single wrong action can become a business event
                in seconds. Runtime Governance reduces this exposure before execution — and gives
                teams the confidence to deploy more automation, not less.
              </p>
            </div>
            <div className="cof-grid reveal">
              {[
                ["Regulatory investigations", "Enforcement, audits, and reporting obligations."],
                ["Financial losses", "Funds moved, payments made, value destroyed."],
                ["Data breach exposure", "Customer and proprietary data leaving the boundary."],
                ["Compliance failures", "FCA / AML / GDPR controls bypassed by an agent."],
                ["Operational disruption", "Systems changed, workflows broken, downtime."],
                ["Reputational damage", "Public incidents that outlast the fix."],
                ["Customer trust erosion", "Confidence lost across the customer base."],
                ["Confidence to deploy", "Removed exposure means more automation, safely."],
              ].map(([h, p], i) => (
                <div className={`cof-card${i === 7 ? " is-positive" : ""}`} key={h}>
                  <span className="cof-dot" aria-hidden="true" />
                  <div>
                    <div className="cof-h">{h}</div>
                    <div className="cof-p">{p}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <hr className="divider" />

        {/* ===== ROI — COST OF ONE UNSAFE EXECUTION ===== */}
        <section className="section section--tight" id="roi" aria-label="The cost of one unsafe execution">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Return on governance</span>
              <h2>The Cost of One Unsafe Execution</h2>
            </div>
            <p className="roi-lede reveal">
              Runtime Governance is priced against the cost of <span className="om">Ω</span> becoming
              reachable — not the complexity of the software.
            </p>
            <p className="roi-statement reveal">
              One prevented event can pay for <span className="num">26,666</span> audits.
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
              <div className="roi-verds">
                <div className="roi-verd">
                  <span className="vdot" aria-hidden="true" />
                  <span className="vk">Multi-agent evaluations</span>
                  <span className="vv">16/16 passed</span>
                </div>
                <div className="roi-verd">
                  <span className="vdot" aria-hidden="true" />
                  <span className="vk">Collusion detection</span>
                  <span className="vv">Verified</span>
                </div>
              </div>
            </div>

            <p className="roi-close reveal">
              The audit identifies which catastrophic states are currently reachable in your system —
              before they become a business event.
            </p>
          </div>
        </section>

        <hr className="divider" />

        {/* ===== FINANCIAL RISK COMPARISON ===== */}
        <FinancialComparison />

        <hr className="divider" />

        {/* ===== WHY RUNTIME GOVERNANCE EXISTS (BRIDGE) ===== */}
        <section className="section section--tight" id="why-fails" data-screen-label="Why Runtime Governance">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Why Runtime Governance exists</span>
              <h2>Most safety reacts. Governance prevents.</h2>
              <p>
                Traditional AI safety inspects outputs after the system has already acted. Runtime
                Governance evaluates the action before execution. Here is how it works.
              </p>
            </div>
            <div className="versus">
              <div className="vs-col legacy reveal">
                <div className="vs-tag"><span className="pip" /> Traditional safety</div>
                <div className="vs-step"><span className="si">01</span> Output generated</div>
                <div className="vs-arrow-v"><ArrowDown /></div>
                <div className="vs-step"><span className="si">02</span> Action taken</div>
                <div className="vs-arrow-v"><ArrowDown /></div>
                <div className="vs-step"><span className="si">03</span> Issue discovered later</div>
              </div>
              <div className="vs-mid"><div className="vbar" /><span>VS</span><div className="vbar" /></div>
              <div className="vs-col gov reveal" data-d="1">
                <div className="vs-tag"><span className="pip" /> Runtime Governance</div>
                <div className="vs-step"><span className="si">01</span> Trajectory evaluated</div>
                <div className="vs-arrow-v"><ArrowDown /></div>
                <div className="vs-step"><span className="si">02</span> Unsafe path detected</div>
                <div className="vs-arrow-v"><ArrowDown /></div>
                <div className="vs-step"><span className="si">03</span> Execution prevented</div>
              </div>
            </div>
          </div>
        </section>

        <hr className="divider" />

        {/* ===== UNIVERSAL RUNTIME GOVERNANCE LAYER ===== */}
        <section className="section section--tight" id="middleware" aria-label="Universal runtime governance layer">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Governance beyond the model</span>
              <h2>Governance for every AI system you already run.</h2>
              <p>
                Runtime Governance does not depend on model weights, architectures, providers, or
                training methods. The governance layer operates at the execution boundary, so the
                same safety controls govern actions regardless of where they originate. You do not
                rebuild your AI stack.
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

            <div className="mw-evolve reveal">
              <p className="mw-evolve-lede">AI providers will change. Models will improve. Agent frameworks will evolve.</p>
              <p className="mw-evolve-strong">
                Runtime Governance remains at the execution boundary — enforcing the same safety
                constraints regardless of the intelligence generating the action.
              </p>
            </div>

            <p className="mw-examples reveal">
              These providers are examples, not limits. As new models emerge, Runtime Governance
              remains unchanged — the model can change; the governance layer does not.
            </p>

            <div className="mw-callouts reveal">
              <div className="mw-callout">
                <div className="mw-callout-k">Future model compatible</div>
                <p>
                  New frontier models, open-weight systems, agent frameworks, and enterprise AI
                  stacks can be governed without redesigning the governance architecture. Governance
                  is attached to execution, not to a specific model.
                </p>
              </div>
              <div className="mw-callout mw-callout--compare">
                <div className="mw-compare-row is-legacy">
                  <span className="mw-compare-k">Traditional AI safety</span>
                  <span className="mw-compare-v">&ldquo;Every new model requires a new safety strategy.&rdquo;</span>
                </div>
                <div className="mw-compare-row is-gov">
                  <span className="mw-compare-k">Runtime Governance</span>
                  <span className="mw-compare-v">&ldquo;The same governance layer evaluates actions regardless of which model proposed them.&rdquo;</span>
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
              <span>See how it plugs into the platforms you already run</span>
              <Link href="/integrations" className="btn btn--ghost btn--sm">
                How it integrates <span className="arr">→</span>
              </Link>
            </div>
          </div>
        </section>

        <hr className="divider" />

        {/* ===== OPERATING MODEL (FLOW) ===== */}
        <section className="section section--tight" id="model" data-screen-label="Operating model">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">The operating model</span>
              <h2>Audit → Pilot → Integration → Retainer</h2>
              <p>
                A continuous operational role, not a single-report delivery. Each stage lights up as
                governance moves into the client environment.
              </p>
            </div>
            <div className="flow reveal">
              <div className="flow-track">
                {[
                  ["STAGE 01", "Audit", "Identify reachable Ω exposure before deployment.", "// 48-hour catastrophic trajectory exposure assessment. Entry point, not deliverable."],
                  ["STAGE 02", "Pilot", "Validate runtime constraints under realistic operational conditions.", "// Staging deployment. Validation, not theatre."],
                  ["STAGE 03", "Integration", "Embed runtime governance into the client environment.", "// Operational embedment, not a slide deck."],
                  ["STAGE 04", "Retainer", "Ongoing Ω governance, threat-surface monitoring, incident review, and model/planner revalidation — keeping forbidden states aligned as systems, tools, models, and regulations change.", "// Ongoing assurance, not a renewal fee."],
                ].map(([idx, h, p, more], i, arr) => (
                  <Section key={h as string} idx={idx as string} h={h as string} p={p as string} more={more as string} last={i === arr.length - 1} />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ===== REACHABILITY ===== */}
        <section className="section" id="reachability" data-screen-label="Reachability">
          <div className="wrap">
            <div className="reach">
              <div className="reach-stage reveal">
                <canvas id="reach-canvas" aria-hidden="true" />
                <CanvasScript src="/canvas/reach.js" />
              </div>
              <div>
                <div className="section-head reveal" style={{ marginBottom: 0 }}>
                  <span className="eyebrow">Ω Reachability</span>
                  <h2>Safety, expressed as geometry.</h2>
                  <p>
                    States are nodes. Transitions are edges. Governance evaluates every reachable
                    path and denies any transition that would step the system into the forbidden Ω
                    set — before it executes.
                  </p>
                </div>
                <div className="reach-legend reveal" data-d="1">
                  <div className="legend-row">
                    <span className="swatch safe" />
                    <div>
                      <b>Reachable &amp; safe</b>
                      <span>Transitions that remain outside Ω propagate freely.</span>
                    </div>
                  </div>
                  <div className="legend-row">
                    <span className="swatch blocked" />
                    <div>
                      <b>Denied transition</b>
                      <span>Edges crossing the boundary are blocked pre-execution.</span>
                    </div>
                  </div>
                  <div className="legend-row">
                    <span className="swatch omega" />
                    <div>
                      <b>Ω — forbidden region</b>
                      <span>Catastrophic states. Constrained, contained, unreachable.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== INTERACTIVE GOVERNANCE DEMO ===== */}
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
            <div className="demo-cta reveal">
              <span>Want to test your own action chain?</span>
              <Link href="/test-trajectory" className="btn btn--ghost btn--sm">
                Try the trajectory demo <span className="arr">→</span>
              </Link>
            </div>
          </div>
        </section>

        <hr className="divider" />

        {/* ===== INVARIANTS IN PLAIN ENGLISH ===== */}
        <section className="section section--tight" id="invariants" aria-label="Plain-English concept glossary">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Plain-English clarity</span>
              <h2>The concepts, without the jargon.</h2>
              <p>
                Runtime Governance uses precise technical language. Here is what each core
                term means in plain English, so you know exactly what you are buying.
              </p>
            </div>
            <div className="inv-grid">
              {([
                ["Ω — The Forbidden Region", "The set of system states your AI must never reach. Ω is not a filter — it is a geometric boundary around catastrophic outcomes. Once defined, the governance layer ensures no execution path can enter it."],
                ["Reachability", "Whether your system can ever reach a given state from where it is now. If a catastrophic state is reachable, it will eventually be reached. Governance makes the Ω set unreachable by construction."],
                ["Trajectory", "The sequence of decisions, tool calls, or actions that lead your system from its current state toward an outcome. Governance evaluates the entire trajectory — not just the final action."],
                ["Runtime Constraint", "A rule embedded directly in the execution path that prevents a prohibited action. Unlike policy, it cannot be bypassed, overridden, or forgotten by the model at inference time."],
                ["Pre-Execution Interception", "Blocking a harmful action before it happens — not detecting it after. Most AI safety operates post-hoc. Runtime Governance operates before the action executes."],
                ["Invariant", "A property that must remain true throughout every execution — for example: 'This system will never authorise a payment above threshold X without human approval.' Invariants are formally specified and enforced at runtime."],
              ] as [string, string][]).map(([term, plain]) => (
                <div className="inv-card card reveal" key={term}>
                  <div className="inv-term">{term}</div>
                  <div className="inv-plain">{plain}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <hr className="divider" />

        {/* ===== ENGAGEMENT MODEL ===== */}
        <section className="section section--tight" id="engagement" data-screen-label="Engagement model">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Engagement model</span>
              <h2>How organisations typically engage with Resurrection Tech.</h2>
              <p>
                Three one-time engagements move governance into your environment. The retainer keeps
                it protected as systems, models, and threats evolve.
              </p>
            </div>
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
            <div className="engage-note reveal">
              <div className="en-key">
                <div className="row"><span className="pill" /> One-time</div>
                <div className="row"><span className="pill rec" /> Recurring</div>
              </div>
              <div className="en-divider" aria-hidden="true" />
              <p className="en-text">
                Most organisations begin with a <b>Runtime Governance Audit</b>. If material Ω
                exposure is identified, the next step is typically a <b>Structural Safety Pilot</b>.
                Successful pilots transition into deployment and operational <b>integration</b>.
                After deployment, governance remains an ongoing process — <b>retainer</b> engagements
                provide continuous revalidation, Ω governance, threat-surface monitoring, and
                operational assurance as systems, models, and environments change.
              </p>
            </div>
          </div>
        </section>

        <hr className="divider" />

        {/* ===== DOMAINS ===== */}
        <section className="section section--tight" id="domains" data-screen-label="Domains">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Enterprise / domain integration</span>
              <h2>Target sectors &amp; Ω scope.</h2>
              <p>Indicative engagement scale by domain. The following are target sectors — not existing client claims.</p>
            </div>
            <div className="tbl-wrap reveal" data-rowreveal>
              <table className="tbl">
                <thead>
                  <tr><th>Domain</th><th>Ω definition / scope</th><th>Investment</th></tr>
                </thead>
                <tbody>
                  {[
                    ["Finance / Banking Infrastructure", "Treasury automation, payment systems, autonomous trading, settlement", "£1M–£5M+"],
                    ["Healthcare / Clinical Systems", "PHI governance, discharge workflows, medication authorization", "£750K–£3M+"],
                    ["Cybersecurity / Infrastructure", "Credential governance, shell-execution governance, orchestration", "£750K–£3M+"],
                    ["Data Privacy / Compliance", "GDPR / FCA / SOX executable runtime enforcement", "£1M–£4M+"],
                    ["Enterprise Autonomous Systems", "Internal workflow governance, auditability, autonomous operations", "£500K–£2M+"],
                    ["Insurance / Actuarial Governance", "Runtime insurability evidence & governance verification", "£750K–£3M+"],
                    ["Defence / Sovereign Infrastructure", "Autonomous coordination, classified handling, sovereign runtime governance", "£5M–£25M+"],
                  ].map(([d, s, inv]) => (
                    <tr key={d}>
                      <td data-l="Domain" className="t-main">{d}</td>
                      <td data-l="Scope">{s}</td>
                      <td data-l="Investment" className="t-price">{inv}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="note-strip reveal">
              <div><div className="k">ARR target / client</div><div className="v"><b>£500K–£2M+</b> annually</div></div>
              <div><div className="k">Sovereign / defence retainers</div><div className="v"><b>£1M–£5M+</b> / yr</div></div>
            </div>
          </div>
        </section>

        {/* ===== FINAL CTA ===== */}
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

function TrustBar() {
  return (
    <div className="trust-bar" aria-label="Validation credentials">
      <div className="wrap">
        <div className="tb-inner">
          <span className="tb-item"><span className="tb-dot" aria-hidden="true" />Patent GB2600765.8</span>
          <span className="tb-sep" aria-hidden="true" />
          <span className="tb-item"><span className="tb-dot" aria-hidden="true" />171/171 Tests Passed</span>
          <span className="tb-sep" aria-hidden="true" />
          <span className="tb-item"><span className="tb-dot" aria-hidden="true" />Zero False Positives</span>
          <span className="tb-sep" aria-hidden="true" />
          <span className="tb-item"><span className="tb-dot" aria-hidden="true" />Cross-Model Validated</span>
        </div>
      </div>
    </div>
  );
}

function Section({ idx, h, p, more, last }: { idx: string; h: string; p: string; more: string; last: boolean }) {
  return (
    <>
      <div className="flow-stage">
        <div className="st-idx"><span>{idx}</span><span className="dot" /></div>
        <h3>{h}</h3>
        <p>{p}</p>
        <div className="st-more"><p>{more}</p></div>
      </div>
      {!last && (
        <div className="flow-arrow" aria-hidden="true">
          <ArrowR />
        </div>
      )}
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
