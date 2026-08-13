import type { Metadata } from "next";
import FrontierLabClient from "@/components/FrontierLabClient";

export const metadata: Metadata = {
  title: "Frontier Containment Lab",
  description: "Operator-only hosted frontier-model containment experiments through Morrison Runtime Governance.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function FrontierLabPage() {
  return <FrontierLabClient />;
}
