"use client";

import { Nav } from "./Nav";
import { Footer } from "./Footer";
import { useSiteMotion } from "./useSiteMotion";

/** Client shell: nav, footer, and scroll-motion wiring for content pages.
 *
 *  `className` lands on <main> so a page can scope its own theme tokens
 *  (see `.sov-page` / `.sip-page`) without an extra wrapper element, which
 *  would break the full-bleed section backgrounds.
 *
 *  A page that declares a surface theme also needs it on the chrome: the nav is
 *  `position: fixed` and the footer sits outside <main>, so without this they
 *  would render on the default light ground while the page behind them is dark.
 *  Custom properties inherit through fixed positioning, so repeating the page
 *  class on a plain wrapper is enough — the wrapper has no box of its own, so
 *  full-bleed sections inside <main> are unaffected. */
export function PageShell({ children, className }: { children: React.ReactNode; className?: string }) {
  useSiteMotion();
  const themed = className?.split(/\s+/).some((c) => c.startsWith("theme-"));
  return (
    <div className={themed ? className : undefined}>
      <Nav />
      <main id="top" className={className} style={{ paddingTop: 66 }}>
        {children}
      </main>
      <Footer />
    </div>
  );
}
