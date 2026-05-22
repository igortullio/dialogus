import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const here = dirname(fileURLToPath(import.meta.url))
let envDir = here
while (true) {
  const candidate = resolve(envDir, '.env')
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate)
    break
  }
  const parent = dirname(envDir)
  if (parent === envDir) break
  envDir = parent
}

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
