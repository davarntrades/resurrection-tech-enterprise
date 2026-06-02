import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Payment received",
  description: "Your payment was received.",
  alternates: { canonical: "/pay/success" },
  robots: { index: false },
};

export default function Page() {
  return (
    <PageShell>
      <section className="section section--tight pay" aria-label="Payment success">
        <div className="wrap">
          <div className="pay-outcome reveal is-ok">
            <span className="pay-outcome-badge">Payment received</span>
            <h1>Thank you — your payment is being confirmed.</h1>
            <p>
              You&rsquo;ll receive a receipt from the payment provider. Our team will confirm and
              begin onboarding once scope, contract, and onboarding are in place.
            </p>
            <p className="pay-outcome-note">
              Reminder: payment does not begin work until scope, contract, and onboarding are confirmed.
            </p>
            <div className="pay-outcome-cta">
              <Link href="/book" className="btn btn--primary">Confirm next steps <span className="arr">→</span></Link>
              <Link href="/" className="btn btn--ghost">Back to site</Link>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
