import type { Metadata } from "next";
import { ReportClient } from "@/components/ReportClient";

export const metadata: Metadata = {
  title: "Runtime Governance Evaluation Report",
  description:
    "A shareable, printable pre-execution Runtime Governance verdict: user task, proposed trajectory, governance payload, live verdict, and execution decision.",
  // Shareable links carry result data in the URL — keep them out of the index.
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ReportClient />;
}
