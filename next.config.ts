import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.fbcdn.net' },
      { protocol: 'https', hostname: '**.facebook.com' },
      { protocol: 'https', hostname: 'scontent**.fna.fbcdn.net' },
    ],
  },
  serverExternalPackages: ['better-sqlite3', 'playwright', 'playwright-extra', 'puppeteer-extra-plugin-stealth'],
};

export default nextConfig;
