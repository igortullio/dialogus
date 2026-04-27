import type { Database, PgBoss } from '@dialogus/db'
import type { DialogusEnv } from '@dialogus/shared/config'
import { pino } from 'pino'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  composeStageDeps,
  EmbeddingProviderConfigError,
  SummaryGeneratorConfigError,
  selectEmbeddingProvider,
  selectSummaryGenerator,
} from '../src/deps'

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  delete process.env.EMBEDDING_PROVIDER
  delete process.env.OPENAI_API_KEY
  delete process.env.SUMMARY_GENERATOR
  delete process.env.ANTHROPIC_API_KEY
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('selectEmbeddingProvider', () => {
  it('returns mock with source=env when EMBEDDING_PROVIDER=mock', () => {
    const result = selectEmbeddingProvider({
      nodeEnv: 'production',
      openaiApiKey: 'sk-anything',
      embeddingProviderEnv: 'mock',
    })
    expect(result.choice).toBe('mock')
    expect(result.source).toBe('env')
    expect(result.provider.modelName).toBe('mock-embedding-1536')
    expect(result.provider.dimensions).toBe(1536)
  })

  it('returns openai with source=env when EMBEDDING_PROVIDER=openai', () => {
    const result = selectEmbeddingProvider({
      nodeEnv: 'development',
      openaiApiKey: 'sk-test',
      embeddingProviderEnv: 'openai',
    })
    expect(result.choice).toBe('openai')
    expect(result.source).toBe('env')
    expect(result.provider.modelName).toBe('text-embedding-3-small')
  })

  it('defaults to mock when env unset and NODE_ENV !== production', () => {
    const dev = selectEmbeddingProvider({
      nodeEnv: 'development',
      openaiApiKey: undefined,
      embeddingProviderEnv: undefined,
    })
    expect(dev.choice).toBe('mock')
    expect(dev.source).toBe('default')

    const test = selectEmbeddingProvider({
      nodeEnv: 'test',
      openaiApiKey: undefined,
      embeddingProviderEnv: undefined,
    })
    expect(test.choice).toBe('mock')
    expect(test.source).toBe('default')
  })

  it('defaults to openai when env unset and NODE_ENV === production', () => {
    const result = selectEmbeddingProvider({
      nodeEnv: 'production',
      openaiApiKey: 'sk-prod',
      embeddingProviderEnv: undefined,
    })
    expect(result.choice).toBe('openai')
    expect(result.source).toBe('default')
  })

  it('treats blank EMBEDDING_PROVIDER as unset', () => {
    const result = selectEmbeddingProvider({
      nodeEnv: 'development',
      openaiApiKey: undefined,
      embeddingProviderEnv: '   ',
    })
    expect(result.choice).toBe('mock')
    expect(result.source).toBe('default')
  })

  it('throws when openai is selected but OPENAI_API_KEY is missing', () => {
    expect(() =>
      selectEmbeddingProvider({
        nodeEnv: 'production',
        openaiApiKey: undefined,
        embeddingProviderEnv: undefined,
      }),
    ).toThrow(EmbeddingProviderConfigError)

    expect(() =>
      selectEmbeddingProvider({
        nodeEnv: 'development',
        openaiApiKey: '',
        embeddingProviderEnv: 'openai',
      }),
    ).toThrow(/OPENAI_API_KEY/)
  })

  it('throws on an unrecognised EMBEDDING_PROVIDER value', () => {
    expect(() =>
      selectEmbeddingProvider({
        nodeEnv: 'development',
        openaiApiKey: 'sk-test',
        embeddingProviderEnv: 'cohere',
      }),
    ).toThrow(/EMBEDDING_PROVIDER/)
  })
})

