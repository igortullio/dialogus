import type { ChunkWithContext } from '../entities/ChunkWithContext'

export interface SearchSemanticParams {
  readonly bookIds: readonly string[]
  readonly queryEmbedding: readonly number[]
  readonly spoilerCaps?: Readonly<Record<string, number>>
  readonly k: number
}

export interface FindCharacterMentionsParams {
  readonly bookIds: readonly string[]
  readonly aliases: readonly string[]
  readonly spoilerCaps?: Readonly<Record<string, number>>
  readonly limit: number
}

export interface ChunkReadRepository {
  searchSemantic(params: SearchSemanticParams): Promise<ChunkWithContext[]>
  findById(id: string): Promise<ChunkWithContext | null>
  findCharacterMentions(params: FindCharacterMentionsParams): Promise<ChunkWithContext[]>
}
