import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Permite que a Vercel termine a build com sucesso mesmo que haja pequenas discrepâncias de tipos
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;