import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sovereignProfiles = require("@/lib/sovereign/profiles").PROFILE_IDS as string[];

export const metadata: Metadata = {
  title: "Guardian OS Sovereign — Execution Control Inside the Boundary",
  description:
    "Guardian OS Sovereign provides an acceptance-testable, offline-clean and air-gapped operating architecture with signed local policy enforcement, customer-controlled execution authority and locally generated governance evidence.",
  alternates: { canonical: "/guardian-os/sovereign" },
};

/* The three sovereignties. The first two are widely pursued; the third is the
   one that decides what actually executes. */
const SOVEREIGNTIES = [
  ["Model sovereignty", "Which models run, and where their weights sit."],
  ["Compute sovereignty", "Which infrastructure they run on, and under whose jurisdiction."],
  ["Execution sovereignty", "Which proposed transitions are permitted to execute — and who holds that authority."],
];

/* Enforced by code and asserted by a test in CI. */
const GUARANTEES = [
  "Signed local policy bundles",
  "Ed25519 signature verification",
  "Signing key outside the protected environment",
  "No required external control plane",
  "No required cloud database",
  "No required network",
  "Local evidence generation",
  "Local evidence rendering",
  "Fail-closed operation",
  "Tamper refusal",
  "Customer-controlled execution authority",
  "Customer-controlled evidence custody",
  "Isolated deployment",
  "Sovereign deployment profile",
  "Air-gapped operation",
];

const PROVEN = [
  "External network access removed during sovereign CI execution.",
  "Signed local policy bundles enforced without a database, control plane or network connection.",
  "Offline-clean interface with zero required external fonts, analytics, embeds or telemetry loads.",
  "Governance evidence, attestations and control mappings generated locally.",
  "Tampered policy bundles fail closed and load zero active policies.",
  "Acceptance tooling verifies a live unauthorised action and its resulting evidence chain.",
];

/* Named plainly, because a defence or government procurement team will ask and
   the answer should already be written down. */
const NOT_YET = [
  "No deployment has run on customer hardware yet. The install media, images and acceptance suite exist; a witnessed site record does not.",
  "No third-party accreditation. No Common Criteria evaluation, no NCSC assurance, no FedRAMP authorisation, no ATO.",
  "No independent penetration test of the codebase has been commissioned.",
  "No identity provider of our own — Guardian OS sits behind the estate's existing IdP.",
];

const AUDIENCES = [
  ["National government", "Departments and central authorities deploying governed AI across public administration, national programmes and shared services."],
  ["Defence and national security", "Organisations operating under mission, security, isolation and evidence requirements that cannot depend on public-cloud assumptions."],
  ["Critical infrastructure", "Operators responsible for energy, communications, transport, water and other nationally important systems."],
  ["Public-sector healthcare", "National and regional healthcare bodies requiring controlled AI operation, traceable evidence and protected deployment boundaries."],
  ["Sovereign technology programmes", "Programmes establishing national AI capability while retaining policy authority, evidence custody and operational control inside the jurisdiction."],
  ["Highly regulated institutions", "Organisations whose governance or security requirements demand private, on-premises or air-gapped deployment."],
];

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

const CONTRACT = ["Identity", "Policy", "Verdict", "Approval", "Execution", "Evidence"];

