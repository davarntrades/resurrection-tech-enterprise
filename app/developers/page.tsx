import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { CodeSnippet } from "@/components/CodeSnippet";

export const metadata: Metadata = {
  title: "Developers — The Execution-Control Boundary",
  description:
    "The integration surface for Morrison Runtime Governance: one synchronous authorization call before each state-changing action, returning a deterministic PERMIT / ESCALATE / BLOCK verdict with replayable evidence. Adapter patterns, deployment profiles and fail-closed behaviour.",
  alternates: { canonical: "/developers" },
};

const REQUEST = `POST {GOVERNANCE_URL}/v1/evaluate
Authorization: Bearer {GOVERNANCE_TOKEN}
Content-Type: application/json

{
  "trajectory": [
    { "tool": "transfer_funds",
      "args": { "amount": 50000, "to": "acct_991" } }
  ],
  "domains": ["finance"]
}`;

const RESPONSE = `{
  "verdict": "BLOCK",           // PERMIT | ESCALATE | BLOCK
  "permitted": false,           // execute only when true
  "layer": "V5+",
  "reason": "Ω violation: finance_high_value_unverified_transfer",
  "omega_domain": "finance",
  "trajectory_hash": "9f3c1a8e7b22",
  "attestation": {
    "engine_commit": "96ecd39…",
    "ruleset_hash": "7b1f…"
  }
}`;

const ESCALATE = `{
  "verdict": "ESCALATE",
  "permitted": false,           // held — not issued
  "requires_human_review": true,
  "omega_domain": "healthcare",
  "review": {
    "reason": "Clinical recommendation generated.",
    "required_action": "Oncology consultant review.",
    "decision_authority": "Oncology consultant",
    "execution_status": "HELD FOR HUMAN REVIEW"
  }
}`;

const TS = `import { guardedDispatch, GovernanceBlocked } from "./governanceGuard";

// The boundary sits at plan -> act. Nothing above it changes.
try {
  await guardedDispatch(
    { tool: "transfer_funds", args: { amount: 50000, to: "acct_991" } },
    (call) => runTool(call),        // PERMIT   -> issue the call
    (v) => routeToApprover(v.review), // ESCALATE -> independent approval
    { domains: ["finance"] },
  );
} catch (e) {
  if (e instanceof GovernanceBlocked) deny(e.result.reason); // BLOCK -> never issued
}`;

const PY = `from governance_guard import guard, GovernanceBlocked, GovernanceEscalation

try:
    guard("transfer_funds", {"amount": 50000, "to": "acct_991"},
          domains=["finance"])
    run_tool(...)                 # PERMIT   -> issue the call
except GovernanceEscalation as e:
    route_to_approver(e.review)   # ESCALATE -> independent approval
except GovernanceBlocked as e:
    deny(str(e))                  # BLOCK    -> never issued`;

const FAILCLOSED = `# Fail-closed is the default and is not configurable away.
# An unreachable evaluator, an unverifiable policy bundle or a
# timeout all resolve to "not authorized" — never to "proceed".

except GovernanceUnavailable:
    deny("authorization unavailable")   # the call is not issued`;

/* The adapter changes; the contract does not. */
const ADAPTERS = [
  ["OpenAI Agents", "Gate the tool-dispatch step."],
  ["LangGraph", "A governance node placed before the tool node."],
  ["LangChain", "A pre-tool guard wrapping each tool once."],
  ["AutoGen", "Gate the execute step of the agent loop."],
  ["MCP", "At the client or host, before a call is forwarded."],
  ["Custom orchestrator", "One call at the plan → act boundary."],
];

const CONTRACT = [
  ["01", "Identity", "The calling identity and the authority it actually holds are resolved first."],
  ["02", "Policy", "The envelope and Ω definitions in force are loaded and verified by signature."],
  ["03", "Verdict", "The proposed trajectory is evaluated deterministically. Permit, escalate or block."],
  ["04", "Approval", "Where escalation applies, an independent approver decides. Nothing executes while held."],
  ["05", "Execution", "Only an authorized transition is issued to the downstream system."],
  ["06", "Evidence", "The proposal, policy state, verdict, approval and result are recorded and hash-linked."],
];

const PROFILES = [
  ["Hosted", "Call the managed endpoint. Fastest path to a first verdict."],
  ["Self-hosted", "Run the engine in your own VPC, pinned to a commit. No egress."],
  ["On-premises", "Enforcement and evidence inside your estate."],
  ["Air-gapped", "Signed local policy bundles. No required external control plane or network."],
];

