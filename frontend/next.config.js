const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Limit build parallelism to keep memory usage low on small instances (EC2)
  experimental: { cpus: 1 },
};

module.exports = withSentryConfig(nextConfig, {
  // No Sentry auth token is configured — skip source map generation and
  // telemetry to cut next build memory usage significantly (small EC2 builds)
  sourcemaps: { disable: true },
  telemetry: false,
});
