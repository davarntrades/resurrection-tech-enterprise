import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Evidence — Measured, Not Asserted",
  description:
    "The evidence repository for Morrison Runtime Governance: benchmarks, bounded verification, repository tests, runtime evidence, sovereign acceptance testing, fail-closed testing, evidence-chain structure, deterministic replay, and the limits of every claim.",
  alternates: { canonical: "/evidence" },
};

const REPO = "https://github.com/davarntrades/Morrison-Runtime-Governance";

/* Every figure below is either published in this repository or rendered by the
   running system. Nothing is quoted without the conditions that produced it. */
const HEADLINE = [
  { v: "129,857+", l: <>Recorded governance evaluations across model architectures</> },
  { v: "171/171", l: <>Test cases passed across coverage scenarios</> },
  { v: "16/16", l: <>Multi-agent and collusion evaluations passed</> },
  { v: "219", l: <>Test functions in the governance repository</> },
  { v: "0.0%", l: <>False positives on the governed test suite</> },
  { v: "0.0%", l: <>False negatives on the governed test suite</> },
];

const LATENCY_ROWS: [string, string, string, string, string][] = [
  ["Single-step", "1", "0.298", "0.338", "3,284"],
  ["Short", "2", "0.745", "0.807", "1,323"],
  ["Medium", "4", "2.334", "2.403", "426"],
  ["Long", "8", "5.414", "5.522", "184"],
  ["Very long", "16", "11.501", "11.722", "87"],
  ["Multi-agent (joint)", "3", "1.559", "1.622", "638"],
];

/* The inspection surface, grouped by what a reviewer is actually trying to
   establish. Each row says what exists today and links to it where it is
   published. */
