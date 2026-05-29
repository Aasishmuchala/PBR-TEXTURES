/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // sharp ships native binaries; keep it external to the server bundle.
  experimental: {
    serverComponentsExternalPackages: ["sharp"],
  },
};

export default nextConfig;
