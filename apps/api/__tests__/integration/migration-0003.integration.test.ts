import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  dockerAvailable,
  type PostgresContext,
  startPostgres,
  stopPostgres,
} from './_helpers/setup'

describe.skipIf(!dockerAvailable)('migration 0003 — chapters + chunks + pgvector + check', () => {
  let ctx: PostgresContext

  beforeAll(async () => {
    ctx = await startPostgres()
  }, 180_000)

  afterAll(async () => {
    if (ctx) await stopPostgres(ctx)
  })

  it('creates the chapters table', async () => {
    const rows = (await ctx.db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'chapters'
    `)) as unknown as Array<{ table_name: string }>
    expect(rows).toHaveLength(1)
  })

  it('creates the chunks table with a 1536-dim vector column', async () => {
    const tables = (await ctx.db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'chunks'
    `)) as unknown as Array<{ table_name: string }>
    expect(tables).toHaveLength(1)

    const cols = (await ctx.db.execute(sql`
      SELECT a.atttypmod AS dimensions
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_type t ON t.oid = a.atttypid
      WHERE c.relname = 'chunks'
        AND a.attname = 'embedding'
        AND t.typname = 'vector'
    `)) as unknown as Array<{ dimensions: number }>
    expect(cols).toHaveLength(1)
    expect(cols[0]?.dimensions).toBe(1536)
  })

  it('creates the HNSW index chunks_embedding_hnsw_idx with m=16, ef_construction=64', async () => {
    const idx = (await ctx.db.execute(sql`
      SELECT i.relname AS index_name, am.amname AS access_method, c.reloptions AS options
      FROM pg_class i
      JOIN pg_index ix ON i.oid = ix.indexrelid
      JOIN pg_class c ON c.oid = i.oid
      JOIN pg_am am ON i.relam = am.oid
      WHERE i.relname = 'chunks_embedding_hnsw_idx'
    `)) as unknown as Array<{
      index_name: string
      access_method: string
      options: string[] | null
    }>
    expect(idx).toHaveLength(1)
    expect(idx[0]?.access_method).toBe('hnsw')
    const opts = idx[0]?.options ?? []
    expect(opts).toContain('m=16')
    expect(opts).toContain('ef_construction=64')
  })

  it('creates the partial index for pending embeddings', async () => {
    const rows = (await ctx.db.execute(sql`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'chunks'
        AND indexname = 'chunks_book_id_pending_embedding_idx'
    `)) as unknown as Array<{ indexdef: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0]?.indexdef).toMatch(/WHERE\s+.*embedding\s+IS NULL/i)
  })

  it('enforces the books.ingestion_progress check (rejects 150)', async () => {
    const constraintRows = (await ctx.db.execute(sql`
      SELECT conname, pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      WHERE cl.relname = 'books' AND c.conname = 'books_ingestion_progress_check'
    `)) as unknown as Array<{ conname: string; definition: string }>
    expect(constraintRows).toHaveLength(1)
    expect(constraintRows[0]?.definition).toMatch(/(BETWEEN 0 AND 100|>=\s*0.*<=\s*100)/is)

    let captured: unknown
    try {
      await ctx.db.execute(sql`
        INSERT INTO books (gutendex_id, title, authors, languages, ingestion_progress)
        VALUES (
          900001,
          'check-violation',
          '[{"name":"x","birthYear":null,"deathYear":null}]'::jsonb,
          ARRAY['en'],
          150
        )
      `)
    } catch (error) {
      captured = error
    }
    expect(captured).toBeInstanceOf(Error)
    const cause = (captured as { cause?: { constraint_name?: string; code?: string } }).cause
    expect(cause?.code).toBe('23514')
    expect(cause?.constraint_name).toBe('books_ingestion_progress_check')
  })

  it('round-trips a vector(1536) value through chunks.embedding', async () => {
    const bookRows = (await ctx.db.execute(sql`
      INSERT INTO books (gutendex_id, title, authors, languages, ingestion_status)
      VALUES (
        900002,
        'vector-roundtrip',
        '[{"name":"x","birthYear":null,"deathYear":null}]'::jsonb,
        ARRAY['en'],
        'discovered'
      )
      RETURNING id
    `)) as unknown as Array<{ id: string }>
    const bookId = bookRows[0]?.id
    expect(bookId).toBeTruthy()

    const chapterRows = (await ctx.db.execute(sql`
      INSERT INTO chapters (book_id, ordinal, title, plain_text, token_count)
      VALUES (${bookId}::uuid, 1, 'Ch1', 'text', 1)
      RETURNING id
    `)) as unknown as Array<{ id: string }>
    const chapterId = chapterRows[0]?.id
    expect(chapterId).toBeTruthy()

    const vector = Array.from({ length: 1536 }, (_, i) => (i % 2 === 0 ? 0.5 : -0.5))
    const literal = `[${vector.join(',')}]`
    const inserted = (await ctx.db.execute(sql`
      INSERT INTO chunks (
        book_id, chapter_id, ordinal, text, token_count, start_char, end_char, embedding
      )
      VALUES (
        ${bookId}::uuid,
        ${chapterId}::uuid,
        0, 'sample', 1, 0, 6,
        ${literal}::vector
      )
      RETURNING id
    `)) as unknown as Array<{ id: string }>
    const chunkId = inserted[0]?.id
    expect(chunkId).toBeTruthy()

    const back = (await ctx.db.execute(sql`
      SELECT embedding::text AS embedding FROM chunks WHERE id = ${chunkId}::uuid
    `)) as unknown as Array<{ embedding: string }>
    expect(back).toHaveLength(1)
    const parsed = JSON.parse(back[0]?.embedding ?? '[]') as number[]
    expect(parsed).toHaveLength(1536)
    expect(parsed[0]).toBeCloseTo(0.5, 5)
    expect(parsed[1]).toBeCloseTo(-0.5, 5)
  })
})