describe('selectSummaryGenerator', () => {
  it('returns mock with source=env when SUMMARY_GENERATOR=mock', () => {
    const result = selectSummaryGenerator({
      nodeEnv: 'production',
      anthropicApiKey: 'sk-ant',
      summaryGeneratorEnv: 'mock',
    })
    expect(result.choice).toBe('mock')
    expect(result.source).toBe('env')
    expect(result.modelName).toBe('mock-summary-generator')
  })

  it('returns anthropic with source=env when SUMMARY_GENERATOR=anthropic', () => {
    const result = selectSummaryGenerator({
      nodeEnv: 'development',
      anthropicApiKey: 'sk-ant-test',
      summaryGeneratorEnv: 'anthropic',
    })
    expect(result.choice).toBe('anthropic')
    expect(result.source).toBe('env')
    expect(result.modelName).toBe('claude-haiku-4-5')
  })

  it('defaults to mock when env unset and NODE_ENV !== production', () => {
    const result = selectSummaryGenerator({
      nodeEnv: 'development',
      anthropicApiKey: undefined,
      summaryGeneratorEnv: undefined,
    })
    expect(result.choice).toBe('mock')
    expect(result.source).toBe('default')
  })

  it('defaults to anthropic when env unset and NODE_ENV === production', () => {
    const result = selectSummaryGenerator({
      nodeEnv: 'production',
      anthropicApiKey: 'sk-ant-prod',
      summaryGeneratorEnv: undefined,
    })
    expect(result.choice).toBe('anthropic')
    expect(result.source).toBe('default')
  })

  it('throws when anthropic is selected but ANTHROPIC_API_KEY is missing', () => {
    expect(() =>
      selectSummaryGenerator({
        nodeEnv: 'production',
        anthropicApiKey: undefined,
        summaryGeneratorEnv: undefined,
      }),
    ).toThrow(SummaryGeneratorConfigError)
    expect(() =>
      selectSummaryGenerator({
        nodeEnv: 'development',
        anthropicApiKey: '',
        summaryGeneratorEnv: 'anthropic',
      }),
    ).toThrow(/ANTHROPIC_API_KEY/)
  })

  it('throws on an unrecognised SUMMARY_GENERATOR value', () => {
    expect(() =>
      selectSummaryGenerator({
        nodeEnv: 'development',
        anthropicApiKey: 'sk-ant',
        summaryGeneratorEnv: 'gemini',
      }),
    ).toThrow(/SUMMARY_GENERATOR/)
  })
})

describe('composeStageDeps', () => {
  function makeConfig(overrides: Partial<DialogusEnv> = {}): DialogusEnv {
    return {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://user:pw@127.0.0.1:5/dialogus',
      API_PORT: 3001,
      WEB_PORT: 3000,
      NEXT_PUBLIC_API_URL: 'http://localhost:3001',
      LOG_LEVEL: 'info',
      ANTHROPIC_API_KEY: undefined,
      OPENAI_API_KEY: undefined,
      NEXT_PUBLIC_MASTRA_URL: undefined,
      ...overrides,
    } as DialogusEnv
  }

  function makeFakeBoss(): PgBoss {
    return {} as PgBoss
  }

  function makeFakeDb(): Database {
    return {} as Database
  }

  it('builds StageDeps with all required adapters and the chosen embedding provider', () => {
    const logger = pino({ level: 'silent' })
    const composed = composeStageDeps({
      db: makeFakeDb(),
      boss: makeFakeBoss(),
      logger,
      config: makeConfig({ NODE_ENV: 'test' }),
    })
    expect(composed.embeddingProvider.choice).toBe('mock')
    expect(composed.deps.chapterRepo).toBeDefined()
    expect(composed.deps.chunkRepo).toBeDefined()
    expect(composed.deps.downloader).toBeDefined()
    expect(composed.deps.chapterParser).toBeDefined()
    expect(composed.deps.txtChapterParser).toBeDefined()
    expect(composed.deps.embeddingProvider.modelName).toBe('mock-embedding-1536')
    expect(composed.deps.storageRoot).toBe('./storage')
    expect(composed.deps.pgboss).toBe(composed.deps.pgboss)
    expect(composed.chapterSummaryRepo).toBeDefined()
    expect(composed.chapterSummaryGenerator).toBeDefined()
    expect(composed.summaryGenerator.choice).toBe('mock')
    expect(composed.summaryGenerator.modelName).toBe('mock-summary-generator')
  })

  it('honors EMBEDDING_PROVIDER=openai with OPENAI_API_KEY from config', () => {
    process.env.EMBEDDING_PROVIDER = 'openai'
    const logger = pino({ level: 'silent' })
    const composed = composeStageDeps({
      db: makeFakeDb(),
      boss: makeFakeBoss(),
      logger,
      config: makeConfig({ NODE_ENV: 'development', OPENAI_API_KEY: 'sk-test-key' }),
    })
    expect(composed.embeddingProvider.choice).toBe('openai')
    expect(composed.embeddingProvider.source).toBe('env')
    expect(composed.deps.embeddingProvider.modelName).toBe('text-embedding-3-small')
  })

  it('passes a custom storageRoot through to deps', () => {
    const logger = pino({ level: 'silent' })
    const composed = composeStageDeps({
      db: makeFakeDb(),
      boss: makeFakeBoss(),
      logger,
      config: makeConfig(),
      storageRoot: '/tmp/custom-storage',
    })
    expect(composed.deps.storageRoot).toBe('/tmp/custom-storage')
  })
})
