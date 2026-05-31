import type { Metadata } from "next";
import { AuditForm } from "@/components/AuditForm";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Request Audit — 48-Hour Runtime Governance Audit™",
  description:
    "Request a 48-Hour Runtime Governance Audit. Identify reachable Ω exposure before deployment — executable trajectories, tool interactions, autonomy boundaries, and operational risk.",
  alternates: { canonical: "/request-audit" },
  robots: { index: true, follow: true },
  openGraph: {
    title: `Request Audit — Resurrection Tech™`,
    description: "Identify reachable Ω exposure before deployment.",
    url: `${SITE.url}/request-audit`,
  },
};

export default function Page() {
  return <AuditForm />;
}
