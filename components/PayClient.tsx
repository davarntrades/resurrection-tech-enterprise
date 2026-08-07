"use client";

import Link from "next/link";
import { useState } from "react";
import { track, Events } from "@/lib/analytics";

type ProviderId = "stripe" | "gocardless";
interface PayTier {
  id: string;
  label: string;
  note: string | null;
  recommended: boolean;
}
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
  /** Deliberately gated: full-width, visually distinct, never reads as purchasable. */
  gated: boolean;
  gateNote: string;
  ctaLabel: string;
  ctaHref: string;
  /** Selectable amounts. Empty for single-price services. */
  tiers: PayTier[];
  tierLegend: string;
}

interface PayGroup {
  key: string;
  eyebrow: string;
  title: string;
  lede: string;
  /** Ordered steps rendered as a progression above the cards. */
  ladder: string[] | null;
  services: PayService[];
}

const PROVIDER_LABEL: Record<ProviderId, string> = {
  stripe: "Pay by Card · Stripe",
  gocardless: "Bank Debit · GoCardless",
};

export function PayClient({ groups }: { groups: PayGroup[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Chosen tier per service; defaults to the recommended one, else the lowest.
  const [tier, setTier] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      groups
        .flatMap((g) => g.services)
        .filter((s) => s.tiers.length > 0)
        .map((s) => [s.id, (s.tiers.find((t) => t.recommended) ?? s.tiers[0]).id]),
    ),
  );

  async function pay(serviceId: string, provider: ProviderId) {
    setError(null);
    setBusy(`${serviceId}:${provider}`);
    const tierId = tier[serviceId];
    track(Events.CTA_CLICK, { location: "pay", service: serviceId, provider, ...(tierId ? { tier: tierId } : {}) });
    try {
      const res = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId, provider, ...(tierId ? { tierId } : {}) }),
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
    <>
      {groups.map((g) => (
        <section className="pay-group" key={g.key} aria-label={g.title}>
          <div className="pay-group-head reveal">
            <span className="eyebrow">{g.eyebrow}</span>
            <h3 className="pay-group-title">{g.title}</h3>
            {g.ladder && (
              <ol className="pay-ladder" aria-label="Engagement ladder">
                {g.ladder.map((step, i) => (
                  <li key={step}>
                    {i > 0 && <span className="pay-ladder-arr" aria-hidden="true">→</span>}
                    <span className="pay-ladder-step">{step}</span>
                  </li>
                ))}
              </ol>
            )}
            <p className="pay-group-lede">{g.lede}</p>
          </div>
          <PayGrid
            services={g.services}
            busy={busy}
            tier={tier}
            setTier={setTier}
            pay={pay}
          />
        </section>
      ))}
      {error && <div className="pay-error is-standalone" role="alert">{error}</div>}
    </>
  );
}

function PayGrid({
  services,
  busy,
  tier,
  setTier,
  pay,
}: {
  services: PayService[];
  busy: string | null;
  tier: Record<string, string>;
  setTier: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  pay: (serviceId: string, provider: ProviderId) => void;
}) {
  return (
    <div className="pay-grid reveal">
      {services.map((s) => (
        <div
          className={`pay-card${s.online ? "" : " is-invoice"}${s.gated ? " is-gated" : ""}`}
          key={s.id}
        >
          {s.gated && <span className="pay-gated-k">Strategic relationship · by negotiation</span>}
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
          {s.tiers.length > 0 && (
            <fieldset className="pay-tiers" disabled={busy !== null}>
              <legend className="pay-tiers-legend">{s.tierLegend}</legend>
              <div className="pay-tier-options">
                {s.tiers.map((t) => (
                  <label
                    key={t.id}
                    className={`pay-tier${tier[s.id] === t.id ? " is-selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name={`tier-${s.id}`}
                      value={t.id}
                      checked={tier[s.id] === t.id}
                      onChange={() => setTier((prev) => ({ ...prev, [s.id]: t.id }))}
                    />
                    {t.label}
                    {t.recommended && <span className="pay-tier-rec">Recommended</span>}
                  </label>
                ))}
              </div>
              {s.tiers.find((t) => t.id === tier[s.id])?.note && (
                <p className="pay-tier-note">{s.tiers.find((t) => t.id === tier[s.id])?.note}</p>
              )}
            </fieldset>
          )}
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
              <Link href={s.ctaHref} className={`btn btn--ghost btn--sm${s.gated ? " btn--gated" : ""}`}>
                {s.ctaLabel} <span className="arr">→</span>
              </Link>
            )}
          </div>
          <p className="pay-gate"><span className="pay-gate-lock" aria-hidden="true" />{s.gateNote}</p>
        </div>
      ))}
    </div>
  );
}
