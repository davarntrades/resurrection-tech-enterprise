"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "./Logo";
import { NAV_LINKS } from "@/lib/site";
import { track, Events } from "@/lib/analytics";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className={`nav${scrolled ? " scrolled" : ""}`} aria-label="Primary">
      <div className="wrap">
        <Link className="brand" href="/" aria-label="Resurrection Tech home">
          <span className="mark" aria-hidden="true" style={{ color: "var(--ink)" }}>
            <Logo height={22} />
          </span>
          <span className="brand-name">
            Resurrection&nbsp;Tech<span className="tm">™</span>
          </span>
        </Link>

        <div className="nav-links">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </div>

        <div className="nav-cta">
          <Link href="/enterprise-pathways" className="btn btn--ghost btn--sm">
            Enterprise Pathways
          </Link>
          <Link
            href="/book"
            className="btn btn--primary btn--sm"
            onClick={() => track(Events.CTA_CLICK, { location: "nav" })}
          >
            Book Meeting <span className="arr">→</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
