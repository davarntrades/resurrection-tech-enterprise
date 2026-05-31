/**
 * Booking + contact configuration for the enterprise meeting workflow.
 *
 * Calendly URLs come from public env vars so they are configurable per
 * environment and never hardcoded. When a URL is not set, the UI shows a
 * "Calendly link pending configuration." state instead of a dead link.
 */

export type BookingType = "discovery" | "audit" | "enterprise";

export interface BookingSession {
  id: BookingType;
  /** Hash target used to deep-link / focus a card (e.g. /book#enterprise). */
  anchor: BookingType;
  title: string;
  duration: string;
  /** Lead-in for the audience list. */
  audienceLabel: string;
  audience: string[];
  cta: string;
  /** Resolved Calendly URL; "" when not configured. */
  calendlyUrl: string;
}

/** Message shown wherever a Calendly URL has not been configured yet. */
export const CALENDLY_PENDING = "Calendly link pending configuration.";

/**
 * NEXT_PUBLIC_* vars are statically inlined by Next at build time, so this
 * resolves correctly in both server and client components.
 */
export const CALENDLY_URLS: Record<BookingType, string> = {
  discovery: process.env.NEXT_PUBLIC_CALENDLY_DISCOVERY ?? "",
  audit: process.env.NEXT_PUBLIC_CALENDLY_AUDIT ?? "",
  enterprise: process.env.NEXT_PUBLIC_CALENDLY_ENTERPRISE ?? "",
};

export const BOOKING_SESSIONS: BookingSession[] = [
  {
    id: "discovery",
    anchor: "discovery",
    title: "Discovery Call",
    duration: "30 minutes",
    audienceLabel: "For",
    audience: ["Researchers", "Investors", "Collaborators", "Media"],
    cta: "Schedule Discovery Call",
    calendlyUrl: CALENDLY_URLS.discovery,
  },
  {
    id: "audit",
    anchor: "audit",
    title: "Runtime Governance Audit Consultation",
    duration: "45 minutes",
    audienceLabel: "For organisations evaluating",
    audience: [
      "Autonomous systems",
      "AI agents",
      "Agentic workflows",
      "High-trust deployments",
    ],
    cta: "Schedule Audit Consultation",
    calendlyUrl: CALENDLY_URLS.audit,
  },
  {
    id: "enterprise",
    anchor: "enterprise",
    title: "Enterprise Pilot Discussion",
    duration: "60 minutes",
    audienceLabel: "For",
    audience: [
      "Banks",
      "Healthcare",
      "Cybersecurity",
      "Enterprise AI teams",
      "Government",
    ],
    cta: "Schedule Enterprise Discussion",
    calendlyUrl: CALENDLY_URLS.enterprise,
  },
];

/** Reasons surfaced in the conversion / trust panel. */
export const WHY_BOOK: string[] = [
  "Runtime Governance architecture review",
  "Threat exposure assessment",
  "Deployment pathway discussion",
  "Pilot feasibility review",
  "Research collaboration opportunities",
];

export interface ContactRoute {
  label: string;
  description: string;
  email: string;
}

export const CONTACT_ROUTES: ContactRoute[] = [
  {
    label: "General Contact",
    description: "Enquiries & briefings",
    email: "hello@resurrection-tech.com",
  },
  {
    label: "Pilot Programmes",
    description: "Enterprise pilots & deployments",
    email: "pilots@resurrection-tech.com",
  },
  {
    label: "Research & Publications",
    description: "Research collaboration & academia",
    email: "research@resurrection-tech.com",
  },
  {
    label: "Partnerships",
    description: "Strategic & commercial partnerships",
    email: "partnerships@resurrection-tech.com",
  },
  {
    label: "Media & Press",
    description: "Interviews & press enquiries",
    email: "media@resurrection-tech.com",
  },
  {
    label: "General Information",
    description: "Anything else — we'll route it",
    email: "info@resurrection-tech.com",
  },
];
