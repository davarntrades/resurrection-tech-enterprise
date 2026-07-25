import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";

// Read deployment profiles from the shipping runtime registry so the public
// page cannot silently drift away from the platform it describes.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sovereignProfiles = require("@/lib/sovereign/profiles").PROFILE_IDS as string[];

export const metadata: Metadata = {
  title: "Guardian OS Sovereign — Verifiable Governance for Controlled Environments",
  description:
    "Guardian OS Sovereign extends the same Runtime Governance kernel across cloud, private cloud, on-premises, sovereign and air-gapped environments while making deployment guarantees explicit and inspectable.",
  alternates: { canonical: "/guardian-os/sovereign" },
  openGraph: {
    title: "Guardian OS Sovereign — Verifiable Governance for Controlled Environments",
    description:
      "One Runtime Governance kernel across multiple deployment profiles, with explicit operational guarantees, offline-capable evidence and verification over assumption.",
    url: "/guardian-os/sovereign",
  },
};

const QUESTIONS = [
  "Where is policy enforced?",
  "Where are state and evidence stored?",
  "Can software update itself?",
  "Can runtime behaviour change remotely?",
  "Can AI communicate externally?",
  "How are deployments verified?",
  "What can an auditor prove from the running environment?",
];

const PROFILE_PROPERTIES = [
  ["Policy source", "Remote service, controlled service or signed local bundle."],
  ["Evidence storage", "Where governance records and assurance artefacts remain."],
  ["State storage", "Which storage provider is permitted inside the deployment boundary."],
  ["Network egress", "Whether outbound communication is available, restricted or absent."],
  ["Runtime mutability", "Whether software or policy can change during operation."],
  ["Update mechanism", "How signed releases and policy packages enter the environment."],
  ["Trust requirements", "Which signatures, identities and deployment assertions must be verified."],
];

const PACK_CONTENTS = [
  "Domain policies",
  "Operational workflows",
  "Reporting templates",
  "Evidence mappings",
  "Readiness guidance",
  "Executive briefings",
  "Mission-specific governance content",
];

const VERIFICATION_PROPERTIES = [
  "Deployment profile",
  "Policy source",
  "Evidence and state storage",
  "Network posture",
  "Signing requirements",
  "Governance readiness",
  "Runtime accessibility",
];

const PRINCIPLES = [
  ["Kernel invariance", "The Runtime Governance engine and decision contract remain consistent across deployment models."],
  ["Explicit deployment guarantees", "Operational characteristics are represented as properties rather than implied by infrastructure prose."],
  ["Verification over assumption", "The platform reports observed characteristics and preserves unknowns instead of manufacturing certainty."],
  ["Governance-first architecture", "A different hosting boundary does not create a different policy-enforcement standard."],
  ["Operational transparency", "Deployment posture is surfaced through Guardian OS and its evidence rather than hidden in configuration."],
];

const CURRENT_CAPABILITIES = [
  "Six deployment profiles",
  "Signed offline policy bundles",
  "Deployment verification and reporting",
  "Consistent Runtime Governance interfaces",
  "Control Room integration",
  "Industry Intelligence Pack support",
  "Sovereign Intelligence Pack framework",
  "Offline evidence and PDF generation",
  "Runtime inspection of deployment characteristics",
  "Acceptance and control-mapping instruments",
];

const PROVEN = [
  "The Runtime Governance engine can load active policy from a signed filesystem bundle without a database, control plane or network connection.",
  "A sovereign profile refuses cloud storage clients even when cloud credentials remain present in the environment.",
  "The sovereign interface is built without external fonts, analytics, embeds or telemetry requests.",
  "Evidence packs, attestations and control mappings can render locally without Chromium or an external PDF service.",
  "Continuous integration runs the platform with network access removed and requires tampered bundles to load zero policies.",
  "Acceptance tooling sends a real unauthorised action through the live engine and verifies the resulting evidence chain.",
];

const NOT_YET = [
  "No Guardian OS Sovereign deployment has yet been witnessed on customer hardware.",
  "No independent accreditation, government authorisation or Common Criteria evaluation has been completed.",
  "No independent penetration test of the full sovereign deployment has been commissioned.",
  "Recovery-time and recovery-point objectives have not yet been proven in a customer operating environment.",
];

