import type { Metadata } from "next";
import OperationsClient from "@/components/admin/OperationsClient";
import SovereignEngagementToggle from "@/components/admin/SovereignEngagementToggle";
import "@/styles/operations-sovereign-profile.css";
import "@/styles/sovereign-engagement-toggle.css";

export const metadata: Metadata = {
  title: "Operations Agent — Operator Control Room",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function OperationsPage() {
  return (
    <>
      <SovereignEngagementToggle />
      <OperationsClient />
    </>
  );
}
