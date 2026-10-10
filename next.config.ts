import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Masterlist uploads travel through a Server Action; the default cap is 1MB.
  // D430: event addresses are tested locally as <label>.localhost:3000. Next blocks dev-only
  // assets (HMR, chunks) for any origin but localhost unless it is listed here. Development only.
  allowedDevOrigins: ["*.localhost"],
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};

export default nextConfig;
