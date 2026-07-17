import type { Metadata } from "next";
import { AssessmentReportClient } from "@/components/AssessmentReportClient";

export const metadata: Metadata = {
  title: "Executive Report — Runtime Governance Assessment",
  description:
    "Your board-ready Runtime Governance Assessment executive report: recommended pathway, key findings, strengths and gaps, governance scorecard, and engagement timeline.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AssessmentReportClient />;
}
