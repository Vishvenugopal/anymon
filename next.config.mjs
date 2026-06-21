/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow large base64 image payloads through API routes.
  experimental: {
    serverComponentsExternalPackages: ["ioredis"],
  },
};

export default nextConfig;
