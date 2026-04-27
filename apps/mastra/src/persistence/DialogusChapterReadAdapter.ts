import type { Database } from '@dialogus/db'
import { schema } from '@dialogus/db'
import type { ChapterReadRepository, ChapterView } from '@dialogus/rag'
import { asc, eq } from 'drizzle-orm'

const { chapters } = schema

interface ChapterRow {
  readonly id: string
  readonly bookId: string
  readonly ordinal: number
  readonly title: string
  readonly tokenCount: number
}

const SELECT_COLUMNS = {
  id: chapters.id,
  bookId: chapters.bookId,
  ordinal: chapters.ordinal,
  title: chapters.title,
  tokenCount: chapters.tokenCount,
} as const

function rowToView(row: ChapterRow): ChapterView {
  return {
    id: row.id,
    bookId: row.bookId,
    ordinal: row.ordinal,
    title: row.title,
    tokenCount: row.tokenCount,
  }
}

export class DialogusChapterReadAdapter implements ChapterReadRepository {
  constructor(private readonly db: Database) {}

  async listByBook(bookId: string): Promise<ChapterView[]> {
    const rows = (await this.db
      .select(SELECT_COLUMNS)
      .from(chapters)
      .where(eq(chapters.bookId, bookId))
      .orderBy(asc(chapters.ordinal))) as ChapterRow[]
    return rows.map(rowToView)
  }

  async findById(id: string): Promise<ChapterView | null> {
    const [row] = (await this.db
      .select(SELECT_COLUMNS)
      .from(chapters)
      .where(eq(chapters.id, id))
      .limit(1)) as ChapterRow[]
    return row ? rowToView(row) : null
  }
}
