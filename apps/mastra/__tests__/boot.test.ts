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
  // Clear agent overrides so default-selection tests stay hermetic regardless
  // of the developer's local .env (which may pin a specific model).
  delete process.env.DIALOGUS_AGENT_MODEL
  delete process.env.DIALOGUS_AGENT_PROVIDER
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

  it('defaults to openai/gpt-4o-mini outside production', async () => {
    const mod = await import('../mastra.config')
    // Clear inside the test too: importing mastra.config re-runs
    // loadEnvFromRoot() at module load, repopulating env vars from .env.
    delete process.env.DIALOGUS_AGENT_MODEL
    delete process.env.DIALOGUS_AGENT_PROVIDER
    const choice = mod.pickAgentModel({
      NODE_ENV: 'development',
    } as Parameters<typeof mod.pickAgentModel>[0])
    expect(choice.provider).toBe('openai')
    expect(choice.modelId).toBe('gpt-4o-mini')
  })

  it('defaults to anthropic/claude-sonnet-4-6 in production', async () => {
    const mod = await import('../mastra.config')
    delete process.env.DIALOGUS_AGENT_MODEL
    delete process.env.DIALOGUS_AGENT_PROVIDER
    const choice = mod.pickAgentModel({
      NODE_ENV: 'production',
    } as Parameters<typeof mod.pickAgentModel>[0])
    expect(choice.provider).toBe('anthropic')
    expect(choice.modelId).toBe('claude-sonnet-4-6')
  })

  it('defaults to openai/gpt-4o-mini in test', async () => {
    const mod = await import('../mastra.config')
    delete process.env.DIALOGUS_AGENT_MODEL
    delete process.env.DIALOGUS_AGENT_PROVIDER
    const choice = mod.pickAgentModel({
      NODE_ENV: 'test',
    } as Parameters<typeof mod.pickAgentModel>[0])
    expect(choice.provider).toBe('openai')
    expect(choice.modelId).toBe('gpt-4o-mini')
  })

  it('honours DIALOGUS_AGENT_MODEL override (provider inferred from prefix)', async () => {
    const mod = await import('../mastra.config')
    process.env.DIALOGUS_AGENT_MODEL = 'gpt-4o'
    delete process.env.DIALOGUS_AGENT_PROVIDER
    const choice = mod.pickAgentModel({
      NODE_ENV: 'development',
    } as Parameters<typeof mod.pickAgentModel>[0])
    expect(choice.provider).toBe('openai')
    expect(choice.modelId).toBe('gpt-4o')

    process.env.DIALOGUS_AGENT_MODEL = 'claude-sonnet-4-6'
    const choice2 = mod.pickAgentModel({
      NODE_ENV: 'development',
    } as Parameters<typeof mod.pickAgentModel>[0])
    expect(choice2.provider).toBe('anthropic')
    expect(choice2.modelId).toBe('claude-sonnet-4-6')
  })
})
