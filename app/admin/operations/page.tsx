import type { Metadata } from "next";
import OperationsClient from "@/components/admin/OperationsClient";
import "@/styles/operations-sovereign-profile.css";

export const metadata: Metadata = {
  title: "Operations Agent — Operator Control Room",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function OperationsPage() {
  return <OperationsClient />;
}
