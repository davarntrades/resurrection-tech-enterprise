import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sovereignProfiles = require("@/lib/sovereign/profiles").PROFILE_IDS as string[];

export const metadata: Metadata = {
  title: "Guardian OS Sovereign — Governed AI for Controlled Environments",
  description:
    "Guardian OS Sovereign provides an acceptance-testable, offline-clean and air-gapped operating architecture with signed local policy enforcement and locally generated governance evidence.",
  alternates: { canonical: "/guardian-os/sovereign" },
};

const AUDIENCES = [
  ["National government", "Departments and central authorities deploying governed AI across public administration, national programmes and shared services."],
  ["Defence and national security", "Organisations operating under mission, security, isolation and evidence requirements that cannot depend on public-cloud assumptions."],
  ["Critical infrastructure", "Operators responsible for energy, communications, transport, water and other nationally important systems."],
  ["Public-sector healthcare", "National and regional healthcare bodies requiring controlled AI operation, traceable evidence and protected deployment boundaries."],
  ["Sovereign technology programmes", "Programmes establishing national AI capability while retaining policy authority, evidence custody and operational control inside the jurisdiction."],
  ["Highly regulated institutions", "Organisations whose governance or security requirements demand private, on-premises or air-gapped deployment."],
];

const TRADITIONAL_FLOW = ["Organisation", "Build governance platform", "Build deployment model", "Build evidence engine", "Build AI governance", "Deploy AI"];
const GUARDIAN_FLOW = ["Organisation", "Guardian OS", "Configure", "Verify", "Deploy"];

const SOVEREIGN_PACKS = [
  ["National Security", "Mission-specific policy, approval, evidence and reporting structures for national-security operating environments."],
  ["Defence Operations", "Governance content for controlled workflows, delegated authority, constrained execution and evidence preservation."],
  ["Critical Infrastructure", "Domain controls for nationally important systems where availability, reachability and operational boundaries must remain explicit."],
  ["Public Sector", "Reusable governance workflows, accountability structures and executive reporting for departments, agencies and public programmes."],
  ["National Healthcare", "Governance content for national and regional healthcare systems, including controlled data use, evidence mapping and human oversight."],
];

const VALUE_ROWS = [
  ["Time to capability", "2–4 year platform programme", "Platform available today"],
  ["Illustrative engineering investment", "£5M–£30M+ depending on scope and organisation size", "Configure and integrate an existing platform"],
  ["Governance kernel", "Build, validate and maintain internally", "Runtime Governance kernel already implemented"],
  ["Specialist capability", "Recruit and retain specialist engineering teams", "Existing platform plus configuration and integration"],
  ["Operating responsibility", "Ongoing platform ownership and redevelopment", "Ongoing platform operation, policy configuration and assurance"],
];

const PROVEN = [
  "External network access removed during sovereign CI execution.",
  "Signed local policy bundles enforced without a database, control plane or network connection.",
  "Offline-clean interface with zero required external fonts, analytics, embeds or telemetry loads.",
  "Governance evidence, attestations and control mappings generated locally.",
  "Tampered policy bundles fail closed and load zero active policies.",
  "Acceptance tooling verifies a live unauthorised action and its resulting evidence chain.",
];

const SUMMARY = [
  ["Already built", "Move directly into configuration, verification and deployment."],
  ["Air-gapped", "Signed local policy enforcement with no required external network access."],
  ["One kernel", "The same governance contract across cloud, on-premises and sovereign boundaries."],
  ["Evidence local", "Generate attestations, control mappings and governance evidence inside the boundary."],
];

function Flow({ steps }: { steps: string[] }) {
  return <div className="sov-flow">{steps.map((step, i) => <div className="sov-flow-step" key={step}><div>{step}</div>{i < steps.length - 1 && <span>↓</span>}</div>)}</div>;
}

