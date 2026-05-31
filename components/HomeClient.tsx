"use client";

import { useState } from "react";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { CanvasScript } from "@/components/CanvasScript";
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
              <div className="hero-tag reveal in">
                <span className="dot pulse-dot" /> Morrison Runtime Governance™ · Live boundary
                enforcement
              </div>
              <h1 className="reveal in" data-d="1">
                Runtime Governance
                <br />
                for <span className="grad">Autonomous Systems</span>
              </h1>
              <p className="hero-sub reveal in" data-d="2">
                We identify, constrain, embed, and monitor runtime governance boundaries —
                preventing catastrophic reachable states before execution.
              </p>
              <div className="hero-chips reveal in" data-d="3">
                <span>Safety as Geometry</span>
                <span>Intelligence as Reachability</span>
                <span>Deployment-Ready Governance</span>
              </div>
              <div className="hero-actions reveal in" data-d="4">
                <Link
                  href="/request-audit"
                  className="btn btn--primary"
                  onClick={() => track(Events.CTA_CLICK, { location: "hero" })}
                >
                  Request 48-Hour Runtime Governance Audit <span className="arr">→</span>
                </Link>
                <Link href="/enterprise-pathways" className="btn btn--ghost">
                  View Enterprise Pathways
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

        {/* ===== MODEL-AGNOSTIC MIDDLEWARE ===== */}
        <section className="section section--tight" id="middleware" aria-label="Model-agnostic middleware">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Model-agnostic middleware</span>
              <h2>Governance that works regardless of which model you run.</h2>
              <p>
                Runtime Governance operates at the execution boundary — not inside any model.
                It intercepts transitions before they execute, independently of model architecture,
                provider, or deployment topology.
              </p>
            </div>
            <div className="mw-arch reveal">
              <div className="mw-layer mw-models">
                <div className="mw-layer-label">Your AI model layer</div>
                <div className="mw-model-chips">
                  {["GPT-4o", "Claude 3.5", "Gemini 1.5", "Llama 3", "Mistral", "Custom LLM"].map((m) => (
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
                    <div className="mw-gov-title">Runtime Governance Layer</div>
                    <div className="mw-gov-sub">Trajectory evaluation · Boundary enforcement · Pre-execution interception</div>
                  </div>
                </div>
              </div>
              <div className="mw-arrow" aria-hidden="true">
                <div className="mw-arrow-line" />
                <div className="mw-arrow-cap">↓ safe trajectories only</div>
              </div>
              <div className="mw-layer mw-system">
                <div className="mw-layer-label">Your system · tools · external actions</div>
              </div>
            </div>
            <div className="mw-note reveal">
              <div className="mwn-row">
                <span className="mwn-dot safe" />
                <span>Safe trajectories pass through to execution</span>
              </div>
              <div className="mwn-row">
                <span className="mwn-dot blocked" />
                <span>Ω-bound trajectories are blocked pre-execution, regardless of model or provider</span>
              </div>
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
                  ["STAGE 04", "Retainer", "Maintain Ω evolution, threat-surface monitoring, incident review, and model/planner revalidation.", "// Ongoing assurance, not a renewal fee."],
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
                Select a trajectory below. Runtime Governance evaluates each transition
                before execution — safe paths proceed, Ω-bound paths are blocked pre-action.
              </p>
            </div>
            <GovernanceDemo />
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

        {/* ===== WHY TRADITIONAL FAILS ===== */}
        <section className="section section--tight" id="why-fails" data-screen-label="Why traditional fails">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Why traditional AI safety fails</span>
              <h2>Most safety reacts. Governance prevents.</h2>
              <p>
                Conventional safety inspects outputs after the system has already acted. Runtime
                Governance evaluates the trajectory and denies unsafe execution before it happens.
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

        {/* ===== THREAT COVERAGE ===== */}
        <section className="section section--tight" id="threats" aria-label="Threat coverage">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Threat coverage</span>
              <h2>What Runtime Governance protects against.</h2>
              <p>
                Autonomous systems fail in specific, predictable ways. Runtime Governance
                addresses the threat classes that cause catastrophic, irreversible outcomes.
              </p>
            </div>
            <div className="threat-grid">
              {([
                ["T01", "Unauthorised Autonomous Action", "Agent executes transactions, modifies systems, or triggers workflows outside its defined authorisation scope — without human approval."],
                ["T02", "Data Exfiltration via Tool Use", "Agent uses permitted tools to extract sensitive data across a boundary — PII, credentials, proprietary data — beyond the tool's intended scope."],
                ["T03", "Privilege Escalation in Multi-Agent Systems", "An agent acquires permissions or capabilities not explicitly granted, exploiting coordination gaps in multi-agent pipeline architectures."],
                ["T04", "Regulatory Boundary Violation", "Agent takes an action that is operationally possible but legally prohibited — breaching payment limits, exposing PHI, or bypassing FCA controls."],
                ["T05", "Cascading Failures Across Agent Pipelines", "A single unsafe decision propagates through downstream agents or tools, amplifying the blast radius before any human-in-the-loop can intervene."],
                ["T06", "Hallucination-Driven Catastrophic Action", "Model generates a confident but incorrect output that drives the system into an irreversible action — wire transfer, system shutdown, or credential change."],
              ] as [string, string, string][]).map(([n, title, desc], i) => (
                <div className="threat-card card reveal" key={n} data-d={i > 0 ? String(Math.min(i, 5)) : undefined}>
                  <div className="threat-n">{n}</div>
                  <div className="threat-title">{title}</div>
                  <div className="threat-desc">{desc}</div>
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
                provide continuous revalidation, Ω evolution, threat-surface monitoring, and
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

        {/* ===== COMMERCIAL POSITIONING ===== */}
        <section className="section section--tight" id="positioning" data-screen-label="Positioning">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Commercial positioning</span>
              <h2>Operational assurance infrastructure — not a one-off audit vendor.</h2>
              <p>
                The offering is to find, constrain, embed, and monitor runtime governance boundaries
                for autonomous systems: a continuous operational role rather than a single-report delivery.
              </p>
            </div>
            <div className="callout reveal" style={{ marginBottom: 26 }}>
              <div className="clines">
                {[
                  ["01", "The audit identifies the ", "trajectory", "."],
                  ["02", "The pilot ", "constrains", " it."],
                  ["03", "The integration ", "embeds", " governance."],
                  ["04", "The retainer ", "maintains", " protection as the environment evolves."],
                ].map(([idx, pre, v, post]) => (
                  <div className="cl" key={idx}>
                    <span className="idx">{idx}</span>
                    <span className="ck">{pre}<span className="v">{v}</span>{post}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="pos-grid reveal">
              {[
                ["The audit is the entry point", "the", "deliverable"],
                ["The pilot is validation", "", "theatre"],
                ["The integration is operational embedment", "a", "slide deck"],
                ["The retainer is ongoing assurance", "a", "renewal fee"],
              ].map(([is, pre, struck]) => (
                <div className="pos-cell" key={is}>
                  <div className="is">{is}</div>
                  <div className="isnt">not {pre ? `${pre} ` : ""}<s>{struck}</s></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <hr className="divider" />

        {/* ===== ENTERPRISE ENGAGEMENT PROCESS ===== */}
        <section className="section section--tight" id="process" data-screen-label="Engagement process">
          <div className="wrap">
            <div className="section-head reveal">
              <span className="eyebrow">Enterprise engagement process</span>
              <h2>From first contact to standing protection.</h2>
              <p>
                A controlled, auditable path into operational governance — structured for procurement,
                security review, and institutional sign-off.
              </p>
            </div>
            <div className="proc">
              {[
                ["01", "Scoping", "// Define Ω, blast radius, and regulatory exposure."],
                ["02", "Audit", "// 48-hour reachable-state exposure assessment."],
                ["03", "Pilot", "// Staging validation under operational conditions."],
                ["04", "Integration", "// Governance embedded in the client environment."],
                ["05", "Retainer", "// Continuous revalidation as the environment evolves."],
              ].map(([n, h, p], i) => (
                <div className="proc-step reveal" key={h} data-d={i > 0 ? String(i) : undefined}>
                  <div className="pn">{n}</div>
                  <h4>{h}</h4>
                  <p>{p}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== FINAL CTA ===== */}
        <section className="section cta-final" id="contact" data-screen-label="Contact">
          <div className="wrap">
            <div className="inner reveal">
              <span className="eyebrow" style={{ justifyContent: "center" }}>Request a Runtime Governance Assessment</span>
              <h2 style={{ marginTop: 20 }}>Identify catastrophic reachable states before execution.</h2>
              <p>
                For autonomous systems, agentic workflows, AI tool-use pipelines, high-risk
                automation, and enterprise deployment environments where catastrophic reachable
                states must be identified before they execute.
              </p>
              <div className="hero-actions" style={{ marginTop: 38 }}>
                <Link href="/request-audit" className="btn btn--primary">Request Audit <span className="arr">→</span></Link>
                <Link href="/enterprise-pathways" className="btn btn--ghost">Discuss Enterprise Pilot</Link>
                <Link href="/licensing" className="btn btn--ghost">View Licensing Framework</Link>
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

function GovernanceDemo() {
  const [mode, setMode] = useState<"idle" | "safe" | "unsafe">("idle");
  const [phase, setPhase] = useState(0);

  function run(m: "safe" | "unsafe") {
    setMode("idle");
    setPhase(0);
    setTimeout(() => {
      setMode(m);
      setPhase(1);
      setTimeout(() => setPhase(2), 700);
      setTimeout(() => setPhase(3), 1400);
    }, 60);
  }

  const blocked = mode === "unsafe" && phase >= 2;
  const reached = mode === "safe" && phase >= 3;

  return (
    <div className="gdemo reveal">
      <div className="gdemo-graph" role="img" aria-label="Trajectory evaluation diagram">
        <div className={`gdemo-start${phase >= 1 ? " active" : ""}`}>
          <span className="gn-label">Start state</span>
        </div>
        <div className="gdemo-connector" aria-hidden="true" />
        <div className="gdemo-paths">
          <div className="gdemo-path">
            <div className={`gdemo-edge${mode === "safe" && phase >= 2 ? " lit-safe" : ""}`} aria-hidden="true" />
            <div className={`gdemo-dest gdemo-dest--safe${reached ? " reached" : ""}`}>
              <span className="gn-icon" aria-hidden="true">{reached ? "✓" : "→"}</span>
              <span className="gn-label">Safe destination</span>
              <span className="gn-sub">Execution proceeds</span>
            </div>
          </div>
          <div className="gdemo-path">
            <div className={`gdemo-edge${mode === "unsafe" && phase >= 2 ? " lit-unsafe" : ""}`} aria-hidden="true" />
            <div className={`gdemo-dest gdemo-dest--omega${blocked ? " blocked" : ""}`}>
              <span className="gn-icon" aria-hidden="true">{blocked ? "⛔" : "Ω"}</span>
              <span className="gn-label">{blocked ? "Blocked" : "Forbidden region"}</span>
              <span className="gn-sub">{blocked ? "Pre-execution intercept" : "Ω-bound trajectory"}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="gdemo-status" aria-live="polite" aria-atomic="true">
        {mode === "idle" && <span className="gds-idle">Select a trajectory below to see runtime governance in action.</span>}
        {mode !== "idle" && phase < 2 && <span className="gds-eval">↻ Evaluating trajectory...</span>}
        {reached && <span className="gds-safe">✓ No Ω-bound states on trajectory. Execution allowed.</span>}
        {blocked && <span className="gds-blocked">⛔ Ω-bound state detected on trajectory. Execution blocked pre-action.</span>}
      </div>
      <div className="gdemo-controls">
        <button
          className="btn btn--ghost btn--sm"
          onClick={() => run("safe")}
          type="button"
          aria-label="Simulate a safe trajectory"
        >
          Simulate safe trajectory
        </button>
        <button
          className="btn btn--omega btn--sm"
          onClick={() => run("unsafe")}
          type="button"
          aria-label="Simulate an Omega-bound unsafe trajectory"
        >
          Simulate Ω-bound trajectory
        </button>
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
