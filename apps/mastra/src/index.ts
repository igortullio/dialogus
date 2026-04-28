import { createDatabase, type Database } from '@dialogus/db'
import {
  createDialogusAgent,
  DIALOGUS_AGENT_ID,
  type DialogusAgentLogger,
  type DialogusAgentModelId,
  MockQueryEmbedder,
  OpenAIQueryEmbedder,
  type QueryEmbedder,
} from '@dialogus/rag'
import { type DialogusEnv, loadConfig, loadEnvFromRoot } from '@dialogus/shared/config'
import { Mastra } from '@mastra/core'
import { PostgresStore } from '@mastra/pg'
import { type Logger, pino, stdSerializers } from 'pino'
import {
  DialogusChapterReadAdapter,
  DialogusChapterSummaryReadAdapter,
  DialogusChunkReadAdapter,
} from './persistence'
import { activateAnthropicMock } from './test-mocks/anthropic-msw'

const MASTRA_STORAGE_ID = 'dialogus-mastra-pg'
const MASTRA_LOGGER_NAME = '@dialogus/mastra'

export interface BuildMastraOptions {
  readonly env?: DialogusEnv
  readonly logger?: Logger
  readonly db?: Database
  readonly queryEmbedder?: QueryEmbedder
}

export interface BuildMastraResult {
  readonly mastra: Mastra
  readonly env: DialogusEnv
  readonly logger: Logger
}

export function createMastraLogger(level: string): Logger {
  return pino({
    level,
    name: MASTRA_LOGGER_NAME,
    serializers: { error: stdSerializers.err },
  })
}

export function pickModelId(env: DialogusEnv): DialogusAgentModelId {
  return env.NODE_ENV === 'production' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5'
}

function pickQueryEmbedder(env: DialogusEnv): QueryEmbedder {
  if (env.NODE_ENV === 'test') return new MockQueryEmbedder()
  return new OpenAIQueryEmbedder({ apiKey: env.OPENAI_API_KEY })
}

export function buildMastra(options: BuildMastraOptions = {}): BuildMastraResult {
  const env = options.env ?? loadConfig()
  const logger = options.logger ?? createMastraLogger(env.LOG_LEVEL)
  const db = options.db ?? createDatabase(env.DATABASE_URL)
  const queryEmbedder = options.queryEmbedder ?? pickQueryEmbedder(env)

  const chunkRepo = new DialogusChunkReadAdapter(db)
  const chapterRepo = new DialogusChapterReadAdapter(db)
  const chapterSummaryRepo = new DialogusChapterSummaryReadAdapter(db)

  const dialogusAgent = createDialogusAgent({
    chunkRepo,
    chapterRepo,
    chapterSummaryRepo,
    queryEmbedder,
    logger: logger as unknown as DialogusAgentLogger,
    modelId: pickModelId(env),
  })

  const storage = new PostgresStore({
    id: MASTRA_STORAGE_ID,
    connectionString: env.DATABASE_URL,
  })

  const mastra = new Mastra({
    storage,
    agents: { [DIALOGUS_AGENT_ID]: dialogusAgent },
  })

  return { mastra, env, logger }
}

loadEnvFromRoot()

if (process.env.E2E_MOCK_LLM === '1') {
  activateAnthropicMock()
}

const built = buildMastra()

export const mastra = built.mastra
