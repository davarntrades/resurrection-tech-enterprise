"use client";

import { Nav } from "./Nav";
import { Footer } from "./Footer";
import { useSiteMotion } from "./useSiteMotion";

/** Client shell: nav, footer, and scroll-motion wiring for content pages.
 *  `className` lands on <main> so a page can scope its own theme tokens
 *  (see `.sip-page` / `.mgp-page`) without an extra wrapper element, which
 *  would break the full-bleed section backgrounds. */
export function PageShell({ children, className }: { children: React.ReactNode; className?: string }) {
  useSiteMotion();
  return (
    <>
      <Nav />
      <main id="top" className={className} style={{ paddingTop: 66 }}>
        {children}
      </main>
      <Footer />
    </>
  );
}
