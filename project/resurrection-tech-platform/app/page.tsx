import type { Metadata } from "next";
import { HomeClient } from "@/components/HomeClient";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: `${SITE.name} — ${SITE.tagline}`,
  description: SITE.description,
  alternates: { canonical: "/" },
};

export default function Page() {
  return <HomeClient />;
}
