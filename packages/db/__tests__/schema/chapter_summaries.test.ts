import { type Column, SQL } from 'drizzle-orm'
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { books, chapterSummaries, chapters } from '../../src/schema'

const dialect = new PgDialect()
const config = getTableConfig(chapterSummaries)
const columnsByName = new Map<string, Column>(config.columns.map((column) => [column.name, column]))

function getColumn(name: string): Column {
  const column = columnsByName.get(name)
  if (!column) {
    throw new Error(`Expected column ${name} on chapter_summaries table`)
  }
  return column
}

function renderSql(value: unknown): string {
  expect(value).toBeInstanceOf(SQL)
  return dialect.sqlToQuery(value as SQL).sql.trim()
}

describe('chapter_summaries table', () => {
  it('targets the chapter_summaries table', () => {
    expect(config.name).toBe('chapter_summaries')
  })

  it('defines all columns from the Feature 003 ADR-005 shape', () => {
    expect([...columnsByName.keys()].sort()).toEqual(
      ['book_id', 'chapter_id', 'generated_at', 'id', 'model', 'summary', 'token_count'].sort(),
    )
  })

  it('marks id as a UUID primary key with uuid_generate_v4() default', () => {
    const id = getColumn('id')
    expect(id.columnType).toBe('PgUUID')
    expect(id.primary).toBe(true)
    expect(id.notNull).toBe(true)
    expect(id.hasDefault).toBe(true)
    expect(renderSql(id.default)).toBe('uuid_generate_v4()')
  })

  it.each(['chapter_id', 'book_id'])('marks %s as a not-null UUID', (name) => {
    const column = getColumn(name)
    expect(column.columnType).toBe('PgUUID')
    expect(column.notNull).toBe(true)
    expect(column.hasDefault).toBe(false)
  })

  it('marks chapter_id as unique to enforce 1:1 with chapters', () => {
    const chapterId = getColumn('chapter_id') as Column & { isUnique?: boolean }
    expect(chapterId.isUnique).toBe(true)
  })

  it.each(['summary', 'model'])('marks %s as not-null text without a default', (name) => {
    const column = getColumn(name)
    expect(column.columnType).toBe('PgText')
    expect(column.notNull).toBe(true)
    expect(column.hasDefault).toBe(false)
  })

  it('marks token_count as a not-null integer without a default', () => {
    const column = getColumn('token_count')
    expect(column.columnType).toBe('PgInteger')
    expect(column.notNull).toBe(true)
    expect(column.hasDefault).toBe(false)
  })

  it('marks generated_at as not-null timestamptz with now() default', () => {
    const generatedAt = getColumn('generated_at') as Column & { withTimezone?: boolean }
    expect(generatedAt.columnType).toBe('PgTimestamp')
    expect(generatedAt.notNull).toBe(true)
    expect(generatedAt.hasDefault).toBe(true)
    expect(generatedAt.withTimezone).toBe(true)
    expect(renderSql(generatedAt.default)).toBe('now()')
  })

  it('declares the foreign keys to chapters and books with ON DELETE CASCADE', () => {
    expect(config.foreignKeys).toHaveLength(2)
    const fks = config.foreignKeys.map((fk) => {
      const ref = fk.reference()
      return {
        onDelete: fk.onDelete,
        column: ref.columns[0]?.name,
        foreignTable: ref.foreignTable,
        foreignColumn: ref.foreignColumns[0]?.name,
      }
    })
    const chapterFk = fks.find((fk) => fk.column === 'chapter_id')
    const bookFk = fks.find((fk) => fk.column === 'book_id')
    if (!chapterFk || !bookFk) {
      throw new Error('expected both FKs on chapter_summaries')
    }
    expect(chapterFk.onDelete).toBe('cascade')
    expect(chapterFk.foreignTable === chapters).toBe(true)
    expect(chapterFk.foreignColumn).toBe('id')
    expect(bookFk.onDelete).toBe('cascade')
    expect(bookFk.foreignTable === books).toBe(true)
    expect(bookFk.foreignColumn).toBe('id')
  })

  it('declares the book-scoped sweep index on book_id', () => {
    const idx = config.indexes.find((i) => i.config.name === 'chapter_summaries_book_id_idx')
    if (!idx) throw new Error('expected chapter_summaries_book_id_idx')
    expect(idx.config.where).toBeUndefined()
    expect(idx.config.columns.map((c) => (c as Column).name)).toEqual(['book_id'])
  })

  it('declares no CHECK constraints', () => {
    expect(config.checks).toHaveLength(0)
  })
})

describe('@dialogus/db/schema barrel', () => {
  it('re-exports chapterSummaries', async () => {
    const mod = await import('@dialogus/db/schema')
    expect(mod.chapterSummaries).toBe(chapterSummaries)
  })
})
