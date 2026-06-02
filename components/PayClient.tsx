"use client";

import Link from "next/link";
import { useState } from "react";
import { track, Events } from "@/lib/analytics";

type ProviderId = "stripe" | "gocardless";
interface PayService {
  id: string;
  name: string;
  blurb: string;
  online: boolean;
  providers: ProviderId[];
  priceLabel: string;
  statusLabel: string;
  engagementValue: string | null;
  isDeposit: boolean;
  recurring: boolean;
}

const PROVIDER_LABEL: Record<ProviderId, string> = {
  stripe: "Pay by Card · Stripe",
  gocardless: "Bank Debit · GoCardless",
};

export function PayClient({ services }: { services: PayService[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pay(serviceId: string, provider: ProviderId) {
    setError(null);
    setBusy(`${serviceId}:${provider}`);
    track(Events.CTA_CLICK, { location: "pay", service: serviceId, provider });
    try {
      const res = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId, provider }),
      });
      const data: { ok: boolean; url?: string; error?: string } = await res.json();
      if (data.ok && data.url) {
        window.location.href = data.url; // hosted provider checkout
      } else {
        setError(data.error ?? "Online payment is temporarily unavailable. Please request an invoice.");
        setBusy(null);
      }
    } catch {
      setError("Could not reach the payment service. Please request an invoice.");
      setBusy(null);
    }
  }

  return (
    <div className="pay-grid reveal">
      {services.map((s) => (
        <div className={`pay-card${s.online ? "" : " is-invoice"}`} key={s.id}>
          <div className="pay-card-top">
            <h3>{s.name}</h3>
            <span className="pay-amount">{s.priceLabel}</span>
          </div>
          {s.engagementValue && (
            <div className="pay-engagement">Engagement value · {s.engagementValue}</div>
          )}
          <span className={`pay-status${s.online ? (s.recurring ? " is-recurring" : " is-online") : " is-invoiceonly"}`}>
            <span className="pay-status-dot" aria-hidden="true" />
            {s.statusLabel}
          </span>
          <p className="pay-card-blurb">{s.blurb}</p>
          {s.isDeposit && <p className="pay-deposit-note">Deposit credited against final engagement fee.</p>}
          <div className="pay-card-actions">
            {s.online ? (
              s.providers.map((p) => (
                <button
                  key={p}
                  className="btn btn--primary btn--sm"
                  onClick={() => pay(s.id, p)}
                  disabled={busy !== null}
                >
                  {busy === `${s.id}:${p}` ? "Starting…" : PROVIDER_LABEL[p]} <span className="arr">→</span>
                </button>
              ))
            ) : (
              <Link href="/contact" className="btn btn--ghost btn--sm">Request Invoice</Link>
            )}
          </div>
        </div>
      ))}
      {error && <div className="pay-error" role="alert">{error}</div>}
    </div>
  );
}
