"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { track } from "@/lib/analytics";

/**
 * Floating enterprise contact button.
 * Desktop: bottom-right · Mobile: bottom-centre.
 * Hidden on pages where it would be redundant (/book, /request-audit).
 */
const HIDDEN_ON = ["/book", "/request-audit"];

export function StickyBookBar() {
  const pathname = usePathname();
  if (HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }

  return (
    <Link
      href="/book#assessment"
      className="sticky-book"
      aria-label="Book a Runtime Safety Assessment"
      onClick={() => track("cta_click", { location: "sticky_bar" })}
    >
      <span className="sticky-book-glow" aria-hidden="true" />
      <span className="sticky-book-dot" aria-hidden="true" />
      <span className="sticky-book-label">Book Assessment</span>
      <span className="arr" aria-hidden="true">→</span>
    </Link>
  );
}
