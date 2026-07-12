# PDF renderer (Railway) — Generate-evidence-pack pipeline

Codespaces/Vercel serverless cannot run Chromium, so production PDF rendering
runs on a **dedicated Node + Playwright renderer service on Railway**, separate
from the Python governance engine (which is never modified).

```
Control Room (Vercel)                Railway
  POST /admin/deliverables/generate
     │  build report + branded HTML
     │  renderPdfs(documents)  ──────►  renderer POST /render   (Node + Chromium)
     │                                   x-render-secret required
     │  ◄── audit.pdf, executive-report.pdf (bytes) ──────────────┘
     │  publishUploaded → Supabase Storage + rg_deliverables
     ▼
  Control Room panel · Evidence Hub · secure customer emails
```

The renderer is the **only** place Chromium runs in production. The Vercel route
keeps auth, ownership validation, persistence and notifications.

## Deploy the renderer on Railway

Create a **second Railway service** (alongside the engine) from this repo:

- **Root Directory:** `.` (repo root — the image needs `scripts/*`)
- **Dockerfile Path:** `renderer/Dockerfile`

The image installs Playwright's Chromium **at build time** (`npx playwright
install --with-deps chromium`), runs the chromium smoke test as a **build-time
and startup preflight**, then serves `renderer/server.cjs`. It does **not** use
any Codespace browser cache.

### Renderer environment variables (Railway)
| Var | Required | Notes |
|-----|----------|-------|
| `RENDER_SECRET` | **yes** | Shared secret; the renderer returns 401 without a matching `x-render-secret`, and 503 if this is unset. |
| `PORT` | provided | Railway sets it; server defaults to 8080. |
| `RENDER_TIMEOUT_MS` | no | Per-render timeout (default 30000). |
| `RENDER_MAX_BODY_BYTES` | no | Max request body (default 8 MB). |
| `RENDER_MAX_DOCS` | no | Max documents per request (default 6). |

Endpoints: `GET /health` (unauthenticated liveness), `POST /render` (secret-gated).

## Wire Vercel to the renderer

Set these **server-only** env vars on Vercel (never `NEXT_PUBLIC_*`):

| Var | Required | Notes |
|-----|----------|-------|
| `RENDERER_URL` | to enable PDFs | The Railway renderer base URL. |
| `RENDERER_SECRET` | to enable PDFs | Must equal the renderer's `RENDER_SECRET`. |
| `RENDERER_TIMEOUT_MS` | no | Client fetch timeout (default 45000). |

**If `RENDERER_URL`/`RENDERER_SECRET` are unset, Generate-evidence-pack keeps its
legacy behaviour** (HTML/Markdown/JSON pack, no PDFs) — so nothing regresses
before the renderer is deployed. When set, it renders `audit.pdf` +
`executive-report.pdf`, publishes them, and **fails closed** (no pack is created)
if rendering or upload fails.

## Security properties
- Server-to-server only; the secret + renderer URL never reach the browser.
- HTML content only — the renderer refuses URLs, and **all external navigation
  is blocked** during rendering (every non-`data:`/`about:blank` request is aborted).
- Bounded body size + per-render timeout; fails closed.
- The Vercel route validates that `environment_id` belongs to `org_id`
  (cross-organisation generation is rejected) and records renderer
  success/failure in the operator audit trail
  (`generate_evidence_pack` / `generate_evidence_pack_failed`).

## Verify
```bash
# Local renderer smoke (same code Railway runs):
RENDER_SECRET=dev npm run renderer &                 # starts on :8080
curl -s localhost:8080/health
curl -s -X POST localhost:8080/render -H 'x-render-secret: dev' \
  -H 'content-type: application/json' \
  -d '{"documents":[{"name":"t.pdf","html":"<h1>ok</h1>"}]}' | head -c 80

# Production: Control Room → a customer → Generate evidence pack →
# audit.pdf + executive-report.pdf appear in the audit-pack panel and the
# customer Evidence Hub; the executive-report event emails opted-in contacts.
```
