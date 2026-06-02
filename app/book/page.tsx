import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { BookClient } from "@/components/BookClient";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Book a Runtime Safety Assessment",
  description:
    "Book a Runtime Safety Assessment with Resurrection Tech. A consultation, enterprise strategy session, and pilot are the steps that follow — for autonomous systems, AI agents, and high-trust deployments.",
  alternates: { canonical: "/book" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Book a Runtime Safety Assessment — Resurrection Tech™",
    description:
      "Discuss Runtime Governance, enterprise pilots, licensing, audits, research collaboration, and deployment pathways.",
    url: `${SITE.url}/book`,
  },
};

export default function Page() {
  return (
    <PageShell>
      <BookClient />
    </PageShell>
  );
}
