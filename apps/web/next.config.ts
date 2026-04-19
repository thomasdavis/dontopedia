import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@dontopedia/ui", "@dontopedia/sdk", "@donto/client"],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
