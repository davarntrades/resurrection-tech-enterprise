import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { ContactSection } from "@/components/ContactSection";
import { ConsultationSection } from "@/components/ConsultationSection";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with Resurrection Tech — enterprise deployment, runtime governance pilots, research collaboration, licensing, media & press, and strategic partnerships.",
  alternates: { canonical: "/contact" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Contact — Resurrection Tech™",
    description:
      "Enterprise deployment, runtime governance pilots, research collaboration, licensing, media, and partnerships.",
    url: `${SITE.url}/contact`,
  },
};

export default function Page() {
  return (
    <PageShell>
      <ContactSection />
      <hr className="divider" />
      <ConsultationSection />
    </PageShell>
  );
}
