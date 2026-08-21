import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { LiveDemoClient } from "@/components/LiveDemoClient";

export const metadata: Metadata = {
  title: "Live Demo — See a Local Safety Envelope in Action",
  description:
    "See Morrison Runtime Governance evaluate whether AI-agent trajectories remain inside a local Safety Envelope before execution. Pick a scenario — unauthorized transfer, credential exfiltration, customer-data leakage, privilege escalation, regulatory boundary, multi-agent collusion, or a safe workflow — and see the ALLOW / BLOCK / ESCALATE decision, business impact, and evidence.",
  alternates: { canonical: "/live-demo" },
  openGraph: {
    title: "Live Demo — Local Safety Envelope in Action",
    description:
      "An enterprise governance console showing which AI-agent trajectories remain inside a validated local Safety Envelope and which are blocked or escalated before execution.",
    url: "/live-demo",
  },
};

export default function Page() {
  return (
    <PageShell>
      <section className="section section--tight" aria-label="Live local Safety Envelope and Runtime Governance demo">
        <div className="wrap">
          <LiveDemoClient />
        </div>
      </section>
    </PageShell>
  );
}