const SECTIONS: {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  rows: [string, React.ReactNode][];
}[] = [
  {
    id: "benchmarks",
    eyebrow: "Benchmarks",
    title: "Latency and throughput, with the environment stated.",
    body:
      "The benchmark calls the real evaluation path — the same engine and deployment rule set the live service runs. Each class is warmed up, then timed per call; percentiles come from the sorted sample.",
    rows: [
      ["Report", <a key="r" href="/benchmarks/runtime-governance-benchmarks.md">runtime-governance-benchmarks.md</a>],
      ["Raw data", <a key="d" href="/benchmarks/latency.json">latency.json</a>],
      ["Configuration", <>Horizon 3, 96 Ω rules across 9 domains, 800 iterations per class after 100 warm-up calls, single-threaded.</>],
      ["Environment", <>Python 3.12.14, Linux x86_64, 4 logical CPUs. Representative figures, not a production-hardware guarantee.</>],
    ],
  },
  {
    id: "verification",
    eyebrow: "Bounded verification",
    title: "Reach_G(X₀) ∩ Ω = ∅, within a declared model.",
    body:
      "The verification condition is that no configured forbidden state remains reachable under the governed transition system, within the declared environment, tools, permissions, policies and horizon.",
    rows: [
      ["What is verified", <>That the declared Ω set is unreachable under the governed transition system, over the declared horizon.</>],
      ["What is not verified", <>That the underlying model is safe in every environment, under every tool set, or under every future configuration.</>],
      ["Revalidation trigger", <>A material change to tools, permissions, policies, agent architecture or deployment context.</>],
      ["Read the method", <Link key="t" href="/technology#verification">Technology — bounded verification</Link>],
    ],
  },
  {
    id: "harness",
    eyebrow: "Global Safety Verification Harness",
    title: "The evaluation hierarchy, layer by layer.",
    body:
      "Evaluation runs as a layered hierarchy. Each layer answers a different question about the proposed trajectory, and every layer runs before execution.",
    rows: [
      ["A_safe", <>Single-step forbidden actions.</>],
      ["V2", <>Source → sink data-flow taint, including cross-agent paths.</>],
      ["V3", <>Forward reachability over horizon k ≥ 2.</>],
      ["V4", <>State-space admissibility: permissions, scope, schema.</>],
      ["V4+ / V5", <>Feasibility and environmental stability.</>],
      ["V5+", <>Extended deployment layer: finance hardening and adversarial coverage.</>],
    ],
  },
  {
    id: "tests",
    eyebrow: "Repository tests",
    title: "219 test functions, in a repository you can read.",
    body:
      "The governance engine, its Ω definitions and its deployment rules are exercised by the repository's own suite. Coverage scenarios, multi-agent scenarios and adversarial cases are part of it.",
    rows: [
      ["Repository", <a key="g" href={REPO} target="_blank" rel="noopener noreferrer">github.com/davarntrades/Morrison-Runtime-Governance<span className="sr-only"> (opens in a new tab)</span></a>],
      ["Coverage scenarios", <>171 of 171 test cases passing.</>],
      ["Multi-agent", <>16 of 16 collusion and delegation evaluations passing.</>],
      ["Tested architectures", <>GPT, Claude, Gemini, Llama and Mistral families — governance operates at the execution boundary, independent of the model.</>],
      ["Tested domains", <>Finance and banking, healthcare and PHI, cybersecurity and credentials, data privacy and GDPR, each with domain-specific Ω definitions.</>],
    ],
  },
  {
    id: "runtime",
    eyebrow: "Runtime evidence",
    title: "What a governed run records.",
    body:
      "Every governed run emits a record: the proposal, the policy state in force, the verdict and its governing rule, any approval, the execution result, and a hash linking it to the record before it.",
    rows: [
      ["Audit export", <>Structured JSON export of the evaluation chain, versioned by schema.</>],
      ["Latency recorded per run", <>Evaluation latency, approval wait and downstream provider latency are recorded separately.</>],
      ["Attestation", <>Each verdict carries the engine commit and ruleset hash that produced it.</>],
      ["Logging scope", <>Metadata only — tool arguments and payloads are not stored.</>],
      ["Structure", <Link key="c" href="/technology#evidence-chain">Technology — evidence chain</Link>],
    ],
  },
  {
    id: "replay",
    eyebrow: "Deterministic replay",
    title: "The same trajectory reproduces the same verdict.",
    body:
      "Verdicts are produced by deterministic evaluation against declared constraints, not by a model judging its own output. That is what makes a record replayable rather than merely stored.",
    rows: [
      ["Determinism", <>The same proposed trajectory against the same policy state produces the same verdict and the same trajectory hash.</>],
      ["Tamper detection", <>An altered record fails chain verification: each entry hashes the one before it.</>],
      ["Replay target", <>Replay runs against the pinned engine commit recorded in the attestation.</>],
    ],
  },
  {
    id: "sovereign",
    eyebrow: "Sovereign acceptance testing",
    title: "What CI proves about an isolated deployment.",
    body:
      "The sovereign profile is exercised in CI with the network removed, not simulated. Each item below is asserted by a test.",
    rows: [
      ["Network", <>CI runs the platform in a network namespace with no interface but loopback, and the engine in a container started with no network.</>],
      ["Policy", <>Signed local bundles enforced with no database, control plane or network connection.</>],
      ["Signatures", <>Ed25519 verification with the standard library alone; the signing key never enters the environment.</>],
      ["Tamper", <>A tampered bundle fails closed and loads zero active policies.</>],
      ["Interface", <>Zero external requests — no font CDN, analytics or embeds. Measured on every build.</>],
      ["Evidence", <>Evidence packs, attestations and control mappings render locally, with no browser installed.</>],
      ["Status", <Link key="s" href="/guardian-os/sovereign#status">Acceptance-testable, not yet field-validated</Link>],
    ],
  },
  {
    id: "fail-closed",
    eyebrow: "Fail-closed testing",
    title: "The absence of an authorization is not an authorization.",
    body:
      "Fail-closed is the default path and is not configurable away. It is asserted rather than described.",
    rows: [
      ["Unverifiable policy", <>A bundle that fails signature verification loads zero active policies.</>],
      ["Evaluator unreachable", <>The transition is not authorized, so the call is not issued.</>],
      ["Timeout", <>Resolved as not authorized, never as proceed.</>],
      ["Acceptance tooling", <>Verifies a live unauthorised action and the evidence chain it produces.</>],
    ],
  },
  {
    id: "comparison",
    eyebrow: "Governed vs ungoverned",
    title: "The comparison is run, not asserted.",
    body:
      "The evaluation corpus contains adversarial and benign trajectories. The ungoverned path executes them; the governed path evaluates them at the boundary first.",
    rows: [
      ["Adversarial corpus", <>Trajectories constructed to reach Ω through single-step, chained, cross-agent and multi-representation paths.</>],
      ["Benign corpus", <>Trajectories that must remain admissible — the false-positive measurement.</>],
      ["Result", <>0.0% false positives and 0.0% false negatives on the governed test suite.</>],
      ["Run one", <Link key="l" href="/live-demo">Live console</Link>],
    ],
  },
  {
    id: "integrations",
    eyebrow: "Integrations",
    title: "The same contract at every dispatch point.",
    body:
      "The adapter changes with the framework; the authorization contract does not. Each integration places the boundary at the point where a call would otherwise be issued.",
    rows: [
      ["Frameworks", <>OpenAI Agents, LangGraph, LangChain, AutoGen, Amazon Bedrock, MCP servers, custom orchestrators.</>],
      ["Contract", <>Identity → policy → verdict → approval → execution → evidence.</>],
      ["Surface", <Link key="d" href="/developers">Developer surface</Link>],
    ],
  },
];

