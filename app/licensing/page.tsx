import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Ownership & Licensing",
  description:
    "Resurrection Tech Ltd retains ownership of the Morrison Framework™, Morrison Runtime Governance™, the Runtime Governance Audit™, the governance engine, audit methodology, and all licensing rights. Patent GB2600765.8.",
  alternates: { canonical: "/licensing" },
};

const ASSETS = [
  "Morrison Framework™",
  "Morrison Runtime Governance™",
  "Runtime Governance Audit™",
  "Governance engine",
  "Audit methodology",
  "Licensing rights",
  "Governance subscriptions",
  `Patent ${SITE.patent}`,
];

const Lock = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <rect x="2.5" y="6.5" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
    <path d="M5 6.5 V4.5 a2.5 2.5 0 0 1 5 0 V6.5" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

export default function Page() {
  return (
    <PageShell>
      <section className="section" id="licensing">
        <div className="wrap">
          <div className="section-head reveal">
            <span className="eyebrow">Ownership &amp; licensing boundary</span>
            <h2>Clear ownership. Clear boundaries.</h2>
          </div>
          <div className="own-grid">
            <div className="own-list reveal">
              {ASSETS.map((a) => (
                <div className="own-item" key={a}>
                  <span className="lock"><Lock /></span>
                  {a}
                </div>
              ))}
            </div>
            <div className="own-note reveal" data-d="1">
              <p>Resurrection Tech Ltd retains ownership of all framework, methodology, engine, and licensing assets listed.</p>
              <p style={{ marginTop: 18, color: "var(--ink-3)", fontSize: 14 }}>
                Partners, sponsors, investors, integrators, and consultants may be compensated or
                collaborate, but <strong style={{ color: "var(--ink)" }}>do not acquire ownership</strong> unless
                separately agreed in writing.
              </p>
              <p style={{ marginTop: 18 }} className="patent mono">PATENT · {SITE.patent}</p>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
