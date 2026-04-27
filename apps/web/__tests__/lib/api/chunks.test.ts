import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, SchemaError } from '../../../src/lib/api/_error'
import { fetchChunkById } from '../../../src/lib/api/chunks'
import { jsonResponse } from './_fixtures'

const BASE = 'http://api.test'
const fetchMock = vi.fn<typeof fetch>()
const originalEnv = process.env.NEXT_PUBLIC_API_URL

const CHUNK = {
  id: '11111111-1111-4111-8111-111111111111',
  book_id: '22222222-2222-4222-8222-222222222222',
  chapter_id: '33333333-3333-4333-8333-333333333333',
  chapter_title: 'Capítulo I',
  chapter_ordinal: 1,
  ordinal: 0,
  text: 'Sou eu o defunto autor.',
  token_count: 7,
  start_char: 0,
  end_char: 23,
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  process.env.NEXT_PUBLIC_API_URL = BASE
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (originalEnv === undefined) delete process.env.NEXT_PUBLIC_API_URL
  else process.env.NEXT_PUBLIC_API_URL = originalEnv
})

describe('fetchChunkById', () => {
  it('returns the parsed ChunkReadDto', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: CHUNK }))
    await expect(fetchChunkById(CHUNK.id)).resolves.toEqual(CHUNK)
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/api/library/chunks/${CHUNK.id}`,
      expect.any(Object),
    )
  })

  it('throws ApiError with status 404 + slug chunk-not-found on 404', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          type: 'urn:dialogus:problems:chunk-not-found',
          title: 'Chunk Not Found',
          status: 404,
          detail: `Chunk ${CHUNK.id} was not found`,
        },
        { status: 404 },
      ),
    )
    const err = await fetchChunkById(CHUNK.id).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(404)
    expect((err as ApiError).slug).toBe('chunk-not-found')
    expect((err as ApiError).detail).toContain(CHUNK.id)
  })

  it('throws SchemaError when the response is missing required fields', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { id: CHUNK.id } }))
    const err = await fetchChunkById(CHUNK.id).catch((e) => e)
    expect(err).toBeInstanceOf(SchemaError)
  })
})
