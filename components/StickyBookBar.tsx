"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";

/**
 * Floating sticky CTA bar: "Try Live Demo" (primary, fastest path to value)
 * and "Book Assessment".
 * - Hidden near the hero (which has its own CTAs) and near the footer / final CTA.
 * - Hides while scrolling down (so it never covers content you're reading) and
 *   reappears on scroll-up (intent to act). Hidden on /book and /request-audit.
 */
const HIDDEN_ON = ["/book", "/request-audit"];

export function StickyBookBar() {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(true);
  const lastY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const vh = window.innerHeight;
      const docH = document.documentElement.scrollHeight;
      const nearTop = y < 540; // hero already has a primary CTA
      const nearBottom = y + vh > docH - 700; // footer / final CTA in view
      if (nearTop || nearBottom) {
        setHidden(true);
      } else if (y > lastY.current + 4) {
        setHidden(true); // scrolling down → get out of the way
      } else if (y < lastY.current - 4) {
        setHidden(false); // scrolling up → show
      }
      lastY.current = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  if (HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }

  return (
    <div className={`sticky-bar${hidden ? " is-hidden" : ""}`} aria-hidden={hidden}>
      <Link
        href="/live-demo"
        className="sticky-book sticky-book--demo"
        aria-label="Try the live Runtime Governance demo"
        tabIndex={hidden ? -1 : 0}
        onClick={() => track("cta_click", { location: "sticky_bar", cta: "live-demo" })}
      >
        <span className="sticky-book-glow" aria-hidden="true" />
        <span className="sticky-book-dot" aria-hidden="true" />
        <span className="sticky-book-label">Try Live Demo</span>
        <span className="arr" aria-hidden="true">→</span>
      </Link>
      <Link
        href="/book#assessment"
        className="sticky-book sticky-book--book"
        aria-label="Book a Runtime Safety Assessment"
        tabIndex={hidden ? -1 : 0}
        onClick={() => track("cta_click", { location: "sticky_bar", cta: "assessment" })}
      >
        <span className="sticky-book-label">Book Assessment</span>
        <span className="arr" aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
