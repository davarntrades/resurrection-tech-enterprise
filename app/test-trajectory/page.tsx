import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { TestTrajectoryClient } from "@/components/TestTrajectoryClient";

export const metadata: Metadata = {
  title: "Test a Trajectory",
  description:
    "Paste a proposed AI tool-call sequence and see whether the trajectory reaches a forbidden state Ω before execution. A public Runtime Governance concept demo.",
  alternates: { canonical: "/test-trajectory" },
};

export default function Page() {
  return (
    <PageShell>
      <TestTrajectoryClient />
    </PageShell>
  );
}
