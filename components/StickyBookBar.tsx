"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";

/**
 * Floating "Book Assessment" button.
 * - Hidden near the hero (which has its own CTA) and near the footer / final CTA.
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
    <Link
      href="/book#assessment"
      className={`sticky-book${hidden ? " is-hidden" : ""}`}
      aria-label="Book a Runtime Safety Assessment"
      aria-hidden={hidden}
      tabIndex={hidden ? -1 : 0}
      onClick={() => track("cta_click", { location: "sticky_bar" })}
    >
      <span className="sticky-book-glow" aria-hidden="true" />
      <span className="sticky-book-dot" aria-hidden="true" />
      <span className="sticky-book-label">Book Assessment</span>
      <span className="arr" aria-hidden="true">→</span>
    </Link>
  );
}
