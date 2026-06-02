import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Payment cancelled",
  description: "Your payment was not completed.",
  alternates: { canonical: "/pay/cancel" },
  robots: { index: false },
};

export default function Page() {
  return (
    <PageShell>
      <section className="section section--tight pay" aria-label="Payment cancelled">
        <div className="wrap">
          <div className="pay-outcome reveal is-cancel">
            <span className="pay-outcome-badge">Payment not completed</span>
            <h1>No payment was taken.</h1>
            <p>You can try again, or request an invoice and pay on agreed terms instead.</p>
            <div className="pay-outcome-cta">
              <Link href="/pay" className="btn btn--primary">Back to payments <span className="arr">→</span></Link>
              <Link href="/contact" className="btn btn--ghost">Request an invoice</Link>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