export default function GuardianOSSovereignPage() {
  return (
    <PageShell>
      <section className="gos-hero">
        <div className="gos-wrap">
          <span className="gos-eyebrow">Guardian OS Sovereign</span>
          <h1 className="gos-h1">
            One governance kernel.
            <span className="gos-h1-sub">Deployment guarantees appropriate to the mission.</span>
          </h1>
          <p className="gos-lede">
            Guardian OS Sovereign extends the Guardian OS operating platform to organisations working under the
            highest security, regulatory and operational requirements.
          </p>
          <p className="gos-lede-2">
            Cloud, private cloud, on-premises, sovereign and air-gapped deployments use the same Runtime Governance
            interfaces and decision contract. The deployment boundary changes. The governance model does not.
          </p>
          <div className="gos-cta-row">
            <Link href="/book" className="gos-btn gos-btn-primary">Request a sovereign briefing</Link>
            <a href="#verification" className="gos-btn gos-btn-ghost">Review deployment verification</a>
          </div>
          <div className="gos-hero-proof" aria-label="Guardian OS Sovereign platform attributes">
            <span>{sovereignProfiles.length} deployment profiles</span>
            <span>Signed offline policy</span>
            <span>Verification over assumption</span>
            <span>Acceptance-testable</span>
          </div>
        </div>
      </section>

      <section className="gos-section gos-section-alt" id="problem">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">The operational problem</span>
            <h2 className="gos-h2">Critical environments cannot inherit public-cloud assumptions.</h2>
            <p className="gos-sec-lede">
              Defence, government, healthcare, national infrastructure and other regulated organisations need more
              than a deployment diagram. They need to know what a running system can reach, change and prove.
            </p>
          </header>
          <div className="gos-outcome-grid">
            {QUESTIONS.map((question, index) => (
              <article className="gos-outcome reveal" data-d={String((index % 3) + 1)} key={question}>
                <h3>{question}</h3>
                <p>Guardian OS treats the answer as an inspectable deployment property, not an undocumented assumption.</p>
              </article>
            ))}
          </div>
          <div className="gos-problem-turn reveal">
            <p className="gos-problem-q">Documentation says what should be true. Deployment evidence shows what was observed.</p>
            <p className="gos-problem-a">
              Guardian OS Sovereign brings policy enforcement, deployment posture and assurance evidence into the
              same operating platform so administrators and auditors can evaluate the boundary directly.
            </p>
          </div>
        </div>
      </section>

      <section className="gos-section" id="architecture">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Kernel invariance</span>
            <h2 className="gos-h2">Change the providers. Preserve the governance contract.</h2>
            <p className="gos-sec-lede">
              Guardian OS does not fork its control logic for sovereign environments. The same enforcement path
              receives a proposed action, resolves identity and policy, returns a verdict and preserves evidence.
              Deployment profiles select the permitted providers around that path.
            </p>
          </header>
          <div className="gos-deployment-grid">
            {sovereignProfiles.map((profile, index) => (
              <article className="gos-deployment reveal" data-d={String((index % 3) + 1)} key={profile}>
                <h3>{profile.replaceAll("_", " ")}</h3>
                <p>Profile-specific storage, connectivity and update guarantees around one Runtime Governance kernel.</p>
              </article>
            ))}
          </div>
          <div className="gos-deployment-kernel reveal">
            <span>Deployment boundary</span><b>Cloud · Hybrid · Private cloud · On-premises · Sovereign · Air-gapped</b>
            <span>Invariant contract</span><b>Identity → policy → verdict → approval → execution → evidence</b>
          </div>
        </div>
      </section>

      <section className="gos-section gos-section-alt" id="profiles">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Deployment profiles</span>
            <h2 className="gos-h2">Operational guarantees become explicit configuration.</h2>
            <p className="gos-sec-lede">
              Each profile describes the conditions Guardian OS is permitted to operate under. Unknown profile names
              and unavailable guarantees are refused rather than silently falling back to a less controlled mode.
            </p>
          </header>
          <div className="gos-operating-grid">
            {PROFILE_PROPERTIES.map(([title, body], index) => (
              <article className="gos-operating-card reveal" data-d={String((index % 3) + 1)} key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="gos-section" id="packs">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Sovereign Intelligence Packs</span>
            <h2 className="gos-h2">Mission intelligence without modifying the kernel.</h2>
            <p className="gos-sec-lede">
              Sovereign Intelligence Packs contribute specialised governance content through the same versioned pack
              architecture used across Guardian OS. They can add constraints, workflows and evidence requirements;
              they cannot weaken the enterprise baseline or create a second governance engine.
            </p>
          </header>
          <div className="gos-outcome-grid">
            {PACK_CONTENTS.map((item, index) => (
              <article className="gos-outcome reveal" data-d={String((index % 3) + 1)} key={item}>
                <h3>{item}</h3>
                <p>Projected through existing Guardian OS workspaces, policy lifecycle and Control Room evidence.</p>
              </article>
            ))}
          </div>
          <div className="gos-cta-row reveal">
            <Link href="/intelligence-packs" className="gos-btn gos-btn-ghost">Explore the Intelligence Pack architecture</Link>
          </div>
        </div>
      </section>

      <section className="gos-section gos-section-alt" id="verification">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Deployment verification</span>
            <h2 className="gos-h2">Report observed characteristics. Preserve what remains unknown.</h2>
            <p className="gos-sec-lede">
              Verification inspects operational properties of the running deployment and produces a report suitable
              for engineering review, acceptance activity and assurance evidence. It does not convert an observation
              into accreditation or claim compliance that has not been independently established.
            </p>
          </header>
          <div className="gos-ws-grid">
            {VERIFICATION_PROPERTIES.map((property, index) => (
              <article className="gos-ws reveal" data-d={String((index % 3) + 1)} key={property}>
                <h3 className="gos-ws-t">{property}</h3>
                <span className="gos-ws-l">Inspectable property</span>
                <p className="gos-ws-p">Reported from deployment configuration and runtime checks where observable.</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="gos-section" id="assurance-boundary">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Current assurance boundary</span>
            <h2 className="gos-h2">Strong engineering evidence, stated without over-claiming.</h2>
            <p className="gos-sec-lede">
              The sovereign architecture is implemented and continuously tested. Customer-site operation and
              independent assurance remain separate milestones and are named plainly.
            </p>
          </header>
          <div className="twin-isnot">
            <div className="twin-isnot-col twin-isnot-is reveal" data-d="1">
              <span className="twin-vs-h">Proven in code and continuous integration</span>
              <ul>{PROVEN.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
            <div className="twin-isnot-col twin-isnot-not reveal" data-d="2">
              <span className="twin-vs-h">Not yet represented as complete</span>
              <ul>{NOT_YET.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          </div>
          <p className="gos-int-note reveal">
            The accurate description today is <strong>acceptance-testable, not field-tested</strong>. Acceptance
            artefacts identify self-tests, connected profiles and missing witnesses rather than allowing those
            conditions to disappear from the report.
          </p>
        </div>
      </section>

      <section className="gos-section gos-section-alt" id="principles">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Engineering principles</span>
            <h2 className="gos-h2">A sovereign architecture built to resist silent drift.</h2>
          </header>
          <div className="gos-operating-grid">
            {PRINCIPLES.map(([title, body], index) => (
              <article className="gos-operating-card reveal" data-d={String((index % 3) + 1)} key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="gos-section" id="capabilities">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Current capabilities</span>
            <h2 className="gos-h2">Sovereign deployment is an operating capability—not a paragraph in a security document.</h2>
          </header>
          <div className="gos-outcome-grid">
            {CURRENT_CAPABILITIES.map((capability, index) => (
              <article className="gos-outcome reveal" data-d={String((index % 3) + 1)} key={capability}>
                <h3>{capability}</h3>
                <p>Integrated into the Guardian OS deployment, verification or evidence lifecycle.</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="gos-section gos-section-alt" id="why">
        <div className="gos-wrap">
          <header className="gos-sec-head reveal">
            <span className="gos-kicker">Why this matters</span>
            <h2 className="gos-h2">One governance architecture across environments that cannot share the same infrastructure.</h2>
            <p className="gos-sec-lede">
              Maintaining a separate governance platform for each hosting model creates architectural divergence,
              duplicated validation and inconsistent operating decisions. Guardian OS keeps the governance spine
              stable while making the guarantees around each deployment visible and testable.
            </p>
          </header>
          <div className="gos-problem-turn reveal">
            <p className="gos-problem-q">The mission may require isolation. Governance should not fragment with it.</p>
            <p className="gos-problem-a">
              Organisations can evaluate where policy runs, where evidence remains and what the runtime can reach
              through the platform itself—while retaining a common decision and evidence model across the estate.
            </p>
          </div>
        </div>
      </section>

      <section className="gos-final">
        <div className="gos-wrap">
          <span className="gos-kicker">Guardian OS Sovereign</span>
          <h2 className="gos-final-h">Keep operational control inside the boundary. Keep governance consistent across it.</h2>
          <p className="twin-final-sub">
            Begin with deployment requirements, the assurance gap register and one acceptance-testable governed use case.
          </p>
          <div className="gos-cta-row gos-cta-center">
            <Link href="/book" className="gos-btn gos-btn-primary">Request a sovereign briefing</Link>
            <Link href="/guardian-os" className="gos-btn gos-btn-ghost">Explore Guardian OS</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
