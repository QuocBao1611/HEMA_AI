import type { NextConfig } from "next";

// BACKEND_URL nên là URL gốc KHÔNG có /api/v1 ở cuối
// Ví dụ: https://your-space.hf.space   (đúng ✅)
// KHÔNG phải: https://your-space.hf.space/api/v1  (sai ❌ — sẽ bị double path)
const _backendBase = (process.env.BACKEND_URL || "http://localhost:8000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // Vercel tự động optimize, không cần standalone
  typescript: { ignoreBuildErrors: true },

  // QUAN TRỌNG: Rewrite /api/v1/* từ frontend sang backend (HF Space)
  // source: /api/v1/auth/login  →  destination: https://xxx.hf.space/api/v1/auth/login
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${_backendBase}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
