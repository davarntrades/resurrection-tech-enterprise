"use client";

import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { BoundaryDiagram } from "@/components/home/BoundaryDiagram";
import { useSiteMotion } from "@/components/useSiteMotion";
import { Events, track } from "@/lib/analytics";

/* The control boundary, top to bottom. The authority layer is the only row
   that carries the accent — it is the thing the company does. */
const CONTROL_STACK: {
  idx: string;
  name: string;
  verb: string;
  body: string;
  authority?: boolean;
}[] = [
  {
    idx: "01",
    name: "Agent",
    verb: "proposes action",
    body: "An autonomous system proposes a state-changing action across software, infrastructure, finance, enterprise systems or physical environments.",
  },
  {
    idx: "02",
    name: "Morrison Runtime Governance™",
    verb: "independently evaluates",
    body: "The proposed transition is evaluated outside the agent, against declared policy, authority and reachable state — not by the system that proposed it.",
    authority: true,
  },
  {
    idx: "03",
    name: "Admissible Operating Envelope",
    verb: "defines the permitted region",
    body: "The declared set of states, actions, transitions and operating conditions permitted in this environment, with the forbidden region Ω stated explicitly.",
  },
  {
    idx: "04",
    name: "Execution",
    verb: "commits authorized action",
    body: "Only a transition that satisfies authorization reaches the execution path. Everything else is escalated or terminated before it commits.",
  },
];

/* Only figures that this repository actually publishes are shown here. The
   latency figures come from public/benchmarks/latency.json and are quoted with
   the conditions that produced them; no certification or field-deployment
   claim is made, because none is held. */
const PROOF = [
  { value: "LIVE", label: <>Working runtime governance system, executable in the browser</> },
  { value: "129,857+", label: <>Recorded governance evaluations across model architectures</> },
  { value: "219", label: <>Test functions in the governance repository</> },
  { value: "0.0%", label: <>False positives and false negatives on the governed test suite</> },
  {
    value: "SUB-MS",
    label: (
      <>
        Measured single-step authorization — <b>p50 0.298 ms</b>, p95 0.338 ms on the published
        benchmark environment
      </>
    ),
  },
  { value: "BOUNDED", label: <>State-space verification within a declared environment</> },
  { value: "AUDITABLE", label: <>Evidence chains and deterministic replay of every decision</> },
];

/* When a control moves onto the mandatory operating path it stops being a
   feature. Each row is a precedent; the last is the claim. */
const INFRASTRUCTURE_MAP: { from: string; to: string; now?: boolean }[] = [
  { from: "Identity", to: "Access" },
  { from: "TLS", to: "Trusted communication" },
  { from: "Payment rails", to: "Digital commerce" },
  { from: "Independent authorization", to: "Autonomous execution", now: true },
];

const SOVEREIGN_ATTRS = [
  "Signed local policy",
  "Customer-controlled authority",
  "Local evidence",
  "Fail-closed operation",
  "No required external control plane",
  "No required network dependency",
];

