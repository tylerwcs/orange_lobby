import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Masterlist uploads travel through a Server Action; the default cap is 1MB.
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};

export default nextConfig;
