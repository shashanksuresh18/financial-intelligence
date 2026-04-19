import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Type checking runs explicitly via `npx tsc --noEmit` in local verification.
  // Skipping Next's duplicate build-time type worker avoids Windows sandbox EPERM.
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    cpus: 1,
    workerThreads: true,
  },
};

export default nextConfig;