export function HomeClient() {
  useSiteMotion();

  return (
    <>
      <Nav />
      <main id="top" className="rt-home">
        {/* ══════════ 01 — WHO CONTROLS WHAT BECOMES EXECUTABLE? ══════════ */}
        <header className="rt-section rt-section--first rt-hero" aria-labelledby="hero-title">
          <div className="rt-wrap">
            <span className="rt-eyebrow reveal in">Resurrection Tech™</span>

            <h1 id="hero-title" className="rt-display rt-hero-title reveal in" data-d="1">
              Who controls
              <br />
              what becomes executable?
            </h1>

            <div className="rt-hero-body reveal in" data-d="2">
              <p className="rt-lede">
                Autonomous systems can propose actions across software, infrastructure, finance,
                enterprise systems and physical environments.
              </p>
              <p className="rt-lede">
                Resurrection Tech independently authorizes which proposed transitions are permitted
                to cross into execution.
              </p>
            </div>

            <p className="rt-principle rt-hero-principle reveal in" data-d="3">
              Capability <span className="neq">≠</span> Authority
            </p>

            <div className="rt-actions reveal in" data-d="4">
              <Link
                href="/live-demo"
                className="btn btn--primary btn--live"
                onClick={() => track(Events.CTA_CLICK, { location: "hero", cta: "live-demo" })}
              >
                <span className="live-pip" aria-hidden="true" />
                Try Live Demo <span className="arr">→</span>
              </Link>
              <Link
                href="/book#assessment"
                className="btn btn--ghost"
                onClick={() => track(Events.CTA_CLICK, { location: "hero", cta: "book" })}
              >
                Book Runtime Assessment <span className="arr">→</span>
              </Link>
              <Link href="/technology" className="btn btn--text">
                Explore Morrison Runtime Governance
              </Link>
            </div>
          </div>

          {/* The execution path, with the authority layer occupied. */}
          <div className="rt-wrap rt-hero-path reveal" data-d="5">
            <div className="rt-path">
              <div className="rt-path-node">
                <span className="n-label">01 / Proposal</span>
                <span className="n-title">Agent proposes</span>
                <span className="n-desc">A state-changing action is requested.</span>
              </div>
              <div className="rt-path-link" aria-hidden="true">
                <span className="rt-path-glyph">→</span>
              </div>
              <div className="rt-path-node rt-path-node--authority">
                <span className="n-label">02 / Authority</span>
                <span className="n-title">Morrison authorizes</span>
                <span className="n-desc">Evaluated independently of the proposing system.</span>
              </div>
              <div className="rt-path-link" aria-hidden="true">
                <span className="rt-path-glyph">→</span>
              </div>
              <div className="rt-path-node">
                <span className="n-label">03 / Execution</span>
                <span className="n-title">Action commits</span>
                <span className="n-desc">Only an authorized transition crosses.</span>
              </div>
            </div>
          </div>
        </header>

        {/* ══════════ 02 — THE MISSING LAYER ══════════ */}
        <section className="rt-section rt-section--band" aria-labelledby="missing-title">
          <div className="rt-wrap">
            <span className="rt-eyebrow reveal">The missing layer</span>
            <h2 id="missing-title" className="rt-h2 rt-narrow reveal" data-d="1">
              A represented constraint
              <br />
              does not prevent execution.
            </h2>

            <p className="rt-principle rt-principle--stack rt-missing-principle reveal" data-d="2">
              <span>Representation</span>
              <span className="neq">≠</span>
              <span>Causal enforcement</span>
            </p>

            <div className="rt-missing-body reveal" data-d="3">
              <p className="rt-lede">
                Instructions, policies, permissions, evaluations and monitoring can describe or
                influence acceptable operation.
              </p>
              <p className="rt-lede">
                They do not, by themselves, make a prohibited state transition impossible.
              </p>
            </div>
          </div>
        </section>

        {/* ══════════ 03 — THE CONTROL BOUNDARY ══════════ */}
        <section className="rt-section" aria-labelledby="boundary-title">
          <div className="rt-wrap">
            <span className="rt-eyebrow reveal">The control boundary</span>
            <h2 id="boundary-title" className="rt-h2 rt-narrow reveal" data-d="1">
              The authority layer sits
              <br />
              between proposal and execution.
            </h2>

            <div className="rt-boundary-grid">
              <div className="reveal" data-d="2">
                <div className="rt-stack">
                  {CONTROL_STACK.map((row) => (
                    <div
                      key={row.idx}
                      className={`rt-stack-row${row.authority ? " rt-stack-row--authority" : ""}`}
                    >
                      <span className="s-idx">{row.idx}</span>
                      <div>
                        <span className="s-name">{row.name}</span>
                        <span className="s-verb">{row.verb}</span>
                      </div>
                      <p className="s-body">{row.body}</p>
                    </div>
                  ))}
                </div>

                <div className="rt-verdicts">
                  <div className="rt-verdict rt-verdict--allow">
                    <span className="v-key"><span className="v-mark" aria-hidden="true" />Allow</span>
                    <span className="v-desc">The transition is admissible and proceeds to execution.</span>
                  </div>
                  <div className="rt-verdict rt-verdict--escalate">
                    <span className="v-key"><span className="v-mark" aria-hidden="true" />Escalate</span>
                    <span className="v-desc">Authorization is withheld pending an independent approval.</span>
                  </div>
                  <div className="rt-verdict rt-verdict--block">
                    <span className="v-key"><span className="v-mark" aria-hidden="true" />Block</span>
                    <span className="v-desc">The transition is terminated before it reaches the execution path.</span>
                  </div>
                </div>
              </div>

              <div className="reveal" data-d="3">
                <BoundaryDiagram />
              </div>
            </div>

            <p className="rt-principle rt-boundary-statement reveal">
              A proposed transition
              <br />
              does not execute
              <br />
              until authorization is satisfied.
            </p>
          </div>
        </section>

        {/* ══════════ 04 — MEASURED, NOT ASSERTED ══════════ */}
        <section className="rt-section rt-section--band" aria-labelledby="proof-title">
          <div className="rt-wrap">
            <span className="rt-eyebrow reveal">Measured, not asserted</span>
            <h2 id="proof-title" className="rt-h2 rt-narrow reveal" data-d="1">
              Every claim on this site
              <br />
              is inspectable.
            </h2>

            <div className="rt-proof reveal" data-d="2">
              {PROOF.map((row) => (
                <div className="rt-proof-row" key={row.value}>
                  <span className="p-value">{row.value}</span>
                  <span className="p-label">{row.label}</span>
                </div>
              ))}
            </div>

            <div className="rt-links reveal">
              <Link href="/live-demo">View live demo</Link>
              <Link href="/evidence">View evidence</Link>
              <a href="https://github.com/resurrection-tech" target="_blank" rel="noopener noreferrer">
                View GitHub<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>

            <div className="rt-claim rt-proof-claim reveal">
              <span className="c-key">Claim boundary</span>
              <p>
                These figures describe defined test suites and a declared environment. This is{" "}
                <strong>bounded verification, not a universal proof of AI safety</strong>. If the
                deployment context changes materially, the envelope is revalidated.
              </p>
            </div>
          </div>
        </section>

        {/* ══════════ 05 — FROM FEATURE TO INFRASTRUCTURE ══════════ */}
        <section className="rt-section" aria-labelledby="infra-title">
          <div className="rt-wrap">
            <span className="rt-eyebrow reveal">When control becomes non-optional</span>
            <h2 id="infra-title" className="sr-only">
              From feature to infrastructure
            </h2>

            <div className="rt-map reveal" data-d="1">
              {INFRASTRUCTURE_MAP.map((row) => (
                <div
                  key={row.from}
                  className={`rt-map-row${row.now ? " rt-map-row--now" : ""}`}
                >
                  <span className="m-from">{row.from}</span>
                  <span className="m-arrow" aria-hidden="true">→</span>
                  <span className="m-to">{row.to}</span>
                </div>
              ))}
            </div>

            <p className="rt-principle rt-infra-statement reveal" data-d="2">
              Once a control sits on the mandatory operating path,
              it stops behaving like a feature.
              <br />
              <span className="rt-infra-claim">It becomes infrastructure.</span>
            </p>
          </div>
        </section>

        {/* ══════════ 06 — SOVEREIGN ══════════ */}
        <section className="rt-section theme-dark rt-sovereign" aria-labelledby="sovereign-title">
          <div className="rt-wrap">
            <span className="rt-eyebrow reveal">Sovereign execution control</span>
            <h2 id="sovereign-title" className="rt-h2 rt-narrow reveal" data-d="1">
              The same kernel.
              <br />
              With the network taken away.
            </h2>

            <p className="rt-lede reveal" data-d="2">
              Guardian OS Sovereign preserves the same execution-control contract across cloud,
              hybrid, private cloud, on-premises, sovereign and air-gapped deployment profiles.
            </p>

            <ul className="rt-attrs rt-sovereign-attrs reveal" data-d="3">
              {SOVEREIGN_ATTRS.map((attr, i) => (
                <li key={attr}>
                  <span className="a-idx">{String(i + 1).padStart(2, "0")}</span>
                  {attr}
                </li>
              ))}
            </ul>

            <div className="rt-actions reveal">
              <Link
                href="/guardian-os/sovereign"
                className="btn btn--primary"
                onClick={() => track(Events.CTA_CLICK, { location: "sovereign", cta: "sovereign" })}
              >
                Explore Sovereign <span className="arr">→</span>
              </Link>
            </div>
          </div>
        </section>

        {/* ══════════ 07 — CLOSING ══════════ */}
        <section className="rt-section rt-closing" id="contact" aria-labelledby="closing-title">
          <span id="onboarding" className="rt-anchor" aria-hidden="true" />
          <span id="demo" className="rt-anchor" aria-hidden="true" />
          <div className="rt-wrap">
            <h2 id="closing-title" className="rt-principle rt-principle--center reveal">
              If autonomous capability expands,
              <br />
              execution authority must remain controlled.
            </h2>

            <p className="rt-lede rt-closing-lede reveal" data-d="1">
              Resurrection Tech is building the execution-control layer for autonomous systems.
            </p>

            <div className="rt-actions rt-actions--center reveal" data-d="2">
              <Link
                href="/live-demo"
                className="btn btn--primary btn--live"
                onClick={() => track(Events.CTA_CLICK, { location: "final-cta", cta: "live-demo" })}
              >
                <span className="live-pip" aria-hidden="true" />
                Try Live Demo <span className="arr">→</span>
              </Link>
              <Link
                href="/book#assessment"
                className="btn btn--ghost"
                onClick={() => track(Events.CTA_CLICK, { location: "final-cta", cta: "book" })}
              >
                Book Runtime Assessment <span className="arr">→</span>
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
