import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const migrationPath = resolve(here, '..', '..', 'drizzle', '0005_chapter_summaries.sql')
const migrationSql = readFileSync(migrationPath, 'utf8')

describe('drizzle/0005_chapter_summaries.sql migration', () => {
  it('creates the chapter_summaries table with all columns', () => {
    expect(migrationSql).toMatch(/CREATE TABLE "chapter_summaries"/)
    expect(migrationSql).toMatch(/"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4\(\) NOT NULL/)
    expect(migrationSql).toMatch(/"chapter_id" uuid NOT NULL/)
    expect(migrationSql).toMatch(/"book_id" uuid NOT NULL/)
    expect(migrationSql).toMatch(/"summary" text NOT NULL/)
    expect(migrationSql).toMatch(/"token_count" integer NOT NULL/)
    expect(migrationSql).toMatch(/"model" text NOT NULL/)
    expect(migrationSql).toMatch(/"generated_at" timestamp with time zone DEFAULT now\(\) NOT NULL/)
  })

  it('emits the unique constraint on chapter_id to enforce 1:1', () => {
    expect(migrationSql).toMatch(
      /CONSTRAINT "chapter_summaries_chapter_id_unique" UNIQUE\("chapter_id"\)/,
    )
  })

  it('emits the FK to chapters with ON DELETE CASCADE', () => {
    expect(migrationSql).toMatch(
      /ALTER TABLE "chapter_summaries" ADD CONSTRAINT "chapter_summaries_chapter_id_chapters_id_fk" FOREIGN KEY \("chapter_id"\) REFERENCES "public"\."chapters"\("id"\) ON DELETE cascade/,
    )
  })

  it('emits the FK to books with ON DELETE CASCADE', () => {
    expect(migrationSql).toMatch(
      /ALTER TABLE "chapter_summaries" ADD CONSTRAINT "chapter_summaries_book_id_books_id_fk" FOREIGN KEY \("book_id"\) REFERENCES "public"\."books"\("id"\) ON DELETE cascade/,
    )
  })

  it('emits the book-scoped sweep index', () => {
    expect(migrationSql).toMatch(
      /CREATE INDEX "chapter_summaries_book_id_idx" ON "chapter_summaries" USING btree \("book_id"\)/,
    )
  })
})

describe('drizzle/meta/_journal.json — 0005_chapter_summaries', () => {
  it('registers the renamed migration tag', () => {
    const journalPath = resolve(here, '..', '..', 'drizzle', 'meta', '_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: Array<{ idx: number; tag: string }>
    }
    const entry = journal.entries.find((e) => e.idx === 5)
    expect(entry).toBeDefined()
    expect(entry?.tag).toBe('0005_chapter_summaries')
  })
})
