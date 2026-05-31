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
        </div>
        <div>
          <h4>Platform</h4>
          <Link href="/#what">What we do</Link>
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
          <Link href="/book">Book a meeting</Link>
          <Link href="/request-audit">Request audit</Link>
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
