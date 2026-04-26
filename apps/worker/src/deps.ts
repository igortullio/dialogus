import type { Database, PgBoss } from '@dialogus/db'
import type { EmbeddingProvider } from '@dialogus/ingestion'
import {
  DEFAULT_STORAGE_ROOT,
  type StageDeps,
} from '@dialogus/ingestion/application/stages/_common'
import { GutendexDownloader } from '@dialogus/ingestion/infrastructure/external/GutendexDownloader'
import { MockEmbeddingProvider } from '@dialogus/ingestion/infrastructure/external/MockEmbeddingProvider'
import { OpenAIEmbeddingProvider } from '@dialogus/ingestion/infrastructure/external/OpenAIEmbeddingProvider'
import { EpubChapterParser } from '@dialogus/ingestion/infrastructure/parsing/EpubChapterParser'
import { EpubChapterParserEpub2 } from '@dialogus/ingestion/infrastructure/parsing/EpubChapterParserEpub2'
import { EpubChapterParserWithFallback } from '@dialogus/ingestion/infrastructure/parsing/EpubChapterParserWithFallback'
import { TxtChapterParser } from '@dialogus/ingestion/infrastructure/parsing/TxtChapterParser'
import { DrizzleChapterRepository } from '@dialogus/ingestion/infrastructure/persistence/DrizzleChapterRepository'
import { DrizzleChunkRepository } from '@dialogus/ingestion/infrastructure/persistence/DrizzleChunkRepository'
import type { DialogusEnv } from '@dialogus/shared/config'
import type { Logger } from 'pino'

export type EmbeddingProviderChoice = 'mock' | 'openai'
export type EmbeddingProviderSource = 'env' | 'default'

export interface SelectedEmbeddingProvider {
  readonly provider: EmbeddingProvider
  readonly choice: EmbeddingProviderChoice
  readonly source: EmbeddingProviderSource
}

export interface SelectEmbeddingProviderInput {
  readonly nodeEnv: DialogusEnv['NODE_ENV']
  readonly openaiApiKey: string | undefined
  readonly embeddingProviderEnv: string | undefined
}

export class EmbeddingProviderConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmbeddingProviderConfigError'
  }
}

export function selectEmbeddingProvider(
  input: SelectEmbeddingProviderInput,
): SelectedEmbeddingProvider {
  const explicit = normalizeProviderEnv(input.embeddingProviderEnv)
  const choice: EmbeddingProviderChoice =
    explicit ?? (input.nodeEnv === 'production' ? 'openai' : 'mock')
  const source: EmbeddingProviderSource = explicit ? 'env' : 'default'
  if (choice === 'openai') {
    if (!input.openaiApiKey || input.openaiApiKey.length === 0) {
      throw new EmbeddingProviderConfigError(
        'OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai (or NODE_ENV=production)',
      )
    }
    return {
      provider: new OpenAIEmbeddingProvider({ apiKey: input.openaiApiKey }),
      choice,
      source,
    }
  }
  return { provider: new MockEmbeddingProvider(), choice, source }
}

function normalizeProviderEnv(value: string | undefined): EmbeddingProviderChoice | null {
  if (value === undefined) return null
  const trimmed = value.trim().toLowerCase()
  if (trimmed === '') return null
  if (trimmed === 'mock' || trimmed === 'openai') return trimmed
  throw new EmbeddingProviderConfigError(
    `EMBEDDING_PROVIDER must be "mock" or "openai" (got "${value}")`,
  )
}

export interface ComposeStageDepsInput {
  readonly db: Database
  readonly boss: PgBoss
  readonly logger: Logger
  readonly config: DialogusEnv
  readonly storageRoot?: string
}

export interface ComposedStageDeps {
  readonly deps: StageDeps
  readonly embeddingProvider: SelectedEmbeddingProvider
}

export function composeStageDeps(input: ComposeStageDepsInput): ComposedStageDeps {
  const storageRoot = input.storageRoot ?? DEFAULT_STORAGE_ROOT
  const embeddingProvider = selectEmbeddingProvider({
    nodeEnv: input.config.NODE_ENV,
    openaiApiKey: input.config.OPENAI_API_KEY,
    embeddingProviderEnv: process.env.EMBEDDING_PROVIDER,
  })

  const chapterRepo = new DrizzleChapterRepository(input.db)
  const chunkRepo = new DrizzleChunkRepository(input.db)
  const downloader = new GutendexDownloader({ storageDir: `${storageRoot}/raw` })
  const chapterParser = new EpubChapterParserWithFallback({
    primary: new EpubChapterParser(),
    fallback: new EpubChapterParserEpub2(),
    logger: { warn: (msg, meta) => input.logger.warn(meta ?? {}, msg) },
  })
  const txtChapterParser = new TxtChapterParser()

  const deps: StageDeps = {
    db: input.db,
    logger: input.logger,
    chapterRepo,
    chunkRepo,
    embeddingProvider: embeddingProvider.provider,
    chapterParser,
    txtChapterParser,
    downloader,
    pgboss: input.boss,
    storageRoot,
  }
  return { deps, embeddingProvider }
}
