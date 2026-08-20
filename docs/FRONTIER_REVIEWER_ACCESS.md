# Frontier Containment Lab — External Reviewer Access

This mode gives an external technical reviewer access to `/lab` without sharing the Resurrection Tech operator password and without granting Control Room/admin access.

## Security boundary

Reviewer authentication is intentionally separate from `rg_admin_session`.

- Reviewer cookie: `rg_frontier_reviewer`
- Cookie scope: `/api/frontier`
- Reviewer session-grant cookie: `rg_frontier_reviewer_grants`
- Session-grant scope: `/api/frontier/session`
- Both cookies are `HttpOnly`, `Secure`, and `SameSite=Lax`.
- Admin routes continue to accept only the existing operator/admin authentication.
- Reviewer continuous-session history is filtered to sessions created by that reviewer browser session.
- Direct reads or controls of another session ID fail with HTTP 403.
- Hosted provider/API credentials remain server-side and are never returned to the browser.

## Required deployment variables

Set these on the Next.js/Vercel deployment only. Do not commit real values.

```text
FRONTIER_REVIEWER_PASSWORD=<unique reviewer password>
FRONTIER_REVIEWER_SESSION_SECRET=<long random signing secret>
FRONTIER_REVIEWER_IDENTITY=midhun-reviewer
FRONTIER_REVIEWER_EXPIRES_AT=<ISO-8601 timestamp, optional but recommended>
FRONTIER_REVIEWER_TTL_SEC=14400
```

Optional reviewer-specific paid-model limits:

```text
FRONTIER_REVIEWER_UI_RATE_LIMIT=3
FRONTIER_REVIEWER_SESSION_UI_RATE_LIMIT=2
```

`FRONTIER_REVIEWER_EXPIRES_AT` is checked both at login and on every reviewer token verification. Once the configured expiry passes, existing reviewer sessions fail closed. Rotating `FRONTIER_REVIEWER_SESSION_SECRET` revokes all outstanding reviewer cookies immediately.

## Login behaviour

The existing `/lab` login form can remain unchanged. The login endpoint tries the existing operator credential first. If it does not match, it checks the separately configured reviewer credential.

- Operator credential -> existing `rg_admin_session`, full operator behaviour unchanged.
- Reviewer credential -> `rg_frontier_reviewer` only, limited to Frontier API routes.

A reviewer password therefore cannot be used to enter the Control Room or any `/api/runtime/admin/*` endpoint.

## Continuous-session isolation

When a reviewer creates a continuous governed session, the browser receives a signed HttpOnly grant containing only that session ID (plus a bounded set of its recent reviewer-created session IDs). Reviewer history is filtered against those grants, and session read/control endpoints require a matching grant.

Operator sessions remain unchanged and retain their existing global operator visibility.

## Revocation

To revoke reviewer access immediately, remove the reviewer variables or rotate `FRONTIER_REVIEWER_SESSION_SECRET`. For scheduled expiry, set `FRONTIER_REVIEWER_EXPIRES_AT` before issuing access.
