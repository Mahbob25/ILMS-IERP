const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Limit build parallelism to keep memory usage low on small instances (EC2)
  experimental: { cpus: 1 },
  webpack: (config) => {
    // Resolve the @/* alias explicitly — tsconfig paths alone are not always
    // picked up by webpack in this app, which made `@/lib/api` etc. fail.
    config.resolve.alias["@"] = path.join(__dirname);
    return config;
  },
};

module.exports = nextConfig;
