import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Column, SQL } from 'drizzle-orm'
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { books, CHUNK_EMBEDDING_DIMENSIONS, chapters, chunks } from '../src/schema'

const here = dirname(fileURLToPath(import.meta.url))
const migrationPath = resolve(here, '..', 'drizzle', '0003_chapters_chunks.sql')
const migrationSql = readFileSync(migrationPath, 'utf8')

const dialect = new PgDialect()
const config = getTableConfig(chunks)
const columnsByName = new Map<string, Column>(config.columns.map((column) => [column.name, column]))

function getColumn(name: string): Column {
  const column = columnsByName.get(name)
  if (!column) {
    throw new Error(`Expected column ${name} on chunks table`)
  }
  return column
}

function renderSql(value: unknown): string {
  expect(value).toBeInstanceOf(SQL)
  return dialect.sqlToQuery(value as SQL).sql.trim()
}

describe('chunks table', () => {
  it('targets the chunks table', () => {
    expect(config.name).toBe('chunks')
  })

  it('exposes the embedding dimensions constant matching the TechSpec', () => {
    expect(CHUNK_EMBEDDING_DIMENSIONS).toBe(1536)
  })

  it('defines all columns from the TechSpec data model', () => {
    expect([...columnsByName.keys()].sort()).toEqual(
      [
        'book_id',
        'chapter_id',
        'created_at',
        'embedding',
        'end_char',
        'id',
        'ordinal',
        'start_char',
        'text',
        'token_count',
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

  it.each(['book_id', 'chapter_id'])('marks %s as a not-null UUID', (name) => {
    const column = getColumn(name)
    expect(column.columnType).toBe('PgUUID')
    expect(column.notNull).toBe(true)
    expect(column.hasDefault).toBe(false)
  })

  it.each([
    'ordinal',
    'token_count',
    'start_char',
    'end_char',
  ])('marks %s as a not-null integer without a default', (name) => {
    const column = getColumn(name)
    expect(column.columnType).toBe('PgInteger')
    expect(column.notNull).toBe(true)
    expect(column.hasDefault).toBe(false)
  })

  it('marks text as not-null text without a default', () => {
    const text = getColumn('text')
    expect(text.columnType).toBe('PgText')
    expect(text.notNull).toBe(true)
    expect(text.hasDefault).toBe(false)
  })

  it('marks embedding as a nullable vector(1536) column', () => {
    const embedding = getColumn('embedding') as Column & { dimensions?: number }
    expect(embedding.columnType).toBe('PgVector')
    expect(embedding.notNull).toBe(false)
    expect(embedding.hasDefault).toBe(false)
    expect(embedding.dimensions).toBe(CHUNK_EMBEDDING_DIMENSIONS)
  })

  it('marks created_at as a not-null timestamptz with now() default', () => {
    const createdAt = getColumn('created_at') as Column & { withTimezone?: boolean }
    expect(createdAt.columnType).toBe('PgTimestamp')
    expect(createdAt.notNull).toBe(true)
    expect(createdAt.hasDefault).toBe(true)
    expect(createdAt.withTimezone).toBe(true)
    expect(renderSql(createdAt.default)).toBe('now()')
  })

  it('declares the unique constraint on (book_id, chapter_id, ordinal)', () => {
    expect(config.uniqueConstraints).toHaveLength(1)
    const constraint = config.uniqueConstraints[0]
    if (!constraint) throw new Error('expected unique constraint on chunks')
    expect(constraint.name).toBe('chunks_book_id_chapter_id_ordinal_unique')
    expect(constraint.columns.map((c) => c.name)).toEqual(['book_id', 'chapter_id', 'ordinal'])
  })

  it('declares the partial index on book_id WHERE embedding IS NULL', () => {
    const idx = config.indexes.find((i) => i.config.name === 'chunks_book_id_pending_embedding_idx')
    if (!idx) throw new Error('expected chunks_book_id_pending_embedding_idx')
    expect(idx.config.where).toBeInstanceOf(SQL)
    expect(renderSql(idx.config.where)).toContain('"embedding" IS NULL')
    expect(idx.config.columns.map((c) => (c as Column).name)).toEqual(['book_id'])
  })

  it('declares the chapter-scoped retrieval index on chapter_id', () => {
    const idx = config.indexes.find((i) => i.config.name === 'chunks_chapter_id_idx')
    if (!idx) throw new Error('expected chunks_chapter_id_idx')
    expect(idx.config.where).toBeUndefined()
    expect(idx.config.columns.map((c) => (c as Column).name)).toEqual(['chapter_id'])
  })

  it('declares the foreign keys to books and chapters with ON DELETE CASCADE', () => {
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
    const bookFk = fks.find((fk) => fk.column === 'book_id')
    const chapterFk = fks.find((fk) => fk.column === 'chapter_id')
    if (!bookFk || !chapterFk) throw new Error('expected both FKs on chunks')
    expect(bookFk.onDelete).toBe('cascade')
    expect(bookFk.foreignTable === books).toBe(true)
    expect(bookFk.foreignColumn).toBe('id')
    expect(chapterFk.onDelete).toBe('cascade')
    expect(chapterFk.foreignTable === chapters).toBe(true)
    expect(chapterFk.foreignColumn).toBe('id')
  })

  it('declares no CHECK constraints', () => {
    expect(config.checks).toHaveLength(0)
  })
})

describe('@dialogus/db/schema barrel', () => {
  it('re-exports chunks and the embedding-dimensions constant', async () => {
    const mod = await import('@dialogus/db/schema')
    expect(mod.chunks).toBe(chunks)
    expect(mod.CHUNK_EMBEDDING_DIMENSIONS).toBe(CHUNK_EMBEDDING_DIMENSIONS)
  })
})

describe('drizzle/0003_chapters_chunks.sql migration — chunks', () => {
  it('creates the chunks table with all columns including vector(1536)', () => {
    expect(migrationSql).toMatch(/CREATE TABLE "chunks"/)
    expect(migrationSql).toMatch(/"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4\(\) NOT NULL/)
    expect(migrationSql).toMatch(/"book_id" uuid NOT NULL/)
    expect(migrationSql).toMatch(/"chapter_id" uuid NOT NULL/)
    expect(migrationSql).toMatch(/"ordinal" integer NOT NULL/)
    expect(migrationSql).toMatch(/"text" text NOT NULL/)
    expect(migrationSql).toMatch(/"token_count" integer NOT NULL/)
    expect(migrationSql).toMatch(/"start_char" integer NOT NULL/)
    expect(migrationSql).toMatch(/"end_char" integer NOT NULL/)
    expect(migrationSql).toMatch(/"embedding" vector\(1536\)/)
    expect(migrationSql).toMatch(/"created_at" timestamp with time zone DEFAULT now\(\) NOT NULL/)
  })

  it('emits the unique constraint on (book_id, chapter_id, ordinal)', () => {
    expect(migrationSql).toMatch(
      /CONSTRAINT "chunks_book_id_chapter_id_ordinal_unique" UNIQUE\("book_id","chapter_id","ordinal"\)/,
    )
  })

  it('emits the partial embed-stage index with WHERE embedding IS NULL', () => {
    expect(migrationSql).toMatch(
      /CREATE INDEX "chunks_book_id_pending_embedding_idx" ON "chunks" USING btree \("book_id"\) WHERE "chunks"\."embedding" IS NULL/,
    )
  })

  it('emits the chapter-scoped retrieval index', () => {
    expect(migrationSql).toMatch(
      /CREATE INDEX "chunks_chapter_id_idx" ON "chunks" USING btree \("chapter_id"\)/,
    )
  })

  it('emits the FKs to books and chapters with ON DELETE CASCADE', () => {
    expect(migrationSql).toMatch(
      /ALTER TABLE "chunks" ADD CONSTRAINT "chunks_book_id_books_id_fk" FOREIGN KEY \("book_id"\) REFERENCES "public"\."books"\("id"\) ON DELETE cascade/,
    )
    expect(migrationSql).toMatch(
      /ALTER TABLE "chunks" ADD CONSTRAINT "chunks_chapter_id_chapters_id_fk" FOREIGN KEY \("chapter_id"\) REFERENCES "public"\."chapters"\("id"\) ON DELETE cascade/,
    )
  })

  it('appends the hand-edited HNSW index immediately after the chunks CREATE TABLE', () => {
    const tableIdx = migrationSql.indexOf('CREATE TABLE "chunks"')
    const hnswIdx = migrationSql.indexOf('chunks_embedding_hnsw_idx')
    const partialIdx = migrationSql.indexOf('chunks_book_id_pending_embedding_idx')
    expect(tableIdx).toBeGreaterThan(-1)
    expect(hnswIdx).toBeGreaterThan(tableIdx)
    expect(hnswIdx).toBeLessThan(partialIdx)
    expect(migrationSql).toMatch(
      /CREATE INDEX "chunks_embedding_hnsw_idx" ON "chunks" USING hnsw \("embedding" vector_cosine_ops\) WITH \(m = 16, ef_construction = 64\);/,
    )
  })
})

describe('drizzle/0003_chapters_chunks.sql migration — books extension', () => {
  it('adds the four ingestion lifecycle columns to books', () => {
    expect(migrationSql).toMatch(
      /ALTER TABLE "books" ADD COLUMN "ingestion_progress" integer DEFAULT 0 NOT NULL/,
    )
    expect(migrationSql).toMatch(/ALTER TABLE "books" ADD COLUMN "ingestion_last_stage" text/)
    expect(migrationSql).toMatch(
      /ALTER TABLE "books" ADD COLUMN "ingestion_started_at" timestamp with time zone/,
    )
    expect(migrationSql).toMatch(
      /ALTER TABLE "books" ADD COLUMN "indexed_at" timestamp with time zone/,
    )
  })

  it('declares the ingestion_progress CHECK constraint between 0 and 100', () => {
    expect(migrationSql).toMatch(
      /ALTER TABLE "books" ADD CONSTRAINT "books_ingestion_progress_check" CHECK \("books"\."ingestion_progress" BETWEEN 0 AND 100\)/,
    )
  })
})

describe('drizzle/meta/_journal.json — 0003_chapters_chunks', () => {
  it('registers the renamed migration tag', () => {
    const journalPath = resolve(here, '..', 'drizzle', 'meta', '_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: Array<{ idx: number; tag: string }>
    }
    const entry = journal.entries.find((e) => e.idx === 3)
    expect(entry).toBeDefined()
    expect(entry?.tag).toBe('0003_chapters_chunks')
  })
})
