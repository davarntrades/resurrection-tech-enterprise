# Internal Analyst Platform — Architecture & Plan

Status: **Phase 1 + Phase 2 shipped.** Phases 3+ planned below. Nothing here
replaces the Runtime Governance engine, Delivery Kit, or PDF pipeline — they are
treated as production-ready and reused as-is.

---

## Phase 1 — One command ✅ (done)
`npm run audit -- --manifest customer-tools.json --name "Acme" --period "May 2026"`
Auto-loads env (`.env.delivery`), discovers/▶installs Chromium, runs preflight,
executes the existing Delivery Kit, prints a field matrix + output location,
optional `--open` preview. Setup is one-time: `npm run audit:setup`. See
`DELIVERY-QUICKSTART.md`.

---

## The load-bearing constraint (read first)
The Delivery Kit spawns **Chromium** and calls the **engine**. **Vercel
serverless cannot run Chromium** and shouldn't hold engine credentials. So the
public marketing site (Vercel) must stay marketing-only, and **audit execution
must run in an environment that has Chromium + engine access.** This forks the
console architecture:

| Option | Console UI | Execution | Verdict |
|---|---|---|---|
| **A — Internal app (recommended)** | Small Next/Express app | Same box runs the Kit directly | Simplest, fully private, no new moving parts. Host on **Railway** (your existing infra) or run locally for a solo analyst. |
| B — Vercel UI + worker | On Vercel (behind auth) | Delegates to a Railway worker / GitHub Action | More secure separation, more plumbing + latency. Worth it only at multi-analyst scale. |

**Recommendation: Option A.** A dedicated **internal** app — never the public
site — with Chromium installed, Supabase for data, analyst auth. Start solo
(localhost / forwarded Codespace port) and graduate to a Railway-hosted internal
app for multiple analysts. This keeps 100% of Runtime Governance private.

---

## Phase 2 — Analyst Console ✅ (done, Option A1 local)
Built as a **separate, internal** zero-dependency Node app under `console/` —
never the public site. `npm run console` → authed `http://127.0.0.1:8787`. See
`console/README.md`. Delivered:
1. **Engagement store** — local JSON (`console/data/engagements.json`, gitignored)
   with the full record (customer, company, industry, reference, engagement_type,
   analyst, status, notes, reports[], proposal_status, pilot_reco, enterprise_reco,
   invoice_status, delivery_status, created_at). *Swap for a Supabase
   `engagements` table (RLS on, service-role) at multi-analyst scale — UI contract
   unchanged.*
2. **Auth gate** — fail-closed Basic Auth (`ANALYST_USER`/`ANALYST_PASSWORD`); the
   server refuses to start without credentials. v2: Supabase Auth / magic-link for
   per-analyst identity + audit log.
3. **Intake + upload UI** — customer fields + manifest upload/paste (any format);
   passed straight through as `manifest_text` (no rewrite).
4. **Run Audit** — one button → `/api/run` spawns the **existing** kit
   (`RT_CONSOLE=1` stage markers) and streams staged ndjson progress (parsing →
   assessment → Ω exposure → audit → replay → determinism → exec report →
   complete) + the live kit log.
5. **Deliverables** — preview/download Audit, Executive Report, Run Summary;
   field matrix shown; files served path-scoped under `/deliverables`
   (traversal-blocked). *Private bucket + signed links = next (below).*
6. **Client management** — engagement list with inline status / proposal /
   invoice / delivery workflow; generated reports auto-attach to the record.

## Phases 3+ (additions, not redesigns)
Discovery Workshops · Runtime Safety Assessments · Pilots · Enterprise
Integrations · Monthly Governance Reports · Proposal / SOW / Invoice generation
(reuse the PDF pipeline) · CRM integration · multi-analyst management.

---

## Secure client delivery — recommendation
Goal: protect confidentiality, never expose internal infra, premium feel.

| Model | Confidentiality | Control | Effort | Use |
|---|---|---|---|---|
| 1. Manual email attachment | Low (no expiry/revoke, forwards freely) | None | None | Fallback only |
| 2. **Signed expiring links** | High | Expiry + revoke | Low | **Default** |
| 3. Per-client portal | Highest | Full (per-account) | High | Premium / recurring |
| 4. Password-protected file | Medium | Shared secret | Low | Add-on to #2 |

**Recommended: #2 now → #3 later.**
- Store delivered PDFs in a **private object store** (Supabase Storage private
  bucket or S3 — *not* `/public`).
- Generate **short-lived signed URLs** (e.g. 7–14 days) emailed to the named
  client contact; **revocable**; optionally watermarked with the client name +
  "Confidential". (Optionally layer #4 password for sensitive sectors.)
- **Graduate to a per-client portal (#3)** once you have recurring/monthly
  reporting — invited customers sign in and see only their own reports.
- Never email the raw PDF as the primary channel, and never give customers access
  to the console, the Kit, the engine, or pre-delivery reports.

---

## Host decision — RESOLVED: A1 (local/internal, solo)
`npm run console` launches the authed localhost app wrapping the Kit — zero new
infra. **Graduation path when a second analyst joins → A2:** containerise
`console/` (it already has no Vercel coupling), add Chromium, move the engagement
store to Supabase, deploy **privately** on Railway behind auth. (B — Vercel UI +
Railway worker — only if the UI itself must be publicly reachable; not needed for
an internal tool.)
