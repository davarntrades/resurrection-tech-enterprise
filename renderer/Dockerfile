# Runtime Governance — PDF renderer (Railway).
# Node + Playwright Chromium. Chromium is installed at BUILD time (never per
# request). Reuses the shared scripts/lib/resolve-chromium.cjs resolver and the
# existing chromium smoke test as build + startup preflight.
#
# Build context = the REPOSITORY ROOT (so scripts/* are available). On Railway:
#   Root Directory: .   ·   Dockerfile Path: renderer/Dockerfile
FROM node:20-bookworm-slim

WORKDIR /app

# Minimal, renderer-only dependency set (playwright → playwright-core). Installed
# at /app/node_modules so both renderer/server.cjs and scripts/lib resolve it.
COPY renderer/package.json ./package.json
RUN npm install --no-audit --no-fund

# Chromium + its system libraries at IMAGE BUILD time, not per request.
RUN npx playwright install --with-deps chromium

# Shared browser resolver + smoke test (identical to local / CI), then the server.
COPY scripts/lib/resolve-chromium.cjs ./scripts/lib/resolve-chromium.cjs
COPY scripts/smoke-tests/chromium-smoke.cjs ./scripts/smoke-tests/chromium-smoke.cjs
COPY renderer/server.cjs ./renderer/server.cjs

# Build-time preflight: fail the image if Chromium cannot render a PDF.
RUN node scripts/smoke-tests/chromium-smoke.cjs

ENV PORT=8080 \
    NODE_ENV=production
EXPOSE 8080

# Startup preflight (smoke) → then serve. If the browser is broken the container
# exits non-zero instead of serving a renderer that can't render.
CMD ["sh", "-c", "node scripts/smoke-tests/chromium-smoke.cjs && node renderer/server.cjs"]
