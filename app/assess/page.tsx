import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { AssessClient } from "@/components/AssessClient";

export const metadata: Metadata = {
  title: "Assess Your Agent — Day-1 Ω Exposure Assessment",
  description:
    "Upload the tool manifest your AI agent already uses — OpenAI functions, MCP, LangChain, Bedrock, JSON, CSV, or Markdown — and get an Ω exposure map, coverage matrix, and the high-risk trajectories Morrison Runtime Governance would block before execution. Zero integration. Nothing is executed.",
  alternates: { canonical: "/assess" },
  openGraph: {
    title: "Assess Your Agent — Day-1 Ω Exposure Assessment",
    description:
      "Paste your agent's tool manifest → an Ω exposure map, coverage matrix, and verified pre-execution blocks in seconds. Zero integration.",
    url: "/assess",
  },
};

export default function Page() {
  return (
    <PageShell>
      <section className="section section--tight" aria-label="Day-1 Ω exposure assessment">
        <div className="wrap">
          <AssessClient />
        </div>
      </section>
    </PageShell>
  );
}
