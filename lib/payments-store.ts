import { getServiceSupabase } from "@/lib/supabase";
import type { PaymentRecord } from "@/lib/paymentProviders/types";

/**
 * Persists ONLY the minimal payment status. Never card numbers, bank details,
 * or payment credentials. Best-effort: a missing table or client must not crash
 * a webhook — providers expect a 200 and will retry on 5xx.
 */
export async function recordPayment(rec: PaymentRecord): Promise<void> {
  const supabase = getServiceSupabase();
  if (!supabase) {
    console.warn("[payments] supabase not configured; skipping persist", {
      provider: rec.provider,
      providerId: rec.providerId,
      status: rec.status,
    });
    return;
  }
  const { error } = await supabase.from("payments").upsert(
    {
      provider: rec.provider,
      provider_id: rec.providerId,
      status: rec.status,
      amount_minor: rec.amountMinor,
      currency: rec.currency,
      service_type: rec.serviceType,
      created_at: rec.createdAt,
    },
    { onConflict: "provider_id" },
  );
  if (error) console.error("[payments] persist failed:", error.message);
}
