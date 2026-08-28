import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 서버 액션(자체 경로엔진)이 fs로 읽는 시간표 바이너리를 서버리스 번들에 포함
  outputFileTracingIncludes: {
    "/**": ["./data/engine/tokyo-rail.bin"],
  },
};

export default nextConfig;
