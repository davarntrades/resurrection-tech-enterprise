# Resurrection Tech™ — Enterprise Platform

Production Next.js 15 implementation of the Resurrection Tech™ Runtime Governance site, including the adaptive **48-Hour Runtime Governance Audit™** intake (industry-aware questions, live Ω risk-surface scoring, generated recommendation + executive assessment) wired to **Supabase** for storage and **Resend** for transactional email. Optimised for **Vercel**.

> **Note on visual fidelity.** The approved design system (`styles/design-system.css`, `upgrade.css`, `audit.css`) is reused **verbatim** from the design source. Tailwind is configured for incidental layout utilities only and its preflight reset is disabled so the design system fully owns base styling. Do not re-theme these files — edit tokens in `:root` if you must.

---

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router, RSC) |
| Language | TypeScript (strict) |
| Styling | Reused CSS design system + Tailwind utilities |
| Animation | Verbatim canvas scripts (`public/canvas/*`) + IntersectionObserver motion hook |
| Database | Supabase (Postgres) |
| Email | Resend |
| Validation | Zod (shared client/server) |
| Hosting | Vercel |

---

## Quick start

```bash
# 1. Install (Node >= 18.18)
npm install

# 2. Configure environment
cp .env.example .env.local
#    → fill in Supabase + Resend keys (see below)

# 3. Create the database table
#    Supabase dashboard → SQL editor → paste supabase/schema.sql → Run

# 4. Develop
npm run dev          # http://localhost:3000

# 5. Production checks
npm run typecheck
npm run lint
npm run build
```

Without Supabase/Resend keys the app still runs: submissions log to the server console and email is skipped, so you can develop the UI offline.

---

## Project structure

```
app/
  layout.tsx              Root layout, SEO metadata, fonts, JSON-LD
  page.tsx                Home (RSC) → components/HomeClient
  request-audit/page.tsx  Audit intake (RSC) → components/AuditForm
  enterprise-pathways/    Pathways + pricing logic
  licensing/              Ownership & licensing
  partners/               Partner framework
  api/audit/route.ts      POST handler: validate → store → email
  sitemap.ts robots.ts manifest.ts not-found.tsx
components/
  Nav, Footer, Logo       Brand chrome (ℛ(t) mark)
  HomeClient              Full marketing page markup + motion
  AuditForm               4-step adaptive intake state machine
  PageShell               Nav + Footer + motion wrapper for content pages
  useSiteMotion           Reveal / count-up / flow sequencing
  CanvasScript            Injects the verbatim canvas animations
  Analytics               Optional GA4 / Plausible
lib/
  industries.ts           Industry intelligence + risk scoring (shared)
  validation.ts           Zod schema (shared client/server)
  supabase.ts             Server-only service-role client
  email.ts                Resend transactional emails
  rateLimit.ts            Per-IP sliding-window limiter
  site.ts analytics.ts types.ts
styles/                   Reused design system + page CSS
public/
  canvas/                 hero.js, reach.js (approved animations)
  assets/logo/            ℛ(t) mark, favicons
supabase/schema.sql       Database table + RLS
```

---

## The audit intake

`components/AuditForm.tsx` is a four-step state machine:

1. **Organisation** — required fields validated inline (company, contact, email).
2. **System overview** — platform, models, capability chips, production status.
3. **Risk profile** — capability checklist that **changes with the selected industry** (`lib/industries.ts`), feeding a live blue→amber→red **risk-surface meter** with a contextual exposure label (Risk Surface / Patient Safety / Infrastructure / Operational / Compliance …).
4. **Scope & recommendation** — a generated summary (org, industry, autonomy level, risk surface, primary exposure areas), a **Preliminary Governance Assessment** card, deliverables, timeline, and an **estimated investment that scales with the risk surface**.

On submit the payload is validated again server-side, stored in Supabase, and triggers two emails (internal notification + prospect confirmation). The UI shows the **Audit Request Received™** confirmation with a generated reference.

See `docs/DEPLOYMENT.md` for Supabase, Resend, domain, and Vercel setup, and `docs/ARCHITECTURE.md` for data flow and security notes.

---

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint (next/core-web-vitals) |
| `npm run typecheck` | `tsc --noEmit` |

---

## License / IP

© Resurrection Tech Ltd. Morrison Framework™, Morrison Runtime Governance™, and the Runtime Governance Audit™ are proprietary. Patent **GB2600765.8**. Do not redistribute.
