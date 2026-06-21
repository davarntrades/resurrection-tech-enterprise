import type { Metadata } from "next";
import Link from "next/link";
import { getPartnerSummary } from "@/lib/assessmentsStore";
import { verifyToken } from "@/lib/partnerToken";
import { humanizeRef } from "@/lib/referral";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";
// Never index a partner page — links are private and token-gated.
export const metadata: Metadata = {
  title: "Partner statistics",
  robots: { index: false, follow: false, nocache: true },
};

type Params = { referral_code: string };
type Search = { [key: string]: string | string[] | undefined };

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

/** Generic, non-revealing failure view — does not confirm whether a code exists. */
function InvalidView() {
  return (
    <main className="pt">
      <div className="pt-wrap pt-invalid">
        <span className="pt-brand">{SITE.name}</span>
        <h1>This link isn&rsquo;t valid</h1>
        <p>
          The partner link you followed is missing or incorrect. Partner statistics are only
          available through the private link shared with you. Please use the most recent link, or
          ask your Resurrection Tech contact to re-send it.
        </p>
        <Link className="btn btn--primary" href="/">
          Go to {SITE.domain}
        </Link>
      </div>
    </main>
  );
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { referral_code } = await params;
  const sp = await searchParams;
  const code = decodeURIComponent(referral_code || "");
  const tokenRaw = sp.t;
  const token = Array.isArray(tokenRaw) ? tokenRaw[0] : tokenRaw;

  // Gate: a valid signed token for THIS code is required. Anything else fails
  // safe to a generic view, so codes cannot be enumerated.
  if (!verifyToken(code, token)) {
    return <InvalidView />;
  }

  const result = await getPartnerSummary(code);
  if (!result.ok) {
    // Token was valid but data is unavailable (e.g. Supabase down). Keep it
    // generic rather than leaking internal error detail to the partner.
    return <InvalidView />;
  }

  const row = result.row;
  const source = row?.referral_source || humanizeRef(code);
  const stats: { label: string; value: number }[] = [
    { label: "Workshops", value: row?.workshops ?? 0 },
    { label: "Audits", value: row?.audits ?? 0 },
    { label: "Pilots", value: row?.pilots ?? 0 },
    { label: "Integrations", value: row?.integrations ?? 0 },
    { label: "Won", value: row?.won ?? 0 },
    { label: "Lost", value: row?.lost ?? 0 },
  ];
  const leads = row?.leads ?? 0;

  return (
    <main className="pt">
      <div className="pt-wrap">
        <header className="pt-head">
          <span className="pt-brand">{SITE.name}</span>
          <span className="pt-eyebrow">Partner statistics</span>
          <h1>{source}</h1>
          <p className="pt-code">
            Referral code <b>{code}</b>
          </p>
        </header>

        <section className="pt-hero" aria-label="Leads generated">
          <span className="pt-hero-k">Leads generated</span>
          <span className="pt-hero-v">{leads}</span>
          <span className="pt-hero-sub">Last lead {fmtDate(row?.last_lead_at ?? null)}</span>
        </section>

        <section className="pt-grid" aria-label="Pipeline">
          {stats.map((s) => (
            <div className="pt-stat" key={s.label}>
              <span className="pt-stat-v">{s.value}</span>
              <span className="pt-stat-k">{s.label}</span>
            </div>
          ))}
        </section>

        <p className="pt-note">
          These figures reflect assessments attributed to your referral code as they move through our
          pipeline. Updated in real time. For questions, contact your Resurrection Tech representative.
        </p>

        <footer className="pt-foot">
          <Link href="/">{SITE.domain}</Link>
          <span>Visibility &amp; transparency — read-only.</span>
        </footer>
      </div>
    </main>
  );
}
