import { describe, expect, it } from 'vitest'
import type { Chunk } from '../../../../src/domain/chunk/Chunk'
import {
  type ChunkRow,
  toDomain,
  toPersistence,
} from '../../../../src/infrastructure/persistence/mappers/ChunkMapper'

const fixedCreated = new Date('2026-04-25T10:00:00.000Z')
const EMBED_DIMS = 1536

function buildEmbedding(seed = 0.1): number[] {
  return Array.from({ length: EMBED_DIMS }, (_, i) => seed + i / EMBED_DIMS)
}

function buildRow(overrides: Partial<ChunkRow> = {}): ChunkRow {
  return {
    id: 'a3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b0',
    bookId: 'b3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b1',
    chapterId: 'c3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b2',
    ordinal: 0,
    text: 'Some chunk text spanning a paragraph or two.',
    tokenCount: 768,
    startChar: 0,
    endChar: 4096,
    embedding: null,
    createdAt: fixedCreated,
    ...overrides,
  }
}

describe('ChunkMapper.toDomain', () => {
  it('maps a non-embedded row to a Chunk with embedding=null', () => {
    const chunk = toDomain(buildRow({ embedding: null }))
    expect(chunk.embedding).toBeNull()
  })

  it('maps a fully-populated row including a 1536-dim embedding to a Chunk entity', () => {
    const embedding = buildEmbedding(0.5)
    const row = buildRow({ embedding })
    const chunk = toDomain(row)
    expect(chunk).toEqual({
      id: row.id,
      bookId: row.bookId,
      chapterId: row.chapterId,
      ordinal: row.ordinal,
      text: row.text,
      tokenCount: row.tokenCount,
      startChar: row.startChar,
      endChar: row.endChar,
      embedding,
      createdAt: row.createdAt,
    })
    expect(chunk.embedding).toHaveLength(EMBED_DIMS)
  })

  it('returns a defensive copy of the embedding array (mutating the row does not leak into the entity)', () => {
    const embedding = buildEmbedding(0.25)
    const row = buildRow({ embedding })
    const chunk = toDomain(row)
    expect(chunk.embedding).not.toBe(embedding)
    embedding[0] = 9999
    expect(chunk.embedding?.[0]).not.toBe(9999)
  })
})

describe('ChunkMapper.toPersistence', () => {
  it('writes null to the embedding column when the chunk embedding is null', () => {
    const original: Chunk = {
      id: 'a3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b0',
      bookId: 'b3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b1',
      chapterId: 'c3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b2',
      ordinal: 0,
      text: 'no embedding yet',
      tokenCount: 768,
      startChar: 0,
      endChar: 4096,
      embedding: null,
      createdAt: fixedCreated,
    }
    const row = toPersistence(original)
    expect(row.embedding).toBeNull()
  })

  it('produces a row whose round-trip via toDomain returns the input chunk (with embedding)', () => {
    const original: Chunk = {
      id: 'a3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b0',
      bookId: 'b3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b1',
      chapterId: 'c3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b2',
      ordinal: 3,
      text: 'a chunk',
      tokenCount: 768,
      startChar: 100,
      endChar: 4196,
      embedding: buildEmbedding(0.123),
      createdAt: fixedCreated,
    }
    const row = toPersistence(original) as ChunkRow
    expect(toDomain(row)).toEqual(original)
  })

  it('round-trips a chunk without an embedding (null)', () => {
    const original: Chunk = {
      id: 'd2e8f1a7-4c5e-49b6-9b1a-1f2c3d4e5f60',
      bookId: 'b3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b1',
      chapterId: 'c3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b2',
      ordinal: 12,
      text: 'pending',
      tokenCount: 256,
      startChar: 0,
      endChar: 1500,
      embedding: null,
      createdAt: fixedCreated,
    }
    const row = toPersistence(original) as ChunkRow
    expect(toDomain(row)).toEqual(original)
  })

  it('produces a fresh embedding array (defensive copy of the domain array)', () => {
    const embedding = buildEmbedding(0.42)
    const original: Chunk = {
      id: 'a3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b0',
      bookId: 'b3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b1',
      chapterId: 'c3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b2',
      ordinal: 0,
      text: 't',
      tokenCount: 1,
      startChar: 0,
      endChar: 1,
      embedding,
      createdAt: fixedCreated,
    }
    const row = toPersistence(original)
    expect(row.embedding).not.toBe(embedding)
    expect(row.embedding).toEqual(embedding)
  })
})
