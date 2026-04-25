import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Column, SQL } from 'drizzle-orm'
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { books, INGESTION_STATUS_VALUES } from '../src/schema'

const here = dirname(fileURLToPath(import.meta.url))
const migrationPath = resolve(here, '..', 'drizzle', '0001_books.sql')
const migrationSql = readFileSync(migrationPath, 'utf8')

const dialect = new PgDialect()
const config = getTableConfig(books)
const columnsByName = new Map<string, Column>(config.columns.map((column) => [column.name, column]))

function getColumn(name: string): Column {
  const column = columnsByName.get(name)
  if (!column) {
    throw new Error(`Expected column ${name} on books table`)
  }
  return column
}

function renderSql(value: unknown): string {
  expect(value).toBeInstanceOf(SQL)
  return dialect.sqlToQuery(value as SQL).sql.trim()
}

describe('books table', () => {
  it('targets the books table', () => {
    expect(config.name).toBe('books')
  })

  it('defines all columns from the TechSpec data model', () => {
    expect([...columnsByName.keys()].sort()).toEqual(
      [
        'authors',
        'cover_url',
        'created_at',
        'deleted_at',
        'download_url_epub',
        'download_url_txt',
        'gutendex_id',
        'id',
        'ingestion_error',
        'ingestion_status',
        'languages',
        'raw_hash',
        'subjects',
        'tags',
        'title',
        'updated_at',
      ].sort(),
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

  it('marks gutendex_id as a not-null integer with a unique constraint', () => {
    const gutendexId = getColumn('gutendex_id')
    expect(gutendexId.columnType).toBe('PgInteger')
    expect(gutendexId.notNull).toBe(true)
    expect(gutendexId.isUnique).toBe(true)
  })

  it('marks title as not-null text', () => {
    const title = getColumn('title')
    expect(title.columnType).toBe('PgText')
    expect(title.notNull).toBe(true)
  })

  it('marks authors as not-null jsonb without a default', () => {
    const authors = getColumn('authors')
    expect(authors.columnType).toBe('PgJsonb')
    expect(authors.notNull).toBe(true)
    expect(authors.hasDefault).toBe(false)
  })

  it('marks languages as a not-null text array without a default', () => {
    const languages = getColumn('languages')
    expect(languages.columnType).toBe('PgArray')
    expect(languages.notNull).toBe(true)
    expect(languages.hasDefault).toBe(false)
  })

  it("marks subjects as a not-null text array defaulting to '{}'", () => {
    const subjects = getColumn('subjects')
    expect(subjects.columnType).toBe('PgArray')
    expect(subjects.notNull).toBe(true)
    expect(subjects.hasDefault).toBe(true)
    expect(renderSql(subjects.default)).toBe("'{}'")
  })

  it.each([
    'download_url_epub',
    'download_url_txt',
    'cover_url',
    'raw_hash',
    'ingestion_error',
  ])('marks %s as nullable text without a default', (name) => {
    const column = getColumn(name)
    expect(column.columnType).toBe('PgText')
    expect(column.notNull).toBe(false)
    expect(column.hasDefault).toBe(false)
  })

  it("marks ingestion_status as not-null text defaulting to 'discovered'", () => {
    const status = getColumn('ingestion_status')
    expect(status.columnType).toBe('PgText')
    expect(status.notNull).toBe(true)
    expect(status.hasDefault).toBe(true)
    expect(status.default).toBe('discovered')
  })

  it('exposes the IngestionStatus enum values on the ingestion_status column', () => {
    const status = getColumn('ingestion_status') as Column & { enumValues?: readonly string[] }
    expect(status.enumValues).toEqual([
      'discovered',
      'downloading',
      'parsing',
      'chunking',
      'embedding',
      'ready',
      'failed',
    ])
  })

  it('marks tags as not-null jsonb defaulting to []', () => {
    const tags = getColumn('tags')
    expect(tags.columnType).toBe('PgJsonb')
    expect(tags.notNull).toBe(true)
    expect(tags.hasDefault).toBe(true)
    expect(renderSql(tags.default)).toBe("'[]'::jsonb")
  })

  it.each([
    'created_at',
    'updated_at',
  ])('%s is a not-null timestamptz with now() default', (name) => {
    const column = getColumn(name) as Column & { withTimezone?: boolean }
    expect(column.columnType).toBe('PgTimestamp')
    expect(column.notNull).toBe(true)
    expect(column.hasDefault).toBe(true)
    expect(column.withTimezone).toBe(true)
    expect(renderSql(column.default)).toBe('now()')
  })

  it('marks deleted_at as a nullable timestamptz', () => {
    const deletedAt = getColumn('deleted_at') as Column & { withTimezone?: boolean }
    expect(deletedAt.columnType).toBe('PgTimestamp')
    expect(deletedAt.notNull).toBe(false)
    expect(deletedAt.hasDefault).toBe(false)
    expect(deletedAt.withTimezone).toBe(true)
  })

  it('declares both partial indexes scoped to active rows', () => {
    const indexNames = config.indexes.map((idx) => idx.config.name)
    expect(indexNames).toEqual(
      expect.arrayContaining([
        'books_created_at_id_active_idx',
        'books_ingestion_status_active_idx',
      ]),
    )

    for (const idx of config.indexes) {
      expect(idx.config.where, `${idx.config.name} must be partial`).toBeInstanceOf(SQL)
      expect(renderSql(idx.config.where)).toContain('"deleted_at" IS NULL')
    }
  })

  it('declares the ingestion_status CHECK constraint via the table config', () => {
    expect(config.checks).toHaveLength(1)
    const constraint = config.checks[0]
    if (!constraint) throw new Error('expected CHECK constraint on books')
    expect(constraint.name).toBe('books_ingestion_status_check')
    expect(renderSql(constraint.value)).toContain(`'discovered'`)
    expect(renderSql(constraint.value)).toContain(`'failed'`)
  })
})

describe('@dialogus/db/schema barrel', () => {
  it('re-exports books and the IngestionStatus enum values', async () => {
    const mod = await import('@dialogus/db/schema')
    expect(mod.books).toBe(books)
    expect(mod.INGESTION_STATUS_VALUES).toBe(INGESTION_STATUS_VALUES)
  })
})

describe('drizzle/0001_books.sql migration', () => {
  it('creates both partial indexes with WHERE deleted_at IS NULL', () => {
    expect(migrationSql).toMatch(
      /CREATE INDEX "books_created_at_id_active_idx".*WHERE.*"deleted_at" IS NULL/s,
    )
    expect(migrationSql).toMatch(
      /CREATE INDEX "books_ingestion_status_active_idx".*WHERE.*"deleted_at" IS NULL/s,
    )
  })

  it('orders the cursor index by (created_at DESC, id DESC)', () => {
    expect(migrationSql).toMatch(/"books_created_at_id_active_idx".*"created_at" DESC.*"id" DESC/s)
  })

  it('emits the CHECK constraint listing every IngestionStatus enum value', () => {
    expect(migrationSql).toMatch(/CONSTRAINT "books_ingestion_status_check"/)
    for (const value of INGESTION_STATUS_VALUES) {
      expect(migrationSql).toContain(`'${value}'`)
    }
  })

  it('declares gutendex_id as UNIQUE', () => {
    expect(migrationSql).toMatch(/CONSTRAINT "books_gutendex_id_unique" UNIQUE\("gutendex_id"\)/)
  })

  it('declares ingestion_status default as discovered and tags default as []', () => {
    expect(migrationSql).toMatch(/"ingestion_status" text DEFAULT 'discovered' NOT NULL/)
    expect(migrationSql).toMatch(/"tags" jsonb DEFAULT '\[\]'::jsonb NOT NULL/)
  })
})
