import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MembersPanel } from '../../../src/components/admin/MembersPanel'
import { makeTestQueryClient, QueryWrapper } from '../chat/_helpers'

vi.mock('../../../src/lib/api/admin', () => ({
  fetchMembers: vi.fn(),
  revokeMember: vi.fn(),
  restoreMember: vi.fn(),
  setMemberRole: vi.fn(),
}))

import {
  fetchMembers,
  restoreMember,
  revokeMember,
  setMemberRole,
} from '../../../src/lib/api/admin'

const MEMBER = {
  id: 'm1',
  email: 'm@test.local',
  role: 'member',
  banned: false,
  created_at: '2026-06-01T00:00:00.000Z',
}

function renderPanel() {
  return render(
    <QueryWrapper client={makeTestQueryClient()}>
      <MembersPanel />
    </QueryWrapper>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('MembersPanel', () => {
  it('lists members', async () => {
    vi.mocked(fetchMembers).mockResolvedValue({ members: [MEMBER], nextCursor: null })

    renderPanel()

    expect(await screen.findByText('m@test.local')).toBeTruthy()
  })

  it('revokes an active member', async () => {
    vi.mocked(fetchMembers).mockResolvedValue({ members: [MEMBER], nextCursor: null })
    vi.mocked(revokeMember).mockResolvedValue({ ...MEMBER, banned: true })

    renderPanel()
    await screen.findByText('m@test.local')

    fireEvent.click(screen.getByRole('button', { name: /revogar/i }))

    await waitFor(() => expect(revokeMember).toHaveBeenCalledWith('m1'))
  })

  it('restores a banned member', async () => {
    vi.mocked(fetchMembers).mockResolvedValue({
      members: [{ ...MEMBER, banned: true }],
      nextCursor: null,
    })
    vi.mocked(restoreMember).mockResolvedValue({ ...MEMBER, banned: false })

    renderPanel()
    await screen.findByText('m@test.local')

    fireEvent.click(screen.getByRole('button', { name: /restaurar/i }))

    await waitFor(() => expect(restoreMember).toHaveBeenCalledWith('m1'))
  })

  it('promotes a member to admin', async () => {
    vi.mocked(fetchMembers).mockResolvedValue({ members: [MEMBER], nextCursor: null })
    vi.mocked(setMemberRole).mockResolvedValue({ ...MEMBER, role: 'admin' })

    renderPanel()
    await screen.findByText('m@test.local')

    fireEvent.click(screen.getByRole('button', { name: /tornar admin/i }))

    await waitFor(() => expect(setMemberRole).toHaveBeenCalledWith('m1', 'admin'))
  })

  it('surfaces the last-admin error when a mutation is rejected', async () => {
    vi.mocked(fetchMembers).mockResolvedValue({
      members: [{ ...MEMBER, id: 'admin-1', email: 'admin@test.local', role: 'admin' }],
      nextCursor: null,
    })
    vi.mocked(setMemberRole).mockRejectedValue(new Error('last admin'))

    renderPanel()
    await screen.findByText('admin@test.local')

    fireEvent.click(screen.getByRole('button', { name: /tornar membro/i }))

    expect(await screen.findByRole('alert')).toBeTruthy()
  })
})
