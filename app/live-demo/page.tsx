import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { LiveDemoClient } from "@/components/LiveDemoClient";

export const metadata: Metadata = {
  title: "Live Demo — Runtime Governance in Action",
  description:
    "See Morrison Runtime Governance block unsafe AI-agent actions before execution. Pick a scenario — unauthorized transfer, credential exfiltration, customer-data leakage, privilege escalation, regulatory boundary, multi-agent collusion, or a safe workflow — and see the ALLOW / BLOCK / ESCALATE decision, the business impact avoided, and the repo evidence.",
  alternates: { canonical: "/live-demo" },
  openGraph: {
    title: "Live Demo — Runtime Governance in Action",
    description:
      "An enterprise governance console: watch unsafe AI-agent trajectories get stopped before execution, in plain business language.",
    url: "/live-demo",
  },
};

export default function Page() {
  return (
    <PageShell>
      <section className="section section--tight" aria-label="Live Runtime Governance demo">
        <div className="wrap">
          <LiveDemoClient />
        </div>
      </section>
    </PageShell>
  );
}
