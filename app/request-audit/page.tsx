import type { Metadata } from "next";
import { AuditForm } from "@/components/AuditForm";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Request Envelope Discovery — 48-Hour Operating Envelope Discovery™",
  description:
    "Request 48-Hour Operating Envelope Discovery. Map consequential execution paths, reachable Ω exposure, and candidate operating-envelope boundaries in a bounded environment — before deployment.",
  alternates: { canonical: "/request-audit" },
  robots: { index: true, follow: true },
  openGraph: {
    title: `Request Envelope Discovery — Resurrection Tech™`,
    description: "Map reachable Ω exposure and candidate envelope boundaries before deployment.",
    url: `${SITE.url}/request-audit`,
  },
};

export default function Page() {
  return <AuditForm />;
}
