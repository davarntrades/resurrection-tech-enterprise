import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Company",
  description:
    "Resurrection Tech Ltd — runtime governance for autonomous systems. Founder, mission, legal entity, research, and enterprise contact.",
  alternates: { canonical: "/company" },
};

export default function Page() {
  return (
    <PageShell>
      <section className="section section--tight tp" aria-label="Company">
        <div className="wrap">
          <span className="eyebrow">Company</span>
          <h1>About Resurrection Tech</h1>
          <p className="tp-lede">
            Who is behind the platform, the legal entity you would contract with, and where to
            reach us. The basic identity an enterprise buyer needs before a vendor review.
          </p>

          <div className="tp-block tp-prose">
            <h2>About</h2>
            <p>
              Resurrection Tech Ltd builds <b>runtime governance for autonomous systems</b> — it
              identifies, constrains, embeds, and monitors the boundaries within which AI agents are
              allowed to act, preventing catastrophic reachable states (<span className="om">Ω</span>)
              before execution rather than detecting failures after the fact.
            </p>
          </div>

          <div className="tp-block">
            <h2>Mission</h2>
            <p className="tp-sub" style={{ fontSize: 16, color: "var(--ink-2)" }}>
              Runtime governance for autonomous systems — making catastrophic states unreachable by
              construction.
            </p>
          </div>

          <div className="tp-block">
            <h2>Founder</h2>
            <div className="tp-card" style={{ maxWidth: 520 }}>
              <h3>Davarn Morrison</h3>
              <p>Founder, Resurrection Tech Ltd. Author of the Morrison Framework™ for reachability-based runtime governance.</p>
            </div>
            <div className="tp-todo"><b>Owner action:</b> optionally add a short founder bio, LinkedIn, and any co-founders / advisors to strengthen the trust signal.</div>
          </div>

          <div className="tp-block">
            <h2>Legal entity</h2>
            <div className="tp-facts">
              <div><dt>Registered name</dt><dd>{SITE.legalName}</dd></div>
              <div><dt>Company registration no.</dt><dd>16613178</dd></div>
              <div><dt>Jurisdiction</dt><dd>United Kingdom</dd></div>
              <div><dt>Status</dt><dd><span className="tp-pill ok">Active</span></dd></div>
              <div><dt>Incorporated</dt><dd>29 July 2025</dd></div>
              <div>
                <dt>Registered office</dt>
                <dd>Carneys Community Centre, 30 Petworth Street, London, England, SW11 4QW</dd>
              </div>
              <div><dt>Patent</dt><dd>{SITE.patent} (UKIPO) — see <Link href="/evidence">Evidence</Link> for status</dd></div>
            </div>
          </div>

          <div className="tp-block">
            <h2>Research &amp; publications</h2>
            <div className="tp-facts">
              <div><dt>Core repository</dt><dd><a href="https://github.com/davarntrades/Morrison-Runtime-Governance">github.com/davarntrades/Morrison-Runtime-Governance</a></dd></div>
              <div><dt>Evidence &amp; methodology</dt><dd><Link href="/evidence">/evidence</Link></dd></div>
              <div><dt>Technical papers</dt><dd><span className="tp-pill warn">Owner to link</span></dd></div>
            </div>
          </div>

          <div className="tp-block">
            <h2>Contact</h2>
            <div className="tp-grid">
              <div className="tp-card"><span className="k">Enterprise pilots</span><p><a href="mailto:pilots@resurrection-tech.com">pilots@resurrection-tech.com</a></p></div>
              <div className="tp-card"><span className="k">General &amp; briefings</span><p><a href="mailto:hello@resurrection-tech.com">hello@resurrection-tech.com</a></p></div>
              <div className="tp-card"><span className="k">Research</span><p><a href="mailto:research@resurrection-tech.com">research@resurrection-tech.com</a></p></div>
              <div className="tp-card"><span className="k">Partnerships</span><p><a href="mailto:partnerships@resurrection-tech.com">partnerships@resurrection-tech.com</a></p></div>
            </div>
          </div>

          <div className="tp-cta">
            <Link href="/book#assessment" className="btn btn--primary">Book a Runtime Safety Assessment <span className="arr">→</span></Link>
            <Link href="/contact" className="btn btn--ghost">Contact</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
