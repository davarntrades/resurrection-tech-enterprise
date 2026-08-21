import type { Metadata } from "next";
import RuntimeAdminClient from "@/components/admin/RuntimeAdminClient";
import CustomerSovereignControls from "@/components/admin/CustomerSovereignControls";

export const metadata: Metadata = {
  title: "Runtime Governance — Operator Control Room",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function RuntimeAdminPage() {
  return (
    <>
      <RuntimeAdminClient />
      <CustomerSovereignControls />
    </>
  );
}
