import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { acceptInvitation, fetchInvitationInfo } from '../../../src/lib/api/invitations'
import { jsonResponse } from './_fixtures'

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

describe('invitations client', () => {
  it('fetches the invited email + status for a token', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { email: 'invitee@test.local', status: 'pending' } }),
    )

    const info = await fetchInvitationInfo('tok-123')

    expect(info).toEqual({ email: 'invitee@test.local', status: 'pending' })
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/api/invitations/tok-123`)
  })

  it('accepts an invitation (POST /accept) and returns the user id', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { user_id: 'user-xyz' } }, { status: 201 }),
    )

    const result = await acceptInvitation({
      invitation: 'tok-123',
      name: 'Invitee',
      password: 'StrongPass123!',
    })

    expect(result.userId).toBe('user-xyz')
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe(`${BASE}/api/invitations/accept`)
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual({
      invitation: 'tok-123',
      name: 'Invitee',
      password: 'StrongPass123!',
    })
  })
})