export default function GuardianOSSovereignPage() {
  return (
    <PageShell className="theme-dark sov-page">
      {/* ══════════ LEAD ══════════ */}
      <section className="rt-section rt-section--first sov-lead" aria-labelledby="sov-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow">Guardian OS Sovereign</span>
          <h1 id="sov-title" className="rt-display sov-title reveal in" data-d="1">
            Sovereignty is incomplete
            <br />
            without execution control.
          </h1>
          <p className="rt-lede reveal in" data-d="2">
            Controlling which models run, and where they run, does not by itself control what those
            systems are permitted to execute. Execution authority is a separate control, and it can
            be held inside the boundary.
          </p>
          <div className="rt-actions reveal in" data-d="3">
            <Link href="/book" className="btn btn--primary">
              Discuss a Sovereign deployment <span className="arr">→</span>
            </Link>
            <a href="#guarantees" className="btn btn--ghost">What is enforced</a>
          </div>
        </div>
      </section>

      {/* ══════════ THREE SOVEREIGNTIES ══════════ */}
      <section className="rt-section sov-band" id="sovereignties" aria-labelledby="three-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">The third sovereignty</span>
          <h2 id="three-title" className="sr-only">Model, compute and execution sovereignty</h2>
          <p className="rt-principle rt-principle--stack sov-triple reveal" data-d="1">
            <span>Model sovereignty</span>
            <span className="sov-plus" aria-hidden="true">+</span>
            <span>Compute sovereignty</span>
            <span className="sov-plus" aria-hidden="true">+</span>
            <span className="sov-third">Execution sovereignty</span>
          </p>
          <div className="rt-defs reveal" data-d="2">
            {SOVEREIGNTIES.map(([k, v]) => (
              <div key={k}><span className="k">{k}</span><span className="v">{v}</span></div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ GUARANTEES ══════════ */}
      <section className="rt-section" id="guarantees" aria-labelledby="guar-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">Enforced in the deployment</span>
          <h2 id="guar-title" className="rt-h2 rt-narrow reveal" data-d="1">
            The same kernel.
            <br />
            With the network taken away.
          </h2>
          <p className="rt-lede reveal" data-d="2">
            The deployment profile changes where enforcement runs, who signs policy and who holds
            the evidence. It does not change the control contract.
          </p>

          <ol className="sov-contract reveal" data-d="3" aria-label="Control contract">
            {CONTRACT.map((step, i) => (
              <li key={step}><span>{String(i + 1).padStart(2, "0")}</span>{step}</li>
            ))}
          </ol>

          <ul className="rt-attrs sov-guarantees reveal">
            {GUARANTEES.map((g, i) => (
              <li key={g}>
                <span className="a-idx">{String(i + 1).padStart(2, "0")}</span>
                {g}
              </li>
            ))}
          </ul>

          <div className="sov-profiles reveal" aria-label="Sovereign deployment profiles">
            <span className="sov-profiles-k">Deployment profiles</span>
            <div>
              {sovereignProfiles.map((p) => (
                <span key={p}>{p.replaceAll("_", " ")}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ CLAIM BOUNDARY ══════════ */}
      <section className="rt-section sov-band" id="status" aria-labelledby="status-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">Current status</span>
          <h2 id="status-title" className="rt-principle sov-status-title reveal" data-d="1">
            Acceptance-testable.
            <br />
            <span className="sov-not-yet">Not yet field-validated.</span>
          </h2>

          <div className="sov-status-grid">
            <div className="reveal" data-d="2">
              <h3 className="rt-h3 sov-col-h">Verified in CI</h3>
              <ol className="sov-list sov-list--proven">
                {PROVEN.map((p, i) => (
                  <li key={p}><span>{String(i + 1).padStart(2, "0")}</span>{p}</li>
                ))}
              </ol>
            </div>
            <div className="reveal" data-d="3">
              <h3 className="rt-h3 sov-col-h">Not done yet</h3>
              <ol className="sov-list sov-list--notyet">
                {NOT_YET.map((p, i) => (
                  <li key={p}><span>{String(i + 1).padStart(2, "0")}</span>{p}</li>
                ))}
              </ol>
            </div>
          </div>

          <div className="rt-claim reveal">
            <span className="c-key">Claim boundary</span>
            <p>
              Guardian OS Sovereign is <strong>acceptance-testable, not field-validated</strong>.
              Everything in the left column is enforced by code and asserted by a test in CI.
              Everything in the right column is work that has not been done. No accreditation is
              claimed until one is held.
            </p>
          </div>
        </div>
      </section>

      {/* ══════════ WHO ══════════ */}
      <section className="rt-section" id="who" aria-labelledby="who-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">Who this is for</span>
          <h2 id="who-title" className="rt-h2 rt-narrow reveal" data-d="1">
            Institutions that must retain
            <br />
            control of how AI operates.
          </h2>
          <div className="rt-map reveal" data-d="2">
            {AUDIENCES.map(([who, why]) => (
              <div className="rt-map-row" key={who}>
                <span className="m-from">{who}</span>
                <span className="m-arrow" aria-hidden="true">→</span>
                <span className="m-to">{why}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ PROGRAMME ══════════ */}
      <section className="rt-section sov-band" id="programme" aria-labelledby="prog-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">Programme position</span>
          <h2 id="prog-title" className="rt-h2 rt-narrow reveal" data-d="1">
            Configure a platform that exists,
            <br />
            or build one first.
          </h2>
          <p className="rt-lede reveal" data-d="2">
            The figures below are illustrative rather than quoted programme costs. Actual investment
            varies materially by scope, accreditation, deployment boundary and organisation size.
          </p>
          <div className="sov-table-wrap reveal" data-d="3">
            <table className="sov-table">
              <thead>
                <tr><th>Capability</th><th>Build internally</th><th>Guardian OS</th></tr>
              </thead>
              <tbody>
                {VALUE_ROWS.map(([c, b, g]) => (
                  <tr key={c}>
                    <td data-label="Capability">{c}</td>
                    <td data-label="Build internally">{b}</td>
                    <td data-label="Guardian OS" className="sov-cell-now">{g}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="rt-note reveal">
            This compares a multi-year internal platform programme with configuring an existing
            governed operating architecture. It is not a guaranteed savings claim.
          </p>
        </div>
      </section>

      {/* ══════════ PACKS ══════════ */}
      <section className="rt-section" id="packs" aria-labelledby="packs-title">
        <div className="rt-wrap">
          <span className="rt-eyebrow reveal">Sovereign Intelligence Packs</span>
          <h2 id="packs-title" className="rt-h2 rt-narrow reveal" data-d="1">
            Mission domains
            <br />
            without a second platform.
          </h2>
          <p className="rt-lede reveal" data-d="2">
            Sovereign Intelligence Packs add domain policies, workflows, evidence mappings and
            reporting structures while preserving one Runtime Governance kernel.
          </p>
          <div className="rt-map reveal" data-d="3">
            {SOVEREIGN_PACKS.map(([t, b]) => (
              <div className="rt-map-row" key={t}>
                <span className="m-from">{t}</span>
                <span className="m-arrow" aria-hidden="true">→</span>
                <span className="m-to">{b}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ CLOSE ══════════ */}
      <section className="rt-section rt-closing sov-close" aria-labelledby="sov-close-title">
        <div className="rt-wrap">
          <h2 id="sov-close-title" className="rt-principle rt-principle--center reveal">
            Keep execution authority
            <br />
            inside the boundary.
          </h2>
          <div className="rt-actions rt-actions--center reveal" data-d="1">
            <Link href="/book" className="btn btn--primary">
              Discuss a Sovereign deployment <span className="arr">→</span>
            </Link>
            <Link href="/guardian-os" className="btn btn--ghost">
              Explore Guardian OS <span className="arr">→</span>
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
