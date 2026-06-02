import type { PaymentProvider, ProviderId } from "./types";
import { stripeProvider } from "./stripe";
import { gocardlessProvider } from "./gocardless";

/**
 * Provider registry. To add a future provider, implement PaymentProvider and
 * register it here — no page or API-route changes required.
 */
const REGISTRY: Record<ProviderId, PaymentProvider> = {
  stripe: stripeProvider,
  gocardless: gocardlessProvider,
};

export function getProvider(id: ProviderId): PaymentProvider | undefined {
  return REGISTRY[id];
}

export { stripeProvider, gocardlessProvider };
export type { PaymentProvider, ProviderId };
