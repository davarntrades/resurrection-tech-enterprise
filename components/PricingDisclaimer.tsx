import { PRICING_DISCLAIMER, PRICING_DISCLAIMER_FULL, type PricingDisclaimerVariant } from "@/lib/pricing";

/**
 * Consistent pricing / commercial-qualification disclaimer. Has no server-only
 * dependencies, so it can be rendered from server or client components.
 *   variant="short"  → one-line note (tight spaces, cards, results, emails-UI)
 *   variant="medium" → fuller note (pricing pages with room)
 *   variant="full"   → headed, multi-paragraph note (primary pricing pages)
 */
export function PricingDisclaimer({
  variant = "short",
  className = "",
}: {
  variant?: PricingDisclaimerVariant;
  className?: string;
}) {
  if (variant === "full") {
    return (
      <aside className={`pricing-disc pricing-disc--full reveal ${className}`} role="note" aria-label="Pricing and qualification">
        <span className="pricing-disc-k">{PRICING_DISCLAIMER_FULL.heading}</span>
        {PRICING_DISCLAIMER_FULL.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </aside>
    );
  }
  return (
    <p className={`pricing-disc ${className}`} role="note">
      {PRICING_DISCLAIMER[variant]}
    </p>
  );
}
