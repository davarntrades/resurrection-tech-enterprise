import Link from "next/link";
import { Logo } from "./Logo";
import { SITE } from "@/lib/site";

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div>
          <Link className="brand" href="/" style={{ color: "var(--ink)" }}>
            <span className="mark" aria-hidden="true">
              <Logo height={22} />
            </span>
            <span>
              Resurrection&nbsp;Tech<span className="tm">™</span>
            </span>
          </Link>
          <p className="fbrand">Safety as Geometry. Intelligence as Reachability.</p>
          <div className="fcontact">
            <span>{SITE.legalName}</span>
            <a href={SITE.url}>{SITE.domain}</a>
            <a href="mailto:hello@resurrection-tech.com">hello@resurrection-tech.com</a>
            <a
              className="fsocial"
              href="https://www.linkedin.com/company/resurrection-tech/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Resurrection Tech on LinkedIn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
              </svg>
              LinkedIn
            </a>
          </div>
        </div>
        <div>
          <h4>Platform</h4>
          <Link href="/#what">What we do</Link>
          <Link href="/why-runtime-governance">Why Runtime Governance</Link>
          <Link href="/integrations">How it integrates</Link>
          <Link href="/#model">Operating model</Link>
          <Link href="/#reachability">Ω Reachability</Link>
          <Link href="/enterprise-pathways">Why pricing scales</Link>
        </div>
        <div>
          <h4>Engage</h4>
          <Link href="/enterprise-pathways">Enterprise pathways</Link>
          <Link href="/#domains">Target domains</Link>
          <Link href="/partners">Partners</Link>
          <Link href="/licensing">Licensing framework</Link>
          <Link href="/book#assessment">Book a Runtime Safety Assessment</Link>
          <Link href="/pay">Payments &amp; invoicing</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/request-audit">Request audit</Link>
        </div>
        <div>
          <h4>Evidence &amp; trust</h4>
          <Link href="/case-studies">Case studies</Link>
          <Link href="/evidence">Evidence &amp; methodology</Link>
          <Link href="/security">Security &amp; deployment</Link>
          <Link href="/sample-audit">Sample audit report</Link>
          <Link href="/company">Company</Link>
        </div>
      </div>
      <div className="wrap">
        <div className="footer-base">
          <span>© {new Date().getFullYear()} {SITE.legalName.toUpperCase()} · ALL RIGHTS RESERVED</span>
          <span>PATENT {SITE.patent} · MORRISON RUNTIME GOVERNANCE™</span>
        </div>
      </div>
    </footer>
  );
}
