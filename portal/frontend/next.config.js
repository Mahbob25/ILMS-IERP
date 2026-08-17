/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Limit build parallelism to keep memory usage low on small instances (EC2)
  experimental: { cpus: 1 },
};

module.exports = nextConfig;
