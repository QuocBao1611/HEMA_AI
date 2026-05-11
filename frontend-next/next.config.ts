import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: { ignoreBuildErrors: true },

  // QUAN TRỌNG: Rewrite /api/v1/* từ frontend sang backend
  // Khi deploy lên Render, frontend và backend là 2 service riêng biệt
  // Next.js sẽ proxy các request /api/v1/* từ browser sang backend
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${process.env.INTERNAL_API_URL || "http://localhost:8000/api/v1"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
