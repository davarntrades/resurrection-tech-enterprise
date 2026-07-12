import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // The full-audit flow reuses scripts/delivery-kit.cjs for its HTML builders.
  // That module can lazily reach Playwright (CLI rendering only — never on the
  // web, where PDFs render on the Railway service). Keep Playwright external so
  // the server bundle doesn't try to bundle Chromium; the require is never hit
  // in the Vercel runtime.
  serverExternalPackages: ["playwright", "playwright-core", "chromium-bidi"],
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        // Security headers applied to every route.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
