import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { ReferralClient } from "@/components/ReferralClient";

export const metadata: Metadata = {
  title: "Referral link generator",
  description:
    "Generate a referral link for the Runtime Governance Assessment. Share it to attribute every assessment back to you. Referral attribution is subject to internal review and agreed commercial terms.",
  alternates: { canonical: "/referral" },
  robots: { index: true, follow: true },
};

export default function Page() {
  return (
    <PageShell>
      <ReferralClient />
    </PageShell>
  );
}
