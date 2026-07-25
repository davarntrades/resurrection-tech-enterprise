# Production E2E — Control Room Preview (dormant / manual)

A WebKit (Safari-engine) Playwright test that reproduces the exact operator flow
against the **live** site and asserts that **Preview serves the PDF, not the 404
page**:

> Customers → Dry Run Customer → Audit pack → Preview `audit.pdf`
> ⇒ response is `application/pdf` (`200`/`206`).

- Workflow: `.github/workflows/e2e-production.yml`
- Test: `e2e/control-room-preview.spec.ts`
- Config: `playwright.config.ts` (project `webkit`)
- Runner: `npm run test:e2e`

## Status: DORMANT

This is prepared but **not active**. It runs **only** via manual
`workflow_dispatch` (Actions → *E2E — Control Room Preview (production, manual)* →
**Run workflow**). It does **not** run on `push`, `pull_request`, merge,
`schedule`, or any deployment event, and it is **not** connected to any deploy
pipeline. Until the secrets below are set, a manual run **fails fast** at the
preflight step with a clear message and changes nothing.

## Required repository secrets

Set these under **Settings → Secrets and variables → Actions → Secrets** before
running:

| Secret | Purpose |
|---|---|
| `E2E_BASE_URL` | Base URL of the live site, e.g. `https://www.resurrection-tech.com` |
| `ADMIN_USER` | HTTP Basic-Auth username for `/admin/*` (the `proxy.ts` gate) |
| `ADMIN_PASSWORD` | HTTP Basic-Auth password for `/admin/*` |
| `RUNTIME_ADMIN_KEY` | Operator login password (used to mint the session) |

Optional variable (**Actions → Variables**, not a secret):

| Variable | Default | Purpose |
|---|---|---|
| `E2E_CUSTOMER` | `Dry Run Customer` | Customer card the test opens |

Secrets are referenced only via `${{ secrets.* }}`; their **values are never
printed** — the preflight step checks presence only.

## Running it manually (once secrets are set)

1. **Actions** tab → **E2E — Control Room Preview (production, manual)**.
2. **Run workflow**. Optionally set the `base_url` input to override
   `E2E_BASE_URL` for a single run (e.g. a staging URL).
3. On failure, the `playwright-report` artifact (trace + screenshots) is attached
   to the run.

If secrets are missing, the run stops at **Preflight — required secrets present**
with an error listing exactly which secret(s) to add. No production request is
made.

## Run it locally instead (no CI needed)

```bash
E2E_BASE_URL=https://www.resurrection-tech.com \
ADMIN_USER=… ADMIN_PASSWORD=… RUNTIME_ADMIN_KEY=… \
npx playwright install webkit && npm run test:e2e
```

## Activating automatic execution later (optional)

Only after the secrets are configured and you want it to gate continuously, add
triggers back to `.github/workflows/e2e-production.yml`, e.g.:

```yaml
on:
  workflow_dispatch:
    # …existing input…
  schedule:
    - cron: "0 */6 * * *"   # every 6h, catch production drift
  # push / pull_request are usually NOT recommended for a *production* E2E,
  # since it hits the live site on every change. Prefer schedule + manual.
```

Keep production-hitting E2E off `push`/`pull_request` unless you intend every
change to exercise the live environment.
