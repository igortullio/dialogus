import { describe, expect, it } from 'vitest'
import type { Chapter } from '../../../../src/domain/chapter/Chapter'
import {
  type ChapterRow,
  toDomain,
  toPersistence,
} from '../../../../src/infrastructure/persistence/mappers/ChapterMapper'

const fixedCreated = new Date('2026-04-25T10:00:00.000Z')

function buildRow(overrides: Partial<ChapterRow> = {}): ChapterRow {
  return {
    id: 'a3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b0',
    bookId: 'b3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b1',
    ordinal: 1,
    title: 'Chapter I — Loomings',
    plainText: 'Call me Ishmael...',
    tokenCount: 1234,
    createdAt: fixedCreated,
    ...overrides,
  }
}

describe('ChapterMapper.toDomain', () => {
  it('maps a fully-populated row to a Chapter entity preserving every column', () => {
    const row = buildRow()
    const chapter = toDomain(row)
    expect(chapter).toEqual({
      id: row.id,
      bookId: row.bookId,
      ordinal: row.ordinal,
      title: row.title,
      plainText: row.plainText,
      tokenCount: row.tokenCount,
      createdAt: row.createdAt,
    })
  })

  it('preserves an empty-string title without mutation', () => {
    const chapter = toDomain(buildRow({ title: '' }))
    expect(chapter.title).toBe('')
  })

  it('preserves a multiline plainText body with unicode characters', () => {
    const text = 'Linha 1\nLinha 2\n— Capítulo 漢字 café'
    const chapter = toDomain(buildRow({ plainText: text }))
    expect(chapter.plainText).toBe(text)
  })
})

describe('ChapterMapper.toPersistence', () => {
  it('produces a row whose round-trip via toDomain returns the input chapter', () => {
    const original: Chapter = {
      id: 'a3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b0',
      bookId: 'b3b9f5e0-7c1f-4a2e-9d3b-22f4c9a1d8b1',
      ordinal: 7,
      title: 'Chapter VII',
      plainText: 'Some text...',
      tokenCount: 500,
      createdAt: fixedCreated,
    }
    const row = toPersistence(original) as ChapterRow
    expect(toDomain(row)).toEqual(original)
  })

  it('round-trips a chapter with a large tokenCount and empty body', () => {
    const original: Chapter = {
      id: 'd2e8f1a7-4c5e-49b6-9b1a-1f2c3d4e5f60',
      bookId: 'e4f6a8c0-1234-4567-89ab-cdef01234567',
      ordinal: 0,
      title: 'Prologue',
      plainText: '',
      tokenCount: 0,
      createdAt: fixedCreated,
    }
    expect(toDomain(toPersistence(original) as ChapterRow)).toEqual(original)
  })
})
