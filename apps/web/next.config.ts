import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  transpilePackages: ["@dontopedia/ui", "@dontopedia/sdk", "@donto/client"],
};

export default nextConfig;
