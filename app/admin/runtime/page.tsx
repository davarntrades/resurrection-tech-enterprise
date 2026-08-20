import type { Metadata } from "next";
import RuntimeAdminClient from "@/components/admin/RuntimeAdminClient";
import ProductionDeploymentSurface from "@/components/admin/ProductionDeploymentSurface";

export const metadata: Metadata = {
  title: "Runtime Governance — Operator Control Room",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function RuntimeAdminPage() {
  return <>
    <ProductionDeploymentSurface />
    <RuntimeAdminClient />
  </>;
}
