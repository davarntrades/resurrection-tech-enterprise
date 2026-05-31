# Resurrection Tech™ — Runtime Governance Platform

Production Next.js 16 website for **Resurrection Tech™** — Runtime Governance for Autonomous Systems.

## Tech Stack

- **Next.js 16** (App Router, TypeScript strict)
- **Tailwind CSS** (layout utilities; design system owns all tokens)
- **Supabase** — audit request persistence
- **Resend** — transactional email
- **Zod** — API validation
- **Vercel** — deployment target

## Quick Start

```bash
npm install
cp .env.example .env.local   # fill in Supabase + Resend keys
npm run dev                   # http://localhost:3000
```

The app runs **without environment keys** — submissions log to console and email is skipped, so you can develop UI offline.

## Environment Variables

See `.env.example` for all required keys. Set the same keys in Vercel Project Settings → Environment Variables.

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Yes | Canonical site URL |
| `NEXT_PUBLIC_SUPABASE_URL` | For submissions | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | For submissions | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | For submissions | Supabase service role key (server-only) |
| `RESEND_API_KEY` | For email | Resend API key |
| `EMAIL_FROM` | For email | Verified sending address |
| `AUDIT_NOTIFY_TO` | For email | Internal notification address |

## Database Setup (Supabase)

Paste `supabase/schema.sql` into the Supabase SQL Editor. This creates the `audit_requests` table with RLS enabled and a service-role-only insert policy.

## Deploy to Vercel

```bash
# 1. Push to GitHub
git remote add origin https://github.com/YOUR_USERNAME/resurrection-tech.git
git push -u origin main

# 2. Import the repo in Vercel dashboard: https://vercel.com/new
# 3. Set all environment variables from .env.example in Vercel settings
# 4. Deploy
```

See `docs/DEPLOYMENT.md` for the full step-by-step guide.

## Project Structure

```
app/
  layout.tsx              # Root layout with SEO metadata
  page.tsx                # Home page
  request-audit/          # Audit intake form
  enterprise-pathways/    # Pathways & pricing
  licensing/              # Licensing framework
  partners/               # Partner framework
  api/audit/route.ts      # Form submission API
  sitemap.ts / robots.ts  # SEO files
components/
  HomeClient.tsx          # Full home page (canvas, sections, motion)
  AuditForm.tsx           # 4-step adaptive audit intake
  Nav.tsx / Footer.tsx    # Shared navigation
  CanvasScript.tsx        # Canvas animation injector
  Logo.tsx                # ℛ(t) SVG mark
  useSiteMotion.ts        # Scroll reveals, count-up, flow sequencing
styles/
  design-system.css       # Full approved design system (verbatim)
  upgrade.css             # Premium upgrade styles + Engagement Model
  audit.css               # Audit intake styles
  audit-upgrade.css       # Audit recommendation/exec styles
lib/
  industries.ts           # Industry intelligence + risk scoring
  validation.ts           # Zod schema for audit API
  supabase.ts / email.ts  # Backend integrations
  site.ts                 # SITE constants, NAV_LINKS
public/
  canvas/hero.js          # Hero trajectory animation
  canvas/reach.js         # Ω reachability diagram animation
  assets/logo/            # ℛ(t) logo assets + favicons
supabase/schema.sql       # Database schema
```

## Scripts

```bash
npm run dev        # Development server
npm run build      # Production build
npm run start      # Start production server
npm run typecheck  # TypeScript check
npm run lint       # ESLint
```
