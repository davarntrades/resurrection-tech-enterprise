import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";

// Read deployment profiles from the shipping runtime registry so the public
// page cannot silently drift away from the platform it describes.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sovereignProfiles = require("@/lib/sovereign/profiles").PROFILE_IDS as string[];

export const metadata: Metadata = {
  title: "Guardian OS Sovereign — Governed AI for Controlled Environments",
  description:
    "Guardian OS Sovereign enables organisations to adopt governed enterprise AI across cloud, private cloud, on-premises, sovereign and air-gapped environments without rebuilding the governance platform for every deployment boundary.",
  alternates: { canonical: "/guardian-os/sovereign" },
  openGraph: {
    title: "Guardian OS Sovereign — Governed AI for Controlled Environments",
    description:
      "One Runtime Governance kernel across six deployment profiles, with explicit operational guarantees, Sovereign Intelligence Packs and deployment verification.",
    url: "/guardian-os/sovereign",
  },
};

const AUDIENCES = [
  ["National government", "Departments and central authorities deploying governed AI across public administration, national programmes and shared services."],
  ["Defence and national security", "Organisations operating under mission, security, isolation and evidence requirements that cannot depend on public-cloud assumptions."],
  ["Critical infrastructure", "Operators responsible for energy, communications, transport, water and other nationally important systems."],
  ["Public-sector healthcare", "National and regional healthcare bodies requiring controlled AI operation, traceable evidence and protected deployment boundaries."],
  ["Sovereign technology programmes", "Programmes establishing national AI capability while retaining operational control, policy authority and evidence inside the jurisdiction."],
  ["Highly regulated institutions", "Organisations whose governance, security or operational requirements demand private, on-premises or air-gapped deployment."],
];

const QUESTIONS = [
  "Where is policy enforced?",
  "Where are state and evidence stored?",
  "Can software update itself?",
  "Can runtime behaviour change remotely?",
  "Can AI communicate externally?",
  "How are deployments verified?",
];

const TRADITIONAL_FLOW = [
  "Organisation",
  "Build governance platform",
  "Build deployment model",
  "Build evidence engine",
  "Build AI governance",
  "Deploy AI",
];

const GUARDIAN_FLOW = ["Organisation", "Guardian OS", "Configure", "Verify", "Deploy"];

