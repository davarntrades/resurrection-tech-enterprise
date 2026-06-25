import Link from "next/link";

/**
 * "Deploy where your organisation needs it" — deployment-model flexibility for
 * Runtime Governance. Shared across partner / licensing pages so the messaging
 * stays identical. Uses the gold .mgp-page theme of its host page.
 */
const DEPLOY: { h: string; desc?: string; items: string[]; foot?: string }[] = [
  {
    h: "Hosted by Resurrection Tech",
    items: [
      "Fully managed Runtime Governance API",
      "Fastest deployment",
      "Continuous updates",
      "Monitoring and support",
      "Ideal for organisations that want minimal operational overhead",
    ],
  },
  {
    h: "Customer Cloud Deployment",
    desc: "Host Runtime Governance within your own approved cloud environment:",
    items: ["AWS", "Microsoft Azure", "Google Cloud Platform (GCP)", "Private cloud", "On-premises infrastructure (where appropriate)"],
    foot: "Resurrection Tech deploys, configures, validates, and supports the governance layer while you retain control of your own infrastructure if desired.",
  },
  {
    h: "Dedicated Enterprise Deployment",
    desc: "For highly regulated environments:",
    items: [
      "Private networking",
      "Customer-controlled infrastructure",
      "Compliance-driven deployment",
      "Dedicated environments",
      "Enterprise support",
      "Custom integration architecture",
    ],
  },
];

export function DeploymentModels() {
  return (
    <section className="section section--tight" id="deployment">
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">Deployment flexibility</span>
          <h2>Deploy where your organisation needs it.</h2>
          <p>
            Runtime Governance is deployment-model agnostic. Organisations can deploy the governance
            layer in the environment that best fits their security, compliance, operational, and data
            residency requirements.
          </p>
        </div>

        <div className="mgp-int-grid reveal" data-d="1">
          {DEPLOY.map((d) => (
            <div className="mgp-int-card" key={d.h}>
              <h3 className="mgp-int-h">{d.h}</h3>
              {d.desc && <p className="mgp-int-desc">{d.desc}</p>}
              <ul className="mgp-deploy-list">
                {d.items.map((it) => <li key={it}>{it}</li>)}
              </ul>
              {d.foot && <p className="mgp-int-foot">{d.foot}</p>}
            </div>
          ))}
        </div>

        <div className="mgp-note reveal" data-d="1" role="note">
          <span className="mgp-note-k">Deployment &amp; ownership</span>
          <p>
            Deployment location is determined during technical discovery and implementation. Runtime
            Governance can be delivered as a managed API, customer-hosted deployment, or licensed
            enterprise deployment depending on operational, regulatory, security, and commercial
            requirements. The deployment model changes <b>where</b> Runtime Governance runs — not who
            owns it: Resurrection Tech retains ownership of the governance engine, intellectual
            property, updates, and licensing rights regardless of deployment location.{" "}
            <Link href="/managed-governance-partner#integration-models">Compare integration models →</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