export default function DevelopersPage() {
  return (
    <PageShell>
      {/* ══════════ POSITION ══════════ */}
      <section className="rt-section rt-section--first" aria-labelledby="dev-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal in">Developers</span>
          <h1 id="dev-title" className="rt-display rt-dev-title reveal in" data-d="1">
            You do not need
            <br />
            to replace your agent.
          </h1>
          <p className="rt-lede reveal in" data-d="2">
            You place an independent execution-control boundary before state-changing actions. One
            synchronous call at the plan → act boundary returns a deterministic verdict before
            anything is issued.
          </p>
          <p className="rt-lede reveal in" data-d="2">
            The service never executes your tools. It evaluates the proposed call as JSON and
            returns an authorization decision.
          </p>
          <div className="rt-actions reveal" data-d="3">
            <Link href="/quickstart" className="btn btn--primary">
              Developer quickstart <span className="arr">→</span>
            </Link>
            <Link href="/live-demo" className="btn btn--ghost btn--live">
              <span className="live-pip" aria-hidden="true" />
              Try Live Demo <span className="arr">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════ INTEGRATION SURFACE ══════════ */}
      <section className="rt-section rt-section--band" id="surface" aria-labelledby="surface-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">Integration surface</span>
          <h2 id="surface-title" className="rt-h2 rt-narrow reveal" data-d="1">
            One endpoint. One decision.
          </h2>
          <div className="rt-code-pair reveal" data-d="2">
            <CodeSnippet label="Request — POST /v1/evaluate" lang="http" code={REQUEST} />
            <CodeSnippet label="Response — BLOCK" lang="json" code={RESPONSE} />
          </div>
          <p className="rt-note reveal">
            <span className="rt-inline-mono">trajectory</span> is the sequence about to run — one
            call or several. The response carries the governing rule, the Ω domain, a replayable{" "}
            <span className="rt-inline-mono">trajectory_hash</span>, and an attestation tying the
            verdict to the exact engine commit and ruleset.
          </p>
        </div>
      </section>

      {/* ══════════ AUTHORIZATION CONTRACT ══════════ */}
      <section className="rt-section" id="contract" aria-labelledby="contract-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">Authorization contract</span>
          <h2 id="contract-title" className="rt-h2 rt-narrow reveal" data-d="1">
            The same six steps
            <br />
            in every deployment profile.
          </h2>
          <div className="rt-stack reveal" data-d="2">
            {CONTRACT.map(([idx, name, body]) => (
              <div className="rt-stack-row" key={idx}>
                <span className="s-idx">{idx}</span>
                <div><span className="s-name">{name}</span></div>
                <p className="s-body">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ VERDICT HANDLING ══════════ */}
      <section className="rt-section rt-section--band" id="verdicts" aria-labelledby="verdict-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">Verdict handling</span>
          <h2 id="verdict-title" className="rt-h2 rt-narrow reveal" data-d="1">
            Three branches.
            <br />
            One of them issues the call.
          </h2>

          <div className="rt-verdicts rt-verdicts--standalone reveal" data-d="2">
            <div className="rt-verdict rt-verdict--allow">
              <span className="v-key"><span className="v-mark" aria-hidden="true" />Permit</span>
              <span className="v-desc">Issue the call. No configured forbidden state is reachable from it.</span>
            </div>
            <div className="rt-verdict rt-verdict--escalate">
              <span className="v-key"><span className="v-mark" aria-hidden="true" />Escalate</span>
              <span className="v-desc">Hold. The response names the required authority and action.</span>
            </div>
            <div className="rt-verdict rt-verdict--block">
              <span className="v-key"><span className="v-mark" aria-hidden="true" />Block</span>
              <span className="v-desc">Do not issue. The trajectory reaches Ω.</span>
            </div>
          </div>

          <div className="rt-code-pair reveal">
            <CodeSnippet label="TypeScript — gate a dispatch" lang="ts" code={TS} />
            <CodeSnippet label="Python — gate before execution" lang="py" code={PY} />
          </div>

          <p className="rt-note reveal">
            On <span className="rt-inline-mono">ESCALATE</span> the response carries a review record
            you can render or forward to an approver:
          </p>
          <div className="rt-code-single reveal">
            <CodeSnippet label="Response — ESCALATE" lang="json" code={ESCALATE} />
          </div>
        </div>
      </section>

      {/* ══════════ FAIL-CLOSED ══════════ */}
      <section className="rt-section" id="fail-closed" aria-labelledby="fc-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">Fail-closed behaviour</span>
          <h2 id="fc-title" className="rt-h2 rt-narrow reveal" data-d="1">
            The absence of an authorization
            <br />
            is not an authorization.
          </h2>
          <p className="rt-lede reveal" data-d="2">
            An unreachable evaluator, an unverifiable policy bundle, a tampered signature or a
            timeout all resolve the same way: the transition is not authorized, so the call is not
            issued.
          </p>
          <div className="rt-code-single reveal" data-d="3">
            <CodeSnippet label="Fail-closed — the default path" lang="py" code={FAILCLOSED} />
          </div>
        </div>
      </section>

      {/* ══════════ ADAPTERS ══════════ */}
      <section className="rt-section rt-section--band" id="adapters" aria-labelledby="adapter-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">Adapter patterns</span>
          <h2 id="adapter-title" className="rt-h2 rt-narrow reveal" data-d="1">
            The adapter changes.
            <br />
            The contract does not.
          </h2>
          <div className="rt-map reveal" data-d="2">
            {ADAPTERS.map(([name, where]) => (
              <div className="rt-map-row" key={name}>
                <span className="m-from">{name}</span>
                <span className="m-arrow" aria-hidden="true">→</span>
                <span className="m-to">{where}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ EVIDENCE OUTPUT ══════════ */}
      <section className="rt-section" id="evidence" aria-labelledby="ev-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">Evidence output</span>
          <h2 id="ev-title" className="rt-h2 rt-narrow reveal" data-d="1">
            Every verdict is replayable.
          </h2>
          <div className="rt-defs reveal" data-d="2">
            {[
              ["trajectory_hash", "Identifies the evaluated sequence. The same trajectory against the same policy state reproduces the same verdict."],
              ["attestation", "Ties the verdict to the engine commit and ruleset hash that produced it."],
              ["Chain linkage", "Each record hashes the one before it, so an alteration anywhere breaks verification."],
              ["Metadata-only logging", "Tool arguments and payloads are not stored — the evaluation record holds metadata and the decision."],
            ].map(([k, v]) => (
              <div key={k}><span className="k">{k}</span><span className="v">{v}</span></div>
            ))}
          </div>
          <div className="rt-links reveal">
            <Link href="/evidence">Evidence &amp; methodology</Link>
            <Link href="/technology#evidence-chain">Evidence chain</Link>
          </div>
        </div>
      </section>

      {/* ══════════ DEPLOYMENT PROFILES ══════════ */}
      <section className="rt-section rt-section--band" id="deployment" aria-labelledby="deploy-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">Deployment profiles</span>
          <h2 id="deploy-title" className="rt-h2 rt-narrow reveal" data-d="1">
            Where enforcement runs
            <br />
            is your decision.
          </h2>
          <div className="rt-map reveal" data-d="2">
            {PROFILES.map(([name, desc]) => (
              <div className="rt-map-row" key={name}>
                <span className="m-from">{name}</span>
                <span className="m-arrow" aria-hidden="true">→</span>
                <span className="m-to">{desc}</span>
              </div>
            ))}
          </div>
          <div className="rt-links reveal">
            <Link href="/guardian-os">Guardian OS</Link>
            <Link href="/guardian-os/sovereign">Sovereign</Link>
            <Link href="/security">Security &amp; deployment</Link>
          </div>
        </div>
      </section>

      {/* ══════════ NEXT ══════════ */}
      <section className="rt-section rt-closing" aria-labelledby="dev-next">
        <div className="rt-wrap">
          <h2 id="dev-next" className="rt-principle rt-principle--center reveal">
            One call, before the call.
          </h2>
          <p className="rt-lede rt-closing-lede reveal" data-d="1">
            Copy the guard, point it at an endpoint, and run a trajectory through it.
          </p>
          <div className="rt-actions rt-actions--center reveal" data-d="2">
            <Link href="/quickstart" className="btn btn--primary">
              Developer quickstart <span className="arr">→</span>
            </Link>
            <Link href="/test-trajectory" className="btn btn--ghost">
              Test a trajectory <span className="arr">→</span>
            </Link>
            <Link href="/assess" className="btn btn--text">
              Ω exposure — upload a manifest
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
