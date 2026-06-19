import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { TestWithoutAgentClient } from "@/components/TestWithoutAgentClient";

export const metadata: Metadata = {
  title: "Test Runtime Governance Without Your Own Agent",
  description:
    "Run the production middleware pattern — a planner proposes tool calls, Runtime Governance evaluates the trajectory before execution, and only a permitted verdict proceeds — without an existing agent stack. Try it in Google Colab, via the GitHub example, or with live sample scenarios on this page.",
  alternates: { canonical: "/test-without-agent" },
  openGraph: {
    title: "Test Runtime Governance Without Your Own Agent",
    description:
      "No agent required. A real planner proposes tool trajectories; Runtime Governance returns PERMIT / ESCALATE / BLOCK before execution. Colab, GitHub, or live website scenarios.",
    url: "/test-without-agent",
  },
};

export default function Page() {
  return (
    <PageShell>
      <TestWithoutAgentClient />
    </PageShell>
  );
}
