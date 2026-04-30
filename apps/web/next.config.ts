import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@dialogus/shared', '@dialogus/catalog', '@dialogus/db'],
  typedRoutes: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'www.gutenberg.org' },
      { protocol: 'https', hostname: 'gutenberg.org' },
      { protocol: 'https', hostname: 'gutendex.com' },
    ],
  },
}

export default nextConfig
