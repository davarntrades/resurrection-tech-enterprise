/** Central site constants, nav, and SEO defaults. */

export const SITE = {
  name: "Resurrection Tech™",
  legalName: "Resurrection Tech Ltd",
  domain: "resurrectiontech.ai",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://resurrectiontech.ai",
  tagline: "Runtime Governance for Autonomous Systems",
  description:
    "Resurrection Tech identifies, constrains, embeds, and monitors runtime governance boundaries for autonomous systems — preventing catastrophic reachable states before execution.",
  patent: "GB2600765.8",
  keywords: [
    "Runtime Governance",
    "AI Governance",
    "Reachability-Based Safety",
    "Autonomous Systems Governance",
    "Runtime Assurance",
    "AI Safety Infrastructure",
  ],
} as const;

export const NAV_LINKS = [
  { href: "/#what", label: "Platform" },
  { href: "/#reachability", label: "Reachability" },
  { href: "/enterprise-pathways", label: "Pathways" },
  { href: "/#engagement", label: "Engagement" },
  { href: "/#domains", label: "Domains" },
  { href: "/licensing", label: "Licensing" },
  { href: "/partners", label: "Partners" },
] as const;

export const CALENDLY = {
  discovery: process.env.NEXT_PUBLIC_CALENDLY_DISCOVERY ?? "",
  audit: process.env.NEXT_PUBLIC_CALENDLY_AUDIT ?? "",
  enterprise: process.env.NEXT_PUBLIC_CALENDLY_ENTERPRISE ?? "",
} as const;
