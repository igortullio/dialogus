import { createDatabase, type Database } from '@dialogus/db'
import {
  createDialogusAgent,
  DIALOGUS_AGENT_ID,
  type DialogusAgentLogger,
  type DialogusAgentProvider,
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

export interface AgentModelChoice {
  readonly provider: DialogusAgentProvider
  readonly modelId: string
}

const ANTHROPIC_MODEL_PREFIXES = ['claude-']
const OPENAI_MODEL_PREFIXES = ['gpt-', 'o1-', 'o3-', 'o4-']

function inferProvider(modelId: string): DialogusAgentProvider | null {
  if (ANTHROPIC_MODEL_PREFIXES.some((prefix) => modelId.startsWith(prefix))) return 'anthropic'
  if (OPENAI_MODEL_PREFIXES.some((prefix) => modelId.startsWith(prefix))) return 'openai'
  return null
}

export function pickAgentModel(env: DialogusEnv): AgentModelChoice {
  // Two env vars control the agent model:
  //   - DIALOGUS_AGENT_PROVIDER: 'anthropic' | 'openai'
  //   - DIALOGUS_AGENT_MODEL: explicit model id (provider is inferred from
  //     the prefix, e.g. 'gpt-' → openai, 'claude-' → anthropic)
  // If both are set, DIALOGUS_AGENT_MODEL wins and the provider is derived.
  // Defaults: dev → openai/gpt-4o-mini (cheap, generous tier 1 limits),
  // prod → anthropic/claude-sonnet-4-6.
  const explicitModel = process.env.DIALOGUS_AGENT_MODEL?.trim()
  if (explicitModel && explicitModel.length > 0) {
    const inferred = inferProvider(explicitModel)
    if (inferred !== null) return { provider: inferred, modelId: explicitModel }
  }
  const explicitProvider = process.env.DIALOGUS_AGENT_PROVIDER?.trim().toLowerCase()
  if (explicitProvider === 'openai') return { provider: 'openai', modelId: 'gpt-4o-mini' }
  if (explicitProvider === 'anthropic') {
    return { provider: 'anthropic', modelId: 'claude-haiku-4-5' }
  }
  if (env.NODE_ENV === 'production') {
    return { provider: 'anthropic', modelId: 'claude-sonnet-4-6' }
  }
  return { provider: 'openai', modelId: 'gpt-4o-mini' }
}

function pickQueryEmbedder(env: DialogusEnv): QueryEmbedder {
  if (env.NODE_ENV === 'test' || process.env.EMBEDDING_PROVIDER === 'mock')
    return new MockQueryEmbedder()
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

  const storage = new PostgresStore({
    id: MASTRA_STORAGE_ID,
    connectionString: env.DATABASE_URL,
  })

  const agentModel = pickAgentModel(env)
  const dialogusAgent = createDialogusAgent({
    chunkRepo,
    chapterRepo,
    chapterSummaryRepo,
    queryEmbedder,
    logger: logger as unknown as DialogusAgentLogger,
    modelProvider: agentModel.provider,
    modelId: agentModel.modelId,
    memoryStorage: storage,
  })
  logger.info(
    { provider: agentModel.provider, modelId: agentModel.modelId },
    'agent model selected',
  )

  const mastra = new Mastra({
    storage,
    agents: { [DIALOGUS_AGENT_ID]: dialogusAgent },
    server: { port: env.MASTRA_PORT },
  })

  return { mastra, env, logger }
}

loadEnvFromRoot()

if (process.env.E2E_MOCK_LLM === '1') {
  activateAnthropicMock()
}

const built = buildMastra()

export const mastra = built.mastra
