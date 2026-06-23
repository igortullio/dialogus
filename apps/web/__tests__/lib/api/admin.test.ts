import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createInvitation,
  fetchInvitations,
  fetchMembers,
  restoreMember,
  revokeInvitation,
  revokeMember,
  setMemberRole,
} from '../../../src/lib/api/admin'
import { jsonResponse } from './_fixtures'

const BASE = 'http://api.test'
const fetchMock = vi.fn<typeof fetch>()
const originalEnv = process.env.NEXT_PUBLIC_API_URL

const INVITATION = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'invitee@test.local',
  status: 'pending',
  invited_by: 'admin-1',
  consumed_by_user_id: null,
  expires_at: '2026-07-01T00:00:00.000Z',
  created_at: '2026-06-20T00:00:00.000Z',
  updated_at: '2026-06-20T00:00:00.000Z',
}

const MEMBER = {
  id: 'member-1',
  email: 'm@test.local',
  role: 'member',
  banned: false,
  created_at: '2026-06-01T00:00:00.000Z',
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

describe('admin invitations client', () => {
  it('lists invitations and parses the next cursor', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [INVITATION],
        meta: { count: 1 },
        links: { next: '/api/admin/invitations?cursor=c1&limit=50' },
      }),
    )

    const result = await fetchInvitations({ status: 'pending' })

    expect(result.invitations).toHaveLength(1)
    expect(result.invitations[0]?.email).toBe('invitee@test.local')
    expect(result.nextCursor).toBe('c1')
    const url = fetchMock.mock.calls[0]?.[0] as string
    expect(url).toContain('/api/admin/invitations')
    expect(url).toContain('status=pending')
  })

  it('creates an invitation (POST with email body)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: INVITATION }, { status: 201 }))

    const inv = await createInvitation({ email: 'invitee@test.local' })

    expect(inv.status).toBe('pending')
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual({ email: 'invitee@test.local' })
  })

  it('passes expires_in_hours when provided', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: INVITATION }, { status: 201 }))

    await createInvitation({ email: 'x@test.local', expiresInHours: 24 })

    const [, init] = fetchMock.mock.calls[0] ?? []
    expect(JSON.parse(init?.body as string)).toEqual({
      email: 'x@test.local',
      expires_in_hours: 24,
    })
  })

  it('revokes an invitation (DELETE, no body)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

    await revokeInvitation(INVITATION.id)

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe(`${BASE}/api/admin/invitations/${INVITATION.id}`)
    expect(init?.method).toBe('DELETE')
  })
})

describe('admin members client', () => {
  it('lists members', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [MEMBER], meta: { count: 1 } }))

    const result = await fetchMembers({})

    expect(result.members).toHaveLength(1)
    expect(result.members[0]?.role).toBe('member')
    expect(result.nextCursor).toBeNull()
  })

  it('revokes a member (POST .../revoke)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { ...MEMBER, banned: true } }))

    const member = await revokeMember('member-1')

    expect(member.banned).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe(`${BASE}/api/admin/members/member-1/revoke`)
    expect(init?.method).toBe('POST')
  })

  it('restores a member (POST .../restore)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { ...MEMBER, banned: false } }))

    const member = await restoreMember('member-1')

    expect(member.banned).toBe(false)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/api/admin/members/member-1/restore`)
  })

  it('sets a member role (POST .../role with body)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { ...MEMBER, role: 'admin' } }))

    const member = await setMemberRole('member-1', 'admin')

    expect(member.role).toBe('admin')
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect(JSON.parse(init?.body as string)).toEqual({ role: 'admin' })
  })
})
