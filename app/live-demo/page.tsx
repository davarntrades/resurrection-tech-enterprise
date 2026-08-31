import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { LiveDemoClient } from "@/components/LiveDemoClient";

export const metadata: Metadata = {
  title: "Live Demo — Admissible Operating Envelope Enforcement",
  description:
    "See Morrison Runtime Governance evaluate proposed state transitions against an Admissible Operating Envelope before execution, with ALLOW, ESCALATE, or BLOCK decisions and evidence.",
  alternates: { canonical: "/live-demo" },
  openGraph: {
    title: "Live Demo — Admissible Operating Envelope Enforcement",
    description:
      "An enterprise governance console showing which proposed transitions remain admissible, require escalation, or are blocked before execution.",
    url: "/live-demo",
  },
};

export default function Page() {
  return (
    <PageShell>
      <section className="section section--tight" aria-label="Live Admissible Operating Envelope and Runtime Governance demo">
        <div className="wrap">
          <LiveDemoClient />
        </div>
      </section>
    </PageShell>
  );
}
