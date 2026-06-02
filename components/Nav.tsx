"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "./Logo";
import { NAV_LINKS, NAV_MENU } from "@/lib/site";
import { track, Events } from "@/lib/analytics";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close on Escape; lock body scroll while the panel is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

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
          <Link
            href="/book#assessment"
            className="btn btn--primary btn--sm"
            onClick={() => track(Events.CTA_CLICK, { location: "nav" })}
          >
            Book Assessment <span className="arr">→</span>
          </Link>
          <button
            type="button"
            className={`nav-menu-btn${menuOpen ? " is-open" : ""}`}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="nav-menu-panel"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="nav-menu-bars" aria-hidden="true"><span /><span /><span /></span>
            <span className="nav-menu-label">{menuOpen ? "Close" : "Menu"}</span>
          </button>
        </div>
      </div>

      {/* Full site index — available on desktop and mobile */}
      <div
        className={`nav-menu-scrim${menuOpen ? " is-open" : ""}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />
      <div id="nav-menu-panel" className={`nav-menu-panel${menuOpen ? " is-open" : ""}`} role="dialog" aria-label="Site menu" aria-modal="true" hidden={!menuOpen}>
        <div className="wrap">
          {/* Conversion actions first — top on mobile */}
          <div className="nav-menu-cta">
            <Link
              href="/book#assessment"
              className="btn btn--primary"
              onClick={() => { track(Events.CTA_CLICK, { location: "nav-menu" }); setMenuOpen(false); }}
            >
              Book a Runtime Safety Assessment <span className="arr">→</span>
            </Link>
            <Link href="/enterprise-pathways" className="btn btn--ghost" onClick={() => setMenuOpen(false)}>
              Enterprise pathways
            </Link>
          </div>
          <div className="nav-menu-grid">
            {NAV_MENU.map((g) => (
              <div className="nav-menu-col" key={g.group}>
                <div className="nav-menu-h">{g.group}</div>
                {g.links.map((l) => (
                  <Link key={l.href + l.label} href={l.href} onClick={() => setMenuOpen(false)}>
                    {l.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
