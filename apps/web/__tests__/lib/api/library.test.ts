import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, SchemaError } from '../../../src/lib/api/_error'
import {
  addBook,
  fetchBookById,
  fetchIngestionStatus,
  fetchLibrary,
  removeBook,
  restoreBook,
  retryIngestion,
  startIngestion,
} from '../../../src/lib/api/library'
import { BOOK_1, BOOK_2, jsonResponse } from './_fixtures'

const BASE = 'http://api.test'
const fetchMock = vi.fn<typeof fetch>()
const originalEnv = process.env.NEXT_PUBLIC_API_URL

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

function lastInit(): RequestInit | undefined {
  const calls = fetchMock.mock.calls
  return calls.at(-1)?.[1]
}

describe('library client', () => {
  describe('fetchLibrary', () => {
    it('unwraps the envelope and returns null nextCursor when links.next is null', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ data: [BOOK_1, BOOK_2], meta: { count: 2 }, links: { next: null } }),
      )
      const result = await fetchLibrary({})
      expect(result).toEqual({ books: [BOOK_1, BOOK_2], nextCursor: null })
      expect(fetchMock).toHaveBeenCalledWith(`${BASE}/api/library/books`, expect.any(Object))
    })

    it('parses cursor= from a links.next URL', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          data: [BOOK_1],
          meta: { count: 1 },
          links: { next: '/api/library/books?cursor=abc123&limit=20' },
        }),
      )
      const result = await fetchLibrary({})
      expect(result.nextCursor).toBe('abc123')
    })

    it('forwards filter options to the query string', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ data: [], meta: { count: 0 } }))
      await fetchLibrary({
        cursor: 'c1',
        limit: 10,
        status: 'ready',
        language: 'pt',
        includeDeleted: true,
      })
      const url = fetchMock.mock.calls[0]?.[0] as string
      expect(url).toContain('cursor=c1')
      expect(url).toContain('limit=10')
      expect(url).toContain('status=ready')
      expect(url).toContain('language=pt')
      expect(url).toContain('include_deleted=true')
    })
  })

  describe('addBook', () => {
    it('sends Idempotency-Key header + { gutendex_id } body', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ data: BOOK_1 }, { status: 201 }))
      const book = await addBook(996, 'key-x')
      expect(book).toEqual(BOOK_1)
      const init = lastInit()
      expect(init?.method).toBe('POST')
      expect((init?.headers as Record<string, string>)['Idempotency-Key']).toBe('key-x')
      expect((init?.headers as Record<string, string>)['content-type']).toBe('application/json')
      expect(JSON.parse(init?.body as string)).toEqual({ gutendex_id: 996 })
    })
  })

  describe('fetchBookById', () => {
    it('GETs /api/library/books/:id and returns the book', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ data: BOOK_1 }))
      await expect(fetchBookById(BOOK_1.id)).resolves.toEqual(BOOK_1)
      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/api/library/books/${BOOK_1.id}`,
        expect.objectContaining({ method: 'GET' }),
      )
    })
  })

  describe('removeBook', () => {
    it('DELETEs and resolves void on 204', async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
      await expect(removeBook(BOOK_1.id)).resolves.toBeUndefined()
      const init = lastInit()
      expect(init?.method).toBe('DELETE')
    })

    it('throws ApiError when the API returns a problem document', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          {
            type: 'urn:dialogus:problems:book-not-found',
            title: 'Book Not Found',
            status: 404,
          },
          { status: 404 },
        ),
      )
      const err = await removeBook(BOOK_1.id).catch((e) => e)
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).status).toBe(404)
      expect((err as ApiError).slug).toBe('book-not-found')
    })
  })

  describe('restoreBook', () => {
    it('POSTs to /:id/restore and returns the restored book', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ data: BOOK_1 }))
      await expect(restoreBook(BOOK_1.id)).resolves.toEqual(BOOK_1)
      const init = lastInit()
      expect(init?.method).toBe('POST')
    })
  })

  describe('startIngestion', () => {
    it('returns { jobId } from data.job_id', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          {
            data: {
              book_id: BOOK_1.id,
              status: 'downloading',
              stage: 'download',
              job_id: 'job-1',
            },
          },
          { status: 202 },
        ),
      )
      await expect(startIngestion(BOOK_1.id, 'key-y')).resolves.toEqual({ jobId: 'job-1' })
      const init = lastInit()
      expect((init?.headers as Record<string, string>)['Idempotency-Key']).toBe('key-y')
    })
  })

  describe('fetchIngestionStatus', () => {
    it('returns the typed Zod-parsed DTO', async () => {
      const dto = {
        book_id: BOOK_1.id,
        status: 'embedding',
        stage: 'embed',
        progress: 73,
        started_at: '2026-04-27T10:00:00.000Z',
        indexed_at: null,
        last_stage: 'chunk',
        error: null,
      }
      fetchMock.mockResolvedValueOnce(jsonResponse({ data: dto }))
      await expect(fetchIngestionStatus(BOOK_1.id)).resolves.toEqual(dto)
    })

    it('throws SchemaError when the response is missing a required field', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ data: { book_id: BOOK_1.id } }))
      const err = await fetchIngestionStatus(BOOK_1.id).catch((e) => e)
      expect(err).toBeInstanceOf(SchemaError)
    })
  })

  describe('retryIngestion', () => {
    it('returns { jobId, resumingStage } mapped from data.stage', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          {
            data: {
              book_id: BOOK_1.id,
              status: 'embedding',
              stage: 'embed',
              job_id: 'job-2',
            },
          },
          { status: 202 },
        ),
      )
      await expect(retryIngestion(BOOK_1.id, 'key-z')).resolves.toEqual({
        jobId: 'job-2',
        resumingStage: 'embed',
      })
    })
  })
})
