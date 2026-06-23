import type { LibraryEntryRepository } from '@dialogus/catalog'
import type { Database } from '@dialogus/db'
import { PROBLEM_TYPE_PREFIX } from '@dialogus/shared/http/problem'
import { Hono } from 'hono'
import { pino } from 'pino'
import { describe, expect, it, vi } from 'vitest'
import {
  createProblemMiddleware,
  type ProblemVariables,
} from '../../src/infrastructure/http/middleware/problem'
import {
  createPreferencesRoute,
  type PreferencesRouteDeps,
} from '../../src/infrastructure/http/routes/preferences'
import { fakeAuth } from '../_helpers/auth'

const USER_ID = 'user-1'
const BOOK_A = '00000000-0000-4000-8000-00000000000a'
const BOOK_B = '00000000-0000-4000-8000-00000000000b'

function fakeLibraryRepo(isActiveMember = true): LibraryEntryRepository {
  return {
    upsertMembership: vi.fn(),
    isActiveMember: vi.fn(async () => isActiveMember),
    softRemove: vi.fn(),
    restore: vi.fn(),
    listForUser: vi.fn(),
    countInFlight: vi.fn(),
  }
}

function fakeDb(selectRows: Array<{ bookId: string; cap: number | null }> = []): Database {
  const where = vi.fn(async () => selectRows)
  const from = vi.fn(() => ({ where }))
  const select = vi.fn(() => ({ from }))
  const onConflictDoUpdate = vi.fn(async () => undefined)
  const values = vi.fn(() => ({ onConflictDoUpdate }))
  const insert = vi.fn(() => ({ values }))
  return { select, insert } as unknown as Database
}

function buildApp(
  overrides: Partial<PreferencesRouteDeps> = {},
): Hono<{ Variables: ProblemVariables }> {
  const app = new Hono<{ Variables: ProblemVariables }>()
  app.use('*', createProblemMiddleware({ logger: pino({ level: 'silent' }) }))
  app.route(
    '/preferences',
    createPreferencesRoute({
      db: fakeDb(),
      auth: fakeAuth(USER_ID),
      libraryRepo: fakeLibraryRepo(),
      ...overrides,
    }),
  )
  return app
}

describe('GET /preferences/spoiler-caps', () => {
  it('returns caps for requested books (null where unset)', async () => {
    const app = buildApp({ db: fakeDb([{ bookId: BOOK_A, cap: 5 }]) })

    const res = await app.request(`/preferences/spoiler-caps?book_ids=${BOOK_A},${BOOK_B}`)
    const body = (await res.json()) as { data: { caps: Record<string, number | null> } }

    expect(res.status).toBe(200)
    expect(body.data.caps).toEqual({ [BOOK_A]: 5, [BOOK_B]: null })
  })

  it('returns an empty caps map when no book_ids are given', async () => {
    const app = buildApp()

    const res = await app.request('/preferences/spoiler-caps')
    const body = (await res.json()) as { data: { caps: Record<string, number | null> } }

    expect(res.status).toBe(200)
    expect(body.data.caps).toEqual({})
  })

  it('returns 400 validation-failed for a non-uuid book id', async () => {
    const app = buildApp()

    const res = await app.request('/preferences/spoiler-caps?book_ids=not-a-uuid')
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(400)
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}validation-failed`)
  })
})

describe('PUT /preferences/spoiler-caps/:bookId', () => {
  it('upserts a cap and echoes it back', async () => {
    const app = buildApp()

    const res = await app.request(`/preferences/spoiler-caps/${BOOK_A}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ spoiler_cap_chapter: 7 }),
    })
    const body = (await res.json()) as { data: Record<string, unknown> }

    expect(res.status).toBe(200)
    expect(body.data).toEqual({ book_id: BOOK_A, spoiler_cap_chapter: 7 })
  })

  it('accepts null to clear the cap', async () => {
    const app = buildApp()

    const res = await app.request(`/preferences/spoiler-caps/${BOOK_A}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ spoiler_cap_chapter: null }),
    })
    const body = (await res.json()) as { data: Record<string, unknown> }

    expect(res.status).toBe(200)
    expect(body.data.spoiler_cap_chapter).toBeNull()
  })

  it('returns 404 book-not-found when the user is not a member', async () => {
    const app = buildApp({ libraryRepo: fakeLibraryRepo(false) })

    const res = await app.request(`/preferences/spoiler-caps/${BOOK_A}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ spoiler_cap_chapter: 7 }),
    })
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(404)
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}book-not-found`)
  })

  it('returns 400 validation-failed for a negative cap', async () => {
    const app = buildApp()

    const res = await app.request(`/preferences/spoiler-caps/${BOOK_A}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ spoiler_cap_chapter: -1 }),
    })
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(400)
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}validation-failed`)
  })
})

describe('preferences auth gate', () => {
  it('returns 401 when there is no session', async () => {
    const anonAuth = {
      api: { getSession: async () => null },
    } as unknown as PreferencesRouteDeps['auth']
    const app = buildApp({ auth: anonAuth })

    const res = await app.request('/preferences/spoiler-caps')
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(401)
    expect(body.type).toBe(`${PROBLEM_TYPE_PREFIX}unauthorized`)
  })
})
