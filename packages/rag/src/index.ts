export {
  chunkWithContextSchema,
  SEMANTIC_SEARCH_DEFAULT_K,
  SEMANTIC_SEARCH_EXCERPT_PREVIEW_MAX_LENGTH,
  SEMANTIC_SEARCH_MAX_K,
  SEMANTIC_SEARCH_TOOL_DESCRIPTION,
  SEMANTIC_SEARCH_TOOL_ID,
  type SemanticSearchChunk,
  type SemanticSearchInput,
  type SemanticSearchLogger,
  type SemanticSearchOutput,
  type SemanticSearchToolDeps,
  semanticSearchInputSchema,
  semanticSearchOutputSchema,
  semanticSearchTool,
} from './application/tools/semanticSearch'
export { CITATION_MARKER_REGEX } from './domain/constants/citation'
export type { ChapterSummaryView } from './domain/entities/ChapterSummaryView'
export type { ChapterView } from './domain/entities/ChapterView'
export type { ChunkWithContext } from './domain/entities/ChunkWithContext'
export {
  EmbeddingFailedError,
  type RagErrorOptions,
  SummaryNotFoundError,
} from './domain/errors/RagError'
export type { ChapterReadRepository } from './domain/ports/ChapterReadRepository.port'
export type { ChapterSummaryReadRepository } from './domain/ports/ChapterSummaryReadRepository.port'
export type {
  ChunkReadRepository,
  FindCharacterMentionsParams,
  SearchSemanticParams,
} from './domain/ports/ChunkReadRepository.port'
export type { QueryEmbedder } from './domain/ports/QueryEmbedder.port'
export { MockQueryEmbedder } from './infrastructure/embedding/MockQueryEmbedder'
export {
  OPENAI_QUERY_EMBEDDING_DIMENSIONS,
  OPENAI_QUERY_EMBEDDING_MODEL,
  OpenAIQueryEmbedder,
  type OpenAIQueryEmbedderOptions,
} from './infrastructure/embedding/OpenAIQueryEmbedder'
