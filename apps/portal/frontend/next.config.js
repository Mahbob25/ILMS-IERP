const path = require("path");

// EC2 portal BFF origin for the Vercel → EC2 API bridge. Path-based routing on
// Caddy's :80 block, so plain http is fine (TLS terminates at Vercel).
const API_ORIGIN = process.env.API_ORIGIN || "http://13.50.176.4";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Resolve the @/* alias explicitly — tsconfig paths alone are not always
    // picked up by webpack in this app, which made `@/lib/api` etc. fail.
    config.resolve.alias["@"] = path.join(__dirname);
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_ORIGIN}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
