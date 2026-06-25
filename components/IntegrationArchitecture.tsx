/**
 * "Format-agnostic by design" — integration architecture diagram + connection
 * models. Company-voice messaging; gold .mgp-page theme of its host page.
 */
const SOURCES = [
  "LangChain",
  "OpenAI Agents SDK",
  "Anthropic Tool Use",
  "AWS Bedrock",
  "Azure AI",
  "MCP",
  "Custom Framework",
];

const CONNECTIONS: { h: string; p: string }[] = [
  { h: "Hosted API", p: "Fastest deployment — call the governance API over HTTPS." },
  { h: "Customer cloud", p: "Run it in your own AWS, Azure, GCP, or private cloud." },
  { h: "Embedded SDK", p: "Integrate the governance layer directly in your runtime." },
  { h: "Network proxy / sidecar", p: "Govern actions transparently, with no agent code changes." },
];

export function IntegrationArchitecture() {
  return (
    <section className="section section--tight" id="integration-architecture">
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">Integration architecture</span>
          <h2>Format-agnostic by design.</h2>
          <p>
            Runtime Governance makes a format-agnostic decision. The decision logic does not change per
            API — so for most stacks, integration is an adapter problem, not a rebuild. Anything that
            can make an HTTPS POST can connect.
          </p>
        </div>

        <div className="mgp-arch reveal" data-d="1" aria-label="Frameworks normalise through an adapter into the Runtime Governance engine, which returns ALLOW, BLOCK, or ESCALATE">
          <div className="mgp-arch-sources">
            {SOURCES.map((s) => <span className="mgp-arch-chip" key={s}>{s}</span>)}
          </div>
          <div className="mgp-arch-cap">normalised to one contract</div>
          <div className="mgp-arch-mid">
            <div className="mgp-flow-arrow" aria-hidden="true">↓</div>
            <div className="mgp-flow-node">Adapter / Normalizer</div>
            <div className="mgp-flow-arrow" aria-hidden="true">↓</div>
            <div className="mgp-flow-node mgp-flow-node--gov"><b>Runtime Governance Engine</b></div>
            <div className="mgp-flow-verdict" aria-hidden="true">
              <span className="v-allow">ALLOW</span>
              <span className="v-block">BLOCK</span>
              <span className="v-esc">ESCALATE</span>
            </div>
          </div>
        </div>

        <div className="mgp-prose reveal" data-d="1" style={{ maxWidth: "62ch", margin: "22px auto 0", textAlign: "center" }}>
          <p>
            Frameworks and agent stacks pass proposed actions through a thin adapter that normalises
            them to a single contract; the engine evaluates each one and returns ALLOW, BLOCK, or
            ESCALATE before execution.
          </p>
        </div>

        <div className="section-head reveal" data-d="1" style={{ marginTop: 40 }}>
          <span className="eyebrow">Connection models</span>
          <h3 style={{ fontSize: "1.2rem", margin: 0 }}>Four ways to connect.</h3>
        </div>
        <div className="mgp-conn reveal" data-d="1">
          {CONNECTIONS.map((c) => (
            <div className="mgp-conn-card" key={c.h}>
              <h4 className="mgp-conn-h">{c.h}</h4>
              <p className="mgp-conn-p">{c.p}</p>
            </div>
          ))}
        </div>

        <div className="mgp-note reveal" data-d="1" role="note">
          <span className="mgp-note-k">What to expect on effort</span>
          <p>
            Integration effort varies. It depends on how cleanly a framework exposes tool-execution
            hooks, its authentication model, whether it streams or uses request/response, and the
            customer&rsquo;s deployment constraints. Stacks already close to our contract integrate
            quickly; others take longer. We scope each integration as an engineering estimate, not a
            fixed timeline.
          </p>
        </div>
      </div>
    </section>
  );
}