export default function GuardianOSSovereignPage() {
  return (
    <PageShell>
      <main className="sov-page">
        <section className="sov-hero">
          <div className="sov-grid" aria-hidden="true" />
          <div className="sov-wrap sov-hero-layout">
            <div>
              <span className="sov-label">GUARDIAN OS // SOVEREIGN</span>
              <h1>Governed AI for sovereign, defence and critical infrastructure environments.</h1>
              <p className="sov-hero-copy">Guardian OS is already built. Organisations can move directly into configuration, verification and deployment instead of spending years engineering the governance platform first.</p>
              <p className="sov-muted">One Runtime Governance kernel operates across cloud, private cloud, on-premises, sovereign and air-gapped environments. The deployment boundary changes. The governance model does not.</p>
              <div className="sov-actions"><Link href="/book" className="sov-btn primary">Discuss a Sovereign deployment</Link><a href="#summary" className="sov-btn">View the operating model</a></div>
            </div>
            <div className="sov-command-map">
              <span className="sov-label">NATIONAL DEPLOYMENT ARCHITECTURE</span>
              <div className="sov-boundaries">{sovereignProfiles.map((p) => <div key={p}>{p.replaceAll("_", " ")}</div>)}</div>
              <div className="sov-kernel"><span>RUNTIME GOVERNANCE KERNEL</span><strong>Identity → Policy → Verdict → Approval → Execution → Evidence</strong></div>
              <div className="sov-modules"><span>Policy</span><span>Evidence</span><span>Runtime controls</span><span>Verification</span><span>AI Twin</span></div>
            </div>
          </div>
        </section>

        <section className="sov-summary" id="summary">
          <div className="sov-wrap">
            <div className="sov-summary-grid">{SUMMARY.map(([title, body]) => <article key={title}><strong>{title}</strong><span>{body}</span></article>)}</div>
            <nav className="sov-jump" aria-label="Sovereign page sections"><a href="#who">Who it is for</a><a href="#programme">Deployment path</a><a href="#value">Value comparison</a><a href="#packs">Intelligence Packs</a><a href="#airgap">Air-gapped proof</a></nav>
          </div>
        </section>

        <section className="sov-section dark" id="who"><div className="sov-wrap"><header><span className="sov-label">WHO THIS IS FOR</span><h2>For institutions that must retain control of how AI operates.</h2><p className="sov-muted">Designed for organisations where deployment location, policy authority, evidence custody, network posture and operational accountability cannot be secondary concerns.</p><div className="sov-keyline">Government, defence, critical infrastructure and regulated institutions.</div></header><div className="sov-card-grid">{AUDIENCES.map(([t,b],i)=><article key={t}><span>{String(i+1).padStart(2,"0")}</span><h3>{t}</h3><p>{b}</p></article>)}</div></div></section>

        <section className="sov-section" id="programme"><div className="sov-wrap"><header><span className="sov-label">PROGRAMME ACCELERATION</span><h2>Move from building infrastructure to configuring and operating it.</h2><div className="sov-keyline">The platform exists. Customer effort shifts to configuration, integration, assurance and operation.</div></header><div className="sov-flow-compare"><article><div className="sov-path-head"><span>TRADITIONAL APPROACH</span><b>Build the platform before deploying AI</b></div><Flow steps={TRADITIONAL_FLOW}/></article><article className="gold"><div className="sov-path-head"><span>GUARDIAN OS</span><b>Use the platform that already exists</b></div><Flow steps={GUARDIAN_FLOW}/><p className="sov-note">Delivery can begin immediately. Longer timelines are primarily driven by customer procurement, legal, assurance, integration and operational acceptance.</p></article></div></div></section>

        <section className="sov-section dark" id="value"><div className="sov-wrap"><header><span className="sov-label">ILLUSTRATIVE VALUE COMPARISON</span><h2>Build and own the platform—or configure one that already exists.</h2><p className="sov-muted">The figures below are illustrative rather than quoted programme costs. Actual investment varies materially by scope, accreditation, deployment boundary and organisation size.</p><div className="sov-keyline">The commercial advantage is time-to-capability, lower programme complexity and reduced platform-build risk.</div></header><div className="sov-table-wrap"><table className="sov-table"><thead><tr><th>Capability</th><th>Build internally</th><th>Guardian OS</th></tr></thead><tbody>{VALUE_ROWS.map(([c,b,g])=><tr key={c}><td data-label="Capability">{c}</td><td data-label="Build internally">{b}</td><td data-label="Guardian OS" className="gold-cell">{g}</td></tr>)}</tbody></table></div><p className="sov-disclaimer">This comparison is intended to show the trade-off between a multi-year internal platform programme and configuring an existing governed operating architecture. It is not a guaranteed savings claim.</p></div></section>

        <section className="sov-section" id="packs"><div className="sov-wrap"><header><span className="sov-label">SOVEREIGN INTELLIGENCE PACKS</span><h2>Mission and national-domain governance without creating a second platform.</h2><p className="sov-muted">Sovereign Intelligence Packs add domain-specific policies, workflows, evidence mappings, reporting structures and readiness guidance while preserving one Runtime Governance kernel.</p><div className="sov-keyline">One operating architecture, configured for different sovereign missions.</div></header><div className="sov-pack-map"><strong>Guardian OS</strong><span>└── Sovereign Intelligence Packs</span>{SOVEREIGN_PACKS.map(([t])=><span key={t}>    ├── {t}</span>)}</div><div className="sov-card-grid">{SOVEREIGN_PACKS.map(([t,b],i)=><article key={t}><span>{String(i+1).padStart(2,"0")}</span><h3>{t}</h3><p>{b}</p></article>)}</div></div></section>

        <section className="sov-section dark" id="airgap"><div className="sov-wrap"><header><span className="sov-label">AIR-GAPPED OPERATION</span><h2>Offline-clean, locally enforced and acceptance-testable.</h2><p className="sov-muted">Guardian OS Sovereign provides an acceptance-testable, offline-clean and air-gapped operating architecture, with signed local policy enforcement, zero required external resource loads and locally generated governance evidence.</p><div className="sov-keyline">External network removed. Policy local. Evidence local. Failure mode closed.</div></header><div className="sov-proof-grid">{PROVEN.map((p,i)=><div key={p}><span>{String(i+1).padStart(2,"0")}</span><p>{p}</p></div>)}</div><div className="sov-status">Current description: <strong>acceptance-testable, not field-tested.</strong></div></div></section>

        <section className="sov-final"><div className="sov-grid" aria-hidden="true"/><div className="sov-wrap"><span className="sov-label">GUARDIAN OS SOVEREIGN</span><h2>Keep operational control inside the boundary. Keep governance consistent across it.</h2><div className="sov-actions centred"><Link href="/book" className="sov-btn primary">Discuss a Sovereign deployment</Link><Link href="/guardian-os" className="sov-btn">Explore Guardian OS</Link></div></div></section>
      </main>
      <style>{`
        .sov-page{--gold:#d5ad5a;--line:rgba(213,173,90,.25);--muted:#aaa59b;background:#050505;color:#f6f2e9;overflow:hidden}.sov-page *{box-sizing:border-box}.sov-wrap{width:min(1180px,calc(100% - 40px));margin:auto;position:relative;z-index:1}.nav-assess,.nav-menu-cta .btn--primary{background:linear-gradient(180deg,#e2c07a,#d5ad5a)!important;border-color:transparent!important;color:#14100a!important;box-shadow:0 0 0 1px rgba(213,173,90,.45),0 10px 30px -12px rgba(213,173,90,.4)!important}.nav-assess .arr{color:#14100a!important}.sov-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(213,173,90,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(213,173,90,.055) 1px,transparent 1px);background-size:48px 48px;mask-image:linear-gradient(to bottom,#000,transparent)}.sov-hero,.sov-final{position:relative;background:#030303;border-bottom:1px solid var(--line)}.sov-hero-layout{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:60px;align-items:center;padding:108px 0 86px}.sov-label{color:var(--gold);font-size:12px;font-weight:800;letter-spacing:.2em;text-transform:uppercase}.sov-hero h1{font-size:clamp(44px,6vw,80px);line-height:.99;letter-spacing:-.05em;margin:22px 0 28px}.sov-hero-copy{font-size:clamp(21px,2.4vw,31px);line-height:1.35}.sov-muted{color:var(--muted);font-size:18px;line-height:1.7}.sov-actions{display:flex;gap:14px;flex-wrap:wrap;margin-top:32px}.sov-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 22px;border:1px solid var(--gold);color:var(--gold);text-decoration:none;font-weight:750;text-align:center}.sov-btn.primary{background:var(--gold);color:#050505}.sov-command-map{border:1px solid #8f743d;padding:24px;background:linear-gradient(180deg,rgba(213,173,90,.07),rgba(255,255,255,.015))}.sov-boundaries{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:22px 0}.sov-boundaries div,.sov-modules span{border:1px solid var(--line);padding:12px;text-align:center;text-transform:uppercase;font-size:11px;overflow-wrap:anywhere}.sov-kernel{border:1px solid var(--gold);padding:20px;text-align:center}.sov-kernel span{color:var(--gold);font-size:11px;letter-spacing:.15em}.sov-kernel strong{display:block;margin-top:10px;font-size:14px;line-height:1.5}.sov-modules{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin-top:10px}.sov-summary{padding:28px 0 24px;background:#080705;border-bottom:1px solid var(--line)}.sov-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line)}.sov-summary-grid article{background:#080808;padding:20px}.sov-summary-grid strong{display:block;color:var(--gold);font-size:14px;text-transform:uppercase;letter-spacing:.08em}.sov-summary-grid span{display:block;color:#c9c2b5;line-height:1.5;margin-top:8px;font-size:14px}.sov-jump{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.sov-jump a{border:1px solid var(--line);padding:9px 12px;color:#d8d0c1;text-decoration:none;font-size:12px}.sov-section{padding:92px 0;background:#090909;border-bottom:1px solid rgba(255,255,255,.06)}.sov-section.dark{background:#030303}.sov-section header{max-width:900px;margin-bottom:40px}.sov-section h2,.sov-final h2{font-size:clamp(36px,5vw,62px);line-height:1.04;letter-spacing:-.045em;margin:16px 0 18px}.sov-keyline{margin-top:20px;border-left:3px solid var(--gold);padding:14px 18px;background:rgba(213,173,90,.055);color:#eee3ca;font-weight:750;line-height:1.5}.sov-card-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line)}.sov-card-grid article{background:#080808;padding:26px;min-width:0}.sov-card-grid article>span{color:var(--gold);font-size:11px}.sov-card-grid h3{font-size:22px;margin:22px 0 10px}.sov-card-grid p{color:var(--muted);line-height:1.55}.sov-flow-compare{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.sov-flow-compare article{border:1px solid var(--line);background:#070707}.sov-flow-compare article.gold{border-color:var(--gold)}.sov-path-head{padding:22px;border-bottom:1px solid var(--line)}.sov-path-head span{display:block;color:var(--gold);font-size:11px;letter-spacing:.16em;font-weight:800}.sov-path-head b{display:block;font-size:22px;margin-top:7px}.sov-flow{padding:24px}.sov-flow-step{text-align:center}.sov-flow-step div{border:1px solid var(--line);padding:15px;background:#0a0a0a;font-weight:750}.sov-flow-step span{display:block;color:var(--gold);font-size:24px;padding:7px}.sov-note,.sov-disclaimer{color:#cfc8bb;line-height:1.65}.sov-note{padding:0 24px 24px}.sov-table-wrap{overflow-x:auto;border:1px solid var(--line)}.sov-table{width:100%;border-collapse:collapse;min-width:760px}.sov-table th,.sov-table td{padding:22px;text-align:left;border-bottom:1px solid rgba(255,255,255,.08);vertical-align:top;line-height:1.55}.sov-table th{color:var(--gold);font-size:12px;letter-spacing:.13em;text-transform:uppercase}.sov-table td:first-child{font-weight:750}.sov-table .gold-cell{color:#eee0bd}.sov-disclaimer{margin-top:20px;font-size:14px}.sov-pack-map{display:grid;gap:9px;border:1px solid #8f743d;padding:28px;margin-bottom:24px;background:#070707;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#cbc3b5}.sov-pack-map strong{color:var(--gold);font-size:20px}.sov-proof-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line)}.sov-proof-grid div{background:#070707;padding:22px}.sov-proof-grid span{color:var(--gold);font-size:11px}.sov-proof-grid p{margin:10px 0 0;color:#cbc5b9;line-height:1.55}.sov-status{margin-top:20px;border:1px solid var(--gold);padding:20px;text-align:center;color:#d8d0c1}.sov-status strong{color:var(--gold)}.sov-final{padding:100px 0;text-align:center}.sov-final .sov-wrap{max-width:900px}.centred{justify-content:center}
        @media(max-width:1024px){.sov-hero-layout,.sov-flow-compare{grid-template-columns:1fr}.sov-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.sov-card-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.sov-command-map{max-width:760px}.sov-proof-grid{grid-template-columns:1fr}}
        @media(max-width:720px){.sov-wrap{width:min(100% - 28px,1180px)}.sov-section{padding:70px 0}.sov-summary-grid,.sov-card-grid{grid-template-columns:1fr}.sov-actions{display:grid;grid-template-columns:1fr}.sov-btn{width:100%}.sov-modules{grid-template-columns:repeat(2,minmax(0,1fr))}.sov-jump{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.sov-jump a{text-align:center}.sov-table{min-width:0}.sov-table thead{display:none}.sov-table,.sov-table tbody,.sov-table tr,.sov-table td{display:block;width:100%}.sov-table tr{border-bottom:1px solid var(--line);padding:10px 0}.sov-table td{border:0;padding:10px 18px}.sov-table td:before{content:attr(data-label);display:block;color:var(--gold);font-size:10px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:5px}}
        @media(max-width:420px){.sov-wrap{width:min(100% - 20px,1180px)}.sov-hero-layout{padding:70px 0 58px}.sov-command-map{padding:16px}.sov-boundaries,.sov-modules,.sov-jump{grid-template-columns:1fr}.sov-hero-copy{font-size:20px}.sov-muted{font-size:16px}.sov-card-grid article{padding:22px}}
      `}</style>
    </PageShell>
  );
}
