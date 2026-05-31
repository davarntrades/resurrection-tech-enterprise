# Deployment Guide

End-to-end setup for production on Vercel with Supabase + Resend.

---

## 1. Supabase (database)

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL editor** → paste the contents of [`supabase/schema.sql`](../supabase/schema.sql) → **Run**. This creates `public.audit_requests`, indexes, and enables Row Level Security with **no public policies** (the browser anon key cannot read/write it).
3. **Project Settings → API**, copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ **server-only — never expose to the client.**

The API route (`app/api/audit/route.ts`) inserts with the service-role key, which bypasses RLS. Because RLS is on and no anon policy exists, the table is invisible to the public client by design.

### Viewing submissions
Use the Supabase **Table editor** (`audit_requests`), or build an internal authenticated dashboard. Each row has a `status` column (`new` → `reviewing` → `scheduled` → `declined`).

---

## 2. Resend (email)

1. Create an account at [resend.com](https://resend.com) and **verify your sending domain** (DNS records).
2. Create an API key → `RESEND_API_KEY`.
3. Set:
   - `EMAIL_FROM` — must use the verified domain, e.g. `Resurrection Tech <hello@resurrection-tech.com>`
   - `AUDIT_NOTIFY_TO` — internal inbox for new-request notifications.

Two emails are sent per submission: an internal notification (reply-to = prospect) and a prospect confirmation. If `RESEND_API_KEY` is unset, email is skipped gracefully and the submission still persists.

---

## 3. Environment variables

Copy `.env.example` → `.env.local` for local dev. In Vercel, add the same keys under **Project → Settings → Environment Variables** (Production + Preview). Minimum required for full functionality:

```
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
EMAIL_FROM
AUDIT_NOTIFY_TO
```

Optional: `NEXT_PUBLIC_CALENDLY_*`, `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`.

---

## 4. Deploy to Vercel

1. Push this folder to a Git repo (GitHub/GitLab/Bitbucket).
2. [vercel.com/new](https://vercel.com/new) → import the repo. Framework preset: **Next.js** (auto-detected).
3. Add the environment variables (step 3).
4. Deploy. `vercel.json` pins the region to `lhr1` (London) — change if your audience/data residency differs.
5. Add your custom domain under **Project → Settings → Domains** and update `NEXT_PUBLIC_SITE_URL`.

### CLI alternative
```bash
npm i -g vercel
vercel            # preview
vercel --prod     # production
```

---

## 5. Post-deploy checklist

- [ ] Submit a test audit request → row appears in Supabase, both emails arrive.
- [ ] `https://yourdomain/sitemap.xml` and `/robots.txt` resolve.
- [ ] Favicon (ℛ(t)) shows in the browser tab.
- [ ] Open Graph preview renders (replace `public/assets/og.png` with a real 1200×630 image — a placeholder path is referenced).
- [ ] Run Lighthouse (see ARCHITECTURE.md → Performance).

---

## 6. Scaling the rate limiter

`lib/rateLimit.ts` is an in-memory per-IP limiter — fine for a single region and low write volume, but serverless instances don't share memory. For strict global limits, swap in **Upstash Redis**:

```ts
// pseudo-replacement for rateLimit()
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, "10 m"),
});
```

Then `await ratelimit.limit(ip)` in the API route.
