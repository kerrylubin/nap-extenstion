import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.200.1.82"],
  serverExternalPackages: ["pdf-parse", "playwright-extra", "puppeteer-extra-plugin-stealth"],
};

export default nextConfig;
