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
      "One Runtime Governance kernel across six deployment profiles, with explicit operational guarantees, offline-capable evidence and deployment verification.",
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
];

const BUILD_STEPS = [
  "Design the governance architecture",
  "Build the runtime enforcement engine",
  "Create deployment profiles",
  "Engineer evidence generation",
  "Build governance workflows",
  "Develop the Executive AI Twin",
  "Create mission-specific Intelligence Packs",
  "Continuously test, validate and maintain the platform",
];

const OPERATE_STEPS = ["Define the mission boundary", "Configure policy", "Verify deployment", "Operate governed AI"];

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

        <section className="sov-section" id="programme">
          <div className="sov-wrap">
            <div className="sov-heading">
              <span>PROGRAMME ACCELERATION</span>
              <h2>Move from building infrastructure to configuring and operating it.</h2>
              <p>
                CIOs and CTOs do not need to become software vendors. Their objective is to deploy governed AI safely,
                not spend years inventing the platform that makes governed deployment possible.
              </p>
            </div>

            <div className="sov-compare">
              <article className="sov-path sov-path-long">
                <div className="sov-path-head"><span>BUILD INTERNALLY</span><b>Multi-year platform programme</b></div>
                <ol>{BUILD_STEPS.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span>{step}</li>)}</ol>
              </article>
              <article className="sov-path sov-path-short">
                <div className="sov-path-head"><span>GUARDIAN OS</span><b>Platform ready for deployment</b></div>
                <ol>{OPERATE_STEPS.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span>{step}</li>)}</ol>
                <p className="sov-path-result">
                  The platform foundations already exist. Delivery can begin immediately; elapsed time is driven primarily
                  by customer procurement, legal, assurance, integration and operational acceptance requirements.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="sov-section sov-section-dark" id="problem">
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

        <section className="sov-section" id="architecture">
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

        <section className="sov-section sov-section-dark" id="profiles">
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

        <section className="sov-section" id="verification">
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

        <section className="sov-section sov-section-dark" id="capabilities">
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

        <section className="sov-section" id="assurance-boundary">
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
        .sov-page{--gold:#d5ad5a;--gold-soft:#8f743d;--ink:#050505;--panel:#0b0b0b;--line:rgba(213,173,90,.24);--text:#f5f1e8;--muted:#aaa59b;background:var(--ink);color:var(--text)}
        .sov-wrap{width:min(1180px,calc(100% - 40px));margin:0 auto;position:relative;z-index:1}
        .sov-hero,.sov-final{position:relative;overflow:hidden;background:#030303;border-bottom:1px solid var(--line)}
        .sov-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(213,173,90,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(213,173,90,.055) 1px,transparent 1px);background-size:48px 48px;mask-image:linear-gradient(to bottom,#000,transparent)}
        .sov-hero-layout{display:grid;grid-template-columns:1.05fr .95fr;gap:64px;align-items:center;padding:112px 0 88px}
        .sov-classification,.sov-heading>span,.sov-final>.sov-wrap>span,.sov-map-label{display:inline-block;color:var(--gold);font-size:12px;font-weight:800;letter-spacing:.22em;text-transform:uppercase}
        .sov-hero h1{font-size:clamp(44px,6vw,82px);line-height:.98;letter-spacing:-.055em;max-width:850px;margin:22px 0 28px}
        .sov-hero-copy{font-size:clamp(21px,2.4vw,32px);line-height:1.35;max-width:820px;margin:0 0 22px;color:#fff}
        .sov-hero-support,.sov-heading p,.sov-final p{color:var(--muted);font-size:18px;line-height:1.7;max-width:800px}
        .sov-actions{display:flex;gap:14px;flex-wrap:wrap;margin:34px 0}
        .sov-button{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 22px;border:1px solid var(--gold);font-weight:750;text-decoration:none;letter-spacing:.01em}
        .sov-button-primary{background:var(--gold);color:#050505}.sov-button-secondary{color:var(--gold);background:transparent}
        .sov-proof{display:flex;flex-wrap:wrap;gap:10px}.sov-proof span{border:1px solid var(--line);padding:9px 11px;color:#d9d4ca;font-size:12px;text-transform:uppercase;letter-spacing:.08em}
        .sov-command-map{border:1px solid var(--gold-soft);background:linear-gradient(180deg,rgba(213,173,90,.07),rgba(255,255,255,.015));padding:24px;box-shadow:0 0 70px rgba(213,173,90,.08)}
        .sov-boundaries{display:grid;grid-template-columns:repeat(2,1fr);gap:9px;margin:22px 0}.sov-boundary{border:1px solid var(--line);padding:13px;text-transform:uppercase;font-size:12px;letter-spacing:.09em;color:#d8d2c6}
        .sov-map-line{height:34px;width:1px;background:var(--gold);margin:auto}.sov-kernel{border:1px solid var(--gold);padding:20px;text-align:center}.sov-kernel span{color:var(--gold);font-size:12px;font-weight:800;letter-spacing:.16em}.sov-kernel strong{display:block;font-size:14px;margin-top:10px;line-height:1.5}
        .sov-map-modules{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:10px}.sov-map-modules span{border:1px solid var(--line);padding:10px 5px;text-align:center;font-size:10px;text-transform:uppercase;color:var(--muted)}
        .sov-section{padding:96px 0;background:#090909;border-bottom:1px solid rgba(255,255,255,.06)}.sov-section-dark{background:#030303}
        .sov-heading{max-width:900px;margin-bottom:44px}.sov-heading h2,.sov-final h2{font-size:clamp(36px,5vw,64px);line-height:1.04;letter-spacing:-.045em;margin:16px 0 20px}
        .sov-compare{display:grid;grid-template-columns:1.15fr .85fr;gap:20px}.sov-path{border:1px solid var(--line);background:#070707}.sov-path-head{padding:22px;border-bottom:1px solid var(--line)}.sov-path-head span{display:block;color:var(--gold);font-size:11px;letter-spacing:.17em;font-weight:800}.sov-path-head b{display:block;font-size:22px;margin-top:7px}.sov-path ol{list-style:none;margin:0;padding:0}.sov-path li{display:flex;gap:16px;padding:17px 22px;border-bottom:1px solid rgba(255,255,255,.055);color:#ddd8cf}.sov-path li span{color:var(--gold);font-size:11px;letter-spacing:.1em}.sov-path-short{border-color:var(--gold)}.sov-path-result{padding:24px;color:#ddd6c8;line-height:1.65}
        .sov-question-grid,.sov-card-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border:1px solid var(--line)}
        .sov-question-grid article,.sov-card-grid article{background:#080808;padding:26px;min-height:190px}.sov-question-grid article>span,.sov-card-grid article>span{color:var(--gold);font-size:11px;letter-spacing:.14em}.sov-question-grid h3,.sov-card-grid h3{font-size:22px;margin:24px 0 10px}.sov-question-grid p,.sov-card-grid p{color:var(--muted);line-height:1.55}
        .sov-callout{margin-top:24px;border-left:3px solid var(--gold);padding:24px 28px;background:rgba(213,173,90,.055);font-size:20px}.sov-callout strong,.sov-callout span{display:block}.sov-callout span{color:var(--muted);margin-top:8px}
        .sov-topology{border:1px solid var(--line);padding:28px;background:#050505}.sov-topology-row{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}.sov-topology-row div{border:1px solid var(--line);padding:14px 8px;text-align:center;text-transform:uppercase;font-size:11px;color:#d7d1c5}.sov-topology-spine{margin:26px 0;padding:24px;text-align:center;border:1px solid var(--gold);color:var(--gold);font-weight:850;letter-spacing:.16em}.sov-topology-controls div{color:var(--gold)}
        .sov-verification-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.sov-verification-grid div{border:1px solid var(--line);padding:22px;background:#050505}.sov-verification-grid span{display:block;color:var(--gold);font-size:10px;letter-spacing:.16em}.sov-verification-grid strong{display:block;margin-top:12px}
        .sov-capability-list{display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:var(--line);border:1px solid var(--line)}.sov-capability-list div{background:#070707;padding:20px}.sov-capability-list span{color:var(--gold);font-size:11px;margin-right:15px}
        .sov-assurance{display:grid;grid-template-columns:1fr 1fr;gap:20px}.sov-assurance article{border:1px solid var(--line);padding:28px;background:#050505}.sov-assurance article>span{color:var(--gold);font-size:11px;font-weight:800;letter-spacing:.15em}.sov-assurance ul{padding-left:20px;margin:22px 0 0}.sov-assurance li{margin:0 0 14px;color:#cbc5b9;line-height:1.55}.sov-status{margin-top:20px;border:1px solid var(--gold);padding:20px;text-align:center;color:#d8d0c1}.sov-status strong{color:var(--gold)}
        .sov-final{padding:104px 0;text-align:center}.sov-final .sov-wrap{max-width:900px}.sov-final p{margin:0 auto}.sov-actions-centred{justify-content:center}
        @media(max-width:900px){.sov-hero-layout,.sov-compare,.sov-assurance{grid-template-columns:1fr}.sov-question-grid,.sov-card-grid{grid-template-columns:repeat(2,1fr)}.sov-topology-row{grid-template-columns:repeat(3,1fr)}.sov-verification-grid{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:620px){.sov-wrap{width:min(100% - 24px,1180px)}.sov-hero-layout{padding:78px 0 64px;gap:38px}.sov-section{padding:72px 0}.sov-question-grid,.sov-card-grid,.sov-capability-list,.sov-verification-grid{grid-template-columns:1fr}.sov-topology-row{grid-template-columns:repeat(2,1fr)}.sov-map-modules{grid-template-columns:repeat(2,1fr)}.sov-hero h1{font-size:46px}}
      `}</style>
    </PageShell>
  );
}