const SOVEREIGN_PACKS = [
  ["National Security", "Mission-specific policy, approval, evidence and reporting structures for national-security operating environments."],
  ["Defence Operations", "Governance content for controlled operational workflows, delegated authority, constrained execution and evidence preservation."],
  ["Critical Infrastructure", "Domain controls for nationally important systems where availability, reachability and operational boundaries must remain explicit."],
  ["Public Sector", "Reusable governance workflows, accountability structures and executive reporting for departments, agencies and public programmes."],
  ["National Healthcare", "Governance content for national and regional healthcare systems, including controlled data use, evidence mapping and human oversight."],
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

const VERIFICATION_PROPERTIES = [
  "Deployment profile",
  "Policy source",
  "Evidence and state storage",
  "Network posture",
  "Signing requirements",
  "Governance readiness",
  "Runtime accessibility",
];

const CURRENT_CAPABILITIES = [
  "Six deployment profiles",
  "Signed offline policy bundles",
  "Deployment verification and reporting",
  "Consistent Runtime Governance interfaces",
  "Control Room integration",
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

function Flow({ steps }: { steps: string[] }) {
  return (
    <div className="sov-flow">
      {steps.map((step, index) => (
        <div className="sov-flow-step" key={step}>
          <div>{step}</div>
          {index < steps.length - 1 && <span aria-hidden="true">↓</span>}
        </div>
      ))}
    </div>
  );
}

export default function GuardianOSSovereignPage() {
  return (
    <PageShell>
      <main className="sov-page">
        <section className="sov-hero">
          <div className="sov-grid" aria-hidden="true" />
          <div className="sov-wrap sov-hero-layout">
            <div>
              <span className="sov-classification">GUARDIAN OS // SOVEREIGN</span>
              <h1>Governed AI for sovereign, defence and critical infrastructure environments.</h1>
              <p className="sov-hero-copy">
                Guardian OS is already built. Organisations can move directly into configuration, verification and
                deployment instead of spending multiple years engineering a governance platform before governed AI can
                reach production.
              </p>
              <p className="sov-hero-support">
                One Runtime Governance kernel operates across cloud, private cloud, on-premises, sovereign and air-gapped
                environments. The deployment boundary changes. The governance model does not.
              </p>
              <div className="sov-actions">
                <Link href="/book" className="sov-button sov-button-primary">Request a sovereign briefing</Link>
                <a href="#programme" className="sov-button sov-button-secondary">Review the deployment model</a>
              </div>
              <div className="sov-proof">
                <span>{sovereignProfiles.length} deployment profiles</span>
                <span>Signed offline policy</span>
                <span>Verification over assumption</span>
                <span>Acceptance-testable</span>
              </div>
            </div>

            <div className="sov-command-map" aria-label="Guardian OS sovereign deployment architecture">
              <div className="sov-map-label">NATIONAL DEPLOYMENT ARCHITECTURE</div>
              <div className="sov-boundaries">
                {sovereignProfiles.map((profile) => (
                  <div className="sov-boundary" key={profile}>{profile.replaceAll("_", " ")}</div>
                ))}
              </div>
              <div className="sov-map-line" />
              <div className="sov-kernel">
                <span>RUNTIME GOVERNANCE KERNEL</span>
                <strong>Identity → Policy → Verdict → Approval → Execution → Evidence</strong>
              </div>
              <div className="sov-map-modules">
                <span>Policy</span><span>Evidence</span><span>Runtime controls</span><span>Verification</span><span>AI Twin</span>
              </div>
            </div>
          </div>
        </section>

        <section className="sov-section sov-section-dark" id="who">
          <div className="sov-wrap">
            <div className="sov-heading">
              <span>WHO THIS IS FOR</span>
              <h2>For institutions that must retain control of how AI operates.</h2>
              <p>
                Guardian OS Sovereign is designed for organisations where deployment location, policy authority,
                evidence custody, network posture and operational accountability cannot be treated as secondary concerns.
              </p>
            </div>
            <div className="sov-audience-grid">
              {AUDIENCES.map(([title, body], index) => (
                <article key={title}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="sov-section" id="programme">
          <div className="sov-wrap">
            <div className="sov-heading">
              <span>PROGRAMME ACCELERATION</span>
              <h2>Move from building infrastructure to configuring and operating it.</h2>
              <p>
                Guardian OS removes the need to first invent the governance platform. The technical foundation already
                exists; the customer programme can begin with configuration, verification and deployment.
              </p>
            </div>

            <div className="sov-flow-compare">
              <article className="sov-flow-card">
                <div className="sov-path-head"><span>TRADITIONAL APPROACH</span><b>Build the platform before deploying AI</b></div>
                <Flow steps={TRADITIONAL_FLOW} />
              </article>
              <article className="sov-flow-card sov-flow-card-gold">
                <div className="sov-path-head"><span>GUARDIAN OS</span><b>Use the platform that already exists</b></div>
                <Flow steps={GUARDIAN_FLOW} />
                <p className="sov-path-result">
                  Delivery can begin immediately. Longer elapsed timelines are primarily driven by customer procurement,
                  legal, assurance, integration and operational acceptance requirements.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="sov-section sov-section-dark" id="packs">
          <div className="sov-wrap">
            <div className="sov-heading">
              <span>SOVEREIGN INTELLIGENCE PACKS</span>
              <h2>Mission and national-domain governance without creating a second platform.</h2>
              <p>
                Sovereign Intelligence Packs extend Guardian OS with domain-specific policies, workflows, evidence
                mappings, reporting structures and readiness guidance. They configure how the shared Runtime Governance
                kernel operates for a sovereign mission; they do not replace or weaken the kernel.
              </p>
            </div>

            <div className="sov-pack-map" aria-label="Guardian OS Sovereign Intelligence Pack hierarchy">
              <div className="sov-pack-root">Guardian OS</div>
              <div className="sov-pack-branch">
                <span>Sovereign Intelligence Packs</span>
                <div className="sov-pack-tree">
                  {SOVEREIGN_PACKS.map(([title]) => <div key={title}>{title}</div>)}
                </div>
              </div>
            </div>

            <div className="sov-pack-grid">
              {SOVEREIGN_PACKS.map(([title, body], index) => (
                <article key={title}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
            <div className="sov-callout">
              <strong>One kernel. Multiple sovereign missions.</strong>
              <span>Each pack adds specialised governance content while preserving one decision contract, one evidence model and one operating architecture.</span>
            </div>
          </div>
        </section>

        <section className="sov-section" id="problem">
          <div className="sov-wrap">
            <div className="sov-heading">
              <span>THE OPERATIONAL PROBLEM</span>
              <h2>Critical environments cannot inherit public-cloud assumptions.</h2>
              <p>
                Defence, government, healthcare and national infrastructure operators need to know what a running
                system can reach, change and prove—not simply what a design document says should be true.
              </p>
            </div>
            <div className="sov-question-grid">
              {QUESTIONS.map((question, index) => (
                <article key={question}><span>{String(index + 1).padStart(2, "0")}</span><h3>{question}</h3><p>Guardian OS treats the answer as an inspectable deployment property.</p></article>
              ))}
            </div>
            <div className="sov-callout">
              <strong>Documentation describes intent.</strong>
              <span>Deployment evidence shows what was observed inside the operating boundary.</span>
            </div>
          </div>
        </section>

        <section className="sov-section sov-section-dark" id="architecture">
          <div className="sov-wrap">
            <div className="sov-heading">
              <span>KERNEL INVARIANCE</span>
              <h2>Change the providers. Preserve the governance contract.</h2>
              <p>
                Guardian OS does not fork its control logic for sovereign environments. Deployment profiles select the
                permitted providers around one enforcement path and one evidence model.
              </p>
            </div>
            <div className="sov-topology">
              <div className="sov-topology-row">
                {sovereignProfiles.map((profile) => <div key={profile}>{profile.replaceAll("_", " ")}</div>)}
              </div>
              <div className="sov-topology-spine">ONE RUNTIME GOVERNANCE KERNEL</div>
              <div className="sov-topology-row sov-topology-controls">
                <div>Identity</div><div>Policy</div><div>Verdict</div><div>Approval</div><div>Execution</div><div>Evidence</div>
              </div>
            </div>
          </div>
        </section>

        <section className="sov-section" id="profiles">
          <div className="sov-wrap">
            <div className="sov-heading">
              <span>DEPLOYMENT GUARANTEES</span>
              <h2>Operational properties become explicit configuration.</h2>
              <p>Unknown profiles and unavailable guarantees are refused rather than silently falling back to a less controlled mode.</p>
            </div>
            <div className="sov-card-grid">
              {PROFILE_PROPERTIES.map(([title, body], index) => (
                <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{body}</p></article>
              ))}
            </div>
          </div>
        </section>

        <section className="sov-section sov-section-dark" id="verification">
          <div className="sov-wrap">
            <div className="sov-heading">
              <span>DEPLOYMENT VERIFICATION</span>
              <h2>Report observed characteristics. Preserve what remains unknown.</h2>
              <p>
                Verification produces evidence for engineering review and acceptance activity without turning an
                observation into accreditation or claiming assurance that has not been independently established.
              </p>
            </div>
            <div className="sov-verification-grid">
              {VERIFICATION_PROPERTIES.map((property) => <div key={property}><span>INSPECTABLE</span><strong>{property}</strong></div>)}
            </div>
          </div>
        </section>

        <section className="sov-section" id="capabilities">
          <div className="sov-wrap">
            <div className="sov-heading">
              <span>CURRENT CAPABILITY</span>
              <h2>Sovereign deployment is an operating capability—not a paragraph in a security document.</h2>
            </div>
            <div className="sov-capability-list">
              {CURRENT_CAPABILITIES.map((capability, index) => <div key={capability}><span>{String(index + 1).padStart(2, "0")}</span>{capability}</div>)}
            </div>
          </div>
        </section>

        <section className="sov-section sov-section-dark" id="assurance-boundary">
          <div className="sov-wrap">
            <div className="sov-heading">
              <span>ASSURANCE BOUNDARY</span>
              <h2>Strong engineering evidence, stated without over-claiming.</h2>
              <p>The architecture is implemented and continuously tested. Customer-site operation and independent assurance remain separate milestones.</p>
            </div>
            <div className="sov-assurance">
              <article><span>PROVEN IN CODE AND CI</span><ul>{PROVEN.map((item) => <li key={item}>{item}</li>)}</ul></article>
              <article><span>NOT YET REPRESENTED AS COMPLETE</span><ul>{NOT_YET.map((item) => <li key={item}>{item}</li>)}</ul></article>
            </div>
            <div className="sov-status">Current description: <strong>acceptance-testable, not field-tested.</strong></div>
          </div>
        </section>

        <section className="sov-final">
          <div className="sov-grid" aria-hidden="true" />
          <div className="sov-wrap">
            <span>GUARDIAN OS SOVEREIGN</span>
            <h2>Keep operational control inside the boundary. Keep governance consistent across it.</h2>
            <p>Begin with deployment requirements, the assurance gap register and one acceptance-testable governed use case.</p>
            <div className="sov-actions sov-actions-centred">
              <Link href="/book" className="sov-button sov-button-primary">Request a sovereign briefing</Link>
              <Link href="/guardian-os" className="sov-button sov-button-secondary">Explore Guardian OS</Link>
            </div>
          </div>
        </section>
      </main>

      <style>{`
        .sov-page{--gold:#d5ad5a;--gold-soft:#8f743d;--ink:#050505;--panel:#0b0b0b;--line:rgba(213,173,90,.24);--text:#f5f1e8;--muted:#aaa59b;background:var(--ink);color:var(--text);overflow:hidden}
        .sov-page *{box-sizing:border-box}.sov-wrap{width:min(1180px,calc(100% - 40px));margin:0 auto;position:relative;z-index:1}
        .nav-assess,.nav-menu-cta .btn--primary{background:#d5ad5a!important;border-color:#d5ad5a!important;color:#050505!important}
        .sov-hero,.sov-final{position:relative;overflow:hidden;background:#030303;border-bottom:1px solid var(--line)}
        .sov-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(213,173,90,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(213,173,90,.055) 1px,transparent 1px);background-size:48px 48px;mask-image:linear-gradient(to bottom,#000,transparent)}
        .sov-hero-layout{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:64px;align-items:center;padding:112px 0 88px}
        .sov-classification,.sov-heading>span,.sov-final>.sov-wrap>span,.sov-map-label{display:inline-block;color:var(--gold);font-size:12px;font-weight:800;letter-spacing:.22em;text-transform:uppercase}
        .sov-hero h1{font-size:clamp(44px,6vw,82px);line-height:.98;letter-spacing:-.055em;max-width:850px;margin:22px 0 28px;overflow-wrap:anywhere}
        .sov-hero-copy{font-size:clamp(21px,2.4vw,32px);line-height:1.35;max-width:820px;margin:0 0 22px;color:#fff}
        .sov-hero-support,.sov-heading p,.sov-final p{color:var(--muted);font-size:18px;line-height:1.7;max-width:800px}
        .sov-actions{display:flex;gap:14px;flex-wrap:wrap;margin:34px 0}.sov-button{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 22px;border:1px solid var(--gold);font-weight:750;text-decoration:none;letter-spacing:.01em;text-align:center}.sov-button-primary{background:var(--gold);color:#050505}.sov-button-secondary{color:var(--gold);background:transparent}
        .sov-proof{display:flex;flex-wrap:wrap;gap:10px}.sov-proof span{border:1px solid var(--line);padding:9px 11px;color:#d9d4ca;font-size:12px;text-transform:uppercase;letter-spacing:.08em}
        .sov-command-map{min-width:0;border:1px solid var(--gold-soft);background:linear-gradient(180deg,rgba(213,173,90,.07),rgba(255,255,255,.015));padding:24px;box-shadow:0 0 70px rgba(213,173,90,.08)}
        .sov-boundaries{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:22px 0}.sov-boundary{border:1px solid var(--line);padding:13px;text-transform:uppercase;font-size:12px;letter-spacing:.09em;color:#d8d2c6;overflow-wrap:anywhere}
        .sov-map-line{height:34px;width:1px;background:var(--gold);margin:auto}.sov-kernel{border:1px solid var(--gold);padding:20px;text-align:center}.sov-kernel span{color:var(--gold);font-size:12px;font-weight:800;letter-spacing:.16em}.sov-kernel strong{display:block;font-size:14px;margin-top:10px;line-height:1.5;overflow-wrap:anywhere}
        .sov-map-modules{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin-top:10px}.sov-map-modules span{border:1px solid var(--line);padding:10px 5px;text-align:center;font-size:10px;text-transform:uppercase;color:var(--muted);overflow-wrap:anywhere}
        .sov-section{padding:96px 0;background:#090909;border-bottom:1px solid rgba(255,255,255,.06)}.sov-section-dark{background:#030303}
        .sov-heading{max-width:900px;margin-bottom:44px}.sov-heading h2,.sov-final h2{font-size:clamp(36px,5vw,64px);line-height:1.04;letter-spacing:-.045em;margin:16px 0 20px;overflow-wrap:anywhere}
        .sov-audience-grid,.sov-question-grid,.sov-card-grid,.sov-pack-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line)}
        .sov-audience-grid article,.sov-question-grid article,.sov-card-grid article,.sov-pack-grid article{background:#080808;padding:26px;min-height:190px;min-width:0}.sov-audience-grid article>span,.sov-question-grid article>span,.sov-card-grid article>span,.sov-pack-grid article>span{color:var(--gold);font-size:11px;letter-spacing:.14em}.sov-audience-grid h3,.sov-question-grid h3,.sov-card-grid h3,.sov-pack-grid h3{font-size:22px;margin:24px 0 10px}.sov-audience-grid p,.sov-question-grid p,.sov-card-grid p,.sov-pack-grid p{color:var(--muted);line-height:1.55}
        .sov-flow-compare{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.sov-flow-card{border:1px solid var(--line);background:#070707;min-width:0}.sov-flow-card-gold{border-color:var(--gold)}.sov-path-head{padding:22px;border-bottom:1px solid var(--line)}.sov-path-head span{display:block;color:var(--gold);font-size:11px;letter-spacing:.17em;font-weight:800}.sov-path-head b{display:block;font-size:22px;margin-top:7px}.sov-flow{padding:24px}.sov-flow-step{text-align:center}.sov-flow-step div{border:1px solid var(--line);padding:16px 14px;background:#0a0a0a;font-weight:750;overflow-wrap:anywhere}.sov-flow-card-gold .sov-flow-step div{border-color:rgba(213,173,90,.55)}.sov-flow-step span{display:block;color:var(--gold);font-size:24px;line-height:1;padding:8px 0}.sov-path-result{padding:0 24px 24px;color:#ddd6c8;line-height:1.65}
        .sov-pack-map{border:1px solid var(--gold-soft);background:linear-gradient(180deg,rgba(213,173,90,.06),rgba(255,255,255,.01));padding:28px;margin-bottom:24px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}.sov-pack-root{font-size:20px;color:var(--gold);margin-bottom:22px}.sov-pack-branch{border-left:1px solid var(--gold-soft);padding-left:24px}.sov-pack-branch>span{display:block;font-size:18px;color:#eee5d4;margin-bottom:16px}.sov-pack-tree{display:grid;gap:9px}.sov-pack-tree div{position:relative;border:1px solid var(--line);padding:12px 14px;color:#cfc7b7;background:#070707}.sov-pack-tree div:before{content:"";position:absolute;left:-25px;top:50%;width:24px;height:1px;background:var(--gold-soft)}
        .sov-callout{margin-top:24px;border-left:3px solid var(--gold);padding:24px 28px;background:rgba(213,173,90,.055);font-size:20px}.sov-callout strong,.sov-callout span{display:block}.sov-callout span{color:var(--muted);margin-top:8px}
        .sov-topology{border:1px solid var(--line);padding:28px;background:#050505}.sov-topology-row{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}.sov-topology-row div{border:1px solid var(--line);padding:14px 8px;text-align:center;text-transform:uppercase;font-size:11px;color:#d7d1c5;overflow-wrap:anywhere}.sov-topology-spine{margin:26px 0;padding:24px;text-align:center;border:1px solid var(--gold);color:var(--gold);font-weight:850;letter-spacing:.16em;overflow-wrap:anywhere}.sov-topology-controls div{color:var(--gold)}
        .sov-verification-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.sov-verification-grid div{border:1px solid var(--line);padding:22px;background:#050505;min-width:0}.sov-verification-grid span{display:block;color:var(--gold);font-size:10px;letter-spacing:.16em}.sov-verification-grid strong{display:block;margin-top:12px;overflow-wrap:anywhere}
        .sov-capability-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line)}.sov-capability-list div{background:#070707;padding:20px;min-width:0}.sov-capability-list span{color:var(--gold);font-size:11px;margin-right:15px}
        .sov-assurance{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.sov-assurance article{border:1px solid var(--line);padding:28px;background:#050505;min-width:0}.sov-assurance article>span{color:var(--gold);font-size:11px;font-weight:800;letter-spacing:.15em}.sov-assurance ul{padding-left:20px;margin:22px 0 0}.sov-assurance li{margin:0 0 14px;color:#cbc5b9;line-height:1.55}.sov-status{margin-top:20px;border:1px solid var(--gold);padding:20px;text-align:center;color:#d8d0c1}.sov-status strong{color:var(--gold)}
        .sov-final{padding:104px 0;text-align:center}.sov-final .sov-wrap{max-width:900px}.sov-final p{margin:0 auto}.sov-actions-centred{justify-content:center}
        @media(max-width:1024px){.sov-hero-layout{grid-template-columns:1fr;gap:44px;padding:92px 0 76px}.sov-command-map{max-width:760px}.sov-flow-compare,.sov-assurance{grid-template-columns:1fr}.sov-audience-grid,.sov-question-grid,.sov-card-grid,.sov-pack-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.sov-topology-row{grid-template-columns:repeat(3,minmax(0,1fr))}.sov-verification-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:720px){.sov-wrap{width:min(100% - 28px,1180px)}.sov-section{padding:72px 0}.sov-hero h1{font-size:clamp(42px,12vw,58px)}.sov-heading h2,.sov-final h2{font-size:clamp(34px,10vw,50px)}.sov-audience-grid,.sov-question-grid,.sov-card-grid,.sov-pack-grid,.sov-capability-list,.sov-verification-grid{grid-template-columns:1fr}.sov-topology{padding:18px}.sov-topology-row{grid-template-columns:repeat(2,minmax(0,1fr))}.sov-map-modules{grid-template-columns:repeat(2,minmax(0,1fr))}.sov-actions{display:grid;grid-template-columns:1fr}.sov-button{width:100%}.sov-pack-map{padding:20px}.sov-pack-branch{padding-left:18px}.sov-pack-tree div:before{left:-19px;width:18px}}
        @media(max-width:420px){.sov-wrap{width:min(100% - 20px,1180px)}.sov-hero-layout{padding:70px 0 58px}.sov-command-map{padding:16px}.sov-boundaries{grid-template-columns:1fr}.sov-topology-row{grid-template-columns:1fr}.sov-map-modules{grid-template-columns:1fr}.sov-hero-copy{font-size:20px}.sov-hero-support,.sov-heading p,.sov-final p{font-size:16px}.sov-classification,.sov-heading>span,.sov-final>.sov-wrap>span,.sov-map-label{letter-spacing:.14em}.sov-flow{padding:16px}.sov-path-head{padding:18px}.sov-audience-grid article,.sov-question-grid article,.sov-card-grid article,.sov-pack-grid article{padding:22px;min-height:0}.sov-assurance article{padding:22px}}
      `}</style>
    </PageShell>
  );
}
