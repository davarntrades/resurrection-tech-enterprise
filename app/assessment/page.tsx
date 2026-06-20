import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { AssessmentClient } from "@/components/AssessmentClient";

export const metadata: Metadata = {
  title: "Assess Your Agent — Runtime Governance Assessment",
  description:
    "Complete a Runtime Governance Assessment and receive a recommended engagement pathway. A structured 5–10 minute questionnaire covering your agent architecture, tool exposure, data flows, governance maturity, and compliance — with an instant recommendation.",
  alternates: { canonical: "/assessment" },
  openGraph: {
    title: "Assess Your Agent — Runtime Governance Assessment",
    description:
      "A structured 5–10 minute assessment that returns a recommended engagement pathway: Discovery Workshop, Audit, Pilot, or Integration.",
    url: "/assessment",
  },
};

export default function Page() {
  return (
    <PageShell>
      <AssessmentClient />
    </PageShell>
  );
}
