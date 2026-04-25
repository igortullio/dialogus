import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Column, SQL } from 'drizzle-orm'
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { books, chapters } from '../src/schema'

const here = dirname(fileURLToPath(import.meta.url))
const migrationPath = resolve(here, '..', 'drizzle', '0003_chapters_chunks.sql')
const migrationSql = readFileSync(migrationPath, 'utf8')

const dialect = new PgDialect()
const config = getTableConfig(chapters)
const columnsByName = new Map<string, Column>(config.columns.map((column) => [column.name, column]))

function getColumn(name: string): Column {
  const column = columnsByName.get(name)
  if (!column) {
    throw new Error(`Expected column ${name} on chapters table`)
  }
  return column
}

function renderSql(value: unknown): string {
  expect(value).toBeInstanceOf(SQL)
  return dialect.sqlToQuery(value as SQL).sql.trim()
}

describe('chapters table', () => {
  it('targets the chapters table', () => {
    expect(config.name).toBe('chapters')
  })

  it('defines all columns from the TechSpec data model', () => {
    expect([...columnsByName.keys()].sort()).toEqual(
      ['book_id', 'created_at', 'id', 'ordinal', 'plain_text', 'title', 'token_count'].sort(),
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

  it('marks book_id as a not-null UUID', () => {
    const bookId = getColumn('book_id')
    expect(bookId.columnType).toBe('PgUUID')
    expect(bookId.notNull).toBe(true)
    expect(bookId.hasDefault).toBe(false)
  })

  it.each([
    'ordinal',
    'token_count',
  ])('marks %s as a not-null integer without a default', (name) => {
    const column = getColumn(name)
    expect(column.columnType).toBe('PgInteger')
    expect(column.notNull).toBe(true)
    expect(column.hasDefault).toBe(false)
  })

  it.each(['title', 'plain_text'])('marks %s as not-null text without a default', (name) => {
    const column = getColumn(name)
    expect(column.columnType).toBe('PgText')
    expect(column.notNull).toBe(true)
    expect(column.hasDefault).toBe(false)
  })

  it('marks created_at as not-null timestamptz with now() default', () => {
    const createdAt = getColumn('created_at') as Column & { withTimezone?: boolean }
    expect(createdAt.columnType).toBe('PgTimestamp')
    expect(createdAt.notNull).toBe(true)
    expect(createdAt.hasDefault).toBe(true)
    expect(createdAt.withTimezone).toBe(true)
    expect(renderSql(createdAt.default)).toBe('now()')
  })

  it('declares the unique constraint on (book_id, ordinal)', () => {
    expect(config.uniqueConstraints).toHaveLength(1)
    const constraint = config.uniqueConstraints[0]
    if (!constraint) throw new Error('expected unique constraint on chapters')
    expect(constraint.name).toBe('chapters_book_id_ordinal_unique')
    expect(constraint.columns.map((c) => c.name)).toEqual(['book_id', 'ordinal'])
  })

  it('declares the natural-order index on (book_id, ordinal)', () => {
    const indexNames = config.indexes.map((idx) => idx.config.name)
    expect(indexNames).toContain('chapters_book_id_ordinal_idx')
    const idx = config.indexes.find((i) => i.config.name === 'chapters_book_id_ordinal_idx')
    if (!idx) throw new Error('expected chapters_book_id_ordinal_idx')
    expect(idx.config.where).toBeUndefined()
    expect(idx.config.columns.map((c) => (c as Column).name)).toEqual(['book_id', 'ordinal'])
  })

  it('declares the foreign key to books with ON DELETE CASCADE', () => {
    expect(config.foreignKeys).toHaveLength(1)
    const fk = config.foreignKeys[0]
    if (!fk) throw new Error('expected FK on chapters')
    expect(fk.onDelete).toBe('cascade')
    const ref = fk.reference()
    expect(ref.columns.map((c) => c.name)).toEqual(['book_id'])
    expect(ref.foreignColumns.map((c) => c.name)).toEqual(['id'])
    expect((ref.foreignTable as typeof books) === books).toBe(true)
  })

  it('declares no CHECK constraints', () => {
    expect(config.checks).toHaveLength(0)
  })
})

describe('@dialogus/db/schema barrel', () => {
  it('re-exports chapters', async () => {
    const mod = await import('@dialogus/db/schema')
    expect(mod.chapters).toBe(chapters)
  })
})

describe('drizzle/0003_chapters_chunks.sql migration — chapters', () => {
  it('creates the chapters table with all columns', () => {
    expect(migrationSql).toMatch(/CREATE TABLE "chapters"/)
    expect(migrationSql).toMatch(/"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4\(\) NOT NULL/)
    expect(migrationSql).toMatch(/"book_id" uuid NOT NULL/)
    expect(migrationSql).toMatch(/"ordinal" integer NOT NULL/)
    expect(migrationSql).toMatch(/"title" text NOT NULL/)
    expect(migrationSql).toMatch(/"plain_text" text NOT NULL/)
    expect(migrationSql).toMatch(/"token_count" integer NOT NULL/)
    expect(migrationSql).toMatch(/"created_at" timestamp with time zone DEFAULT now\(\) NOT NULL/)
  })

  it('emits the unique constraint on (book_id, ordinal)', () => {
    expect(migrationSql).toMatch(
      /CONSTRAINT "chapters_book_id_ordinal_unique" UNIQUE\("book_id","ordinal"\)/,
    )
  })

  it('emits the natural-order btree index on (book_id, ordinal)', () => {
    expect(migrationSql).toMatch(
      /CREATE INDEX "chapters_book_id_ordinal_idx" ON "chapters" USING btree \("book_id","ordinal"\)/,
    )
  })

  it('emits the FK to books with ON DELETE CASCADE', () => {
    expect(migrationSql).toMatch(
      /ALTER TABLE "chapters" ADD CONSTRAINT "chapters_book_id_books_id_fk" FOREIGN KEY \("book_id"\) REFERENCES "public"\."books"\("id"\) ON DELETE cascade/,
    )
  })
})
