import type { Database } from '@dialogus/db'
import type {
  ChunkReadRepository,
  ChunkWithContext,
  FindCharacterMentionsParams,
  SearchSemanticParams,
} from '@dialogus/rag'

const NOT_IMPLEMENTED_PREFIX = 'DialogusChunkReadAdapter'
const PENDING_REASON = 'is awaiting Feature 002 amendment SQL implementation'

function notImplemented(method: string): Error {
  return new Error(`${NOT_IMPLEMENTED_PREFIX}.${method} ${PENDING_REASON}`)
}

export class DialogusChunkReadAdapter implements ChunkReadRepository {
  // Database is captured for the SQL implementation that lands with the
  // Feature 002 amendment (searchSemantic + findCharacterMentions). The smoke
  // boot wiring constructs the adapter without exercising it.
  constructor(_db: Database) {}

  async searchSemantic(_params: SearchSemanticParams): Promise<ChunkWithContext[]> {
    throw notImplemented('searchSemantic')
  }

  async findById(_id: string): Promise<ChunkWithContext | null> {
    throw notImplemented('findById')
  }

  async findCharacterMentions(_params: FindCharacterMentionsParams): Promise<ChunkWithContext[]> {
    throw notImplemented('findCharacterMentions')
  }
}
