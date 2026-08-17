const { withSentryConfig } = require("@sentry/nextjs");

// EC2 backend origin for the Vercel → EC2 API bridge. Path-based routing on
// Caddy's :80 block, so plain http is fine (TLS terminates at Vercel; the
// browser never talks to EC2 directly).
const API_ORIGIN = process.env.API_ORIGIN || "http://16.192.155.151";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${API_ORIGIN}/api/v1/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${API_ORIGIN}/uploads/:path*`,
      },
    ];
  },
};

module.exports = withSentryConfig(nextConfig, {
  // No Sentry auth token is configured — skip source map generation and
  // telemetry to cut next build memory usage significantly (small EC2 builds)
  sourcemaps: { disable: true },
  telemetry: false,
});
