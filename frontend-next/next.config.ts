import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel tự động optimize, không cần standalone
  typescript: { ignoreBuildErrors: true },

  // QUAN TRỌNG: Rewrite /api/v1/* từ frontend sang backend
  // Khi deploy lên Vercel, frontend gọi backend qua HF Spaces (hoặc platform khác)
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${process.env.BACKEND_URL || "http://localhost:8000/api/v1"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
