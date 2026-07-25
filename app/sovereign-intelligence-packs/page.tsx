import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { catalog, classifications, totals } from "@/lib/sovereign-packs";

/* Every figure on this page is read from the shipping registry at build time.
 * A number published here cannot drift from what actually installs. */
const PACKS = catalog();
const TIERS = classifications();
const TOTALS = totals();

export const metadata: Metadata = {
  title: "Sovereign Intelligence Packs — Mission Intelligence for Guardian OS",
  description:
    "Sovereign Intelligence Packs bring national security, defence, critical infrastructure, public sector, national healthcare, research and cyber operations intelligence to Guardian OS — on one Runtime Governance kernel, with no product fork.",
  alternates: { canonical: "/sovereign-intelligence-packs" },
  openGraph: {
    title: "Sovereign Intelligence Packs — Mission Intelligence for Guardian OS",
    description:
      "Seven sovereign domains. One kernel, one governed Digital Twin, one platform. Declarative intelligence with authority chains, mission workflows, readiness metrics and evidence — installed from signed media.",
    url: "/sovereign-intelligence-packs",
  },
};

const SEPARATION = [
  ["Guardian OS", "The enterprise operating platform."],
  ["Runtime Governance Kernel", "The control boundary. Never forked, never duplicated, identical in every deployment."],
  ["Deployment Profile", "Where it runs and what it may reach: cloud, hybrid, private, on-premises, sovereign, air-gapped."],
  ["Installed Intelligence Packs", "What domain knowledge it contains. Industry for a sector, Sovereign for a national mission."],
  ["Governed Enterprise", "The organisation operating under evidence, authority and constraint."],
];

const CONTRACT = [
  ["Authority chains", "Who may authorise which action, who they delegate to, and the evidence each decision leaves behind."],
  ["Mission workflows", "The governed path from intent to execution, stage by stage, with the gate that must be satisfied at each."],
  ["Governed capabilities", "The operational capabilities the pack governs, named against the runtime policies that constrain them."],
  ["Runtime policies", "Deny-only constraints evaluated before an action executes, in the kernel's existing policy vocabulary."],
  ["Operational readiness", "Readiness measures bound to a source the platform can actually ground, or reported as not instrumented."],
  ["Risk models", "The factors that constitute domain risk and the conditions under which they escalate."],
  ["Digital Twin projections", "Which parts of the one governed twin carry mission meaning — never a second twin."],
  ["Evidence mappings", "Obligation, implemented control, and the evidence that control produces under inspection."],
  ["Incident workflows", "Domain response paths for events that require containment, notification and retained evidence."],
  ["Briefings and reports", "The executive reporting each domain's accountability structure actually requires."],
];

const INVARIANTS = [
  ["One kernel", "A sovereign pack adds policies inside the kernel's existing vocabulary. It adds no domain, no condition type and no evaluation path."],
  ["One Digital Twin", "Sovereign views project the same governed twin every executive workspace reads. There is no separate sovereign model."],
  ["No executable code", "A sovereign pack is data. The registry refuses to load one containing an executable value anywhere in its structure."],
  ["Deny-only extension", "A pack may add constraints. It cannot weaken a baseline, grant permission, or create capability."],
  ["Assessed installation", "A pack declares the deployment guarantees it requires. A deployment that does not provide them is refused, with the missing guarantee named."],
  ["Reversible", "Removing a pack rolls back its policies and returns the organisation to its prior governed baseline."],
  ["Honest measurement", "A readiness measure with no connected source is reported as not instrumented, never as an estimated figure."],
  ["No product fork", "Sovereign domains are additional packs on the same platform. There is no sovereign edition and no separate codebase."],
];

const TRANSFORMATION = [
  ["Platform strategy", "Procure a separate sovereign product", "Install sovereign domains onto the platform already in use"],
  ["Governance engine", "Maintain a forked kernel per environment", "Operate one kernel across every deployment profile"],
  ["Domain expertise", "Rebuild authority and workflow models per programme", "Start from a reviewed, versioned domain structure"],
  ["Assurance", "Assert that controls are appropriate", "Demonstrate which control refused which action, and under whose authority"],
  ["Supply chain", "Accept software updates over a network", "Install signed media at the console, verified before anything changes"],
  ["Review", "Require code review to assess a domain model", "Review the pack as data, by the domain authority responsible for it"],
];

const DELIVERY = [
  ["01", "Assess", "The mission, obligations and operating environment are assessed, and the required classification tier established."],
  ["02", "Select", "The sovereign domains in scope are selected. Deployment profile and domain scope are decided separately."],
  ["03", "Review", "Authority chains, workflows, capabilities and policies are reviewed by the responsible domain authority — as data, not code."],
  ["04", "Deploy", "Guardian OS is deployed on the profile that satisfies the classification's guarantees."],
  ["05", "Install", "Packs are installed from signed media at the console. The signature is verified before anything changes."],
  ["06", "Activate", "Each contributed policy passes through validation and activation in the same Runtime Governance kernel."],
  ["07", "Operate", "Mission workflows, readiness, recommendations and incidents run continuously against the governed twin."],
  ["08", "Evidence", "Signed evidence packs are produced locally for oversight, accreditation and inquiry."],
];

