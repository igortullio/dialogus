import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['**/*.integration.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    pool: 'forks',
    testTimeout: 180_000,
    hookTimeout: 240_000,
    dangerouslyIgnoreUnhandledErrors: false,
  },
})
