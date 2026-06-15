import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { CodeSnippet } from "@/components/CodeSnippet";

export const metadata: Metadata = {
  title: "Integrate in 15 minutes — Developer Quickstart",
  description:
    "Connect Morrison Runtime Governance to your AI agent today: one pre-execution API call at your plan→act boundary returns a deterministic PERMIT / ESCALATE / BLOCK verdict before any tool runs. Copy-paste clients for cURL, TypeScript, Python, and LangChain.",
  alternates: { canonical: "/quickstart" },
};

const REQUEST = `POST {GOVERNANCE_URL}/v1/evaluate
Authorization: Bearer {GOVERNANCE_TOKEN}   # optional
Content-Type: application/json

{
  "trajectory": [
    { "tool": "transfer_funds",
      "args": { "amount": 50000, "to": "acct_991" } }
  ],
  "domains": ["finance"]   // optional; defaults to all Ω
}`;

const RESPONSE = `{
  "verdict": "BLOCK",     // PERMIT | ESCALATE | BLOCK
  "permitted": false,     // execute only when true
  "blocked": true,
  "layer": "V5+",
  "reason": "Ω violation: finance_high_value_unverified_transfer",
  "omega_domain": "finance",
  "trajectory_hash": "9f3c1a8e7b22",
  "attestation": {
    "engine_commit": "96ecd39…",
    "ruleset_hash": "7b1f…"
  }
}`;

const ESCALATE_RESPONSE = `{
  "verdict": "ESCALATE",
  "permitted": false,           // held — not auto-executed
  "requires_human_review": true,
  "omega_domain": "healthcare",
  "review": {
    "reason": "Clinical recommendation generated.",
    "required_action": "Oncology consultant review.",
    "decision_authority": "Oncology consultant",
    "next_step": "Approve / Reject recommendation.",
    "execution_status": "HELD FOR HUMAN REVIEW"
  }
}`;

const CURL = `curl -s "$GOVERNANCE_URL/v1/evaluate" \\
  -H "content-type: application/json" \\
  -H "authorization: Bearer $GOVERNANCE_TOKEN" \\
  -d '{
    "trajectory": [
      { "tool": "transfer_funds",
        "args": { "amount": 50000, "to": "acct_991" } }
    ]
  }'`;

const TS = `import { guardedDispatch, GovernanceBlocked } from "./governanceGuard";

// At your plan -> act boundary, gate the dispatch:
try {
  await guardedDispatch(
    { tool: "transfer_funds", args: { amount: 50000, to: "acct_991" } },
    (call) => runTool(call),        // ALLOW -> execute
    (v) => routeToHuman(v.review),  // ESCALATE -> human sign-off
    { domains: ["finance"] },
  );
} catch (e) {
  // BLOCK -> never runs
  if (e instanceof GovernanceBlocked) deny(e.result.reason);
}`;

const PY = `from governance_guard import guard, GovernanceBlocked, GovernanceEscalation

# Call immediately BEFORE executing a tool:
try:
    guard("transfer_funds", {"amount": 50000, "to": "acct_991"},
          domains=["finance"])
    run_tool(...)                 # ALLOW -> execute
except GovernanceEscalation as e:
    route_to_human(e.review)      # ESCALATE -> human sign-off
except GovernanceBlocked as e:
    deny(str(e))                  # BLOCK -> never runs`;

const LANGCHAIN = `from governance_guard import govern_langchain_tool

# Wrap each tool once; every invocation is now governed pre-execution.
tools = [govern_langchain_tool(t) for t in tools]
agent = create_agent(llm, tools)   # nothing else changes`;

