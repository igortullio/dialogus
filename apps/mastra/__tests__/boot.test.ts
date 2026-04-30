import { spawnSync } from 'node:child_process'
import { DIALOGUS_AGENT_ID } from '@dialogus/rag'
import { Mastra } from '@mastra/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const dockerAvailable = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}']).status === 0

const ORIGINAL_ENV = { ...process.env }

beforeAll(() => {
  process.env.NODE_ENV = 'test'
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'postgres://dialogus:dialogus@localhost:5432/dialogus_test'
  process.env.LOG_LEVEL = 'error'
  process.env.MASTRA_PORT = process.env.MASTRA_PORT ?? '3002'
  process.env.MASTRA_STUDIO_PORT = process.env.MASTRA_STUDIO_PORT ?? '4111'
})

afterAll(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe.skipIf(!dockerAvailable)('apps/mastra mastra.config.ts', () => {
  it('exports a Mastra instance with dialogusAgent registered', async () => {
    const mod = await import('../mastra.config')

    expect(mod.mastra).toBeInstanceOf(Mastra)
    const agents = mod.mastra.listAgents()
    expect(agents).toHaveProperty(DIALOGUS_AGENT_ID)
  })

  it('selects claude-haiku-4-5 outside production', async () => {
    const mod = await import('../mastra.config')
    const id = mod.pickModelId({
      NODE_ENV: 'development',
    } as Parameters<typeof mod.pickModelId>[0])
    expect(id).toBe('claude-haiku-4-5')
  })

  it('selects claude-sonnet-4-6 in production', async () => {
    const mod = await import('../mastra.config')
    const id = mod.pickModelId({
      NODE_ENV: 'production',
    } as Parameters<typeof mod.pickModelId>[0])
    expect(id).toBe('claude-sonnet-4-6')
  })

  it('selects claude-haiku-4-5 in test', async () => {
    const mod = await import('../mastra.config')
    const id = mod.pickModelId({
      NODE_ENV: 'test',
    } as Parameters<typeof mod.pickModelId>[0])
    expect(id).toBe('claude-haiku-4-5')
  })
})
