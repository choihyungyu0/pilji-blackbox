import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 정적 데이터는 캐시 오래 (빌드마다 파일명이 같으므로 배포 후 1시간 재검증)
  async headers() {
    return [
      {
        source: "/data/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }],
      },
      {
        source: "/templates/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600" }],
      },
    ];
  },
};

export default nextConfig;
