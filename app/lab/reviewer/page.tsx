import type { Metadata } from "next";
import ReviewerLoginClient from "@/components/FrontierReviewerLoginClient";

export const metadata: Metadata = {
  title: "Frontier Reviewer Access",
  description: "Scoped external reviewer access to the Frontier Containment Lab.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function FrontierReviewerPage() {
  return <ReviewerLoginClient />;
}
