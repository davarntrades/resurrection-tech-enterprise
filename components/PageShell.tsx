"use client";

import { Nav } from "./Nav";
import { Footer } from "./Footer";
import { useSiteMotion } from "./useSiteMotion";

/** Client shell: nav, footer, and scroll-motion wiring for content pages. */
export function PageShell({ children }: { children: React.ReactNode }) {
  useSiteMotion();
  return (
    <>
      <Nav />
      <main id="top" style={{ paddingTop: 66 }}>
        {children}
      </main>
      <Footer />
    </>
  );
}
