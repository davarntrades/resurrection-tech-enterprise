"use client";

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