export default function QuickstartPage() {
  return (
    <PageShell>
      <section className="qs" aria-label="Developer quickstart">
        <div className="qs-wrap">
          <p className="qs-eyebrow">Developer quickstart</p>
          <h1 className="qs-h1">Connect Runtime Governance to your agent in ~15 minutes</h1>
          <p className="qs-lede">
            One synchronous call at your agent&apos;s <span className="qs-inline">plan → act</span> boundary.
            Pass the tool call your agent is <em>about</em> to make; get back a deterministic{" "}
            <strong>PERMIT / ESCALATE / BLOCK</strong> verdict <strong>before</strong> anything executes.
            No rip-and-replace, no change to your agent&apos;s logic.
          </p>
          <p className="qs-sub">
            The service never executes your tools — it inspects the proposed JSON only. Sub-millisecond
            engine compute. Self-host in your own VPC, or use the hosted endpoint.
          </p>

          <div className="qs-steps">
            <div className="qs-step">
              <h2 className="qs-step-h"><span className="qs-step-n">1</span>See the contract</h2>
              <p className="qs-step-p">
                A request is a <span className="qs-inline">trajectory</span> — the one or more tool calls
                about to run. The response is the engine&apos;s real verdict, with the Ω domain, a
                replayable <span className="qs-inline">trajectory_hash</span>, and an attestation tying it
                to the exact engine + ruleset.
              </p>
              <CodeSnippet label="Request — POST /v1/evaluate" lang="http" code={REQUEST} />
              <CodeSnippet label="Response — BLOCK" lang="json" code={RESPONSE} />
            </div>

            <div className="qs-step">
              <h2 className="qs-step-h"><span className="qs-step-n">2</span>Route on the verdict</h2>
              <div className="qs-verdicts">
                <div className="qs-verdict qs-verdict--allow">
                  <span className="qs-verdict-k">PERMIT</span>
                  <p className="qs-verdict-p">Execute the tool — no forbidden state is reachable.</p>
                </div>
                <div className="qs-verdict qs-verdict--escalate">
                  <span className="qs-verdict-k">ESCALATE</span>
                  <p className="qs-verdict-p">Hold for a human. A review card names who must sign off and why.</p>
                </div>
                <div className="qs-verdict qs-verdict--block">
                  <span className="qs-verdict-k">BLOCK</span>
                  <p className="qs-verdict-p">Deny before execution — the trajectory reaches Ω.</p>
                </div>
              </div>
              <p className="qs-step-p">
                On <span className="qs-inline">ESCALATE</span>, the response carries a human-review card you
                can render or forward to an approver:
              </p>
              <CodeSnippet label="Response — ESCALATE (human review)" lang="json" code={ESCALATE_RESPONSE} />
            </div>

            <div className="qs-step">
              <h2 className="qs-step-h"><span className="qs-step-n">3</span>Drop in the guard</h2>
              <p className="qs-step-p">
                A few lines wherever your framework dispatches tools. Copy{" "}
                <span className="qs-inline">governanceGuard.ts</span> or{" "}
                <span className="qs-inline">governance_guard.py</span> from{" "}
                <span className="qs-inline">examples/integration/</span> and call it before execution.
              </p>
              <CodeSnippet label="TypeScript — guard a tool dispatch" lang="ts" code={TS} />
              <CodeSnippet label="Python — guard before execution" lang="py" code={PY} />
              <CodeSnippet label="cURL — the raw call" lang="bash" code={CURL} />
            </div>

            <div className="qs-step">
              <h2 className="qs-step-h"><span className="qs-step-n">4</span>Wire your framework</h2>
              <p className="qs-step-p">
                Same one-call pattern everywhere: <strong>OpenAI Agents</strong> (gate tool dispatch),{" "}
                <strong>LangGraph</strong> (a governance node before the tool node),{" "}
                <strong>LangChain</strong> (a pre-tool guard), <strong>AutoGen</strong> (the execute step),{" "}
                <strong>MCP</strong> (at the client/host before forwarding), and{" "}
                <strong>custom orchestrators</strong> (call at the plan→act boundary).
              </p>
              <CodeSnippet label="LangChain — govern every tool" lang="py" code={LANGCHAIN} />
            </div>

            <div className="qs-step">
              <h2 className="qs-step-h"><span className="qs-step-n">5</span>What you get for free</h2>
              <ul className="qs-points">
                <li><b>Never executes your tools</b> — inspects the proposed JSON only.</li>
                <li><b>Metadata-only logging</b> — your tool args / payloads are never stored.</li>
                <li><b>Deterministic + replayable</b> — same trajectory → same verdict + hash.</li>
                <li><b>Attestable</b> — every verdict ties to the engine commit + ruleset hash.</li>
                <li><b>Fast</b> — sub-ms compute; co-locate or self-host to remove the round-trip.</li>
                <li><b>Self-hostable</b> — pure-Python engine pinned to a commit, runs in your VPC.</li>
              </ul>
            </div>
          </div>

          <div className="qs-cta">
            <Link href="/assess" className="btn btn--primary">See your agent&apos;s exposure (zero integration)</Link>
            <Link href="/test-trajectory" className="btn btn--ghost">Test a trajectory live</Link>
            <Link href="/pilot" className="btn btn--ghost">Limited Pilot scope</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
