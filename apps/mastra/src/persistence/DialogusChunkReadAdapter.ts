import type { Database } from '@dialogus/db'
import { schema } from '@dialogus/db'
import type {
  ChunkReadRepository,
  ChunkWithContext,
  FindCharacterMentionsParams,
  SearchSemanticParams,
} from '@dialogus/rag'
import { sql } from 'drizzle-orm'

const { chapters, chunks } = schema

const EXCERPT_PREVIEW_MAX_LENGTH = 200

interface ChunkRow {
  readonly chunkId: string
  readonly bookId: string
  readonly chapterId: string
  readonly chapterOrdinal: number
  readonly chapterTitle: string
  readonly text: string
  readonly score: number
}

function toExcerptPreview(text: string): string {
  return text.slice(0, EXCERPT_PREVIEW_MAX_LENGTH)
}

function toChunkWithContext(row: ChunkRow): ChunkWithContext {
  return {
    chunkId: row.chunkId,
    bookId: row.bookId,
    chapterId: row.chapterId,
    chapterOrdinal: row.chapterOrdinal,
    chapterTitle: row.chapterTitle,
    text: row.text,
    excerptPreview: toExcerptPreview(row.text),
    score: Number(row.score),
  }
}

function spoilerCapClause(spoilerCaps?: Readonly<Record<string, number>>) {
  if (!spoilerCaps || Object.keys(spoilerCaps).length === 0) return sql`true`
  const entries = Object.entries(spoilerCaps)
  const checks = entries.map(
    ([bookId, ordinal]) =>
      sql`(${chunks.bookId} = ${bookId}::uuid AND ${chapters.ordinal} > ${ordinal})`,
  )
  const anyOver = sql.join(checks, sql` OR `)
  return sql`NOT (${anyOver})`
}

export class DialogusChunkReadAdapter implements ChunkReadRepository {
  constructor(private readonly db: Database) {}

  async searchSemantic(params: SearchSemanticParams): Promise<ChunkWithContext[]> {
    const bookIds = [...params.bookIds]
    if (bookIds.length === 0) return []
    const embeddingLiteral = `[${[...params.queryEmbedding].join(',')}]`
    const rows = (await this.db.execute(sql`
      SELECT
        ${chunks.id} AS "chunkId",
        ${chunks.bookId} AS "bookId",
        ${chunks.chapterId} AS "chapterId",
        ${chapters.ordinal} AS "chapterOrdinal",
        ${chapters.title} AS "chapterTitle",
        ${chunks.text} AS "text",
        (1 - (${chunks.embedding} <=> ${embeddingLiteral}::vector))::float AS "score"
      FROM ${chunks}
      INNER JOIN ${chapters} ON ${chapters.id} = ${chunks.chapterId}
      WHERE ${chunks.bookId} = ANY(${sql`ARRAY[${sql.join(
        bookIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}]`})
        AND ${chunks.embedding} IS NOT NULL
        AND ${spoilerCapClause(params.spoilerCaps)}
      ORDER BY ${chunks.embedding} <=> ${embeddingLiteral}::vector
      LIMIT ${params.k}
    `)) as unknown as ChunkRow[]
    return rows.map(toChunkWithContext)
  }

  async findById(id: string): Promise<ChunkWithContext | null> {
    const rows = (await this.db.execute(sql`
      SELECT
        ${chunks.id} AS "chunkId",
        ${chunks.bookId} AS "bookId",
        ${chunks.chapterId} AS "chapterId",
        ${chapters.ordinal} AS "chapterOrdinal",
        ${chapters.title} AS "chapterTitle",
        ${chunks.text} AS "text",
        0::float AS "score"
      FROM ${chunks}
      INNER JOIN ${chapters} ON ${chapters.id} = ${chunks.chapterId}
      WHERE ${chunks.id} = ${id}::uuid
      LIMIT 1
    `)) as unknown as ChunkRow[]
    const row = rows[0]
    return row ? toChunkWithContext(row) : null
  }

  async findCharacterMentions(params: FindCharacterMentionsParams): Promise<ChunkWithContext[]> {
    const bookIds = [...params.bookIds]
    const aliases = [...params.aliases]
    if (bookIds.length === 0 || aliases.length === 0) return []
    const aliasChecks = aliases.map(
      (alias) => sql`unaccent(${chunks.text}) ILIKE unaccent(${`%${alias}%`})`,
    )
    const aliasMatch = sql.join(aliasChecks, sql` OR `)
    const rows = (await this.db.execute(sql`
      SELECT
        ${chunks.id} AS "chunkId",
        ${chunks.bookId} AS "bookId",
        ${chunks.chapterId} AS "chapterId",
        ${chapters.ordinal} AS "chapterOrdinal",
        ${chapters.title} AS "chapterTitle",
        ${chunks.text} AS "text",
        0::float AS "score"
      FROM ${chunks}
      INNER JOIN ${chapters} ON ${chapters.id} = ${chunks.chapterId}
      WHERE ${chunks.bookId} = ANY(${sql`ARRAY[${sql.join(
        bookIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}]`})
        AND ${spoilerCapClause(params.spoilerCaps)}
        AND (${aliasMatch})
      ORDER BY ${chapters.ordinal} ASC, ${chunks.ordinal} ASC
      LIMIT ${params.limit}
    `)) as unknown as ChunkRow[]
    return rows.map(toChunkWithContext)
  }
}
