import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MembersPanel } from '../../../src/components/admin/MembersPanel'
import { ApiError } from '../../../src/lib/api/_error'
import { makeTestQueryClient, QueryWrapper } from '../chat/_helpers'

vi.mock('../../../src/lib/api/admin', () => ({
  fetchMembers: vi.fn(),
  revokeMember: vi.fn(),
  restoreMember: vi.fn(),
  setMemberRole: vi.fn(),
  deleteMember: vi.fn(),
}))

// A current user that is NOT any test member, so self-action hiding doesn't
// affect the existing assertions (it's exercised by its own test).
vi.mock('../../../src/lib/auth-client', () => ({
  authClient: { useSession: () => ({ data: { user: { id: 'current-admin' } } }) },
}))

import {
  deleteMember,
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

  it('hides revoke/role/delete on your own row and shows a "você" marker', async () => {
    vi.mocked(fetchMembers).mockResolvedValue({
      members: [{ ...MEMBER, id: 'current-admin', email: 'me@test.local', role: 'admin' }],
      nextCursor: null,
    })

    renderPanel()
    await screen.findByText('me@test.local')

    expect(screen.getByText('você')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /revogar/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /tornar membro/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^excluir$/i })).toBeNull()
  })

  it('deletes a member account after confirming the dialog (FR-023)', async () => {
    vi.mocked(fetchMembers).mockResolvedValue({ members: [MEMBER], nextCursor: null })
    vi.mocked(deleteMember).mockResolvedValue(undefined)

    renderPanel()
    await screen.findByText('m@test.local')

    // Open the confirm dialog, then confirm.
    fireEvent.click(screen.getByRole('button', { name: /^excluir$/i }))
    const confirm = await screen.findByRole('button', { name: /excluir conta/i })
    fireEvent.click(confirm)

    await waitFor(() => expect(deleteMember).toHaveBeenCalledWith('m1'))
  })

  it('promotes a member to admin', async () => {
    vi.mocked(fetchMembers).mockResolvedValue({ members: [MEMBER], nextCursor: null })
    vi.mocked(setMemberRole).mockResolvedValue({ ...MEMBER, role: 'admin' })

    renderPanel()
    await screen.findByText('m@test.local')

    fireEvent.click(screen.getByRole('button', { name: /tornar admin/i }))

    await waitFor(() => expect(setMemberRole).toHaveBeenCalledWith('m1', 'admin'))
  })

  it('surfaces the specific last-admin message for a last-admin ApiError', async () => {
    vi.mocked(fetchMembers).mockResolvedValue({
      members: [{ ...MEMBER, id: 'admin-1', email: 'admin@test.local', role: 'admin' }],
      nextCursor: null,
    })
    vi.mocked(setMemberRole).mockRejectedValue(new ApiError(409, { slug: 'last-admin' }))

    renderPanel()
    await screen.findByText('admin@test.local')

    fireEvent.click(screen.getByRole('button', { name: /tornar membro/i }))

    expect(await screen.findByText(/ao menos um administrador/i)).toBeTruthy()
  })

  it('shows a generic message for a non-last-admin failure (not the last-admin string)', async () => {
    vi.mocked(fetchMembers).mockResolvedValue({ members: [MEMBER], nextCursor: null })
    vi.mocked(revokeMember).mockRejectedValue(new ApiError(404, { slug: 'member-not-found' }))

    renderPanel()
    await screen.findByText('m@test.local')

    fireEvent.click(screen.getByRole('button', { name: /revogar/i }))

    expect(await screen.findByText(/não foi possível concluir a ação/i)).toBeTruthy()
    expect(screen.queryByText(/ao menos um administrador/i)).toBeNull()
  })
})
