# Architecture & Performance

## Data flow — audit submission

```
AuditForm (client)
  │  client-side validation (step 1 required fields)
  │  builds payload: form + autonomy + risk_summary + capability labels + investment
  ▼
POST /api/audit  (Node runtime, force-dynamic)
  │  1. rateLimit(ip)                      → 429 if exceeded
  │  2. auditRequestSchema.safeParse()      → 422 with fieldErrors
  │  3. honeypot check (company_url_confirm)→ silently ok if tripped
  │  4. supabase.insert(audit_requests)     → 502 on DB error
  │  5. sendAuditEmails() (Resend)          → non-blocking; logged on failure
  ▼
{ ok: true, reference: "RGA-XXXXX-2026" }
  ▼
AuditForm → "Audit Request Received™" confirmation
```

### Why validation lives in `lib/`
`lib/validation.ts` (Zod) and `lib/industries.ts` (risk model) are imported by **both** the client form and the server route, so scoring and validation cannot drift. The server never trusts client-computed values — it re-validates shape, and the risk model is deterministic given inputs.

## Security

- **Service-role key is server-only.** `lib/supabase.ts` reads `SUPABASE_SERVICE_ROLE_KEY`, which is never referenced in a client component. RLS is enabled with no anon policy, so the public anon key cannot touch `audit_requests`.
- **RLS on, no public policies** — defence in depth even if the anon key leaks.
- **Honeypot field** (`company_url_confirm`) is visually hidden and off-screen; bots that fill it get a silent success and no DB write.
- **Per-IP rate limiting** on the API route (`lib/rateLimit.ts`).
- **Security headers** set in `next.config.ts` (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy).
- **Honest data.** Validation-benchmark metrics are framed as system/test metrics, not client claims.

## Performance (targeting Lighthouse > 90)

| Lever | Implementation |
| --- | --- |
| RSC by default | Pages are server components; only interactive islands (`AuditForm`, `Nav`, motion) are client. |
| No heavy UI libs | Framer Motion is available but the shipped motion uses lightweight IntersectionObserver + CSS, keeping JS small. |
| Canvas pausing | `hero.js`/`reach.js` pause via IntersectionObserver when offscreen and honor `prefers-reduced-motion`. |
| Font loading | Geist via `display=swap`, preconnect to Google Fonts. |
| Analytics deferred | GA/Plausible load `afterInteractive` and only if configured. |
| Static assets immutable | `vercel.json` sets `Cache-Control: immutable` for `/assets/*`. |
| Images | `next/image` formats set to AVIF/WebP (use it for any future raster art). |

### Measuring
```bash
npm run build && npm run start
# then run Lighthouse (Chrome DevTools or `npx lighthouse http://localhost:3000 --view`)
```

### If you need to lift LCP further
- Replace the Google Fonts link with `next/font/google` (self-hosted, zero layout shift). Kept as a `<link>` here to match the exact font stack the design CSS expects without a build-time swap.
- Provide a real `public/assets/og.png` (1200×630) and a pre-rendered hero poster image behind the canvas for the first paint.

## Accessibility

- Canvas animations are `aria-hidden` and respect reduced-motion.
- Form fields use real `<label>`s, `autoComplete`, and inline error messaging.
- Buttons (chips/radios/checks) are real `<button type="button">` elements — keyboard operable.
- Color is never the sole signal (risk meter has a text level + note).
