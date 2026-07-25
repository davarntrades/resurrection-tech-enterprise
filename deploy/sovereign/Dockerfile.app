# Guardian OS Sovereign — the platform image (offline-clean).
#
# Built ONCE on a connected build host, then carried to the estate as a tar.
# The running container never fetches: dependencies are installed at build time,
# the Next.js build is produced with SOVEREIGN_BUILD=1 (no Google Fonts, no
# Vercel Analytics, no Speed Insights, no Calendly), and the audit in
# scripts/sovereign/offline-audit.cjs runs as part of the build so an image that
# would phone home fails to build at all.
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY . .

# Offline-clean production build + the audit that proves it.
ENV SOVEREIGN_BUILD=1 NEXT_PUBLIC_SOVEREIGN_BUILD=1 NEXT_TELEMETRY_DISABLED=1
RUN npm run build \
 && node scripts/sovereign/offline-audit.cjs

# ── Runtime ─────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    SOVEREIGN_BUILD=1 \
    NEXT_PUBLIC_SOVEREIGN_BUILD=1 \
    GUARDIAN_PROFILE=air_gapped \
    RUNTIME_DATA_DIR=/data \
    GUARDIAN_TRUST_DIR=/trust \
    PORT=3000

COPY --from=build /app /app
RUN mkdir -p /data /trust && chown -R node:node /data
USER node

EXPOSE 3000
VOLUME ["/data"]

# No Chromium is installed, and none is needed: evidence packs render through
# lib/sovereign/pdf.js. `npm run browser:install` must never appear here.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/ops/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["npm", "run", "start"]