export default function SovereignIntelligencePacksPage() {
  return (
    <PageShell>
      <section className="gos-hero ip-hero">
        <div className="gos-wrap">
          <span className="gos-eyebrow">Sovereign Intelligence Packs</span>
          <h1 className="gos-h1">
            Mission intelligence<span className="ip-title-break"> for sovereign Guardian OS.</span>
          </h1>
          <p className="gos-lede">
            Sovereign Intelligence Packs bring the authority chains, mission workflows, readiness measures and
            evidence obligations of a national domain into Guardian OS.
          </p>
          <p className="gos-lede-2">
            They are not sovereign versions of the Industry Intelligence Packs. They are specialised intelligence
            for organisations whose mission, regulation or operating environment requires sovereign AI — installed
            onto the same platform, the same Runtime Governance kernel and the same governed Digital Twin.
          </p>
          <div className="gos-cta-row">
            <Link href="/book" className="gos-btn gos-btn-primary">Discuss a sovereign deployment</Link>
            <a href="#catalog" className="gos-btn gos-btn-ghost">Explore the sovereign catalog</a>
          </div>
          <div className="ip-proof" aria-label="Shipping Sovereign Intelligence Pack facts">
            <div><strong>{TOTALS.packs}</strong><span>sovereign domains</span></div>
            <div><strong>{TOTALS.policies}</strong><span>runtime policies</span></div>
            <div><strong>{TOTALS.authorityChains}</strong><span>authority chains</span></div>
            <div><strong>{TOTALS.missionWorkflows}</strong><span>mission workflows</span></div>
            <div><strong>{TOTALS.kernels}</strong><span>governance kernel</span></div>
          </div>
        </div>
      </section>

      <section className="gos-section gos-section-alt" id="problem">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">The sovereign problem</span>
            <h2 className="gos-h2">Sovereignty is usually sold as a second product. It should be a deployment decision.</h2>
            <p className="gos-sec-lede">
              Organisations with sovereign obligations are routinely offered a separate edition: a forked engine, a
              parallel roadmap, a different security posture and a smaller pool of engineering attention. The
              sovereign customer ends up on the version that receives the least improvement.
            </p>
          </header>
          <div className="sip-separation reveal" role="img" aria-label="Guardian OS runs on one Runtime Governance kernel. The deployment profile determines where it runs. Installed Intelligence Packs determine what domain knowledge it contains. Together they produce a governed enterprise.">
            {SEPARATION.map(([name, body], index) => (
              <div className={`sip-sep-row${index === 1 ? " is-kernel" : ""}${index === 3 ? " is-pack" : ""}`} key={name}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><h3>{name}</h3><p>{body}</p></div>
                {index < SEPARATION.length - 1 && <b aria-hidden="true">↓</b>}
              </div>
            ))}
          </div>
          <div className="gos-problem-turn reveal">
            <p className="gos-problem-q">Deployment and domain expertise are separate concerns.</p>
            <p className="gos-problem-a">
              Where Guardian OS runs is a deployment profile. What it knows is an Intelligence Pack. Keeping those
              separate is what allows a national security organisation and a commercial bank to run the same
              governance kernel, receive the same improvements, and still operate under completely different
              domain intelligence and completely different infrastructure guarantees.
            </p>
          </div>
        </div>
      </section>

      <section className="gos-section" id="classification">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Admissibility</span>
            <h2 className="gos-h2">A pack states the guarantees it requires. The deployment either provides them or it does not.</h2>
            <p className="gos-sec-lede">
              A classification tier does not name the environments it trusts. It declares the infrastructure
              guarantees it requires, and the eligible deployment profiles follow from them. An organisation is
              therefore never told that a pack is suitable — it is shown which specific guarantee is missing.
            </p>
          </header>
          <div className="sip-tiers reveal" role="table" aria-label="Classification tiers, the guarantees they require, and the deployment profiles that satisfy them">
            <div className="sip-tier-head" role="row">
              <span role="columnheader">Tier</span>
              <span role="columnheader">Guarantees required of the deployment</span>
              <span role="columnheader">Eligible deployment profiles</span>
            </div>
            {TIERS.map((tier) => (
              <div className="sip-tier-row" role="row" key={tier.id}>
                <div role="cell">
                  <strong>{tier.title}</strong>
                  <small>{tier.summary}</small>
                </div>
                <div role="cell">
                  <ul>{tier.requires.map((requirement) => <li key={requirement.guarantee}>{requirement.label}</li>)}</ul>
                </div>
                <div role="cell">
                  <div className="sip-profiles">
                    {tier.eligible_profiles.map((profile) => <span key={profile}>{profile.replace(/_/g, " ")}</span>)}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="sip-derived reveal">
            These eligibility lists are computed from the deployment profiles the platform actually ships. They are
            not editorial. If a profile's guarantees changed, the packs depending on them would stop being
            eligible — visibly, and in the operator console as well as here.
          </p>
        </div>
      </section>

      <section className="gos-section gos-section-alt" id="catalog">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Shipping catalog</span>
            <h2 className="gos-h2">{PACKS.length} sovereign domains. One validated pack architecture.</h2>
            <p className="gos-sec-lede">
              Every figure below is read from the production registry. Scope, classification and authority model are
              confirmed against the organisation's mandate, systems and obligations during assessment.
            </p>
          </header>
          <div className="ip-catalog">
            {PACKS.map((pack, index) => (
              <article className="ip-pack sip-pack reveal" data-d={String((index % 3) + 1)} key={pack.id}>
                <header>
                  <div><span>{pack.mission_domain}</span><h3>{pack.title}</h3></div>
                  <b>v{pack.version}</b>
                </header>
                <p className="sip-classification">
                  <span>{pack.classification_title}</span>
                  <small>{pack.eligible_profiles.map((profile) => profile.replace(/_/g, " ")).join(" · ")}</small>
                </p>
                <p>{pack.purpose}</p>
                <div className="ip-regulations">
                  {pack.regulations.slice(0, 5).map((regulation) => <span key={regulation}>{regulation}</span>)}
                </div>
                <dl>
                  <div><dt>Ω policies</dt><dd>{pack.counts.policies}</dd></div>
                  <div><dt>Authority chains</dt><dd>{pack.counts.authority_chains}</dd></div>
                  <div><dt>Mission workflows</dt><dd>{pack.counts.mission_workflows}</dd></div>
                  <div><dt>Governed capabilities</dt><dd>{pack.counts.capabilities}</dd></div>
                  <div><dt>Readiness measures</dt><dd>{pack.counts.readiness}</dd></div>
                  <div><dt>Twin projections</dt><dd>{pack.counts.twin_projections}</dd></div>
                  <div><dt>Evidence maps</dt><dd>{pack.counts.mappings}</dd></div>
                  <div><dt>Incident workflows</dt><dd>{pack.counts.workflows}</dd></div>
                  <div><dt>Briefings + reports</dt><dd>{pack.counts.briefings + pack.counts.reports}</dd></div>
                  <div><dt>Kernel</dt><dd>Shared</dd></div>
                </dl>
              </article>
            ))}
          </div>
          <div className="ip-extension-note reveal">
            <div>
              <span className="gos-kicker">Additional domains</span>
              <h3>A new sovereign domain is a reviewed data file — not a new Guardian OS.</h3>
            </div>
            <p>
              Further sovereign domains can be developed under the same contract: independently versioned,
              deny-only, evidence-aware, declarative, and installed through the same assessed lifecycle. Bespoke
              domain intelligence can also be authored for a single organisation without altering the platform.
            </p>
          </div>
        </div>
      </section>

      <section className="gos-section" id="contents">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">The sovereign pack contract</span>
            <h2 className="gos-h2">Operational intelligence a domain authority can review without reading code.</h2>
            <p className="gos-sec-lede">
              A sovereign pack contains no executable code. Its entire contents are declarative, which means the
              people accountable for a mission — legal advisers, safety authorities, Caldicott guardians, accounting
              officers — can review what the platform will enforce, in their own language.
            </p>
          </header>
          <div className="ip-contract-grid">
            {CONTRACT.map(([title, body], index) => (
              <article className="ip-contract reveal" data-d={String((index % 3) + 1)} key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
          <div className="sip-nocode reveal">
            <div>
              <span className="gos-kicker">Why it matters operationally</span>
              <h3>A pack that cannot contain code cannot introduce behaviour into a national deployment.</h3>
            </div>
            <p>
              The registry validates this structurally: a pack containing an executable value anywhere in its
              structure is refused before it loads. The same rule produces a second benefit. Because there is no
              code to leave behind, a sovereign pack travels on signed media without loss — the copy installed in a
              disconnected facility renders exactly what the connected copy renders.
            </p>
          </div>
        </div>
      </section>

      <section className="gos-section gos-section-alt" id="architecture">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Architecture</span>
            <h2 className="gos-h2">What does not change.</h2>
            <p className="gos-sec-lede">
              The value of a sovereign pack depends on everything around it staying exactly where it was. These are
              the properties that hold whether an organisation installs none of these packs or all of them.
            </p>
          </header>
          <div className="ip-invariant-grid">
            {INVARIANTS.map(([title, body], index) => (
              <article className="ip-invariant reveal" data-d={String((index % 3) + 1)} key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="gos-section" id="delivery">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Assessed delivery</span>
            <h2 className="gos-h2">Reviewed before installation. Verified at the console. Reversible afterwards.</h2>
            <p className="gos-sec-lede">
              A sovereign pack does not arrive as configuration. Where the runtime is immutable — every sovereign and
              air-gapped deployment — it arrives on signed media whose signature is verified before any change is
              made, and there is no network path that can write to governed configuration.
            </p>
          </header>
          <ol className="ip-lifecycle">
            {DELIVERY.map(([number, title, body], index) => (
              <li className="ip-lifecycle-step reveal" data-d={String((index % 3) + 1)} key={number}>
                <span>{number}</span><div><h3>{title}</h3><p>{body}</p></div>
              </li>
            ))}
          </ol>
          <div className="ip-lifecycle-rule reveal">
            <span>Admit</span><b>Assess classification → verify signature → install</b>
            <span>Operate</span><b>Observe → recommend → authorise → execute → evidence</b>
            <span>Remove</span><b>Roll back contributed policies → restore prior baseline</b>
          </div>
        </div>
      </section>

      <section className="gos-section gos-section-alt" id="transformation">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">What changes for the organisation</span>
            <h2 className="gos-h2">Sovereign obligations, without a sovereign fork.</h2>
          </header>
          <div className="gos-comparison reveal" role="table" aria-label="Sovereign AI governance with a separate product compared with Sovereign Intelligence Packs on one platform">
            <div className="gos-comparison-head" role="row">
              <span role="columnheader">Operating concern</span>
              <span role="columnheader">With a separate sovereign product</span>
              <span role="columnheader">With Sovereign Intelligence Packs</span>
            </div>
            {TRANSFORMATION.map(([area, before, after]) => (
              <div className="gos-comparison-row" role="row" key={area}>
                <strong role="cell">{area}</strong><span role="cell">{before}</span><span role="cell">{after}</span>
              </div>
            ))}
          </div>
          <div className="ip-outcomes">
            {[
              ["Keep one governance engine", "The same kernel, the same improvements and the same security work apply to every deployment, sovereign included."],
              ["Give authorities something reviewable", "Authority chains, workflows and constraints are declarative, so the accountable person can review them directly."],
              ["Prove control, not intent", "Evidence shows which action was refused, under which control, and which authority was missing."],
              ["Operate disconnected without losing capability", "Signed media carries the full pack. A disconnected estate is not a degraded one."],
            ].map(([title, body], index) => (
              <article className="ip-outcome reveal" data-d={String((index % 3) + 1)} key={title}>
                <h3>{title}</h3><p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="gos-section" id="platform">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">One enterprise operating platform</span>
            <h2 className="gos-h2">Where a sovereign pack sits.</h2>
          </header>
          <div className="ip-platform">
            {[
              ["AI Twin", "Supplies the organisation's current systems, relationships, authorities, risks and evidence."],
              ["Sovereign Intelligence Pack", "Interprets that context through the mission, its authority model and its statutory obligations."],
              ["Runtime Governance", "Enforces the pack's approved deny-only policies before an autonomous action executes."],
              ["Guardian OS", "Coordinates installation, recommendations, incidents, approvals and continuous monitoring."],
              ["Executive Workspaces", "Present mission intelligence to the authorities accountable for the decisions."],
            ].map(([name, body], index) => (
              <div className={`ip-platform-row reveal${index === 1 ? " is-pack" : ""}`} data-d={String((index % 3) + 1)} key={name}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><h3>{name}</h3><p>{body}</p></div>
                {index < 4 && <b aria-hidden="true">↓</b>}
              </div>
            ))}
          </div>
          <div className="ip-crosslinks reveal">
            <Link href="/guardian-os">Explore Guardian OS <span>→</span></Link>
            <Link href="/intelligence-packs">Industry Intelligence Packs <span>→</span></Link>
            <Link href="/ai-twin">Explore the AI Twin <span>→</span></Link>
          </div>
        </div>
      </section>

      <section className="gos-final">
        <div className="gos-wrap">
          <span className="gos-kicker">One kernel. One twin. One platform. Many sovereign domains.</span>
          <h2 className="gos-final-h">Bring mission intelligence into a governed sovereign deployment.</h2>
          <p className="twin-final-sub">
            Start with the sovereign domains in scope for your mandate, then validate them against your authority
            model, your systems and the deployment profile your obligations require.
          </p>
          <div className="gos-cta-row gos-cta-center">
            <Link href="/book" className="gos-btn gos-btn-primary">Discuss a sovereign deployment</Link>
            <Link href="/guardian-os" className="gos-btn gos-btn-ghost">Explore Guardian OS</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
