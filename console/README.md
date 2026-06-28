# Runtime Governance Analyst Console (internal)

Private, authenticated web app that wraps the existing Delivery Kit so an audit
is **Upload Manifest → Run Audit → Review Deliverables**. Customers never reach
this app, the engine, the kit, analyst tools, or pre-delivery reports.

> Runs where the kit already runs (Chromium + engine access). It is **not** the
> public marketing site and must never be deployed to Vercel or exposed publicly.

## Start
```bash
# one-time: set analyst credentials in .env.delivery (gitignored)
ANALYST_USER=your.name
ANALYST_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))")
# (also set GOVERNANCE_TOKEN so the executive-report replay populates)

npm run console
# → http://127.0.0.1:8787   (Basic Auth: the analyst credentials above)
```
The server **refuses to start without credentials** (fail-closed). It binds to
`127.0.0.1` by default; forward the port (e.g. Codespaces) if you need remote
access for yourself — keep it private.

## What it does
- **Engagement intake** — record customer/company/industry/reference/type/notes.
- **Run** — upload or paste a manifest (any format) + period/format/Ω domains +
  optional trajectories → one button → **live staged progress** (parsing →
  assessment → Ω exposure → audit → replay → determinism → exec report →
  complete) streamed from the kit.
- **Deliverables** — preview/download the branded Audit PDF, Executive Report
  PDF, and run-summary.json; the Priority-1 field matrix shows what populated.
- **Clients** — private engagement records with status / proposal / invoice /
  delivery workflow; generated reports attach to the record automatically.
- **Engagement details** — click any client to open its permanent audit record:
  customer info, every audit run (with evidence: Ω coverage, blocked
  trajectories, ALLOW/BLOCK/ESCALATE, determinism, latency), all deliverables
  (preview/download/share), all secure links (expiry/revoke/regenerate), the
  manifest used, and notes. Everything is restored from the server, so
  deliverables and links survive page refreshes and navigation.

## Architecture
- `server.cjs` — zero-dependency Node `http` server: Basic-Auth gate, engagement
  store (`console/data/engagements.json`, gitignored), and `/api/run` which
  spawns `scripts/delivery-kit.cjs` (env `RT_CONSOLE=1` for stage markers) and
  streams ndjson events. Deliverable serving is path-scoped under
  `/deliverables` (traversal-blocked).
- `public/` — single-page UI (`index.html`, `app.css`, `app.js`).
- The Runtime Governance engine, Delivery Kit, and PDF pipeline are reused
  as-is — nothing here reimplements them.

## Data store
Solo v1 uses a local JSON file. To scale to multiple analysts, swap
`loadEngagements`/`saveEngagements` for Supabase (service-role, RLS on — same
posture as `assessments`) without changing the UI contract.

## Secure delivery ✅
Built in. Each generated PDF has a **Share securely** button →
expiring (1–90 day), revocable, optionally password-protected **capability
link**. Customers open `/share/<token>` with **no analyst credentials** — that
route bypasses Basic Auth but serves only the one deliverable; the console,
engine, kit, and other reports stay private. Links are listed under *Secure
delivery* with state (active/expired/revoked), download count, and a Revoke
button. Sharing a report marks the engagement `delivered`.

- **Reachability:** the server binds to `127.0.0.1`. For a customer to open the
  link, forward the Codespaces port as **Public** (Ports tab → right-click →
  Port Visibility → Public). The token is unguessable; expiry + revoke bound the
  exposure. Add a password for sensitive sectors.
- Store/API: shares live in `console/data/shares.json` (gitignored). For
  multi-analyst scale, move to a private bucket (Supabase Storage / S3) with the
  same token model. See `../PLATFORM-PLAN.md`.