/* Open items, stated as commitments rather than left implicit. A reviewer will
   ask for each of these; the answer should already be written down. */
const OPEN_ITEMS = [
  ["Independent benchmark audit", "Not yet commissioned. The benchmark is reproducible from the published report and raw data, but has not been audited by a third party."],
  ["Public reference verifier", "In preparation. Until it ships, reproduction requires the repository rather than a hosted verifier."],
  ["Field validation", "No sovereign deployment has run on customer hardware. Install media, images and the acceptance suite exist; a witnessed site record does not."],
  ["Third-party accreditation", "None held. No Common Criteria evaluation, no NCSC assurance, no FedRAMP authorisation, no ATO."],
  ["Independent penetration test", "Not yet commissioned."],
  ["Domain coverage", "Coverage reflects the domains listed above. Other domains require their own envelope definition, Ω specification and validation."],
];

export default function Page() {
  return (
    <PageShell>
      {/* ══════════ LEAD ══════════ */}
      <section className="rt-section rt-section--first" aria-labelledby="ev-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal in">Evidence</span>
          <h1 id="ev-title" className="rt-display rt-ev-title reveal in" data-d="1">
            Measured,
            <br />
            not asserted.
          </h1>
          <p className="rt-lede reveal in" data-d="2">
            What was tested, how it was tested, what the numbers mean — and what they do not mean.
            Every figure on this page is either published in the governance repository or produced
            by the running system, and is quoted with the conditions that produced it.
          </p>

          <div className="rt-proof reveal" data-d="3">
            {HEADLINE.map((r, i) => (
              <div className="rt-proof-row" key={i}>
                <span className="p-value">{r.v}</span>
                <span className="p-label">{r.l}</span>
              </div>
            ))}
          </div>

          <div className="rt-claim reveal">
            <span className="c-key">Claim boundary</span>
            <p>
              These figures describe defined test suites in a declared environment. This is{" "}
              <strong>bounded verification, not a universal proof of AI safety</strong>. An
              Admissible Operating Envelope is a local, environment-bound claim; it is not evidence
              that an underlying model is globally safe.
            </p>
          </div>

          <nav className="rt-jump reveal" aria-label="On this page">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`}>{s.eyebrow}</a>
            ))}
            <a href="#open">Open items</a>
          </nav>
        </div>
      </section>

      {/* ══════════ LATENCY TABLE ══════════ */}
      <section className="rt-section rt-section--band" id="latency" aria-labelledby="lat-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">Latency</span>
          <h2 id="lat-title" className="rt-h2 rt-narrow reveal" data-d="1">
            Cost scales with trajectory length,
            <br />
            not with model size.
          </h2>
          <p className="rt-lede reveal" data-d="2">
            No model inference occurs in the governance path, so evaluation cost is a function of
            the number of steps and the rule count — not of prompt length or sampling.
          </p>
          <div className="rt-table-wrap reveal" data-d="3">
            <table className="rt-table">
              <caption className="sr-only">
                Measured evaluation latency by class: steps, p50, p95 and throughput.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Class</th>
                  <th scope="col">Steps</th>
                  <th scope="col">p50 (ms)</th>
                  <th scope="col">p95 (ms)</th>
                  <th scope="col">Throughput (eval/s)</th>
                </tr>
              </thead>
              <tbody>
                {LATENCY_ROWS.map(([cls, steps, p50, p95, tp]) => (
                  <tr key={cls}>
                    <td data-label="Class">{cls}</td>
                    <td data-label="Steps">{steps}</td>
                    <td data-label="p50 (ms)">{p50}</td>
                    <td data-label="p95 (ms)">{p95}</td>
                    <td data-label="Throughput (eval/s)">{tp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="rt-note reveal">
            Single-threaded, horizon 3, 96 Ω rules across 9 domains, 800 iterations per class after
            100 warm-up calls. Representative figures, not a production-hardware guarantee.
          </p>
          <div className="rt-links reveal">
            <a href="/benchmarks/runtime-governance-benchmarks.md">Benchmark report</a>
            <a href="/benchmarks/latency.json">Raw data (JSON)</a>
          </div>
        </div>
      </section>

      {/* ══════════ INSPECTION SURFACE ══════════ */}
      {SECTIONS.map((s, i) => (
        <section
          key={s.id}
          id={s.id}
          className={`rt-section${i % 2 === 1 ? " rt-section--band" : ""}`}
          aria-labelledby={`${s.id}-title`}
        >
          <div className="rt-wrap">
            <span className="rt-eyebrow reveal">{s.eyebrow}</span>
            <h2 id={`${s.id}-title`} className="rt-h2 rt-narrow reveal" data-d="1">
              {s.title}
            </h2>
            <p className="rt-lede reveal" data-d="2">{s.body}</p>
            <div className="rt-defs rt-defs--wide reveal" data-d="3">
              {s.rows.map(([k, v], j) => (
                <div key={j}>
                  <span className="k">{k}</span>
                  <span className="v">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}

      {/* ══════════ OPEN ITEMS ══════════ */}
      <section className="rt-section" id="open" aria-labelledby="open-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">Open items</span>
          <h2 id="open-title" className="rt-h2 rt-narrow reveal" data-d="1">
            What has not been done yet.
          </h2>
          <p className="rt-lede reveal" data-d="2">
            Stated here rather than left for a reviewer to discover. Nothing below is claimed
            anywhere else on this site.
          </p>
          <div className="rt-defs rt-defs--wide reveal" data-d="3">
            {OPEN_ITEMS.map(([k, v]) => (
              <div key={k}><span className="k">{k}</span><span className="v">{v}</span></div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ PATENT ══════════ */}
      <section className="rt-section rt-section--band" id="patent" aria-labelledby="pat-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">Patent status</span>
          <h2 id="pat-title" className="rt-h2 rt-narrow reveal" data-d="1">
            Stated precisely.
          </h2>
          <div className="rt-defs rt-defs--wide reveal" data-d="2">
            <div><span className="k">Application number</span><span className="v">{SITE.patent}</span></div>
            <div><span className="k">Jurisdiction</span><span className="v">United Kingdom — UK Intellectual Property Office</span></div>
            <div>
              <span className="k">Status</span>
              <span className="v">
                Application filed. No grant is claimed. The current status of record is the one
                shown on the UKIPO public register.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ NEXT ══════════ */}
      <section className="rt-section rt-closing" aria-labelledby="ev-next">
        <div className="rt-wrap">
          <h2 id="ev-next" className="rt-principle rt-principle--center reveal">
            Inspect it rather than
            <br />
            take it on trust.
          </h2>
          <div className="rt-actions rt-actions--center reveal" data-d="1">
            <Link href="/live-demo" className="btn btn--primary btn--live">
              <span className="live-pip" aria-hidden="true" />
              Try Live Demo <span className="arr">→</span>
            </Link>
            <Link href="/book#assessment" className="btn btn--ghost">
              Define Your Operating Envelope <span className="arr">→</span>
            </Link>
            <Link href="/security" className="btn btn--text">
              Security &amp; deployment
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
