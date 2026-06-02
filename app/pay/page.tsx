import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { SERVICES } from "@/lib/paymentProviders/services";
import { PayClient } from "@/components/PayClient";

export const metadata: Metadata = {
  title: "Payments",
  description:
    "Enterprise engagements are contracted and invoiced. Online payment is available for approved deposits, retainers, and pre-agreed payments via Stripe (card) and GoCardless (bank debit).",
  alternates: { canonical: "/pay" },
};

export default function Page() {
  const services = SERVICES.map((s) => ({
    id: s.id,
    name: s.name,
    blurb: s.blurb,
    online: s.online,
    providers: [...s.providers],
    amount: s.amountMinor != null ? `£${(s.amountMinor / 100).toLocaleString("en-GB")}` : null,
    kind: s.kind,
  }));

  return (
    <PageShell>
      <section className="section section--tight pay" aria-label="Payments">
        <div className="wrap">
          <span className="eyebrow">Payments</span>
          <h1 className="pay-h1">Invoicing &amp; Online Payment</h1>
          <p className="pay-lede">
            Enterprise engagements are normally contracted and invoiced. Online payment is
            available for approved deposits, retainers, or pre-agreed payments.
          </p>

          {/* Primary path for enterprise: invoice */}
          <div className="pay-primary reveal">
            <div className="pay-primary-main">
              <span className="pay-primary-k">Recommended for enterprise</span>
              <h2>Request an Invoice</h2>
              <p>Contracted engagements are scoped, signed, and invoiced. We&rsquo;ll raise an invoice on agreed terms (bank transfer, card, or Direct Debit).</p>
            </div>
            <div className="pay-primary-cta">
              <Link href="/contact" className="btn btn--primary">Request Invoice <span className="arr">→</span></Link>
              <Link href="/book" className="btn btn--ghost">Discuss Enterprise Procurement</Link>
            </div>
          </div>

          <div className="pay-warn reveal" role="note">
            <span className="pay-warn-dot" aria-hidden="true" />
            Payment does not begin work until scope, contract, and onboarding are confirmed.
          </div>

          {/* Online payment options */}
          <div className="section-head reveal" style={{ marginTop: 8 }}>
            <span className="eyebrow">Online payment</span>
            <h2>Approved deposits, retainers &amp; pre-agreed payments</h2>
            <p>Payments are handled entirely on the provider&rsquo;s hosted, PCI-compliant pages. Resurrection Tech never sees or stores your card or bank details.</p>
          </div>

          <PayClient services={services} />

          <p className="pay-fineprint reveal">
            Card payments (including Apple Pay / Google Pay where available) are processed by Stripe.
            Bank Debit (Direct Debit) is processed by GoCardless. We store only the payment status,
            provider reference, amount, service type, and timestamp — never card numbers, bank
            details, or payment credentials.
          </p>
        </div>
      </section>
    </PageShell>
  );
}
