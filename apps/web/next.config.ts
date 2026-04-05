import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'raw.communitydragon.org',
        pathname: '/latest/**',
      },
      {
        protocol: 'https',
        hostname: 'ddragon.leagueoflegends.com',
        pathname: '/cdn/**',
      },
    ],
  },
};

export default nextConfig;
